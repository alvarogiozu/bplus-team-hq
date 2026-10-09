-- Proyectos abiertos para Claude (el conector rockie.plus/mcp).
-- Igual que las libretas del Cuaderno: el proyecto está cifrado en el dispositivo (el Cofre) y el servidor no lo puede
-- leer. Si su DUEÑO lo abre para Claude, su nombre, sus áreas y sus tareas pasan a guardarse en claro (la app las
-- descifra y las reescribe la próxima vez que las lee) para que el conector las vea y las mueva. Al cerrarlo, la app
-- las vuelve a cifrar. Lo marca `abierta` en cada fila (se calcula sola, aquí abajo).

alter table public.spaces add column if not exists abierto_claude boolean not null default false;
alter table public.tasks add column if not exists abierta boolean not null default false;
alter table public.areas add column if not exists abierta boolean not null default false;
alter table public.projects add column if not exists abierta boolean not null default false;

-- solo el dueño abre o cierra su proyecto para Claude
create or replace function public.spaces_claude_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abierto_claude is distinct from old.abierto_claude
     and coalesce(auth.role(), '') <> 'service_role' and not public.is_owner(new.id) then
    raise exception 'Solo el dueño del proyecto puede abrirlo para Claude';
  end if;
  return new;
end $$;
drop trigger if exists spaces_claude_guard on public.spaces;
create trigger spaces_claude_guard before update of abierto_claude on public.spaces
  for each row execute function public.spaces_claude_guard();

-- cada tarea, área o etapa nace (o se mueve) con la marca de su proyecto
create or replace function public.fila_abierta_por_proyecto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.abierta := coalesce((select abierto_claude from spaces where id = new.space_id), false);
  return new;
end $$;
drop trigger if exists tasks_abierta on public.tasks;
create trigger tasks_abierta before insert or update of space_id on public.tasks
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists areas_abierta on public.areas;
create trigger areas_abierta before insert or update of space_id on public.areas
  for each row execute function public.fila_abierta_por_proyecto();
drop trigger if exists projects_abierta on public.projects;
create trigger projects_abierta before insert or update of space_id on public.projects
  for each row execute function public.fila_abierta_por_proyecto();

-- abrir o cerrar el proyecto marca (o desmarca) todo lo suyo de una vez
create or replace function public.spaces_claude_propaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abierto_claude is distinct from old.abierto_claude then
    update tasks set abierta = new.abierto_claude where space_id = new.id;
    update areas set abierta = new.abierto_claude where space_id = new.id;
    update projects set abierta = new.abierto_claude where space_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists spaces_claude_propaga on public.spaces;
create trigger spaces_claude_propaga after update of abierto_claude on public.spaces
  for each row execute function public.spaces_claude_propaga();

-- ——— lo que escribe el conector, como la persona que lo conectó ———
-- El conector usa la llave de servicio (no hay sesión): estas funciones se ponen en el lugar de esa persona
-- (auth.uid() = ella) para que la actividad diga «Álvaro movió…» y las reglas de las tareas valgan igual que en la app.
-- Solo la llave de servicio las puede llamar, y solo sobre proyectos abiertos para Claude de los que esa persona es
-- miembro.

create or replace function public.mcp_como(p_uid uuid, p_space uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from space_members where space_id = p_space and user_id = p_uid) then
    raise exception 'No eres miembro de ese proyecto';
  end if;
  if not coalesce((select abierto_claude from spaces where id = p_space), false) then
    raise exception 'Ese proyecto no está abierto para Claude';
  end if;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function public.mcp_crear_tarea(
  p_uid uuid, p_space uuid, p_title text, p_notes text default '', p_status text default 'todo',
  p_area uuid default null, p_assignee uuid default null, p_due date default null, p_priority text default 'normal'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  perform public.mcp_como(p_uid, p_space);
  insert into tasks (space_id, title, notes, status, area_id, assignee_id, due_date, priority, created_by, position)
  values (p_space, left(p_title, 200), coalesce(p_notes, ''), coalesce(p_status, 'todo'), p_area, p_assignee, p_due,
          coalesce(p_priority, 'normal'), p_uid,
          coalesce((select max(position) from tasks where space_id = p_space), 0) + 1)
  returning id into tid;
  return tid;
end $$;

-- p_patch: status, title, notes (reemplaza), area_id, assignee_id, due_date, priority (solo las que vengan)
create or replace function public.mcp_actualizar_tarea(p_uid uuid, p_task uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select space_id into sid from tasks where id = p_task;
  if sid is null then raise exception 'No existe esa tarea'; end if;
  perform public.mcp_como(p_uid, sid);
  update tasks set
    status      = case when p_patch ? 'status' then p_patch->>'status' else status end,
    title       = case when p_patch ? 'title' then left(p_patch->>'title', 200) else title end,
    notes       = case when p_patch ? 'notes' then coalesce(p_patch->>'notes', '') else notes end,
    area_id     = case when p_patch ? 'area_id' then nullif(p_patch->>'area_id', '')::uuid else area_id end,
    assignee_id = case when p_patch ? 'assignee_id' then nullif(p_patch->>'assignee_id', '')::uuid else assignee_id end,
    due_date    = case when p_patch ? 'due_date' then nullif(p_patch->>'due_date', '')::date else due_date end,
    priority    = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    updated_at  = now()
  where id = p_task;
end $$;

revoke all on function public.mcp_como(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text) to service_role;
grant execute on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) to service_role;
