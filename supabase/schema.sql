-- ============================================================
-- B+ HQ — esquema para Supabase
-- Ejecutar en el SQL Editor del proyecto (el mismo de la app B+:
-- ref wmsizqixjjrglygskhdb, region sa-east-1).
-- Tablas con prefijo hq_ para no chocar con las de la app.
-- ============================================================

-- ---------- miembros del equipo ----------
create table if not exists hq_members (
  id          text primary key,              -- 'alvaro', 'mariana', ...
  name        text not null,
  color       text not null default '#2a82ad',
  role        text,
  job         text,
  auth_uid    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- tareas del tablero ----------
create table if not exists hq_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  area        text not null default 'gestion',   -- app|pcb|firmware|d3|kickstarter|video|diseno|gestion
  assignee    text references hq_members(id) on delete set null,
  due_date    date,
  priority    text not null default 'normal',    -- normal | urgente
  note        text,                              -- nota o link de prueba
  status      text not null default 'todo',      -- todo | doing | done  ("column" es palabra reservada)
  proof_mode  text,                              -- proof (+100) | plain (+40) | null
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hq_tasks_status_idx   on hq_tasks (status);
create index if not exists hq_tasks_assignee_idx on hq_tasks (assignee);

-- ---------- hitos ----------
create table if not exists hq_milestones (
  id          text primary key,
  title       text not null,
  description text,
  target      text,                              -- texto libre: '2026-08-15' u 'otono 2026'
  pct         int  not null default 0 check (pct between 0 and 100),
  sort_order  int  not null default 0
);

-- ---------- apartados libres ----------
create table if not exists hq_notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Nuevo apartado',
  color       text not null default '#659ca5',
  body        text default '',
  updated_at  timestamptz not null default now()
);

-- ---------- bitacora de XP (la racha sale de aqui) ----------
create table if not exists hq_xp_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references hq_tasks(id) on delete set null,
  member_id   text references hq_members(id) on delete set null,
  mode        text not null,                     -- proof | plain
  points      int  not null,                     -- 100 | 40
  day         date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists hq_xp_log_day_idx on hq_xp_log (day);

-- XP acumulado por miembro, sin recalcular en el cliente
create or replace view hq_member_xp as
  select m.id, m.name, coalesce(sum(l.points), 0)::int as xp
  from hq_members m
  left join hq_xp_log l on l.member_id = m.id
  group by m.id, m.name;

-- ============================================================
-- Seguridad (RLS). El cuartel es privado del equipo: solo
-- usuarios autenticados leen y escriben. Ajustar si algun dia
-- se abre a estudiantes con permisos distintos.
-- ============================================================
alter table hq_members    enable row level security;
alter table hq_tasks      enable row level security;
alter table hq_milestones enable row level security;
alter table hq_notes      enable row level security;
alter table hq_xp_log     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['hq_members','hq_tasks','hq_milestones','hq_notes','hq_xp_log']
  loop
    execute format(
      'create policy "equipo lee %1$s" on %1$s for select to authenticated using (true)', t);
    execute format(
      'create policy "equipo escribe %1$s" on %1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- datos iniciales del equipo ----------
insert into hq_members (id, name, color, role, job) values
  ('alvaro',    'Alvaro',    '#2a82ad', 'Fundador - integra todo',  'Que el proyecto avance entero, no por partes.'),
  ('mariana',   'Mariana',   '#b4637a', 'Hardware - PCB',           'La placa: revisiones, BOM y fabricacion.'),
  ('sebastian', 'Sebastian', '#8aa54a', 'Firmware - integracion',   'Que lo que sale de la placa funcione end-to-end.'),
  ('fabricio',  'Fabricio',  '#eaa545', 'Kickstarter - comunidad',  'Contarle esto al mundo: video, copy, campana.'),
  ('angel',     'Angel',     '#a573a5', 'Diseno - sistema analogo', 'La siguiente invencion del sistema de objetos.')
on conflict (id) do nothing;

-- ============================================================
-- v2: el espacio es configurable (nombre, tema, manifiesto),
-- las columnas y las areas las define cada equipo, y hay logros.
-- ============================================================
create table if not exists hq_space (
  id           int primary key default 1 check (id = 1),   -- una sola fila
  name         text not null default 'HQ',
  tagline      text,
  color_theme  text not null default 'coral',
  hero_title   text,
  hero_lead    text,
  about        text,
  rules        jsonb not null default '[]'::jsonb,        -- [{t,d,c}]
  northstar    jsonb not null default '[]'::jsonb,        -- [{t,d}]
  links        jsonb not null default '[]'::jsonb,        -- [{t,d,url,c}]
  updated_at   timestamptz not null default now()
);
insert into hq_space (id) values (1) on conflict (id) do nothing;

create table if not exists hq_columns (
  id          text primary key,
  name        text not null,
  color       text not null default '#9893a5',
  kind        text not null default 'open' check (kind in ('open','done')),
  sort_order  int  not null default 0
);
insert into hq_columns (id, name, color, kind, sort_order) values
  ('todo',  'Por hacer', '#9893a5', 'open', 0),
  ('doing', 'En curso',  '#eaa545', 'open', 1),
  ('done',  'Hecho',     '#4a7c3f', 'done', 2)
on conflict (id) do nothing;

create table if not exists hq_areas (
  id     text primary key,
  name   text not null,
  color  text not null default '#4a6fa5'
);

-- la tarea guarda su posicion dentro de la columna (drag & drop)
alter table hq_tasks add column if not exists sort_order int not null default 0;
-- y el color de cada hito
alter table hq_milestones add column if not exists color text not null default '#b4637a';

create table if not exists hq_achievements (
  id           text primary key,             -- 'first', 'streak7', ...
  unlocked_at  timestamptz not null default now()
);

alter table hq_space        enable row level security;
alter table hq_columns      enable row level security;
alter table hq_areas        enable row level security;
alter table hq_achievements enable row level security;
do $$
declare t text;
begin
  foreach t in array array['hq_space','hq_columns','hq_areas','hq_achievements']
  loop
    execute format('create policy "equipo lee %1$s" on %1$s for select to authenticated using (true)', t);
    execute format('create policy "equipo escribe %1$s" on %1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
