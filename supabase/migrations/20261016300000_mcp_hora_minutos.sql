-- El conector también fija la hora (start_time) y los minutos estimados (estimate_min) de una tarea: los usa la vista
-- «Hoy» de Tareas (carriles por persona con horas). Mismas reglas que 20261016170000_mcp_frentes.

drop function if exists public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text, uuid);
create or replace function public.mcp_crear_tarea(
  p_uid uuid, p_space uuid, p_title text, p_notes text default '', p_status text default 'todo',
  p_area uuid default null, p_assignee uuid default null, p_due date default null, p_priority text default 'normal',
  p_project uuid default null, p_start_time time default null, p_estimate_min integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  perform public.mcp_como(p_uid, p_space);
  if p_project is not null and not exists (select 1 from projects where id = p_project and space_id = p_space) then
    raise exception 'Ese frente no es de este proyecto';
  end if;
  insert into tasks (space_id, title, notes, status, area_id, assignee_id, due_date, priority, project_id, start_time, estimate_min, created_by, position)
  values (p_space, left(p_title, 200), coalesce(p_notes, ''), coalesce(p_status, 'todo'), p_area, p_assignee, p_due,
          coalesce(p_priority, 'normal'), p_project, p_start_time, p_estimate_min, p_uid,
          coalesce((select max(position) from tasks where space_id = p_space), 0) + 1)
  returning id into tid;
  return tid;
end $$;

-- p_patch: status, title, notes (reemplaza), area_id, assignee_id, due_date, priority, project_id, start_time,
-- estimate_min (solo las que vengan; '' = quitarla)
create or replace function public.mcp_actualizar_tarea(p_uid uuid, p_task uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select space_id into sid from tasks where id = p_task;
  if sid is null then raise exception 'No existe esa tarea'; end if;
  perform public.mcp_como(p_uid, sid);
  if p_patch ? 'project_id' and nullif(p_patch->>'project_id', '') is not null
     and not exists (select 1 from projects where id = (p_patch->>'project_id')::uuid and space_id = sid) then
    raise exception 'Ese frente no es de este proyecto';
  end if;
  update tasks set
    status       = case when p_patch ? 'status' then p_patch->>'status' else status end,
    title        = case when p_patch ? 'title' then left(p_patch->>'title', 200) else title end,
    notes        = case when p_patch ? 'notes' then coalesce(p_patch->>'notes', '') else notes end,
    area_id      = case when p_patch ? 'area_id' then nullif(p_patch->>'area_id', '')::uuid else area_id end,
    assignee_id  = case when p_patch ? 'assignee_id' then nullif(p_patch->>'assignee_id', '')::uuid else assignee_id end,
    due_date     = case when p_patch ? 'due_date' then nullif(p_patch->>'due_date', '')::date else due_date end,
    priority     = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    project_id   = case when p_patch ? 'project_id' then nullif(p_patch->>'project_id', '')::uuid else project_id end,
    start_time   = case when p_patch ? 'start_time' then nullif(p_patch->>'start_time', '')::time else start_time end,
    estimate_min = case when p_patch ? 'estimate_min' then nullif(p_patch->>'estimate_min', '')::integer else estimate_min end,
    updated_at   = now()
  where id = p_task;
end $$;

revoke all on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text, uuid, time, integer) from public, anon, authenticated;
revoke all on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text, uuid, time, integer) to service_role;
grant execute on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) to service_role;
