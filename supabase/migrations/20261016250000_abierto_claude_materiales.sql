-- «Abierto para Claude» llega a Materiales y a las páginas compartidas del equipo (pedido de CEO/Rockie IA: que el
-- conector lea, edite y cree la nota del proyecto de una tarea sin llaves). Igual que tasks/areas/projects
-- (20261014120000): la fila lleva «abierta» y la app la reescribe en claro (enClaroSi en privacidad.json).
--
-- Además, dos arreglos:
--  1. «abierta» se recalculaba solo al cambiar space_id: un miembro podía marcar a mano abierta = true en algo de un
--     proyecto cerrado y la app lo guardaba en claro. Ahora se recalcula en CADA escritura desde spaces.abierto_claude
--     (nadie la pone a mano, tampoco service_role: sale sola del proyecto).
--  2. Dejar de compartir una nota de tarea abierta fallaba: el material se borra dentro del trigger de la nota y el
--     recálculo reescribía la misma fila. Ahora la nota se calcula en su propio trigger y el de materiales no recalcula
--     cuando lo dispara otro trigger.

alter table public.materials add column if not exists abierta boolean not null default false;
alter table public.material_folders add column if not exists abierta boolean not null default false;

-- ——— abierta = su proyecto está abierto para Claude, en cada escritura ———
drop trigger if exists tasks_abierta on public.tasks;
create trigger tasks_abierta before insert or update on public.tasks
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists areas_abierta on public.areas;
create trigger areas_abierta before insert or update on public.areas
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists projects_abierta on public.projects;
create trigger projects_abierta before insert or update on public.projects
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists materials_abierta on public.materials;
create trigger materials_abierta before insert or update on public.materials
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists material_folders_abierta on public.material_folders;
create trigger material_folders_abierta before insert or update on public.material_folders
  for each row execute function public.fila_abierta_por_proyecto();
update public.materials m set abierta = coalesce((select abierto_claude from public.spaces where id = m.space_id), false);
update public.material_folders f set abierta = coalesce((select abierto_claude from public.spaces where id = f.space_id), false);

-- ——— páginas del Cuaderno ———
-- abierta = su libreta está abierta para Claude, o está compartida (material) con un proyecto abierto
create or replace function public.cuaderno_nota_calc(p_note uuid, p_book uuid, p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_book is not null and public.cuaderno_libreta_abierta(p_book))
      or (p_space is not null and exists (
            select 1 from materials m join spaces s on s.id = m.space_id
             where m.note_id = p_note and m.space_id = p_space and s.abierto_claude))
$$;
revoke all on function public.cuaderno_nota_calc(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.cuaderno_nota_abierta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := public.cuaderno_nota_calc(new.id, new.book_id, new.space_id);
  return new;
end $$;
drop trigger if exists cuaderno_nota_abierta on public.cuaderno_notes;
create trigger cuaderno_nota_abierta before insert or update on public.cuaderno_notes
  for each row execute function public.cuaderno_nota_abierta();

create or replace function public.recalcular_nota_abierta(p_note uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_note is null then return; end if;
  perform set_config('app.sistema', '1', true);
  update cuaderno_notes n set abierta = public.cuaderno_nota_calc(n.id, n.book_id, n.space_id)
   where n.id = p_note and n.abierta is distinct from public.cuaderno_nota_calc(n.id, n.book_id, n.space_id);
end $$;

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
    update cuaderno_notes n set abierta = public.cuaderno_nota_calc(n.id, n.book_id, n.space_id)
     where n.book_id in (select id from abajo);
    update cuaderno_cards c set abierta = n.abierta from cuaderno_notes n where n.id = c.note_id and n.user_id = new.user_id;
    update cuaderno_links l
       set abierta = coalesce((select abierta from cuaderno_notes where id = l.a_id), false)
                 and (l.b_id is null or coalesce((select abierta from cuaderno_notes where id = l.b_id), false))
     where l.user_id = new.user_id;
  end if;
  return new;
end $$;

-- al enlazar/desenlazar un material con una nota (no cuando lo dispara otro trigger: ahí la nota se calcula sola)
create or replace function public.materials_nota_de_tarea() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op in ('UPDATE', 'DELETE') then perform public.recalcular_nota_abierta(old.note_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.recalcular_nota_abierta(new.note_id); end if;
  return null;
end $$;

-- ——— abrir/cerrar el proyecto: todo lo suyo de una vez ———
create or replace function public.spaces_claude_propaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if new.abierto_claude is distinct from old.abierto_claude then
    update tasks set abierta = new.abierto_claude where space_id = new.id;
    update areas set abierta = new.abierto_claude where space_id = new.id;
    update projects set abierta = new.abierto_claude where space_id = new.id;
    update materials set abierta = new.abierto_claude where space_id = new.id;
    update material_folders set abierta = new.abierto_claude where space_id = new.id;
    for nid in select note_id from materials where space_id = new.id and note_id is not null loop
      perform public.recalcular_nota_abierta(nid);
    end loop;
  end if;
  return null;
end $$;

drop function if exists public.nota_de_tarea_abierta(uuid);

-- las páginas compartidas de proyectos ya abiertos quedan abiertas desde ahora
select public.recalcular_nota_abierta(m.note_id) from public.materials m where m.note_id is not null;
