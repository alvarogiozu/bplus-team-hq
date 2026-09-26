-- ============================================================
-- Materiales: archivos y enlaces del equipo, ordenados en carpetas (que se pueden ligar a un
-- proyecto). Los archivos viven en el bucket privado `materiales`, ruta
-- <space_id>/<uuid>/<nombre>; los enlaces (Drive, Docs, Figma, YouTube…) son filas con url.
--
-- Cupo por espacio (spaces.storage_limit_bytes, 1 GB en el plan gratis). El tamaño y el tipo
-- de cada archivo los pone la base leyendo storage.objects, nunca el navegador; el límite solo
-- lo cambia el servidor (plan de pago a futuro).
-- ============================================================

alter table public.spaces add column storage_limit_bytes bigint not null default 1073741824
  check (storage_limit_bytes >= 0);

-- nadie cambia su propio cupo desde la app: solo service_role
create or replace function public.spaces_keep_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.storage_limit_bytes is distinct from old.storage_limit_bytes and coalesce(auth.role(), '') <> 'service_role' then
    new.storage_limit_bytes := old.storage_limit_bytes;
  end if;
  return new;
end $$;
create trigger spaces_keep_limit before update on public.spaces
  for each row execute function public.spaces_keep_limit();

create table public.material_folders (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  parent_id   uuid references public.material_folders(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  color       text not null default '#2a82ad' check (color ~ '^#[0-9a-fA-F]{6}$'),
  project_id  uuid references public.projects(id) on delete set null,
  position    double precision not null default 0,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index material_folders_space_idx on public.material_folders (space_id, parent_id, position);

create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  folder_id     uuid references public.material_folders(id) on delete cascade,  -- null = raíz
  kind          text not null check (kind in ('file', 'link')),
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  url           text check (url is null or url ~* '^https?://'),
  storage_path  text,
  mime          text not null default '',
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  note          text not null default '' check (char_length(note) <= 500),
  project_id    uuid references public.projects(id) on delete set null,
  task_id       uuid references public.tasks(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint materials_shape check (
    (kind = 'file' and storage_path is not null and url is null) or
    (kind = 'link' and url is not null and storage_path is null)
  )
);
create index materials_space_idx on public.materials (space_id, folder_id, created_at desc);
create unique index materials_path_uq on public.materials (storage_path) where storage_path is not null;

-- Coherencia: todo dentro del mismo espacio y sin carpetas en círculo.
create or replace function public.material_folders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Una carpeta no puede ir dentro de sí misma';
    end if;
    if not exists (select 1 from material_folders p where p.id = new.parent_id and p.space_id = new.space_id) then
      raise exception 'La carpeta de arriba es de otro espacio';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, parent_id from material_folders where id = new.parent_id
        union all
        select f.id, f.parent_id from material_folders f join up on f.id = up.parent_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'Eso armaría un círculo de carpetas';
    end if;
  end if;
  if new.project_id is not null and not exists (select 1 from projects where id = new.project_id and space_id = new.space_id) then
    raise exception 'El proyecto es de otro espacio';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger material_folders_guard before insert or update on public.material_folders
  for each row execute function public.material_folders_guard();

create or replace function public.materials_guard() returns trigger
language plpgsql security definer set search_path = public, storage as $$
declare
  meta jsonb;
  used bigint;
  lim bigint;
begin
  if new.folder_id is not null and not exists (select 1 from material_folders f where f.id = new.folder_id and f.space_id = new.space_id) then
    raise exception 'La carpeta es de otro espacio';
  end if;
  if new.project_id is not null and not exists (select 1 from projects where id = new.project_id and space_id = new.space_id) then
    raise exception 'El proyecto es de otro espacio';
  end if;
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and space_id = new.space_id) then
    raise exception 'La tarea es de otro espacio';
  end if;
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind or new.storage_path is distinct from old.storage_path or new.space_id <> old.space_id then
      raise exception 'Un material no cambia de tipo, de archivo ni de espacio';
    end if;
    new.size_bytes := old.size_bytes;
    new.mime := old.mime;
  elsif new.kind = 'file' then
    if split_part(new.storage_path, '/', 1) <> new.space_id::text then
      raise exception 'Ruta de archivo inválida';
    end if;
    select o.metadata into meta from storage.objects o where o.bucket_id = 'materiales' and o.name = new.storage_path;
    if not found then
      raise exception 'El archivo no se terminó de subir';
    end if;
    new.size_bytes := coalesce((meta->>'size')::bigint, 0);
    new.mime := coalesce(meta->>'mimetype', '');
    select coalesce(sum(size_bytes), 0) into used from materials where space_id = new.space_id and kind = 'file';
    select storage_limit_bytes into lim from spaces where id = new.space_id;
    if used + new.size_bytes > lim then
      raise exception 'Se llenó el espacio de materiales del equipo (% MB de % MB)',
        round((used + new.size_bytes) / 1048576.0), round(lim / 1048576.0);
    end if;
  else
    new.size_bytes := 0;
    new.mime := '';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger materials_guard before insert or update on public.materials
  for each row execute function public.materials_guard();

-- ¿Queda cupo? (lo usa la política del bucket antes de aceptar una subida)
create or replace function public.materials_room_left(sid_text text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  sid uuid;
begin
  begin
    sid := sid_text::uuid;
  exception when others then
    return false;
  end;
  return coalesce((select sum(size_bytes) from materials where space_id = sid and kind = 'file'), 0)
       < coalesce((select storage_limit_bytes from spaces where id = sid), 0);
end $$;
revoke execute on function public.materials_room_left(text) from public, anon;
grant execute on function public.materials_room_left(text) to authenticated;

alter table public.material_folders enable row level security;
alter table public.materials enable row level security;
revoke all on public.material_folders, public.materials from anon;
grant select, insert, update, delete on public.material_folders, public.materials to authenticated;

create policy material_folders_members on public.material_folders for all to authenticated
  using (public.is_member(space_id)) with check (public.is_member(space_id));
create policy materials_members on public.materials for all to authenticated
  using (public.is_member(space_id)) with check (public.is_member(space_id));

-- Bucket privado: 50 MB por archivo; se lee, sube y borra solo dentro de tu espacio.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materiales', 'materiales', false, 52428800)
on conflict (id) do nothing;

create policy materiales_read on storage.objects for select to authenticated
  using (bucket_id = 'materiales' and public.is_member_text((storage.foldername(name))[1]));
create policy materiales_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materiales' and public.is_member_text((storage.foldername(name))[1])
              and public.materials_room_left((storage.foldername(name))[1]));
create policy materiales_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materiales' and public.is_member_text((storage.foldername(name))[1]));

alter publication supabase_realtime add table public.material_folders, public.materials;
