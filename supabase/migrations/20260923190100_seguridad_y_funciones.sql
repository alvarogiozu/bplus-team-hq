-- ============================================================
-- B+ HQ v3 — seguridad (RLS), triggers y funciones
-- Regla de oro: el cliente nunca escribe XP. Solo validate_task()
-- (security definer, transaccional) inserta en xp_log.
-- ============================================================

-- ---------- helpers de pertenencia ----------
create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid())
$$;

create or replace function public.is_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid() and role = 'owner')
$$;

-- para policies de Storage: la carpeta raiz es el id del espacio
create or replace function public.is_member_text(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when sid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_member(sid::uuid) else false end
$$;

create or replace function public.shares_space(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or exists (
    select 1 from space_members a join space_members b on a.space_id = b.space_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;

-- "hoy" en la zona horaria del usuario (default America/Lima)
create or replace function public.user_today(uid uuid default auth.uid()) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from profiles where id = uid), 'America/Lima'))::date
$$;

create or replace function public.hq_norm(x text) returns text
language sql immutable as $$
  select lower(trim(translate(coalesce(x, ''), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')))
$$;

-- codigo sin caracteres ambiguos (32 simbolos => byte % 32 es uniforme)
create or replace function public.gen_code(n int default 8) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(n);
  r text := '';
begin
  for i in 0..n - 1 loop
    r := r || substr(a, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return r;
end $$;

-- ---------- alta de usuario => perfil ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u  text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  dn text := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), u);
  c  text := new.raw_user_meta_data->>'color';
begin
  if c is null or c !~ '^#[0-9a-fA-F]{6}$' then c := '#2a82ad'; end if;
  insert into public.profiles (id, username, display_name, color)
  values (new.id, u, left(dn, 40), c);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  perform now() at time zone new.timezone;   -- falla si la zona no existe
  if new.color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color invalido'; end if;
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- miembros: siempre al menos un dueño ----------
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.space_id <> old.space_id or new.user_id <> old.user_id then
      raise exception 'No permitido';
    end if;
    if new.role <> old.role and not public.is_owner(old.space_id) then
      raise exception 'Solo el dueño cambia roles';
    end if;
    if old.role = 'owner' and new.role <> 'owner'
       and (select count(*) from space_members where space_id = old.space_id and role = 'owner') <= 1 then
      raise exception 'El espacio necesita al menos un dueño';
    end if;
    return new;
  end if;
  -- DELETE (si el espacio entero se esta borrando, dejar pasar)
  if old.role = 'owner' and exists (select 1 from spaces where id = old.space_id)
     and (select count(*) from space_members where space_id = old.space_id and role = 'owner') <= 1 then
    raise exception 'El espacio necesita al menos un dueño';
  end if;
  return old;
end $$;
create trigger members_guard before update or delete on public.space_members
  for each row execute function public.members_guard();

-- al salir alguien, sus tareas pasan a quien lo quito (o al dueño): nunca quedan sin responsable
create or replace function public.members_reassign() returns trigger
language plpgsql security definer set search_path = public as $$
declare heir uuid;
begin
  if not exists (select 1 from spaces where id = old.space_id) then return old; end if;
  select user_id into heir from space_members
   where space_id = old.space_id and user_id = auth.uid();
  if heir is null then
    select user_id into heir from space_members
     where space_id = old.space_id and role = 'owner' order by created_at limit 1;
  end if;
  update tasks set assignee_id = heir where space_id = old.space_id and assignee_id = old.user_id;
  return old;
end $$;
create trigger members_reassign after delete on public.space_members
  for each row execute function public.members_reassign();

-- ---------- tareas: integridad + anti-trampa ----------
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare validating boolean := coalesce(current_setting('hq.validating', true), '') = '1';
begin
  if tg_op = 'UPDATE' and new.space_id <> old.space_id then
    raise exception 'Una tarea no cambia de espacio';
  end if;
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from space_members where space_id = new.space_id and user_id = new.assignee_id) then
    raise exception 'El responsable no es miembro del espacio';
  end if;
  if new.area_id is not null and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id)
     and not exists (select 1 from areas where id = new.area_id and space_id = new.space_id) then
    raise exception 'Esa área es de otro espacio';
  end if;
  if new.project_id is not null and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
     and not exists (select 1 from projects where id = new.project_id and space_id = new.space_id) then
    raise exception 'Ese proyecto es de otro espacio';
  end if;

  if tg_op = 'INSERT' then
    if not validating then
      new.validation := null; new.validated_at := null; new.validated_by := null;
    end if;
    return new;
  end if;

  -- la validacion solo la escribe validate_task()
  if not validating then
    new.validation := old.validation; new.validated_at := old.validated_at; new.validated_by := old.validated_by;
  end if;
  -- reabrir una validada = se revoca la validacion y su XP
  if old.status = 'done' and new.status <> 'done' and old.validation is not null then
    new.validation := null; new.validated_at := null; new.validated_by := null;
    delete from xp_log where task_id = old.id;
  end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------- actividad automatica de tareas ----------
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
create trigger tasks_activity after insert or update or delete on public.tasks
  for each row execute function public.tasks_activity();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles              enable row level security;
