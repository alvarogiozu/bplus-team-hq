-- Las mcp_* con la «llave temporal para Claude» (20261016270000): el conector escribe CIFRADO (cf1/cj1 con el kid
-- vigente del proyecto) y la base guarda lo que llega, sin recortarlo ni abrirlo.
--  - mcp_como: el proyecto vale si la persona es miembro y le dio a Claude una llave vigente que lo cubre (la de ese
--    proyecto o la de «todo»), o, mientras dure la migración, si sigue «abierto para Claude» (modo viejo, en claro).
--  - Crear y actualizar: un título cifrado no se recorta (left() lo rompería); uno en claro, a 200 como siempre.
--  - La nota de una tarea copia el título y el nombre del frente tal cual estén (cifrados con la misma llave del
--    equipo) y recibe el cuerpo ya cifrado.

create or replace function public.mcp_como(p_uid uuid, p_space uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from space_members where space_id = p_space and user_id = p_uid) then
    raise exception 'No eres miembro de ese proyecto';
  end if;
  if not (
    coalesce((select abierto_claude from spaces where id = p_space), false)
    or exists (select 1 from claude_llaves l where l.user_id = p_uid and l.vence > now() and (l.ambito = 'todo' or l.space_id = p_space))
  ) then
    raise exception 'Ese proyecto no está abierto para Claude';
  end if;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
revoke all on function public.mcp_como(uuid, uuid) from public, anon, authenticated;

/** Un título en claro, a 200; uno cifrado, entero. */
create or replace function public.mcp_titulo(v text) returns text
language sql immutable as $$ select case when v ~ '^c[fj]1\.' then v else left(v, 200) end $$;
revoke all on function public.mcp_titulo(text) from public, anon, authenticated;

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
  values (p_space, public.mcp_titulo(p_title), coalesce(p_notes, ''), coalesce(p_status, 'todo'), p_area, p_assignee, p_due,
          coalesce(p_priority, 'normal'), p_project, p_start_time, p_estimate_min, p_uid,
          coalesce((select max(position) from tasks where space_id = p_space), 0) + 1)
  returning id into tid;
  return tid;
end $$;

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
    title        = case when p_patch ? 'title' then public.mcp_titulo(p_patch->>'title') else title end,
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

-- p_body llega como deba guardarse (cifrado con la llave del equipo, o en claro en el modo viejo)
create or replace function public.mcp_crear_nota_tarea(p_uid uuid, p_task uuid, p_body text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t   tasks;
  pr  projects;
  nid uuid;
  mid uuid;
  fid uuid;
begin
  select * into t from tasks where id = p_task;
  if t.id is null then raise exception 'No existe esa tarea'; end if;
  perform public.mcp_como(p_uid, t.space_id);

  select m.id, m.note_id into mid, nid from materials m where m.task_id = p_task and m.kind = 'note' limit 1;
  if mid is not null then
    return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', true);
  end if;

  -- la carpeta de su frente (su nombre se copia como esté: en claro o cifrado con la llave del equipo)
  if t.project_id is not null then
    select f.id into fid from material_folders f
     where f.space_id = t.space_id and f.project_id = t.project_id and f.parent_id is null
     order by f.position, f.created_at limit 1;
    if fid is null then
      select * into pr from projects where id = t.project_id;
      if pr.id is not null then
        insert into material_folders (space_id, name, color, project_id, position, created_by)
        values (t.space_id, case when pr.name ~ '^c[fj]1\.' then pr.name else left(btrim(pr.name), 80) end,
                coalesce(nullif(pr.color, ''), '#2a82ad'), pr.id,
                coalesce((select max(position) from material_folders where space_id = t.space_id and parent_id is null), 0) + 1, p_uid)
        returning id into fid;
      end if;
    end if;
  end if;

  insert into cuaderno_notes (user_id, title, body, kind, area, space_id)
  values (p_uid, case when t.title ~ '^c[fj]1\.' then t.title else left(t.title, 160) end, coalesce(p_body, ''), 'pagina', 'proyectos', t.space_id)
  returning id into nid;
  begin
    insert into materials (space_id, folder_id, kind, name, note_id, task_id, created_by)
    values (t.space_id, fid, 'note', public.mcp_titulo(t.title), nid, p_task, p_uid)
    returning id into mid;
  exception when unique_violation then
    delete from cuaderno_notes where id = nid;
    select m.id, m.note_id into mid, nid from materials m where m.task_id = p_task and m.kind = 'note' limit 1;
    return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', true);
  end;
  return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', false, 'carpeta', fid is not null);
end $$;

revoke all on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text, uuid, time, integer) from public, anon, authenticated;
revoke all on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mcp_crear_nota_tarea(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mcp_crear_tarea(uuid, uuid, text, text, text, uuid, uuid, date, text, uuid, time, integer) to service_role;
grant execute on function public.mcp_actualizar_tarea(uuid, uuid, jsonb) to service_role;
grant execute on function public.mcp_crear_nota_tarea(uuid, uuid, text) to service_role;
