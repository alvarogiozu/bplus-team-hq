-- Dos cosas del Cuaderno para los proyectos (Interfaz PC: la nota de una tarea se abre como pestaña del Cuaderno):
--
-- 1. Compañeros: una página COMPARTIDA con un equipo (space_id + su material en ese equipo) la puede leer y editar
--    cualquier miembro de ese equipo, directo en la tabla (antes solo por shared_note/save_shared_note). Las páginas
--    personales (sin space_id) siguen siendo solo de su dueño. Quien no es el dueño solo cambia título y contenido:
--    el guardia deja todo lo demás como estaba (no la puede dejar de compartir, mover de libreta ni de padre).
-- 2. Claude: la nota de una tarea (material kind='note' con task_id) queda abierta para el conector si su proyecto está
--    abierto para Claude, además de si su libreta lo está. Se recalcula al abrir/cerrar el proyecto, al enlazar la nota
--    con una tarea y al abrir/cerrar la libreta. La app reescribe en claro o vuelve a cifrar al leer (resellar).

-- ——— 1. compañeros ———
drop policy if exists cuaderno_notes_equipo_leer on public.cuaderno_notes;
create policy cuaderno_notes_equipo_leer on public.cuaderno_notes for select to authenticated
  using (
    kind = 'pagina' and space_id is not null and public.is_member(space_id)
    and exists (select 1 from public.materials m where m.note_id = cuaderno_notes.id and m.space_id = cuaderno_notes.space_id)
  );
drop policy if exists cuaderno_notes_equipo_editar on public.cuaderno_notes;
create policy cuaderno_notes_equipo_editar on public.cuaderno_notes for update to authenticated
  using (
    kind = 'pagina' and space_id is not null and public.is_member(space_id)
    and exists (select 1 from public.materials m where m.note_id = cuaderno_notes.id and m.space_id = cuaderno_notes.space_id)
  )
  with check (space_id is not null and public.is_member(space_id));

-- Quien no es el dueño solo cambia título y contenido. Corre antes que los demás guardias (orden alfabético).
create or replace function public.cuaderno_notes_companero() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text := new.title;
  b text := new.body;
begin
  if auth.uid() is null or auth.uid() = old.user_id or coalesce(current_setting('app.sistema', true), '') = '1' then
    return new;
  end if;
  new := old;
  new.title := t;
  new.body := b;
  return new;
end $$;
revoke execute on function public.cuaderno_notes_companero() from public, anon, authenticated;
drop trigger if exists cuaderno_notes_a_companero on public.cuaderno_notes;
create trigger cuaderno_notes_a_companero before update on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_companero();

-- ——— 2. notas de tareas abiertas con su proyecto ———
create or replace function public.nota_de_tarea_abierta(p_note uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from materials m join spaces s on s.id = m.space_id
     where m.note_id = p_note and m.kind = 'note' and m.task_id is not null and s.abierto_claude
  )
$$;
revoke all on function public.nota_de_tarea_abierta(uuid) from public, anon, authenticated;

-- abierta = su libreta está abierta para Claude, o es la nota de una tarea de un proyecto abierto
create or replace function public.cuaderno_nota_abierta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := (new.book_id is not null and public.cuaderno_libreta_abierta(new.book_id))
                 or public.nota_de_tarea_abierta(new.id);
  return new;
end $$;

create or replace function public.recalcular_nota_abierta(p_note uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_note is null then return; end if;
  perform set_config('app.sistema', '1', true);
  update cuaderno_notes n
     set abierta = (n.book_id is not null and public.cuaderno_libreta_abierta(n.book_id)) or public.nota_de_tarea_abierta(n.id)
   where n.id = p_note
     and n.abierta is distinct from ((n.book_id is not null and public.cuaderno_libreta_abierta(n.book_id)) or public.nota_de_tarea_abierta(n.id));
end $$;
revoke all on function public.recalcular_nota_abierta(uuid) from public, anon, authenticated;

-- al abrir/cerrar la libreta, sus notas siguen abiertas si son de una tarea de un proyecto abierto (y al revés)
create or replace function public.cuaderno_libreta_cambia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abierta_claude is distinct from old.abierta_claude or new.parent_id is distinct from old.parent_id then
    perform set_config('app.sistema', '1', true);
    with recursive abajo as (
      select id from cuaderno_books where id = new.id
      union all
      select b.id from cuaderno_books b join abajo a on b.parent_id = a.id
    )
    update cuaderno_notes n
       set abierta = public.cuaderno_libreta_abierta(n.book_id) or public.nota_de_tarea_abierta(n.id)
     where n.book_id in (select id from abajo);
    update cuaderno_cards c set abierta = n.abierta from cuaderno_notes n where n.id = c.note_id and n.user_id = new.user_id;
    update cuaderno_links l
       set abierta = coalesce((select abierta from cuaderno_notes where id = l.a_id), false)
                 and (l.b_id is null or coalesce((select abierta from cuaderno_notes where id = l.b_id), false))
     where l.user_id = new.user_id;
  end if;
  return new;
end $$;

-- al abrir/cerrar el proyecto para Claude, también sus notas de tareas
create or replace function public.spaces_claude_propaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if new.abierto_claude is distinct from old.abierto_claude then
    update tasks set abierta = new.abierto_claude where space_id = new.id;
    update areas set abierta = new.abierto_claude where space_id = new.id;
    update projects set abierta = new.abierto_claude where space_id = new.id;
    for nid in select note_id from materials where space_id = new.id and kind = 'note' and task_id is not null and note_id is not null loop
      perform public.recalcular_nota_abierta(nid);
    end loop;
  end if;
  return null;
end $$;

-- al enlazar (o desenlazar) una nota con una tarea
create or replace function public.materials_nota_de_tarea() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.recalcular_nota_abierta(old.note_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.recalcular_nota_abierta(new.note_id); end if;
  return null;
end $$;
revoke execute on function public.materials_nota_de_tarea() from public, anon, authenticated;
drop trigger if exists materials_nota_de_tarea on public.materials;
create trigger materials_nota_de_tarea after insert or delete or update of task_id, note_id, space_id on public.materials
  for each row execute function public.materials_nota_de_tarea();
