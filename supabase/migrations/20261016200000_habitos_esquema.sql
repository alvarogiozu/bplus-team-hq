-- ============================================================
-- HÃ¡bitos dentro de la base de Rockie OS (fase 1 de Â«una cuenta, una baseÂ»): el esquema Â«habitosÂ», igual al de la
-- base de HÃ¡bitos (wmsizqixjjrglygskhdb) pero con las cuentas de Rockie OS. Generado por
-- BPLUS COMEBACK/supabase/llevar-a-rockie-os.mjs desde el esquema real (exportar-esquema.sql). TodavÃ­a sin datos ni
-- app: la copia de datos es la fase 3 y el cambio de la app la 5.
-- ============================================================
create schema if not exists habitos;
grant usage on schema habitos to anon, authenticated, service_role;
set search_path = habitos, public, extensions;

-- â€”â€”â€” tablas â€”â€”â€”
create table habitos.blocks (
  blocker uuid not null,
  blocked uuid not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.challenge_members (
  challenge_id uuid not null,
  user_id uuid not null,
  habit_id uuid,
  joined_at timestamp with time zone default now() not null
);
create table habitos.challenges (
  id uuid default gen_random_uuid() not null,
  group_id uuid,
  name text not null,
  kind text default 'shared'::text not null,
  icon text default 'âš¡'::text not null,
  is_public boolean default false not null,
  duration_days integer default 7 not null,
  starts_at date default ((now() AT TIME ZONE 'America/Lima'::text))::date not null,
  ends_at date,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.completions (
  id uuid default gen_random_uuid() not null,
  habit_id uuid not null,
  user_id uuid not null,
  date date not null,
  mode text not null,
  photo_path text,
  verdict jsonb,
  xp_gained integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.day_notes (
  habit_id uuid not null,
  user_id uuid not null,
  date date not null,
  note text default ''::text not null
);
create table habitos.devices (
  id uuid default gen_random_uuid() not null,
  pair_code text,
  owner_id uuid,
  paired boolean default false not null,
  name text,
  last_seen timestamp with time zone,
  created_at timestamp with time zone default now() not null
);
create table habitos.families (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  pair_code text,
  paired boolean default false not null,
  child_name text,
  pin text,
  coins integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table habitos.family_submissions (
  id uuid default gen_random_uuid() not null,
  family_id uuid not null,
  task_id uuid not null,
  date date not null,
  status text default 'enviado'::text not null,
  motivo text,
  paid boolean default false not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.family_tasks (
  id uuid default gen_random_uuid() not null,
  family_id uuid not null,
  name text not null,
  color text,
  coins integer default 10 not null,
  "time" text default ''::text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  icon text
);
create table habitos.feed_events (
  id uuid default gen_random_uuid() not null,
  group_id uuid not null,
  user_id uuid not null,
  type text not null,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.friendships (
  a uuid not null,
  b uuid not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.goal_habits (
  goal_id uuid not null,
  habit_id uuid not null
);
create table habitos.goals (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  icon text default 'ti-target-arrow'::text not null,
  color text default 'var(--olive)'::text not null,
  area_id text,
  deadline text default 'Sin fecha'::text not null,
  pct integer default 0 not null,
  claimed integer[] default '{}'::integer[] not null,
  gcal_event_id text,
  created_at timestamp with time zone default now() not null
);
create table habitos.google_calendar (
  user_id uuid not null,
  refresh_token text not null,
  calendar_id text,
  sync_token text,
  connected_at timestamp with time zone default now() not null
);
create table habitos.group_members (
  group_id uuid not null,
  user_id uuid not null,
  role text default 'member'::text not null,
  joined_at timestamp with time zone default now() not null
);
create table habitos.groups (
  id uuid default gen_random_uuid() not null,
  name text not null,
  icon text default 'ðŸ‘¥'::text not null,
  is_public boolean default false not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  invite_code text default upper(substr(md5((gen_random_uuid())::text), 1, 10)) not null,
  color text default 'var(--olive)'::text not null
);
create table habitos.habits (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  type text default 'salud'::text not null,
  "time" text default '8:00'::text not null,
  freq text default 'Todos los dias'::text not null,
  days integer[] default '{1,1,1,1,1,1,1}'::integer[] not null,
  photo_instruction text default ''::text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  icon text,
  color text,
  gcal_event_id text,
  share_social boolean default true not null
);
create table habitos.messages (
  id uuid default gen_random_uuid() not null,
  group_id uuid,
  challenge_id uuid,
  user_id uuid not null,
  kind text default 'text'::text not null,
  body text default ''::text not null,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.profiles (
  id uuid not null,
  name text default 'Tu'::text not null,
  avatar text default 'ðŸ˜Š'::text not null,
  xp integer default 0 not null,
  coins integer default 0 not null,
  level integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  friend_code text default upper(substr(md5((gen_random_uuid())::text), 1, 10)) not null,
  rockie_shop jsonb
);
create table habitos.reports (
  id uuid default gen_random_uuid() not null,
  reporter uuid not null,
  reported_user uuid,
  message_id uuid,
  context text default 'perfil'::text not null,
  reason text default ''::text not null,
  status text default 'pendiente'::text not null,
  created_at timestamp with time zone default now() not null
);
create table habitos.rpc_rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamp with time zone not null,
  hits integer default 0 not null
);
create table habitos.streaks (
  user_id uuid not null,
  current integer default 0 not null,
  best integer default 0 not null,
  last_date date
);
create table habitos.validation_attempts (
  id uuid default gen_random_uuid() not null,
  habit_id uuid not null,
  user_id uuid not null,
  date date not null,
  created_at timestamp with time zone default now() not null
);

-- â€”â€”â€” claves, Ãºnicos y checks â€”â€”â€”
alter table habitos.blocks add constraint blocks_pkey PRIMARY KEY (blocker, blocked);
alter table habitos.blocks add constraint blocks_check CHECK ((blocker <> blocked));
alter table habitos.challenge_members add constraint challenge_members_pkey PRIMARY KEY (challenge_id, user_id);
alter table habitos.challenges add constraint challenges_duration_days_check CHECK (((duration_days >= 1) AND (duration_days <= 365)));
alter table habitos.challenges add constraint challenges_kind_check CHECK ((kind = ANY (ARRAY['shared'::text, 'commitment'::text])));
alter table habitos.challenges add constraint challenges_pkey PRIMARY KEY (id);
alter table habitos.completions add constraint completions_habit_id_date_key UNIQUE (habit_id, date);
alter table habitos.completions add constraint completions_mode_check CHECK ((mode = ANY (ARRAY['photo'::text, 'check'::text, 'tomorrow'::text])));
alter table habitos.completions add constraint completions_pkey PRIMARY KEY (id);
alter table habitos.day_notes add constraint day_notes_pkey PRIMARY KEY (habit_id, date);
alter table habitos.devices add constraint devices_pkey PRIMARY KEY (id);
alter table habitos.devices add constraint devices_pair_code_key UNIQUE (pair_code);
alter table habitos.families add constraint families_pair_code_key UNIQUE (pair_code);
alter table habitos.families add constraint families_pkey PRIMARY KEY (id);
alter table habitos.family_submissions add constraint family_submissions_pkey PRIMARY KEY (id);
alter table habitos.family_submissions add constraint family_submissions_task_id_date_key UNIQUE (task_id, date);
alter table habitos.family_submissions add constraint family_submissions_status_check CHECK ((status = ANY (ARRAY['enviado'::text, 'aprobado'::text, 'rechazado'::text])));
alter table habitos.family_tasks add constraint family_tasks_coins_check CHECK (((coins >= 1) AND (coins <= 100)));
alter table habitos.family_tasks add constraint family_tasks_pkey PRIMARY KEY (id);
alter table habitos.feed_events add constraint feed_events_type_check CHECK ((type = ANY (ARRAY['validacion'::text, 'racha'::text, 'inactivo'::text])));
alter table habitos.feed_events add constraint feed_events_pkey PRIMARY KEY (id);
alter table habitos.friendships add constraint friendships_check CHECK ((a < b));
alter table habitos.friendships add constraint friendships_pkey PRIMARY KEY (a, b);
alter table habitos.goal_habits add constraint goal_habits_pkey PRIMARY KEY (goal_id, habit_id);
alter table habitos.goals add constraint goals_pct_check CHECK (((pct >= 0) AND (pct <= 100)));
alter table habitos.goals add constraint goals_pkey PRIMARY KEY (id);
alter table habitos.google_calendar add constraint google_calendar_pkey PRIMARY KEY (user_id);
alter table habitos.group_members add constraint group_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));
alter table habitos.group_members add constraint group_members_pkey PRIMARY KEY (group_id, user_id);
alter table habitos.groups add constraint groups_invite_code_key UNIQUE (invite_code);
alter table habitos.groups add constraint groups_pkey PRIMARY KEY (id);
alter table habitos.habits add constraint habits_pkey PRIMARY KEY (id);
alter table habitos.messages add constraint messages_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'event'::text])));
alter table habitos.messages add constraint messages_check CHECK (((group_id IS NULL) <> (challenge_id IS NULL)));
alter table habitos.messages add constraint messages_check1 CHECK (((kind <> 'text'::text) OR ((char_length(btrim(body)) >= 1) AND (char_length(body) <= 1000))));
alter table habitos.messages add constraint messages_pkey PRIMARY KEY (id);
alter table habitos.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table habitos.profiles add constraint profiles_friend_code_key UNIQUE (friend_code);
alter table habitos.reports add constraint reports_pkey PRIMARY KEY (id);
alter table habitos.rpc_rate_limits add constraint rpc_rate_limits_pkey PRIMARY KEY (user_id, action, window_start);
alter table habitos.streaks add constraint streaks_pkey PRIMARY KEY (user_id);
alter table habitos.validation_attempts add constraint validation_attempts_pkey PRIMARY KEY (id);

-- â€”â€”â€” llaves forÃ¡neas â€”â€”â€”
alter table habitos.blocks add constraint blocks_blocker_fkey FOREIGN KEY (blocker) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.blocks add constraint blocks_blocked_fkey FOREIGN KEY (blocked) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.challenge_members add constraint challenge_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.challenge_members add constraint challenge_members_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
alter table habitos.challenge_members add constraint challenge_members_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE SET NULL;
alter table habitos.challenges add constraint challenges_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table habitos.challenges add constraint challenges_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.completions add constraint completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.completions add constraint completions_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;
alter table habitos.day_notes add constraint day_notes_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;
alter table habitos.day_notes add constraint day_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.devices add constraint devices_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table habitos.families add constraint families_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table habitos.family_submissions add constraint family_submissions_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
alter table habitos.family_submissions add constraint family_submissions_task_id_fkey FOREIGN KEY (task_id) REFERENCES family_tasks(id) ON DELETE CASCADE;
alter table habitos.family_tasks add constraint family_tasks_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
alter table habitos.feed_events add constraint feed_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table habitos.feed_events add constraint feed_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.friendships add constraint friendships_b_fkey FOREIGN KEY (b) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.friendships add constraint friendships_a_fkey FOREIGN KEY (a) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.goal_habits add constraint goal_habits_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;
alter table habitos.goal_habits add constraint goal_habits_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;
alter table habitos.goals add constraint goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.google_calendar add constraint google_calendar_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.group_members add constraint group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table habitos.group_members add constraint group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.groups add constraint groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.habits add constraint habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.messages add constraint messages_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
alter table habitos.messages add constraint messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table habitos.messages add constraint messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table habitos.reports add constraint reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL;
alter table habitos.reports add constraint reports_reporter_fkey FOREIGN KEY (reporter) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.reports add constraint reports_reported_user_fkey FOREIGN KEY (reported_user) REFERENCES profiles(id) ON DELETE SET NULL;
alter table habitos.rpc_rate_limits add constraint rpc_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.streaks add constraint streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.validation_attempts add constraint validation_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table habitos.validation_attempts add constraint validation_attempts_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;

-- â€”â€”â€” Ã­ndices â€”â€”â€”
CREATE INDEX blocks_blocked_idx ON habitos.blocks USING btree (blocked);
CREATE INDEX challenge_members_user_idx ON habitos.challenge_members USING btree (user_id);
CREATE INDEX challenges_group_idx ON habitos.challenges USING btree (group_id);
CREATE INDEX completions_user_date_idx ON habitos.completions USING btree (user_id, date);
CREATE INDEX devices_owner_idx ON habitos.devices USING btree (owner_id);
CREATE INDEX family_submissions_pend_idx ON habitos.family_submissions USING btree (family_id) WHERE (status = 'enviado'::text);
CREATE INDEX family_tasks_family_idx ON habitos.family_tasks USING btree (family_id) WHERE active;
CREATE INDEX friendships_b_idx ON habitos.friendships USING btree (b);
CREATE INDEX goal_habits_habit_idx ON habitos.goal_habits USING btree (habit_id);
CREATE INDEX goals_user_idx ON habitos.goals USING btree (user_id);
CREATE INDEX habits_user_idx ON habitos.habits USING btree (user_id);
CREATE INDEX messages_group_created_idx ON habitos.messages USING btree (group_id, created_at DESC);
CREATE INDEX messages_challenge_created_idx ON habitos.messages USING btree (challenge_id, created_at DESC);
CREATE INDEX messages_user_idx ON habitos.messages USING btree (user_id);
CREATE INDEX reports_status_idx ON habitos.reports USING btree (status);
CREATE INDEX attempts_habit_date_idx ON habitos.validation_attempts USING btree (habit_id, date);
CREATE INDEX attempts_user_date_idx ON habitos.validation_attempts USING btree (user_id, date);

-- â€”â€”â€” funciones â€”â€”â€”
CREATE OR REPLACE FUNCTION habitos.add_friend_by_code(code text)
 RETURNS TABLE(friend_id uuid, friend_name text, friend_avatar text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare p record;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  perform habitos.enforce_rpc_rate('add_friend', 20);
  select id, name, avatar into p
  from profiles where friend_code = upper(btrim(code));
  if not found then
    return;
  end if;
  if p.id = auth.uid() then
    raise exception 'codigo_propio';
  end if;
  insert into friendships (a, b)
  values (least(auth.uid(), p.id), greatest(auth.uid(), p.id))
  on conflict do nothing;
  return query select p.id, p.name, p.avatar;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.anunciar_aparato(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  v_code text := upper(trim(p_code));
  v_id   uuid;
begin
  if v_code is null or length(v_code) < 4 or length(v_code) > 8 then
    raise exception 'codigo invalido';
  end if;

  -- Reusar si ya existe y sigue libre
  select id into v_id
    from habitos.devices
   where pair_code = v_code and paired = false
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Si el codigo estaba paired, pedir otro (el aparato regenera)
  if exists (select 1 from habitos.devices where pair_code = v_code) then
    raise exception 'codigo ocupado';
  end if;

  insert into habitos.devices (pair_code)
  values (v_code)
  returning id into v_id;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.aprobar_envio(p_submission uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare v_fam uuid; v_coins integer; v_owner uuid;
begin
  select s.family_id, f.owner_id into v_fam, v_owner
    from family_submissions s join families f on f.id = s.family_id
   where s.id = p_submission;

  if v_fam is null then raise exception 'envio inexistente'; end if;

  -- Quien puede aprobar: el aparato (service_role) o el padre dueno.
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or v_owner is distinct from auth.uid()) then
    raise exception 'no autorizado';
  end if;

  -- El pago es atomico y ocurre UNA vez: el flag paid se voltea en el mismo
  -- UPDATE que lo comprueba, asi que aunque el padre y el aparato aprueben a
  -- la vez, las monedas caen una sola vez.
  v_fam := null;
  update family_submissions s
     set status = 'aprobado', motivo = null, paid = true
    from family_tasks t
   where s.id = p_submission and t.id = s.task_id and s.paid = false
   returning s.family_id, t.coins into v_fam, v_coins;

  if v_fam is not null then
    update families set coins = coins + v_coins, updated_at = now()
     where id = v_fam;
  else
    update family_submissions set status = 'aprobado', motivo = null
     where id = p_submission;
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION habitos.companion_estado(p_device_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select coalesce(
    jsonb_build_object(
      'paired', paired,
      'owner_id', owner_id
    ),
    '{}'::jsonb
  )
  from habitos.devices
  where id = p_device_id;
$function$
;
CREATE OR REPLACE FUNCTION habitos.desvincular_aparato(p_device uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  update devices set owner_id = null, paired = false, name = null
   where id = p_device and owner_id = auth.uid();
end $function$
;
CREATE OR REPLACE FUNCTION habitos.enforce_rpc_rate(p_action text, p_max integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  w timestamptz := date_trunc('hour', now());
  h int;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  insert into habitos.rpc_rate_limits (user_id, action, window_start, hits)
  values (auth.uid(), p_action, w, 1)
  on conflict (user_id, action, window_start)
  do update set hits = habitos.rpc_rate_limits.hits + 1
  returning hits into h;
  if h > p_max then
    raise exception 'limite_rpc';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.gcal_status()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select exists (select 1 from google_calendar where user_id = auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION habitos.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
begin
  insert into habitos.profiles (id) values (new.id) on conflict do nothing;
  insert into habitos.streaks (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.invite_friends_to_challenge(p_challenge_id uuid, p_friend_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  n int := 0;
  fid uuid;
  rc int;
  ch record;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  select id, group_id, created_by into ch
  from habitos.challenges
  where id = p_challenge_id;
  if not found then
    raise exception 'reto_no_existe';
  end if;

  -- Creador del reto, o admin del grupo donde corre
  if ch.created_by <> auth.uid()
     and not exists (
       select 1 from habitos.group_members
       where group_id = ch.group_id
         and user_id = auth.uid()
         and role = 'admin'
     ) then
    raise exception 'no_puedes_invitar';
  end if;

  if p_friend_ids is null or cardinality(p_friend_ids) = 0 then
    return 0;
  end if;

  foreach fid in array p_friend_ids loop
    if fid is null or fid = auth.uid() then
      continue;
    end if;
    if not habitos.is_friend(fid) then
      continue;
    end if;

    insert into habitos.challenge_members (challenge_id, user_id, habit_id)
    values (p_challenge_id, fid, null)
    on conflict do nothing;
    get diagnostics rc = row_count;
    if rc > 0 then
      n := n + 1;
    end if;

    -- Si el reto vive en un grupo, el amigo tambien entra a la sala
    if ch.group_id is not null then
      insert into habitos.group_members (group_id, user_id, role)
      values (ch.group_id, fid, 'member')
      on conflict do nothing;
    end if;
  end loop;

  return n;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.invite_friends_to_group(p_group_id uuid, p_friend_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  n int := 0;
  fid uuid;
  rc int;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  -- Solo admin del grupo (o creador) puede invitar
  if not exists (
    select 1 from habitos.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
      and role = 'admin'
  ) and not exists (
    select 1 from habitos.groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'no_eres_admin';
  end if;

  if p_friend_ids is null or cardinality(p_friend_ids) = 0 then
    return 0;
  end if;

  foreach fid in array p_friend_ids loop
    if fid is null or fid = auth.uid() then
      continue;
    end if;
    -- Solo amigos (no cualquier UUID)
    if not habitos.is_friend(fid) then
      continue;
    end if;

    insert into habitos.group_members (group_id, user_id, role)
    values (p_group_id, fid, 'member')
    on conflict do nothing;
    get diagnostics rc = row_count;
    if rc > 0 then
      n := n + 1;
    end if;

    -- Si el grupo ya tiene retos/anclas, el amigo entra sin habito
    -- (lo elige despues). on conflict: ya era miembro del reto.
    insert into habitos.challenge_members (challenge_id, user_id, habit_id)
    select c.id, fid, null
    from habitos.challenges c
    where c.group_id = p_group_id
    on conflict do nothing;
  end loop;

  return n;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.is_challenge_member(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select exists (
    select 1 from challenge_members where challenge_id = cid and user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION habitos.is_friend(peer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select exists (
    select 1 from friendships
    where a = least(auth.uid(), peer) and b = greatest(auth.uid(), peer)
  );
$function$
;
CREATE OR REPLACE FUNCTION habitos.is_group_member(gid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select exists (
    select 1 from group_members where group_id = gid and user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION habitos.is_group_peer(peer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
  select peer = auth.uid()
    or habitos.is_friend(peer)
    or exists (
      select 1
      from group_members a
      join group_members b on a.group_id = b.group_id
      where a.user_id = auth.uid() and b.user_id = peer
    )
    or exists (
      select 1
      from challenge_members a
      join challenge_members b on a.challenge_id = b.challenge_id
      where a.user_id = auth.uid() and b.user_id = peer
    );
$function$
;
CREATE OR REPLACE FUNCTION habitos.join_group_by_code(code text)
 RETURNS TABLE(group_id uuid, group_name text, group_icon text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare g record;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  perform habitos.enforce_rpc_rate('join_group', 20);
  select id, name, icon into g
  from groups where invite_code = upper(btrim(code));
  if not found then
    return;
  end if;
  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'member')
  on conflict do nothing;
  return query select g.id, g.name, g.icon;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.protect_goal_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'habitos'
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('bplus.allow_economy', true) = '1' then
    return new;
  end if;
  new.pct := old.pct;
  new.claimed := old.claimed;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.protect_group_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'habitos'
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  new.created_by := old.created_by;
  new.invite_code := old.invite_code;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.protect_profile_economy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'habitos'
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('bplus.allow_economy', true) = '1' then
    return new;
  end if;
  -- Cliente autenticado: solo presentacion (name/avatar); economia inmutable
  new.xp := old.xp;
  new.coins := old.coins;
  new.level := old.level;
  new.friend_code := old.friend_code;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.rechazar_envio(p_submission uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare v_owner uuid; v_existe boolean;
begin
  select f.owner_id, true into v_owner, v_existe
    from family_submissions s join families f on f.id = s.family_id
   where s.id = p_submission;

  if not coalesce(v_existe, false) then raise exception 'envio inexistente'; end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or v_owner is distinct from auth.uid()) then
    raise exception 'no autorizado';
  end if;

  update family_submissions
     set status = 'rechazado', motivo = left(p_motivo, 60)
   where id = p_submission and paid = false;   -- lo pagado no se des-aprueba
end $function$
;
CREATE OR REPLACE FUNCTION habitos.seed_challenge_from_group(p_challenge_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  ch record;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  select id, group_id, created_by into ch
  from habitos.challenges
  where id = p_challenge_id;
  if not found then
    raise exception 'reto_no_existe';
  end if;
  if ch.group_id is null then
    return 0;
  end if;

  if ch.created_by <> auth.uid()
     and not exists (
       select 1 from habitos.group_members
       where group_id = ch.group_id
         and user_id = auth.uid()
         and role = 'admin'
     ) then
    raise exception 'no_puedes_sembrar';
  end if;

  insert into habitos.challenge_members (challenge_id, user_id, habit_id)
  select p_challenge_id, gm.user_id, null
  from habitos.group_members gm
  where gm.group_id = ch.group_id
    and gm.user_id <> auth.uid()
  on conflict do nothing;

  get diagnostics n = row_count;
  return n;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.spend_coins(amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare
  new_balance int;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'monto_invalido';
  end if;
  perform set_config('bplus.allow_economy', '1', true);
  update habitos.profiles
     set coins = coins - amount
   where id = auth.uid()
     and coins >= amount
  returning coins into new_balance;
  if new_balance is null then
    raise exception 'saldo_insuficiente';
  end if;
  return new_balance;
end;
$function$
;
CREATE OR REPLACE FUNCTION habitos.vincular_aparato(p_code text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;

  update devices
     set owner_id = auth.uid(), paired = true, pair_code = null,
         name = coalesce(nullif(trim(p_name), ''), 'Mi Rockie')
   where pair_code = upper(trim(p_code)) and paired = false
   returning id into v_id;

  if v_id is null then raise exception 'codigo invalido'; end if;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION habitos.vincular_dispositivo(p_code text, p_child_name text, p_pin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'habitos'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'pin invalido'; end if;

  update families
     set owner_id = auth.uid(), paired = true, pair_code = null,
         child_name = left(trim(p_child_name), 20), pin = p_pin,
         updated_at = now()
   where pair_code = upper(trim(p_code)) and paired = false
   returning id into v_id;

  if v_id is null then raise exception 'codigo invalido'; end if;
  return v_id;
end $function$
;

-- â€”â€”â€” triggers â€”â€”â€”
CREATE TRIGGER trg_protect_goal_progress BEFORE UPDATE ON habitos.goals FOR EACH ROW EXECUTE FUNCTION habitos.protect_goal_progress();
CREATE TRIGGER trg_protect_group_identity BEFORE UPDATE ON habitos.groups FOR EACH ROW EXECUTE FUNCTION habitos.protect_group_identity();
CREATE TRIGGER trg_protect_profile_economy BEFORE UPDATE ON habitos.profiles FOR EACH ROW EXECUTE FUNCTION habitos.protect_profile_economy();
drop trigger if exists habitos_on_auth_user_created on auth.users;
create trigger habitos_on_auth_user_created after insert on auth.users for each row execute function habitos.handle_new_user();

-- â€”â€”â€” RLS â€”â€”â€”
alter table habitos.blocks enable row level security;
alter table habitos.challenge_members enable row level security;
alter table habitos.challenges enable row level security;
alter table habitos.completions enable row level security;
alter table habitos.day_notes enable row level security;
alter table habitos.devices enable row level security;
alter table habitos.families enable row level security;
alter table habitos.family_submissions enable row level security;
alter table habitos.family_tasks enable row level security;
alter table habitos.feed_events enable row level security;
alter table habitos.friendships enable row level security;
alter table habitos.goal_habits enable row level security;
alter table habitos.goals enable row level security;
alter table habitos.google_calendar enable row level security;
alter table habitos.group_members enable row level security;
alter table habitos.groups enable row level security;
alter table habitos.habits enable row level security;
alter table habitos.messages enable row level security;
alter table habitos.profiles enable row level security;
alter table habitos.reports enable row level security;
alter table habitos.rpc_rate_limits enable row level security;
alter table habitos.streaks enable row level security;
alter table habitos.validation_attempts enable row level security;
create policy "desbloquear yo" on habitos.blocks as PERMISSIVE for DELETE to authenticated using ((blocker = auth.uid()));
create policy "bloquear yo" on habitos.blocks as PERMISSIVE for INSERT to authenticated with check ((blocker = auth.uid()));
create policy "ver mis bloqueos" on habitos.blocks as PERMISSIVE for SELECT to authenticated using ((blocker = auth.uid()));
create policy "unirse a reto" on habitos.challenge_members as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = challenge_members.challenge_id) AND (c.is_public OR (c.created_by = auth.uid()) OR ((c.group_id IS NOT NULL) AND is_group_member(c.group_id))))))));
create policy "editar mi membresia de reto" on habitos.challenge_members as PERMISSIVE for UPDATE to authenticated using ((user_id = auth.uid())) with check (((user_id = auth.uid()) AND ((habit_id IS NULL) OR (EXISTS ( SELECT 1
   FROM habits h
  WHERE ((h.id = challenge_members.habit_id) AND (h.user_id = auth.uid())))))));
create policy "salir del reto" on habitos.challenge_members as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy "ver miembros de retos visibles" on habitos.challenge_members as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = challenge_members.challenge_id) AND (c.is_public OR is_challenge_member(c.id) OR ((c.group_id IS NOT NULL) AND is_group_member(c.group_id)))))));
create policy "crear reto" on habitos.challenges as PERMISSIVE for INSERT to authenticated with check (((created_by = auth.uid()) AND ((group_id IS NULL) OR is_group_member(group_id))));
create policy "borrar reto solo creador" on habitos.challenges as PERMISSIVE for DELETE to authenticated using ((created_by = auth.uid()));
create policy "editar reto solo creador" on habitos.challenges as PERMISSIVE for UPDATE to authenticated using ((created_by = auth.uid())) with check ((created_by = auth.uid()));
create policy "ver retos visibles" on habitos.challenges as PERMISSIVE for SELECT to authenticated using ((is_public OR is_challenge_member(id) OR ((group_id IS NOT NULL) AND is_group_member(group_id))));
create policy "leer completions propias o de pares" on habitos.completions as PERMISSIVE for SELECT to authenticated using (is_group_peer(user_id));
create policy "notas propias" on habitos.day_notes as PERMISSIVE for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy aparatos_del_dueno on habitos.devices as PERMISSIVE for ALL to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy familias_del_padre on habitos.families as PERMISSIVE for ALL to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy envios_del_padre on habitos.family_submissions as PERMISSIVE for ALL to authenticated using ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_id = auth.uid())))) with check ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_id = auth.uid()))));
create policy tareas_del_padre on habitos.family_tasks as PERMISSIVE for ALL to authenticated using ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_id = auth.uid())))) with check ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_id = auth.uid()))));
create policy "leer feed de mis grupos" on habitos.feed_events as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM group_members m
  WHERE ((m.group_id = feed_events.group_id) AND (m.user_id = auth.uid())))));