alter table public.spaces                enable row level security;
alter table public.space_members         enable row level security;
alter table public.invites               enable row level security;
alter table public.areas                 enable row level security;
alter table public.projects              enable row level security;
alter table public.tasks                 enable row level security;
alter table public.events                enable row level security;
alter table public.event_attendees       enable row level security;
alter table public.event_tasks           enable row level security;
alter table public.xp_log                enable row level security;
alter table public.achievements_unlocked enable row level security;
alter table public.activity              enable row level security;
alter table public.agent_messages        enable row level security;

-- privilegios explicitos: anon no toca tablas; authenticated pasa por RLS
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- el username es la llave del login (email sintetico): no se cambia
revoke update on public.profiles from authenticated;
grant update (display_name, color, timezone, avatar_rockie, must_change_password) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;
-- xp, logros y actividad: solo lectura para el cliente
revoke insert, update, delete on public.xp_log, public.achievements_unlocked, public.activity from authenticated;

create policy profiles_read on public.profiles for select to authenticated using (public.shares_space(id));
create policy profiles_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy spaces_read on public.spaces for select to authenticated using (public.is_member(id));
create policy spaces_write on public.spaces for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy members_read on public.space_members for select to authenticated using (public.is_member(space_id));
create policy members_update on public.space_members for update to authenticated
  using (public.is_owner(space_id) or user_id = auth.uid())
  with check (public.is_owner(space_id) or user_id = auth.uid());
create policy members_delete on public.space_members for delete to authenticated
  using (public.is_owner(space_id) or user_id = auth.uid());

create policy invites_owner on public.invites for all to authenticated
  using (public.is_owner(space_id)) with check (public.is_owner(space_id));

do $$
declare t text;
begin
  foreach t in array array['areas','projects','tasks','events','event_attendees','event_tasks'] loop
    execute format('create policy %1$s_members on public.%1$s for all to authenticated
      using (public.is_member(space_id)) with check (public.is_member(space_id))', t);
  end loop;
  foreach t in array array['xp_log','achievements_unlocked','activity'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated
      using (public.is_member(space_id))', t);
  end loop;
end $$;

create policy agent_messages_own on public.agent_messages for all to authenticated
  using (user_id = auth.uid() and public.is_member(space_id))
  with check (user_id = auth.uid() and public.is_member(space_id));

-- ---------- Storage: fotos de prueba, carpeta = id del espacio ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do nothing;

create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.is_member_text((storage.foldername(name))[1]));
create policy proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and public.is_member_text((storage.foldername(name))[1]));
create policy proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_member_text((storage.foldername(name))[1]));

-- ---------- Realtime ----------
alter publication supabase_realtime add table
  public.tasks, public.events, public.projects, public.xp_log, public.activity,
  public.space_members, public.achievements_unlocked;

-- ============================================================
-- RPCs
-- ============================================================

-- registro: ¿esta libre el usuario? (se llama antes de crear la cuenta)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(trim(p_username)))
$$;

create or replace function public.create_space(p_name text default 'B+') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into spaces (name, created_by) values (left(coalesce(nullif(trim(p_name), ''), 'B+'), 60), uid)
  returning id into sid;
  insert into space_members (space_id, user_id, role) values (sid, uid, 'owner');
  insert into areas (space_id, name, color, position) values
    (sid, 'App', '#2e88aa', 0), (sid, 'PCB', '#b4637a', 1), (sid, 'Firmware', '#8aa54a', 2),
    (sid, '3D', '#659ca5', 3), (sid, 'Kickstarter', '#eaa545', 4), (sid, 'Video', '#bd6c56', 5),
    (sid, 'Diseño', '#a573a5', 6), (sid, 'Gestión', '#4a6fa5', 7);
  return sid;
