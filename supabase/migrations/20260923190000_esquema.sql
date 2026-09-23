-- ============================================================
-- B+ HQ v3 — esquema
-- Proyecto Supabase propio (bplus-team-hq). Todo vive dentro de un
-- "espacio": solo sus miembros leen y escriben (RLS en todas las tablas).
-- ============================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- perfiles (1:1 con auth.users) ----------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text not null,
  display_name         text not null,
  color                text not null default '#2a82ad',
  timezone             text not null default 'America/Lima',
  avatar_rockie        jsonb not null default '{}'::jsonb,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9._]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40)
);
create unique index profiles_username_lower on public.profiles (lower(username));

-- ---------- espacios ----------
create table public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'B+',
  tagline     text not null default '',
  about       text not null default '',
  links       jsonb not null default '[]'::jsonb,   -- recursos generales [{t,d,url,c}]
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.space_members (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner','member')),
  role_title      text not null default '',
  job_description text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (space_id, user_id)
);
create index space_members_user_idx on public.space_members (user_id);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  code        text not null unique,
  expires_at  timestamptz not null default now() + interval '7 days',
  created_by  uuid references public.profiles(id) on delete set null,
  used_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index invites_space_idx on public.invites (space_id);

-- ---------- áreas (franja de color de cada tarea) ----------
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  color       text not null default '#4a6fa5',
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index areas_space_idx on public.areas (space_id);

-- ---------- proyectos (antes "hitos"; el % se calcula) ----------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  description text not null default '',
  color       text not null default '#b4637a',
  start_date  date,
  due_date    date,
  links       jsonb not null default '[]'::jsonb,   -- recursos del proyecto [{t,url}]
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_space_idx on public.projects (space_id);

-- ---------- tareas ----------
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete set null,
  area_id          uuid references public.areas(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 200),
  notes            text not null default '',
  assignee_id      uuid references public.profiles(id) on delete set null,
  status           text not null default 'todo' check (status in ('todo','doing','done')),
  priority         text not null default 'normal' check (priority in ('normal','urgent')),
  start_date       date,
  due_date         date,
  position         double precision not null default 0,
  validation       text check (validation in ('plain','proof')),
  proof_url        text,
  proof_image_path text,
  validated_at     timestamptz,
  validated_by     uuid references public.profiles(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tasks_dates_order check (start_date is null or due_date is null or start_date <= due_date)
);
create index tasks_space_idx on public.tasks (space_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_project_idx on public.tasks (project_id);

-- ---------- reuniones ----------
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  space_id          uuid not null references public.spaces(id) on delete cascade,
  title             text not null,
  description       text not null default '',
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  location_or_link  text not null default '',
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  external_provider text,            -- listo para Google Calendar
  external_id       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint events_order check (ends_at > starts_at)
);
create index events_space_start_idx on public.events (space_id, starts_at);

create table public.event_attendees (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  response    text not null default 'pending' check (response in ('pending','yes','no')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.event_tasks (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, task_id)
);

-- ---------- gamificación ----------
create table public.xp_log (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  mode        text not null check (mode in ('plain','proof')),
  points      int not null,
  day         date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index xp_log_space_idx on public.xp_log (space_id, day);

create table public.achievements_unlocked (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (space_id, achievement_id)
);

-- ---------- actividad ("qué cambió desde ayer" + deshacer) ----------
create table public.activity (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  verb        text not null,
  entity_type text not null,
  entity_id   uuid,
  summary     text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index activity_space_idx on public.activity (space_id, created_at desc);
create index activity_entity_idx on public.activity (entity_id);

-- ---------- agente ----------
create table public.agent_messages (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index agent_messages_idx on public.agent_messages (space_id, user_id, created_at desc);

-- updated_at en todas
do $$
declare t text;
begin
  foreach t in array array['profiles','spaces','space_members','invites','areas','projects','tasks',
    'events','event_attendees','event_tasks','xp_log','achievements_unlocked','activity','agent_messages']
  loop
    execute format('create trigger %1$s_touch before update on public.%1$s
      for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
