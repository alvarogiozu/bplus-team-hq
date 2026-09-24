-- ============================================================
-- Rockie Agenda — Calendarios (como Google Calendar, pero minimos)
-- Cada actividad vive en UN calendario (Personal, Estudio, Trabajo, Salud...).
-- El calendario da el color y se puede ocultar con su casilla. Google Calendar
-- se conecta en solo lectura: el refresh_token vive en agenda_google (sin
-- politicas = solo service_role, lo usa la Edge Function agenda-google).
-- ============================================================

create table public.agenda_calendars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null default '#cf7358' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon       text not null default 'task' check (char_length(icon) <= 24),
  position   int not null default 0,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index agenda_calendars_user_idx on public.agenda_calendars (user_id, position);

alter table public.agenda_calendars enable row level security;
revoke all on public.agenda_calendars from anon;
grant select, insert, update, delete on public.agenda_calendars to authenticated;
create policy agenda_calendars_own on public.agenda_calendars for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.agenda_calendars;

alter table public.agenda_items add column calendar_id uuid references public.agenda_calendars(id) on delete set null;
create index agenda_items_calendar_idx on public.agenda_items (calendar_id);

-- Un item solo puede ir a un calendario de su mismo dueno
create or replace function public.agenda_items_calendar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.calendar_id is not null
     and not exists (select 1 from public.agenda_calendars c where c.id = new.calendar_id and c.user_id = new.user_id) then
    raise exception 'Ese calendario no es tuyo';
  end if;
  return new;
end $$;
create trigger agenda_items_calendar_guard before insert or update of calendar_id on public.agenda_items
  for each row execute function public.agenda_items_calendar_guard();

-- Calendarios de fabrica la primera vez (idempotente: unique por nombre) y lo
-- que ya estaba agendado pasa a "Personal".
create or replace function public.agenda_seed_calendars() returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_personal uuid;
begin
  if v_uid is null or exists (select 1 from public.agenda_calendars where user_id = v_uid) then
    return;
  end if;
  insert into public.agenda_calendars (user_id, name, color, icon, position) values
    (v_uid, 'Personal', '#cf7358', 'home', 0),
    (v_uid, 'Estudio', '#4a8db3', 'study', 1),
    (v_uid, 'Trabajo', '#8a6fb3', 'work', 2),
    (v_uid, 'Salud', '#6f9a4a', 'gym', 3)
  on conflict (user_id, name) do nothing;
  select id into v_personal from public.agenda_calendars where user_id = v_uid and name = 'Personal';
  update public.agenda_items set calendar_id = v_personal where user_id = v_uid and calendar_id is null;
end $$;
grant execute on function public.agenda_seed_calendars() to authenticated;

-- Que se ve: lo del equipo y los calendarios de Google ocultos
alter table public.agenda_prefs add column hide_team boolean not null default false;
alter table public.agenda_prefs add column google_hidden text[] not null default '{}';

-- Conexion con Google Calendar (solo lectura). Nadie del lado cliente la lee.
create table public.agenda_google (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  refresh_token text not null,
  email         text,
  connected_at  timestamptz not null default now()
);
alter table public.agenda_google enable row level security;
revoke all on public.agenda_google from anon, authenticated;
