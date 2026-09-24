-- ============================================================
-- Rockie Agenda — la agenda personal (mismas cuentas que el HQ)
-- Todo es privado de cada persona (RLS por user_id). Lo del equipo
-- (tareas, reuniones, proyectos) se sigue leyendo de las tablas del HQ.
-- Horas en minutos desde medianoche, en la zona del perfil (default Lima).
-- ============================================================

create table public.agenda_prefs (
  user_id          uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  wake_min         int not null default 480 check (wake_min between 0 and 1439),
  sleep_min        int not null default 1320 check (sleep_min between 0 and 1439),
  presets          int[] not null default '{15,30,45,60,90}',
  default_duration int not null default 15 check (default_duration between 1 and 720),
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.agenda_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  notes        text not null default '',
  color        text not null default '#cf7358' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon         text not null default 'task' check (char_length(icon) <= 24),
  day          date,                                              -- null = Inbox
  start_min    int check (start_min between 0 and 1439),          -- null con día = todo el día
  duration_min int not null default 15 check (duration_min between 1 and 1440),
  done_at      timestamptz,
  subtasks     jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  position     double precision not null default 0,               -- orden dentro del Inbox
  hq_task_id   uuid references public.tasks(id) on delete cascade, -- bloque de tiempo de una tarea del HQ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint agenda_items_time_needs_day check (start_min is null or day is not null)
);
create index agenda_items_user_day on public.agenda_items (user_id, day);
create unique index agenda_items_hq_once on public.agenda_items (user_id, hq_task_id) where hq_task_id is not null;

create trigger agenda_prefs_touch before update on public.agenda_prefs
  for each row execute function public.touch_updated_at();
create trigger agenda_items_touch before update on public.agenda_items
  for each row execute function public.touch_updated_at();

-- Un bloque de tiempo solo puede apuntar a una tarea del HQ que la persona ve.
create or replace function public.agenda_items_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'Un ítem no cambia de dueño';
  end if;
  if new.hq_task_id is not null and (tg_op = 'INSERT' or new.hq_task_id is distinct from old.hq_task_id)
     and not exists (select 1 from public.tasks t where t.id = new.hq_task_id and public.is_member(t.space_id)) then
    raise exception 'Esa tarea del HQ no es de tu equipo';
  end if;
  return new;
end $$;
create trigger agenda_items_guard before insert or update on public.agenda_items
  for each row execute function public.agenda_items_guard();

alter table public.agenda_prefs enable row level security;
alter table public.agenda_items enable row level security;
revoke all on public.agenda_prefs, public.agenda_items from anon;
grant select, insert, update, delete on public.agenda_prefs, public.agenda_items to authenticated;

create policy agenda_prefs_own on public.agenda_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy agenda_items_own on public.agenda_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.agenda_items;

-- ---------- tope de uso del agente de voz (60 órdenes por hora y persona) ----------
create table public.agenda_agent_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  hour    timestamptz not null,
  count   int not null default 0,
  primary key (user_id, hour)
);
alter table public.agenda_agent_usage enable row level security;
revoke all on public.agenda_agent_usage from anon, authenticated;

create or replace function public.agenda_agent_bump() returns int
language sql security definer set search_path = public as $$
  insert into agenda_agent_usage (user_id, hour, count)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set count = agenda_agent_usage.count + 1
  returning count
$$;
revoke execute on function public.agenda_agent_bump() from public, anon;
grant execute on function public.agenda_agent_bump() to authenticated;
revoke execute on function public.agenda_items_guard() from public, anon;
