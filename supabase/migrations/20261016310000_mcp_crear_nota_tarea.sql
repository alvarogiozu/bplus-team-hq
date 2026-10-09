-- El conector crea «la nota del proyecto» de una tarea (decisión del 9 oct): una página del Cuaderno compartida con el
-- equipo (cuaderno_notes con space_id) y su material kind 'note' atado a la tarea, en la carpeta de primer nivel de su
-- frente (si no existe y el nombre del frente está en claro, se crea con su nombre y color; si no, sin carpeta).
-- El Cofre no se toca: «abierta» la ponen los triggers desde spaces.abierto_claude (20261016250000) y mcp_como exige
-- que el proyecto esté abierto para Claude, así que todo lo que se escribe aquí es lo que ese proyecto ya tiene en
-- claro. Una nota por tarea (materials_task_note): si ya existe, devuelve esa.

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
  if t.title ~ '^c[fj]1\.' then raise exception 'La tarea todavía está cifrada: se abre cuando su dueño entra a Rockie'; end if;

  select m.id, m.note_id into mid, nid from materials m where m.task_id = p_task and m.kind = 'note' limit 1;
  if mid is not null then
    return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', true);
  end if;

  -- la carpeta de su frente
  if t.project_id is not null then
    select f.id into fid from material_folders f
     where f.space_id = t.space_id and f.project_id = t.project_id and f.parent_id is null
     order by f.position, f.created_at limit 1;
    if fid is null then
      select * into pr from projects where id = t.project_id;
      if pr.id is not null and pr.name !~ '^c[fj]1\.' then
        insert into material_folders (space_id, name, color, project_id, position, created_by)
        values (t.space_id, left(btrim(pr.name), 80), coalesce(nullif(pr.color, ''), '#2a82ad'), pr.id,
                coalesce((select max(position) from material_folders where space_id = t.space_id and parent_id is null), 0) + 1, p_uid)
        returning id into fid;
      end if;
    end if;
  end if;

  insert into cuaderno_notes (user_id, title, body, kind, area, space_id)
  values (p_uid, left(t.title, 160), left(coalesce(p_body, ''), 60000), 'pagina', 'proyectos', t.space_id)
  returning id into nid;
  begin
    insert into materials (space_id, folder_id, kind, name, note_id, task_id, created_by)
    values (t.space_id, fid, 'note', left(t.title, 200), nid, p_task, p_uid)
    returning id into mid;
  exception when unique_violation then
    -- otra la creó al mismo tiempo: se usa esa y esta página se descarta
    delete from cuaderno_notes where id = nid;
    select m.id, m.note_id into mid, nid from materials m where m.task_id = p_task and m.kind = 'note' limit 1;
    return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', true);
  end;
  return jsonb_build_object('note_id', nid, 'material_id', mid, 'ya_existia', false, 'carpeta', fid is not null);
end $$;
revoke all on function public.mcp_crear_nota_tarea(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mcp_crear_nota_tarea(uuid, uuid, text) to service_role;