create policy "ver mis amistades" on habitos.friendships as PERMISSIVE for SELECT to authenticated using (((a = auth.uid()) OR (b = auth.uid())));
create policy "terminar amistad propia" on habitos.friendships as PERMISSIVE for DELETE to authenticated using (((a = auth.uid()) OR (b = auth.uid())));
create policy goal_habits_own on habitos.goal_habits as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_habits.goal_id) AND (g.user_id = auth.uid()))))) with check (((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_habits.goal_id) AND (g.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM habits h
  WHERE ((h.id = goal_habits.habit_id) AND (h.user_id = auth.uid()))))));
create policy goals_own on habitos.goals as PERMISSIVE for ALL to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "creador entra como admin" on habitos.group_members as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (role = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.created_by = auth.uid()))))));
create policy "salir del grupo" on habitos.group_members as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy "ver miembros de mis grupos" on habitos.group_members as PERMISSIVE for SELECT to authenticated using (is_group_peer(user_id));
create policy "unirse a grupo publico" on habitos.group_members as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND g.is_public)))));
create policy "ver grupos propios o publicos" on habitos.groups as PERMISSIVE for SELECT to authenticated using ((is_public OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_members m
  WHERE ((m.group_id = groups.id) AND (m.user_id = auth.uid()))))));
