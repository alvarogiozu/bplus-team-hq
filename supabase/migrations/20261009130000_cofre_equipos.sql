-- ============================================================
-- El Cofre — tanda 2: equipos/proyectos (docs/privacidad.md)
-- Tareas, metas, eventos, materiales, logros y lo del equipo se cifran con la llave del equipo.
-- Aquí: techos de largo para el texto cifrado, la actividad que no delata títulos al sellar,
-- y las invitaciones que llevan la llave del equipo (cerrada con un secreto que va después del # del enlace).
-- ============================================================

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
       and pg_get_constraintdef(c.oid) ilike '%char_length%'
  loop
    execute format('alter table public.%I drop constraint %I', p_tabla, r.conname);
  end loop;
  execute format('alter table public.%I add constraint %I check (char_length(%I) between %s and %s)',
                 p_tabla, p_tabla || '_' || p_col || '_largo', p_col, p_min, p_max);
end;
$$;

select pg_temp.cofre_ampliar('tasks', 'title', 1, 2000);
select pg_temp.cofre_ampliar('goals', 'title', 1, 2000);
select pg_temp.cofre_ampliar('goals', 'description', 0, 20000);
select pg_temp.cofre_ampliar('goals', 'unit', 0, 400);
select pg_temp.cofre_ampliar('goal_checkins', 'note', 0, 6000);
select pg_temp.cofre_ampliar('spaces', 'mission', 0, 6000);
select pg_temp.cofre_ampliar('material_folders', 'name', 1, 2000);
select pg_temp.cofre_ampliar('materials', 'name', 1, 2000);
select pg_temp.cofre_ampliar('materials', 'note', 0, 6000);
select pg_temp.cofre_ampliar('team_achievements', 'title', 1, 2000);
select pg_temp.cofre_ampliar('team_achievements', 'description', 0, 3000);

-- Sellar un título (pasar de texto en claro a cf1…) no es «renombrar»: no se anota en la actividad
-- (si no, la actividad guardaría el título viejo en claro).
create or replace function public.tasks_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text; s text; d jsonb := '{}'::jsonb; sid uuid; eid uuid;
begin
  if coalesce(current_setting('hq.importing', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    sid := new.space_id; eid := new.id; v := 'created'; s := 'creó «' || new.title || '»';
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from spaces where id = old.space_id) then return null; end if;
    sid := old.space_id; eid := old.id; v := 'deleted'; s := 'borró «' || old.title || '»';
    d := jsonb_build_object('before', to_jsonb(old));
  else
    sid := new.space_id; eid := new.id;
    if new.validation is not null and old.validation is null then
      v := 'validated';
      s := 'validó «' || new.title || '»' || case when new.validation = 'proof' then ' con prueba' else '' end;
    elsif old.validation is not null and new.validation is null then
      v := 'reopened'; s := 'reabrió «' || new.title || '»';
    elsif new.status <> old.status then
      v := 'moved';
      s := 'movió «' || new.title || '» a '
           || case new.status when 'todo' then 'Por hacer' when 'doing' then 'En curso' else 'Hecho' end;
    elsif new.assignee_id is distinct from old.assignee_id then
      v := 'assigned';
      s := 'le pasó «' || new.title || '» a '
           || coalesce((select display_name from profiles where id = new.assignee_id), 'nadie');
    elsif new.due_date is distinct from old.due_date then
      v := 'rescheduled';
      s := case when new.due_date is null then 'quitó la fecha de «' || new.title || '»'
                else 'puso «' || new.title || '» para el ' || to_char(new.due_date, 'DD/MM') end;
    elsif new.title <> old.title then
      if new.title like 'cf1.%' and old.title not like 'cf1.%' then return null; end if;
      v := 'renamed'; s := 'renombró «' || old.title || '» a «' || new.title || '»';
    else
      return null;
    end if;
    d := jsonb_build_object('before', jsonb_build_object(
      'status', old.status, 'assignee_id', old.assignee_id, 'due_date', old.due_date,
      'start_date', old.start_date, 'title', old.title));
  end if;
  insert into activity (space_id, actor_id, verb, entity_type, entity_id, summary, data)
  values (sid, auth.uid(), v, 'task', eid, s, d);
  return null;
end $$;

-- La actividad la arma el servidor y nadie la edita. Un miembro solo puede SELLARLA una vez:
-- cambiar un texto en claro por su versión cifrada (cf1/cj1), nunca otra cosa.
create or replace function public.cofre_sellar_actividad(p_id uuid, p_campos jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a activity;
  s text := p_campos->>'summary';
  d jsonb := p_campos->'data';
begin
  select * into a from activity where id = p_id;
  if not found or not public.is_member(a.space_id) then return false; end if;
  if s is not null and (s not like 'cf1.%' or a.summary like 'cf1.%') then s := null; end if;
  if d is not null and (jsonb_typeof(d) <> 'string' or d #>> '{}' not like 'cj1.%' or jsonb_typeof(a.data) = 'string') then
    d := null;
  end if;
  if s is null and d is null then return false; end if;
  update activity set summary = coalesce(s, summary), data = coalesce(d, data) where id = p_id;
  return true;
end $$;
revoke all on function public.cofre_sellar_actividad(uuid, jsonb) from public, anon;
grant execute on function public.cofre_sellar_actividad(uuid, jsonb) to authenticated;

-- Invitación con llave: el dueño deja aquí las llaves del equipo cerradas con un secreto que solo viaja en el
-- enlace (después del #, que el navegador nunca manda al servidor). Quien entra con el enlace las abre al instante.
create table public.cofre_invitaciones (
  invite_id uuid primary key references public.invites(id) on delete cascade,
  paquete   jsonb not null check (jsonb_typeof(paquete) = 'object'),
  creado    timestamptz not null default now()
);
alter table public.cofre_invitaciones enable row level security;
create policy cofre_invitaciones_duenio on public.cofre_invitaciones for all to authenticated
  using (exists (select 1 from invites i where i.id = invite_id and public.is_owner(i.space_id)))
  with check (exists (select 1 from invites i where i.id = invite_id and public.is_owner(i.space_id)));

-- Para quien ya entró al equipo con el código: el paquete de su invitación (inservible sin el secreto del enlace).
create or replace function public.cofre_invitacion(p_code text)
returns table (space_id uuid, paquete jsonb)
language sql stable security definer set search_path = public as $$
  select i.space_id, ci.paquete
    from invites i
    join cofre_invitaciones ci on ci.invite_id = i.id
   where i.code = upper(trim(p_code))
     and public.is_member(i.space_id)
$$;
revoke all on function public.cofre_invitacion(text) from public, anon;
grant execute on function public.cofre_invitacion(text) to authenticated;

-- Volver a subir cifrado un archivo de antes del Cofre: es el único cambio de ruta permitido
-- (la misma ruta con «.cofre» antes de la extensión, como hace lib/cofre/archivos.ts).
create or replace function public.cofre_ruta_sellada(p_vieja text, p_nueva text) returns boolean
language sql immutable as $$
  select p_vieja is not null and p_vieja not like '%.cofre%'
     and p_nueva = regexp_replace(p_vieja, '(\.[a-z0-9]+)?$', '.cofre\1', 'i')
$$;

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
    if new.kind <> old.kind or new.space_id <> old.space_id
       or (new.storage_path is distinct from old.storage_path and not public.cofre_ruta_sellada(old.storage_path, new.storage_path)) then
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