end $$;

-- invitacion: una activa por espacio; regenerar = la anterior caduca
create or replace function public.create_invite(p_space uuid) returns public.invites
language plpgsql security definer set search_path = public as $$
declare r invites;
begin
  if not public.is_owner(p_space) then raise exception 'Solo el dueño puede invitar'; end if;
  update invites set expires_at = now() where space_id = p_space and expires_at > now();
  insert into invites (space_id, code, created_by) values (p_space, public.gen_code(8), auth.uid())
  returning * into r;
  return r;
end $$;

create or replace function public.invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('space_name', s.name, 'valid', i.expires_at > now())
  from invites i join spaces s on s.id = i.space_id
  where i.code = upper(trim(p_code))
$$;

create or replace function public.join_space(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into i from invites where code = upper(trim(p_code));
  if not found then raise exception 'Ese código de invitación no existe'; end if;
  if i.expires_at <= now() then raise exception 'La invitación caducó. Pídele un enlace nuevo al dueño.'; end if;
  insert into space_members (space_id, user_id, role) values (i.space_id, auth.uid(), 'member')
  on conflict (space_id, user_id) do nothing;
  update invites set used_count = used_count + 1 where id = i.id;
  return i.space_id;
end $$;

-- racha del equipo: dias seguidos con al menos una validacion (hasta hoy o ayer)
create or replace function public.team_streak(sid uuid) returns int
language sql stable security definer set search_path = public as $$
  with d as (select distinct day from xp_log where space_id = sid),
  a as (select case when exists (select 1 from d where day = public.user_today())
                    then public.user_today() else public.user_today() - 1 end as anchor),
  r as (select d.day, row_number() over (order by d.day desc) as rn from d, a where d.day <= a.anchor)
  select count(*)::int from r, a where r.day = a.anchor - (r.rn - 1)::int
$$;

-- logros del equipo (mismos 10 de la v2). Devuelve los recien desbloqueados.
create or replace function public.check_achievements(sid uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  n_all int; n_proof int; xp_total int; streak int; fresh text[] := '{}'; ok boolean; aid text;
  today date := public.user_today();
begin
  select count(*), count(*) filter (where mode = 'proof'), coalesce(sum(points), 0)
    into n_all, n_proof, xp_total from xp_log where space_id = sid;
  streak := public.team_streak(sid);
  foreach aid in array array['first','proof5','ten','streak3','streak7','xp500','xp2000','allin','hito','lategone'] loop
    ok := case aid
      when 'first'   then n_all >= 1
      when 'proof5'  then n_proof >= 5
      when 'ten'     then n_all >= 10
      when 'streak3' then streak >= 3
      when 'streak7' then streak >= 7
      when 'xp500'   then xp_total >= 500
      when 'xp2000'  then xp_total >= 2000
      when 'allin'   then not exists (
        select 1 from space_members m where m.space_id = sid
        and not exists (select 1 from xp_log l where l.space_id = sid and l.user_id = m.user_id))
      when 'hito'    then exists (
        select 1 from projects p where p.space_id = sid and not p.archived
        and exists (select 1 from tasks t where t.project_id = p.id)
        and not exists (select 1 from tasks t where t.project_id = p.id and t.validation is null))
      when 'lategone' then exists (select 1 from tasks where space_id = sid)
        and not exists (select 1 from tasks where space_id = sid and status <> 'done' and due_date < today)
    end;
    if ok then
      insert into achievements_unlocked (space_id, achievement_id) values (sid, aid)
      on conflict (space_id, achievement_id) do nothing;
      if found then fresh := fresh || aid; end if;
    end if;
  end loop;
  return fresh;
end $$;

-- VALIDAR: +40 hecho, +100 con prueba, x2 la primera del dia del responsable.
create or replace function public.validate_task(
  p_task uuid, p_mode text, p_proof_url text default null, p_proof_path text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tasks; owner uuid; d date; base int; first boolean; pts int; before_xp int; lv_before int; lv_after int;
begin
  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'Tarea no encontrada'; end if;
  if not public.is_member(t.space_id) then raise exception 'No eres miembro de este espacio'; end if;
  if t.validation is not null then raise exception 'Esa tarea ya está validada'; end if;
  if p_mode not in ('plain', 'proof') then raise exception 'Modo de validación inválido'; end if;
  p_proof_url := nullif(trim(coalesce(p_proof_url, '')), '');
  p_proof_path := nullif(trim(coalesce(p_proof_path, '')), '');
  if p_mode = 'proof' and p_proof_url is null and p_proof_path is null then
    raise exception 'La prueba necesita un link o una foto';
  end if;
  if p_proof_path is not null and p_proof_path not like t.space_id::text || '/%' then
    raise exception 'Esa foto no es de este espacio';
  end if;

  owner := coalesce(t.assignee_id, auth.uid());
  d := public.user_today(owner);
  base := case when p_mode = 'proof' then 100 else 40 end;
  first := not exists (select 1 from xp_log where space_id = t.space_id and user_id = owner and day = d);
  pts := case when first then base * 2 else base end;
  select coalesce(sum(points), 0) into before_xp from xp_log where space_id = t.space_id and user_id = owner;

  perform set_config('hq.validating', '1', true);
  update tasks set status = 'done', validation = p_mode,
    proof_url = coalesce(p_proof_url, proof_url), proof_image_path = coalesce(p_proof_path, proof_image_path),
    validated_at = now(), validated_by = auth.uid()
  where id = p_task;
  perform set_config('hq.validating', '0', true);

  insert into xp_log (space_id, user_id, task_id, mode, points, day) values (t.space_id, owner, p_task, p_mode, pts, d);

  lv_before := floor(sqrt(before_xp / 60.0))::int + 1;
  lv_after  := floor(sqrt((before_xp + pts) / 60.0))::int + 1;
  return jsonb_build_object(
    'points', pts, 'base', base, 'bonus', first, 'owner', owner,
    'leveled_up', lv_after > lv_before, 'level', lv_after,
    'achievements', to_jsonb(public.check_achievements(t.space_id)));
end $$;

-- IMPORTADOR del respaldo v2 (DB.exportJSON de la app anterior). Solo el dueño.
create or replace function public.import_v2(p_space uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m jsonb; a jsonb; h jsonb; t jsonb; l jsonb; n jsonb; ach text;
  member_map jsonb := '{}'; area_map jsonb := '{}'; task_map jsonb := '{}';
  uid uuid; aid uuid; tid uuid;
  unmatched text[] := '{}';
  first_open text; done_cols text[];
  n_tasks int := 0; n_projects int := 0; n_xp int := 0;
  st text; note text; proof text; md text; extra text := '';
begin
  if not public.is_owner(p_space) then raise exception 'Solo el dueño del espacio puede importar'; end if;
  if p is null or jsonb_typeof(p->'tasks') is distinct from 'array' then
    raise exception 'Ese archivo no parece un respaldo del HQ v2';
  end if;
  perform set_config('hq.importing', '1', true);
  perform set_config('hq.validating', '1', true);

  -- miembros: por nombre visible o usuario, sin tildes ni mayusculas
  for m in select * from jsonb_array_elements(coalesce(p->'members', '[]')) loop
    select sm.user_id into uid from space_members sm join profiles pr on pr.id = sm.user_id
     where sm.space_id = p_space
       and (public.hq_norm(pr.display_name) = public.hq_norm(m->>'name')
            or public.hq_norm(pr.username) = public.hq_norm(m->>'name'))
     limit 1;
    if uid is null then
      unmatched := unmatched || (m->>'name');
      member_map := member_map || jsonb_build_object(m->>'id', me);
    else
      member_map := member_map || jsonb_build_object(m->>'id', uid);
      update space_members
         set role_title = case when role_title = '' then coalesce(m->>'role', '') else role_title end,
             job_description = case when job_description = '' then coalesce(m->>'job', '') else job_description end
       where space_id = p_space and user_id = uid;
    end if;
  end loop;

  -- areas: se reutilizan por nombre, las nuevas se crean
  for a in select * from jsonb_array_elements(coalesce(p->'areas', '[]')) loop
    select id into aid from areas where space_id = p_space and public.hq_norm(name) = public.hq_norm(a->>'name') limit 1;
    if aid is null then
      insert into areas (space_id, name, color, position)
      values (p_space, coalesce(a->>'name', 'Área'), coalesce(a->>'c', '#4a6fa5'),
              (select coalesce(max(position), -1) + 1 from areas where space_id = p_space))
      returning id into aid;
    end if;
    area_map := area_map || jsonb_build_object(a->>'id', aid);
  end loop;

  -- hitos => proyectos (el % manual se descarta: ahora se calcula)
  for h in select * from jsonb_array_elements(coalesce(p->'hitos', '[]')) loop
    insert into projects (space_id, name, description, color, due_date)
    values (p_space, coalesce(nullif(h->>'t', ''), 'Proyecto'), coalesce(h->>'d', ''),
            case when coalesce(h->>'c', '') ~ '^#[0-9a-fA-F]{6}$' then h->>'c' else '#b4637a' end,
            case when coalesce(h->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (h->>'date')::date end);
    n_projects := n_projects + 1;
  end loop;

  -- columnas => estado: la de cierre es "done", la primera abierta "todo", el resto "doing"
  select array_agg(c->>'id') into done_cols from jsonb_array_elements(coalesce(p->'columns', '[]')) c where c->>'kind' = 'done';
  select c->>'id' into first_open from jsonb_array_elements(coalesce(p->'columns', '[]')) c where c->>'kind' = 'open' limit 1;
  done_cols := coalesce(done_cols, array['done']);
  first_open := coalesce(first_open, 'todo');

  for t in select * from jsonb_array_elements(p->'tasks') loop
    st := case when (t->>'col') = any (done_cols) then 'done'
               when (t->>'col') in (first_open, 'todo') then 'todo' else 'doing' end;
    md := case when st = 'done' and (t->>'mode') in ('plain', 'proof') then t->>'mode' end;
    note := coalesce(t->>'note', '');
    -- en la v2, validar pisaba la nota con el link de prueba
    proof := case when md is not null and note ~* '^https?://\S+$' then note end;
    insert into tasks (space_id, title, notes, assignee_id, status, priority, due_date, position,
                       validation, proof_url, validated_at, validated_by, area_id, created_by)
    values (p_space, left(coalesce(nullif(trim(t->>'t'), ''), 'Sin título'), 200),
            case when proof is not null then '' else note end,
            coalesce((member_map->>(t->>'who'))::uuid, me), st,
            case when t->>'prio' = 'urgente' then 'urgent' else 'normal' end,
            case when coalesce(t->>'due', '') ~ '^\d{4}-\d{2}-\d{2}$' then (t->>'due')::date end,
            coalesce((t->>'order')::double precision, 0),
            md, proof, case when md is not null then now() end, case when md is not null then me end,
            (area_map->>(t->>'area'))::uuid, me)
    returning id into tid;
    task_map := task_map || jsonb_build_object(t->>'id', tid);
    n_tasks := n_tasks + 1;
  end loop;

  -- bitacora de XP (asi vuelven XP, niveles y racha)
  for l in select * from jsonb_array_elements(coalesce(p->'log', '[]')) loop
    if coalesce(l->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      insert into xp_log (space_id, user_id, task_id, mode, points, day)
      values (p_space, coalesce((member_map->>(l->>'who'))::uuid, me), (task_map->>(l->>'id'))::uuid,
              case when l->>'mode' = 'proof' then 'proof' else 'plain' end,
              least(greatest(coalesce((l->>'pts')::int, 40), 0), 200), (l->>'date')::date);
      n_xp := n_xp + 1;
    end if;
  end loop;

  for ach in select jsonb_array_elements_text(coalesce(p->'unlocked', '[]')) loop
    insert into achievements_unlocked (space_id, achievement_id) values (p_space, ach)
    on conflict (space_id, achievement_id) do nothing;
  end loop;

  -- el manifiesto y los apartados pasan a "Sobre el espacio"; los links, a recursos del equipo
  for n in select * from jsonb_array_elements(coalesce(p->'notes', '[]')) loop
    extra := extra || E'\n\n' || coalesce(n->>'t', 'Apartado') || E'\n' || coalesce(n->>'body', '');
  end loop;
  update spaces set
    tagline = case when tagline = '' then coalesce(p->'space'->>'tagline', '') else tagline end,
    about = trim(both E'\n' from
      case when about = '' then concat_ws(E'\n\n', nullif(p->'space'->>'heroLead', ''), nullif(p->'space'->>'about', ''))
           else about end || extra),
    links = links || coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(p->'space'->'links', '[]')) x
                               where x->>'url' ~* '^https?://'), '[]'::jsonb)
  where id = p_space;

  perform set_config('hq.importing', '0', true);
  perform set_config('hq.validating', '0', true);
  return jsonb_build_object('tasks', n_tasks, 'projects', n_projects, 'xp_entries', n_xp,
                            'unmatched', to_jsonb(unmatched));
end $$;

-- DEMO: llena un espacio con datos vivos (fechas relativas a hoy).
-- Solo service_role (seed local y QA); el cliente no puede llamarla.
create or replace function public.demo_fill(p_space uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  u uuid[]; n int; d date := (now() at time zone 'America/Lima')::date; ar jsonb := '{}'; r record;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; t11 uuid; t12 uuid; e1 uuid; e2 uuid;
  roles text[] := array['Fundador · integra todo','Hardware · PCB','Firmware · integración','Kickstarter · comunidad','Diseño · sistema análogo'];
begin
  select array_agg(user_id order by created_at) into u from space_members where space_id = p_space;
  n := coalesce(array_length(u, 1), 0);
  if n = 0 then raise exception 'El espacio no tiene miembros'; end if;
  for i in 1..n loop
    update space_members set role_title = roles[1 + (i - 1) % 5] where space_id = p_space and user_id = u[i];
  end loop;
  for r in select id, name from areas where space_id = p_space loop
    ar := ar || jsonb_build_object(r.name, r.id);
  end loop;
  perform set_config('hq.importing', '1', true);
  perform set_config('hq.validating', '1', true);

  insert into projects (space_id, name, description, color, start_date, due_date) values
    (p_space, 'Prototipo cerrado', 'PCB + firmware integrado + carcasa ensamblada y funcional.', '#bd6c56', d - 20, d + 3) returning id into p1;
  insert into projects (space_id, name, description, color, start_date, due_date) values
    (p_space, 'Rockie 1 construido', 'La siguiente versión oficial, con las piezas que se compran esta semana.', '#2e88aa', d - 7, d + 12) returning id into p2;
  insert into projects (space_id, name, description, color, start_date, due_date) values
    (p_space, 'Material Kickstarter listo', 'Video de 45 s, fotos del prototipo, copy y página armada.', '#eaa545', d - 3, d + 30) returning id into p3;
  insert into projects (space_id, name, description, color, start_date, due_date) values
    (p_space, 'Postulación Blueprint II', 'Aplicar apenas abra la cohorte. Historia: all-in, hardware probado.', '#4a6fa5', d + 10, d + 45) returning id into p4;
  insert into projects (space_id, name, description, color, start_date, due_date) values
    (p_space, 'Lanzamiento en Kickstarter', 'Campaña pública con la comunidad.', '#8aa54a', d + 30, d + 60) returning id into p5;

  insert into tasks (space_id, project_id, area_id, title, notes, assignee_id, status, priority, start_date, due_date, position) values
    (p_space, p1, (ar->>'3D')::uuid, 'Ensamblar el prototipo completo', 'Cada quien llega con su parte lista.', u[1], 'doing', 'urgent', d - 4, d, 0),
    (p_space, p1, (ar->>'PCB')::uuid, 'Lista de cambios para la rev B de la PCB', '', u[1 + 1 % n], 'doing', 'normal', d - 6, d - 2, 1),
    (p_space, p1, (ar->>'Firmware')::uuid, 'Integrar firmware con la placa nueva', '', u[1 + 2 % n], 'doing', 'normal', d - 5, d + 1, 2),
    (p_space, p1, (ar->>'Firmware')::uuid, 'Subir el firmware al repo', 'La carpeta firmware/ no está trackeada. Si se pierde, se pierde el trabajo.', u[1 + 2 % n], 'todo', 'urgent', null, d + 2, 0),
    (p_space, p2, (ar->>'Diseño')::uuid, 'Propuesta Rockie 1 lista para verificar', '', u[1 + 4 % n], 'todo', 'urgent', d - 2, d - 1, 1),
    (p_space, p2, (ar->>'Gestión')::uuid, 'Armar el carrito de compras de Rockie 1', 'Mercado Libre. Plan B: lunes en Paruro.', u[1], 'todo', 'normal', null, d, 2),
    (p_space, p2, (ar->>'3D')::uuid, 'Imprimir la carcasa v2', '', u[1 + 4 % n], 'todo', 'normal', d + 2, d + 6, 3),
    (p_space, p3, (ar->>'Video')::uuid, 'Guion del video Kickstarter (45 s)', '', u[1 + 3 % n], 'doing', 'normal', d - 1, d + 5, 3),
    (p_space, p3, (ar->>'Kickstarter')::uuid, 'Definir recompensas y precios', '', u[1 + 3 % n], 'todo', 'normal', d + 4, d + 9, 4),
    (p_space, p3, (ar->>'Video')::uuid, 'Sesión de fotos del prototipo con la carcasa', 'Necesita el prototipo casi cerrado.', u[1 + 3 % n], 'todo', 'normal', null, d + 14, 5),
    (p_space, null, (ar->>'Diseño')::uuid, 'Ideas sueltas para la landing', '', u[1 + 1 % n], 'todo', 'normal', null, null, 6);

  insert into tasks (space_id, project_id, area_id, title, assignee_id, status, due_date, position, validation, proof_url, validated_at, validated_by)
  values (p_space, p4, (ar->>'Gestión')::uuid, 'Registrarnos en la lista de aviso de Blueprint II', u[1], 'done', d - 3, 0, 'proof', 'https://f.inc/blueprint', now() - interval '3 days', u[1])
  returning id into t11;
  insert into tasks (space_id, project_id, area_id, title, assignee_id, status, due_date, position, validation, validated_at, validated_by)
  values (p_space, p1, (ar->>'PCB')::uuid, 'Revisar el BOM con proveedores', u[1 + 1 % n], 'done', d - 1, 1, 'plain', now() - interval '1 day', u[1 + 1 % n])
  returning id into t12;
  insert into xp_log (space_id, user_id, task_id, mode, points, day) values
    (p_space, u[1], t11, 'proof', 200, d - 3),
    (p_space, u[1 + 1 % n], t12, 'plain', 80, d - 1);
  insert into achievements_unlocked (space_id, achievement_id) values (p_space, 'first') on conflict do nothing;

  insert into events (space_id, title, starts_at, ends_at, location_or_link, created_by)
  values (p_space, 'Revisión PCB rev B', (d + time '16:00') at time zone 'America/Lima', (d + time '16:30') at time zone 'America/Lima', 'https://meet.google.com/', u[1])
  returning id into e1;
  insert into events (space_id, title, starts_at, ends_at, location_or_link, created_by)
  values (p_space, 'Sync semanal del equipo', (d + 1 + time '10:00') at time zone 'America/Lima', (d + 1 + time '11:00') at time zone 'America/Lima', 'Presencial · taller', u[1])
  returning id into e2;
  insert into event_attendees (space_id, event_id, user_id, response)
  select p_space, e1, x, 'yes' from unnest(u[1:least(3, n)]) x
  union all
  select p_space, e2, x, 'pending' from unnest(u) x;

  insert into activity (space_id, actor_id, verb, entity_type, entity_id, summary, created_at) values
    (p_space, u[1 + 1 % n], 'validated', 'task', t12, 'validó «Revisar el BOM con proveedores»', now() - interval '20 hours'),
    (p_space, u[1 + 3 % n], 'moved', 'task', null, 'movió «Guion del video Kickstarter (45 s)» a En curso', now() - interval '6 hours'),
    (p_space, u[1], 'created', 'task', null, 'creó «Armar el carrito de compras de Rockie 1»', now() - interval '2 hours');

  perform set_config('hq.importing', '0', true);
  perform set_config('hq.validating', '0', true);
end $$;

-- ---------- permisos de ejecucion ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text), public.invite_info(text) to anon, authenticated;
grant execute on function
  public.is_member(uuid), public.is_owner(uuid), public.is_member_text(text), public.shares_space(uuid),
  public.user_today(uuid), public.hq_norm(text), public.create_space(text), public.create_invite(uuid),
  public.join_space(text), public.team_streak(uuid), public.validate_task(uuid, text, text, text),
  public.import_v2(uuid, jsonb)
to authenticated;
revoke execute on function public.demo_fill(uuid), public.check_achievements(uuid), public.gen_code(int) from authenticated;
grant execute on function public.demo_fill(uuid) to service_role;