create policy "crear grupo" on habitos.groups as PERMISSIVE for INSERT to authenticated with check ((created_by = auth.uid()));
create policy "editar grupo solo admin" on habitos.groups as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM group_members m
  WHERE ((m.group_id = groups.id) AND (m.user_id = auth.uid()) AND (m.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM group_members m
  WHERE ((m.group_id = groups.id) AND (m.user_id = auth.uid()) AND (m.role = 'admin'::text)))));
create policy "leer habitos de pares" on habitos.habits as PERMISSIVE for SELECT to authenticated using (is_group_peer(user_id));
create policy "habitos propios" on habitos.habits as PERMISSIVE for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "borrar mensaje propio" on habitos.messages as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) AND (kind = 'text'::text)));
create policy "escribir mensaje propio" on habitos.messages as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (kind = 'text'::text) AND (((group_id IS NOT NULL) AND is_group_member(group_id)) OR ((challenge_id IS NOT NULL) AND is_challenge_member(challenge_id)))));
create policy "leer mensajes de mis canales" on habitos.messages as PERMISSIVE for SELECT to authenticated using ((((group_id IS NOT NULL) AND is_group_member(group_id)) OR ((challenge_id IS NOT NULL) AND is_challenge_member(challenge_id))));
create policy "editar perfil propio" on habitos.profiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "leer perfil propio o de pares" on habitos.profiles as PERMISSIVE for SELECT to authenticated using (is_group_peer(id));
create policy "reportar yo" on habitos.reports as PERMISSIVE for INSERT to authenticated with check ((reporter = auth.uid()));
create policy "ver mis reportes" on habitos.reports as PERMISSIVE for SELECT to authenticated using ((reporter = auth.uid()));
create policy "leer racha propia o de pares" on habitos.streaks as PERMISSIVE for SELECT to authenticated using (is_group_peer(user_id));

