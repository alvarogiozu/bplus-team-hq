-- Disponibilidad del equipo (como el horario laboral de Google Calendar) y notas del Cuaderno
-- compartidas con el equipo, editables a la vez (como Google Docs).

-- =====================================================================================
-- 1. DISPONIBILIDAD
-- =====================================================================================

-- Tu horario para el equipo por día de la semana ("0" = domingo … "6" = sábado), en minutos:
--   {"1": [[540, 1080]], "2": [[540, 780], [840, 1080]]}   -> lunes 9-18; martes 9-13 y 14-18
-- Sin la clave = ese día no estás disponible. {} = todavía no lo pusiste.
-- share_level = lo que tu equipo ve de tus eventos: 'busy' (solo "Ocupado") o 'details' (el título).
alter table public.agenda_prefs
  add column availability jsonb not null default '{}'::jsonb,
  add column share_level text not null default 'busy' check (share_level in ('busy', 'details'));

-- Por evento: null = lo de siempre (share_level); 'busy' = solo "Ocupado"; 'public' = con título;
-- 'free' = no te bloquea (tu equipo no lo ve).
alter table public.agenda_items
  add column visibility text check (visibility in ('busy', 'public', 'free'));

-- Lo que un miembro del equipo puede saber de los demás: su horario y sus ratos ocupados
-- (con título SOLO si ese evento es público). Nunca más que eso.
create or replace function public.team_availability(p_space uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
begin
  if not public.is_member(p_space) then
    raise exception 'No eres de este equipo';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Rango de fechas inválido';
  end if;
  with mem as (
    select m.user_id,
           coalesce(nullif(p.timezone, ''), 'America/Lima') as tz,
           coalesce(ap.availability, '{}'::jsonb) as availability,
           coalesce(ap.share_level, 'busy') as share_level
      from space_members m
      join profiles p on p.id = m.user_id
      left join agenda_prefs ap on ap.user_id = m.user_id
     where m.space_id = p_space
  ),
  items as (
    select i.user_id,
           ((i.day + make_interval(mins => i.start_min))::timestamp at time zone mem.tz) as s,
           ((i.day + make_interval(mins => i.start_min + i.duration_min))::timestamp at time zone mem.tz) as e,
           case
             when coalesce(i.visibility, case mem.share_level when 'details' then 'public' else 'busy' end) = 'public'
             then i.title
           end as t,
           'a'::text as k
      from agenda_items i
      join mem on mem.user_id = i.user_id
     where i.day between p_from - 1 and p_to
       and i.start_min is not null
       and i.duration_min > 0
       and coalesce(i.visibility, '') <> 'free'
       and i.in_reserve is null  -- lo de adentro de un tiempo reservado ya lo cubre la reserva
  ),
  meets as (
    select a.user_id,
           e.starts_at as s,
           e.ends_at as e,
           case when public.is_member(e.space_id) then e.title end as t,
           'm'::text as k
      from event_attendees a
      join events e on e.id = a.event_id
      join mem on mem.user_id = a.user_id
     where a.response <> 'no'
       and e.ends_at >= p_from::timestamp at time zone 'UTC' - interval '1 day'
       and e.starts_at <= p_to::timestamp at time zone 'UTC' + interval '2 days'
  )
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'tz', tz, 'availability', availability)) from mem), '[]'::jsonb),
    'busy', coalesce((select jsonb_agg(jsonb_build_object('user_id', b.user_id, 's', b.s, 'e', b.e, 't', b.t, 'k', b.k))
                        from (select * from items union all select * from meets) b), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.team_availability(uuid, date, date) from public, anon;
grant execute on function public.team_availability(uuid, date, date) to authenticated;

-- =====================================================================================
-- 2. NOTAS COMPARTIDAS
-- =====================================================================================
-- La nota sigue siendo de quien la escribió (vive en su Cuaderno); compartirla la abre a su
-- equipo. El texto en vivo es un documento CRDT (Yjs) guardado como una lista de cambios; el
-- Markdown de siempre (body) se sigue guardando para buscar, conectar y exportar.

alter table public.cuaderno_notes
  add column space_id uuid references public.spaces(id) on delete set null,
  add column shared_at timestamptz,
  add column ydoc_epoch integer not null default 0,
  add column ydoc_claim uuid,
  add column ydoc_claim_at timestamptz;
create index cuaderno_notes_space on public.cuaderno_notes (space_id) where space_id is not null;

create table public.cuaderno_note_updates (
  id          bigint generated always as identity primary key,
  note_id     uuid not null references public.cuaderno_notes(id) on delete cascade,
  data        text not null check (char_length(data) <= 4000000),  -- cambio de Yjs en base64
  user_id     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index cuaderno_note_updates_note on public.cuaderno_note_updates (note_id, id);
alter table public.cuaderno_note_updates enable row level security;

-- quién puede abrir y escribir una nota: su dueño, o su equipo si está compartida
create or replace function public.can_edit_note(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cuaderno_notes n
     where n.id = nid
       and (n.user_id = auth.uid() or (n.space_id is not null and public.is_member(n.space_id)))
  )
$$;
revoke all on function public.can_edit_note(uuid) from public, anon;
grant execute on function public.can_edit_note(uuid) to authenticated;

create policy cuaderno_note_updates_read on public.cuaderno_note_updates for select to authenticated
  using (public.can_edit_note(note_id));
create policy cuaderno_note_updates_write on public.cuaderno_note_updates for insert to authenticated
  with check (public.can_edit_note(note_id) and user_id = auth.uid());

-- Compartir, dejar de compartir y cambios "de fuera" (Rockie, deshacer, el conector de Claude):
-- en esos casos el documento en vivo se descarta y vuelve a nacer del Markdown (sube ydoc_epoch).
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
    update materials set name = left(new.title, 200) where note_id = new.id;
  end if;
  return new;
end $$;
create trigger cuaderno_notes_collab before update on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_collab();

-- La nota compartida para quien es del equipo (el dueño la tiene en su Cuaderno).
create or replace function public.shared_note(nid uuid)
returns table (id uuid, title text, body text, user_id uuid, owner_name text, space_id uuid, ydoc_epoch integer, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.body, n.user_id, p.display_name, n.space_id, n.ydoc_epoch, n.updated_at
    from cuaderno_notes n
    join profiles p on p.id = n.user_id
   where n.id = nid and n.kind = 'pagina' and public.can_edit_note(n.id)
$$;
revoke all on function public.shared_note(uuid) from public, anon;
grant execute on function public.shared_note(uuid) to authenticated;

-- Guardar el título y/o el Markdown que sale del documento en vivo (no reinicia el documento).
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
     set title = coalesce(nullif(btrim(left(p_title, 160)), ''), title),
         body = coalesce(p_body, body)
   where id = nid
  returning updated_at into t;
  return t;
end $$;
revoke all on function public.save_shared_note(uuid, text, text) from public, anon;
grant execute on function public.save_shared_note(uuid, text, text) to authenticated;

-- Quien abre primero una nota sin documento en vivo lo arma desde el Markdown; los demás esperan.
create or replace function public.claim_note_ydoc(nid uuid, p_epoch integer, p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_note(nid) then
    return false;
  end if;
  if exists (select 1 from cuaderno_note_updates where note_id = nid) then
    return false;
  end if;
  update cuaderno_notes
     set ydoc_claim = p_token, ydoc_claim_at = now()
   where id = nid
     and ydoc_epoch = p_epoch
     and (ydoc_claim is null or ydoc_claim = p_token or ydoc_claim_at < now() - interval '15 seconds');
  return found;
end $$;
revoke all on function public.claim_note_ydoc(uuid, integer, uuid) from public, anon;
grant execute on function public.claim_note_ydoc(uuid, integer, uuid) to authenticated;

-- Junta muchos cambios chicos en uno solo (la nota abre más rápido).
create or replace function public.compact_note_updates(nid uuid, p_snapshot text, p_upto bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_note(nid) then
    raise exception 'Esta nota ya no está compartida contigo';
  end if;
  insert into cuaderno_note_updates (note_id, data, user_id) values (nid, p_snapshot, auth.uid());
  delete from cuaderno_note_updates where note_id = nid and id <= p_upto;
end $$;
revoke all on function public.compact_note_updates(uuid, text, bigint) from public, anon;
grant execute on function public.compact_note_updates(uuid, text, bigint) to authenticated;

-- Materiales: una nota compartida aparece ahí como un material más.
alter table public.materials drop constraint materials_kind_check;
alter table public.materials add constraint materials_kind_check check (kind in ('file', 'link', 'note'));
alter table public.materials add column note_id uuid references public.cuaderno_notes(id) on delete cascade;
alter table public.materials drop constraint materials_shape;
alter table public.materials add constraint materials_shape check (
  (kind = 'file' and storage_path is not null and url is null and note_id is null) or
  (kind = 'link' and url is not null and storage_path is null and note_id is null) or
  (kind = 'note' and note_id is not null and url is null and storage_path is null)
);
create unique index materials_note_uq on public.materials (note_id) where note_id is not null;

create or replace function public.materials_note_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.note_id is distinct from old.note_id then
    raise exception 'Un material no cambia de nota';
  end if;
  if tg_op = 'INSERT' and new.kind = 'note'
     and not exists (select 1 from cuaderno_notes n where n.id = new.note_id and n.space_id = new.space_id) then
    raise exception 'Esa nota no está compartida con este equipo';
  end if;
  return new;
end $$;
create trigger materials_note_guard before insert or update on public.materials
  for each row execute function public.materials_note_guard();

-- Quitar la nota de Materiales = dejar de compartirla (sigue intacta en el Cuaderno de su dueño).
create or replace function public.materials_note_unshare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'note' and pg_trigger_depth() = 1 then
    update cuaderno_notes set space_id = null where id = old.note_id and space_id is not null;
  end if;
  return old;
end $$;
create trigger materials_note_unshare after delete on public.materials
  for each row execute function public.materials_note_unshare();

-- Compartir una página tuya con tu equipo (queda en Materiales, en la carpeta que elijas).
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
    values (p_space, p_folder, 'note', left(n.title, 200), nid, auth.uid())
    returning id into mid;
  end if;
  return mid;
end $$;
revoke all on function public.share_note(uuid, uuid, uuid) from public, anon;
grant execute on function public.share_note(uuid, uuid, uuid) to authenticated;

create or replace function public.unshare_note(nid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cuaderno_notes where id = nid and user_id = auth.uid()) then
    raise exception 'Solo quien escribió la página puede dejar de compartirla';
  end if;
  update cuaderno_notes set space_id = null where id = nid;
end $$;
revoke all on function public.unshare_note(uuid) from public, anon;
grant execute on function public.unshare_note(uuid) to authenticated;

-- Las imágenes de una nota compartida (de su dueño o de quien las pegó) las ve todo el equipo.
create or replace function public.cuaderno_file_shared(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cuaderno_notes n
     where n.space_id is not null
       and public.is_member(n.space_id)
       and strpos(n.body, 'cuaderno://' || path) > 0
  )
$$;
revoke all on function public.cuaderno_file_shared(text) from public, anon;
grant execute on function public.cuaderno_file_shared(text) to authenticated;

create policy cuaderno_files_shared on storage.objects for select to authenticated
  using (bucket_id = 'cuaderno' and public.cuaderno_file_shared(name));
