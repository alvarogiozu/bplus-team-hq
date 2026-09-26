-- ============================================================
-- Rockie Cuaderno v3.1 — subnotas.
-- Una página puede dividirse en subnotas (Termodinámica → Primera ley, Entropía…),
-- y esas en otras: como mucho 4 niveles, sin ciclos, del mismo dueño.
-- Una subnota vive donde vive su tema: si el tema se mueve de cuaderno, se mueven con él.
-- Borrar el tema no borra sus subnotas: quedan como páginas del mismo cuaderno.
-- ============================================================

alter table public.cuaderno_notes
  add column parent_note_id uuid references public.cuaderno_notes(id) on delete set null;
create index cuaderno_notes_parent on public.cuaderno_notes (parent_note_id) where parent_note_id is not null;

create or replace function public.cuaderno_notes_parent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p_user uuid;
  p_book uuid;
  cur uuid;
  lvl int := 1;
begin
  if new.parent_note_id is null then return new; end if;
  if new.parent_note_id = new.id then raise exception 'Una página no puede ser subnota de sí misma'; end if;
  select user_id, book_id into p_user, p_book from cuaderno_notes where id = new.parent_note_id;
  if p_user is null or p_user <> new.user_id then raise exception 'Solo dentro de tus páginas'; end if;
  cur := new.parent_note_id;
  while cur is not null loop
    if cur = new.id then raise exception 'Una página no puede quedar dentro de sus propias subnotas'; end if;
    lvl := lvl + 1;
    if lvl > 5 then raise exception 'Como mucho 4 niveles de subnotas'; end if;
    select parent_note_id into cur from cuaderno_notes where id = cur;
  end loop;
  -- la subnota vive donde vive su tema
  new.book_id := p_book;
  return new;
end $$;
create trigger cuaderno_notes_parent_guard before insert or update of parent_note_id, book_id on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_parent_guard();

-- si el tema se mueve de cuaderno, sus subnotas lo siguen (y las de ellas, en cadena)
create or replace function public.cuaderno_notes_children_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.book_id is distinct from old.book_id then
    update cuaderno_notes set book_id = new.book_id where parent_note_id = new.id and book_id is distinct from new.book_id;
  end if;
  return new;
end $$;
create trigger cuaderno_notes_children_follow after update of book_id on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_children_follow();

revoke execute on function public.cuaderno_notes_parent_guard() from public, anon;
revoke execute on function public.cuaderno_notes_children_follow() from public, anon;
