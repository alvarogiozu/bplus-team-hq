-- ============================================================
-- El Cofre — tanda 3: Cuaderno (docs/privacidad.md)
-- Notas, diario, tarjetas, conexiones, libretas, dibujos y pizarras se cifran en el dispositivo:
--   · lo tuyo, con tu llave maestra;
--   · una página compartida con un equipo, con la llave de esa página (la reciben los del equipo),
--     y también su edición en vivo (cuaderno_note_updates) y sus imágenes (<uid>/n/<nota>/…).
-- Excepción elegida por la persona: las libretas «abiertas para Claude» quedan sin cifrar para que el
-- conector de Claude las pueda leer y escribir. Lo marca `abierta` (se calcula solo, aquí abajo).
-- El agente del Cuaderno ya no lee la base: la app le manda lo que necesita, ya abierto, en cada pedido.
-- ============================================================

-- ——— libretas abiertas para Claude ———

alter table public.cuaderno_books add column abierta_claude boolean not null default false;
alter table public.cuaderno_notes add column abierta boolean not null default false;
alter table public.cuaderno_cards add column abierta boolean not null default false;
alter table public.cuaderno_links add column abierta boolean not null default false;

-- ¿la libreta (o alguna carpeta que la contiene) está abierta para Claude?
create or replace function public.cuaderno_libreta_abierta(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive arriba as (
    select id, parent_id, abierta_claude from cuaderno_books where id = p_book
    union all
    select b.id, b.parent_id, b.abierta_claude from cuaderno_books b join arriba a on b.id = a.parent_id
  )
  select coalesce(bool_or(abierta_claude), false) from arriba
$$;

create or replace function public.cuaderno_nota_abierta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := new.book_id is not null and public.cuaderno_libreta_abierta(new.book_id);
  return new;
end $$;
create trigger cuaderno_nota_abierta before insert or update of book_id on public.cuaderno_notes
  for each row execute function public.cuaderno_nota_abierta();

create or replace function public.cuaderno_tarjeta_abierta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := coalesce((select abierta from cuaderno_notes where id = new.note_id), false);
  return new;
end $$;
create trigger cuaderno_tarjeta_abierta before insert or update of note_id on public.cuaderno_cards
  for each row execute function public.cuaderno_tarjeta_abierta();

create or replace function public.cuaderno_enlace_abierto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := coalesce((select abierta from cuaderno_notes where id = new.a_id), false)
             and (new.b_id is null or coalesce((select abierta from cuaderno_notes where id = new.b_id), false));
  return new;
end $$;
create trigger cuaderno_enlace_abierto before insert or update of a_id, b_id on public.cuaderno_links
  for each row execute function public.cuaderno_enlace_abierto();

-- abrir o cerrar una libreta mueve la marca a todo lo que tiene adentro (la app luego reescribe:
-- en claro lo que se abrió, cifrado lo que se cerró)
create or replace function public.cuaderno_libreta_cambia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abierta_claude is distinct from old.abierta_claude or new.parent_id is distinct from old.parent_id then
    with recursive abajo as (
      select id from cuaderno_books where id = new.id
      union all
      select b.id from cuaderno_books b join abajo a on b.parent_id = a.id
    )
    update cuaderno_notes n set abierta = public.cuaderno_libreta_abierta(n.book_id)
     where n.book_id in (select id from abajo);
    update cuaderno_cards c set abierta = n.abierta from cuaderno_notes n where n.id = c.note_id and n.user_id = new.user_id;
    update cuaderno_links l
       set abierta = coalesce((select abierta from cuaderno_notes where id = l.a_id), false)
                 and (l.b_id is null or coalesce((select abierta from cuaderno_notes where id = l.b_id), false))
     where l.user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger cuaderno_libreta_cambia after update on public.cuaderno_books
  for each row execute function public.cuaderno_libreta_cambia();

create or replace function public.cuaderno_nota_movida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abierta is distinct from old.abierta then
    update cuaderno_cards set abierta = new.abierta where note_id = new.id;
    update cuaderno_links l
       set abierta = coalesce((select abierta from cuaderno_notes where id = l.a_id), false)
                 and (l.b_id is null or coalesce((select abierta from cuaderno_notes where id = l.b_id), false))
     where l.a_id = new.id or l.b_id = new.id;
  end if;
  return new;
end $$;
create trigger cuaderno_nota_movida after update of abierta on public.cuaderno_notes
  for each row execute function public.cuaderno_nota_movida();

-- ——— techos de largo (el texto cifrado es más largo; los límites reales los pone la app) ———

create or replace function pg_temp.cofre_ampliar(p_tabla text, p_col text, p_min int, p_max int) returns void
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = ('public.' || p_tabla)::regclass
       and c.contype = 'c'
       and a.attname = p_col
       and (pg_get_constraintdef(c.oid) ilike '%char_length%' or pg_get_constraintdef(c.oid) ilike '%jsonb_typeof%')
  loop
    execute format('alter table public.%I drop constraint %I', p_tabla, r.conname);
  end loop;
  if p_max > 0 then
    execute format('alter table public.%I add constraint %I check (char_length(%I) between %s and %s)',
                   p_tabla, p_tabla || '_' || p_col || '_largo', p_col, p_min, p_max);
  end if;
end;
$$;

select pg_temp.cofre_ampliar('cuaderno_notes', 'title', 1, 2000);
select pg_temp.cofre_ampliar('cuaderno_notes', 'body', 0, 400000);
select pg_temp.cofre_ampliar('cuaderno_entries', 'text', 1, 120000);
select pg_temp.cofre_ampliar('cuaderno_entries', 'say', 0, 6000);
select pg_temp.cofre_ampliar('cuaderno_links', 'reason', 1, 3000);
select pg_temp.cofre_ampliar('cuaderno_cards', 'q', 1, 3000);
select pg_temp.cofre_ampliar('cuaderno_cards', 'a', 1, 6000);
select pg_temp.cofre_ampliar('cuaderno_books', 'name', 1, 1000);
select pg_temp.cofre_ampliar('cuaderno_note_updates', 'data', 1, 6000000);
-- JSON cifrado = un texto JSON ("cj1…"): ya no es lista ni objeto para la base
select pg_temp.cofre_ampliar('cuaderno_entries', 'proposals', 0, 0);
select pg_temp.cofre_ampliar('cuaderno_drawings', 'strokes', 0, 0);
select pg_temp.cofre_ampliar('cuaderno_boards', 'scene', 0, 0);
alter table public.cuaderno_entries add constraint cuaderno_entries_proposals_forma
  check (jsonb_typeof(proposals) in ('array', 'string'));
alter table public.cuaderno_drawings add constraint cuaderno_drawings_strokes_forma
  check (jsonb_typeof(strokes) in ('array', 'string'));
alter table public.cuaderno_boards add constraint cuaderno_boards_scene_forma
  check (jsonb_typeof(scene) in ('object', 'string') and octet_length(scene::text) <= 4200000);

-- ——— la base ya no recorta títulos (un texto cifrado recortado no se puede abrir) ———

create or replace function public.cuaderno_notes_collab() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.space_id is not null and new.space_id is null then
    delete from cuaderno_note_updates where note_id = new.id;
    delete from materials where note_id = new.id;
    new.ydoc_epoch := old.ydoc_epoch + 1;
    new.ydoc_claim := null;
    new.shared_at := null;
  elsif new.space_id is not null and new.space_id is distinct from old.space_id then
    delete from cuaderno_note_updates where note_id = new.id;
    delete from materials where note_id = new.id and space_id <> new.space_id;
    new.ydoc_epoch := old.ydoc_epoch + 1;
    new.ydoc_claim := null;
    new.shared_at := now();
  elsif new.space_id is not null
        and new.body is distinct from old.body
        and coalesce(current_setting('app.collab', true), '') <> '1' then
    delete from cuaderno_note_updates where note_id = new.id;
    new.ydoc_epoch := old.ydoc_epoch + 1;
    new.ydoc_claim := null;
  end if;
  if new.title is distinct from old.title then
    update materials set name = new.title where note_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.save_shared_note(nid uuid, p_title text default null, p_body text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
begin
  if not public.can_edit_note(nid) then
    raise exception 'Esta nota ya no está compartida contigo';
  end if;
  perform set_config('app.collab', '1', true);
  update cuaderno_notes
     set title = coalesce(nullif(btrim(p_title), ''), title),
         body = coalesce(p_body, body)
   where id = nid
  returning updated_at into t;
  return t;
end $$;

create or replace function public.share_note(nid uuid, p_space uuid, p_folder uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  n cuaderno_notes;
  mid uuid;
begin
  select * into n from cuaderno_notes where id = nid;
  if n.id is null or n.user_id <> auth.uid() then
    raise exception 'Solo puedes compartir tus propias páginas';
  end if;
  if n.kind <> 'pagina' then
    raise exception 'Por ahora se comparten páginas (las pizarras todavía no)';
  end if;
  if not public.is_member(p_space) then
    raise exception 'No eres de ese equipo';
  end if;
  if p_folder is not null and not exists (select 1 from material_folders f where f.id = p_folder and f.space_id = p_space) then
    p_folder := null;
  end if;
  if n.space_id is distinct from p_space then
    update cuaderno_notes set space_id = p_space where id = nid;
  end if;
  select m.id into mid from materials m where m.note_id = nid;
  if mid is null then
    insert into materials (space_id, folder_id, kind, name, note_id, created_by)
    values (p_space, p_folder, 'note', n.title, nid, auth.uid())
    returning id into mid;
  end if;
  return mid;
end $$;

-- ——— imágenes de páginas compartidas: el permiso sale de la ruta (<uid>/n/<nota>/…), no del texto ———
-- (el texto de la página va cifrado: la base ya no puede buscar adentro)
create or replace function public.cuaderno_file_shared(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(path, '/', 2) = 'n'
         and split_part(path, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_edit_note(split_part(path, '/', 3)::uuid)
    else exists (
      select 1 from cuaderno_notes n
       where n.space_id is not null
         and public.is_member(n.space_id)
         and strpos(n.body, 'cuaderno://' || path) > 0
    )
  end
$$;

-- ——— huellas de significado (para «parecidas»): ahora cifradas, y se comparan en el dispositivo ———
-- Un vector de una nota dice mucho de su contenido: deja de vivir en claro (salvo libretas abiertas,
-- que usa el conector de Claude para buscar).

create table public.cuaderno_huellas (
  note_id    uuid primary key references public.cuaderno_notes(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  huella     text not null,
  actualizado timestamptz not null default now()
);
alter table public.cuaderno_huellas enable row level security;
create policy cuaderno_huellas_own on public.cuaderno_huellas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

update public.cuaderno_notes set embedding = null, embedded_at = null where not abierta;
-- la búsqueda por parecido en la base queda solo para lo abierto (la usa el conector de Claude)
create or replace function public.cuaderno_similar(q extensions.vector(768), k int default 8, exclude uuid[] default '{}')
returns table (id uuid, title text, area text, snippet text, score double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select n.id, n.title, n.area, left(n.body, 280), 1 - (n.embedding <=> q)
    from cuaderno_notes n
   where n.user_id = auth.uid() and n.abierta and n.embedding is not null and not (n.id = any(exclude))
   order by n.embedding <=> q
   limit least(greatest(k, 1), 20)
$$;
create or replace function public.cuaderno_similar_for(p_user uuid, q extensions.vector(768), k int default 8)
returns table (id uuid, title text, area text, snippet text, score double precision)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.title, n.area, left(n.body, 280), 1 - (n.embedding <=> q)
    from cuaderno_notes n
   where n.user_id = p_user and n.abierta and n.embedding is not null
   order by n.embedding <=> q
   limit least(greatest(k, 1), 20)
$$;
create or replace function public.cuaderno_set_embedding(note uuid, emb extensions.vector(768)) returns void
language sql security invoker set search_path = public, extensions as $$
  update cuaderno_notes set embedding = emb, embedded_at = now() where id = note and user_id = auth.uid() and abierta
$$;