-- â€”â€”â€” permisos â€”â€”â€”
revoke all on all tables in schema habitos from anon;
grant select, insert, update, delete on all tables in schema habitos to authenticated;
grant all on all tables in schema habitos to service_role;
grant usage, select on all sequences in schema habitos to authenticated, service_role;
revoke all on all functions in schema habitos from public, anon, authenticated;
grant execute on function habitos.add_friend_by_code(code text) to authenticated;
grant execute on function habitos.anunciar_aparato(p_code text) to anon, authenticated;
grant execute on function habitos.aprobar_envio(p_submission uuid) to authenticated;
grant execute on function habitos.companion_estado(p_device_id uuid) to authenticated, anon;
grant execute on function habitos.desvincular_aparato(p_device uuid) to authenticated;
grant execute on function habitos.gcal_status() to authenticated;
grant execute on function habitos.invite_friends_to_challenge(p_challenge_id uuid, p_friend_ids uuid[]) to authenticated;
grant execute on function habitos.invite_friends_to_group(p_group_id uuid, p_friend_ids uuid[]) to authenticated;
grant execute on function habitos.is_challenge_member(cid uuid) to authenticated;
grant execute on function habitos.is_friend(peer uuid) to authenticated;
grant execute on function habitos.is_group_member(gid uuid) to authenticated;
grant execute on function habitos.is_group_peer(peer uuid) to authenticated;
grant execute on function habitos.join_group_by_code(code text) to authenticated;
grant execute on function habitos.rechazar_envio(p_submission uuid, p_motivo text) to authenticated;
grant execute on function habitos.seed_challenge_from_group(p_challenge_id uuid) to authenticated;
grant execute on function habitos.spend_coins(amount integer) to authenticated;
grant execute on function habitos.vincular_aparato(p_code text, p_name text) to authenticated;
grant execute on function habitos.vincular_dispositivo(p_code text, p_child_name text, p_pin text) to authenticated;
grant execute on all functions in schema habitos to service_role;

-- â€”â€”â€” realtime â€”â€”â€”
alter publication supabase_realtime add table habitos.challenge_members;
alter publication supabase_realtime add table habitos.challenges;
alter publication supabase_realtime add table habitos.completions;
alter publication supabase_realtime add table habitos.friendships;
alter publication supabase_realtime add table habitos.group_members;
alter publication supabase_realtime add table habitos.groups;
alter publication supabase_realtime add table habitos.messages;
alter publication supabase_realtime add table habitos.profiles;
alter publication supabase_realtime add table habitos.streaks;

-- â€”â€”â€” archivos: buckets propios (proofs ya existe en Rockie OS para las pruebas de tareas) â€”â€”â€”
insert into storage.buckets (id, name, public) values ('habitos-proofs', 'habitos-proofs', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('habitos-avatars', 'habitos-avatars', true) on conflict (id) do nothing;
drop policy if exists "habitos: actualizar avatar propio" on storage.objects;
create policy "habitos: actualizar avatar propio" on storage.objects for UPDATE to authenticated using (((bucket_id = 'habitos-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: actualizar prueba propia" on storage.objects;
create policy "habitos: actualizar prueba propia" on storage.objects for UPDATE to authenticated using (((bucket_id = 'habitos-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'habitos-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: borrar avatar propio" on storage.objects;
create policy "habitos: borrar avatar propio" on storage.objects for DELETE to authenticated using (((bucket_id = 'habitos-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: borrar prueba propia" on storage.objects;
create policy "habitos: borrar prueba propia" on storage.objects for DELETE to authenticated using (((bucket_id = 'habitos-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: leer avatares" on storage.objects;
create policy "habitos: leer avatares" on storage.objects for SELECT to public using ((bucket_id = 'habitos-avatars'::text));
drop policy if exists "habitos: leer pruebas propias" on storage.objects;
create policy "habitos: leer pruebas propias" on storage.objects for SELECT to authenticated using (((bucket_id = 'habitos-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: subir avatar propio" on storage.objects;
create policy "habitos: subir avatar propio" on storage.objects for INSERT to authenticated with check (((bucket_id = 'habitos-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "habitos: subir prueba a carpeta propia" on storage.objects;
create policy "habitos: subir prueba a carpeta propia" on storage.objects for INSERT to authenticated with check (((bucket_id = 'habitos-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ——— cada persona que ya existe en Rockie OS tiene su perfil y su racha de Hábitos (las nuevas, por el trigger) ———
insert into habitos.profiles (id) select id from auth.users on conflict do nothing;
insert into habitos.streaks (user_id) select id from auth.users on conflict do nothing;

reset search_path;
