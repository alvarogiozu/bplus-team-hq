-- ============================================================
-- Rockie Agenda — Grupos de tareas, prioridad y hobbies
-- Grupo: una tanda de tareas con nombre propio ("Terminar carro") que vive en un
-- calendario (de ahi saca el color). Prioridad: 0 sin, 1 baja, 2 media, 3 alta.
-- Hobby: una practica de tiempo libre sin hora fija (guitarra 30 min). Ponerlo en
-- el dia crea un item con hobby_id: eso llena la casilla de hobbies de ese dia.
-- HQ: la prioridad de las tareas suma 'low' y 'medium' ('normal' = sin prioridad,
-- 'urgent' = alta), para que Equipo y Agenda hablen igual.
-- ============================================================

create table public.agenda_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  calendar_id uuid references public.agenda_calendars(id) on delete set null,
  priority    smallint not null default 0 check (priority between 0 and 3),
  position    int not null default 0,
  collapsed   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index agenda_groups_user_idx on public.agenda_groups (user_id, position);

alter table public.agenda_groups enable row level security;
revoke all on public.agenda_groups from anon;
grant select, insert, update, delete on public.agenda_groups to authenticated;
create policy agenda_groups_own on public.agenda_groups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.agenda_groups;

create table public.agenda_hobbies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  icon         text not null default 'star' check (char_length(icon) <= 24),
  color        text not null default '#8a6fb3' check (color ~ '^#[0-9a-fA-F]{6}$'),
  duration_min int not null default 30 check (duration_min between 5 and 480),
  position     int not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index agenda_hobbies_user_idx on public.agenda_hobbies (user_id, position);

alter table public.agenda_hobbies enable row level security;
revoke all on public.agenda_hobbies from anon;
grant select, insert, update, delete on public.agenda_hobbies to authenticated;
create policy agenda_hobbies_own on public.agenda_hobbies for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.agenda_hobbies;

alter table public.agenda_items
  add column group_id uuid references public.agenda_groups(id) on delete set null,
  add column hobby_id uuid references public.agenda_hobbies(id) on delete set null,
  add column priority smallint not null default 0 check (priority between 0 and 3);
create index agenda_items_group_idx on public.agenda_items (group_id) where group_id is not null;
create index agenda_items_hobby_idx on public.agenda_items (hobby_id, day) where hobby_id is not null;

-- Un item solo va a un grupo o hobby de su mismo dueno
create or replace function public.agenda_items_links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null
     and not exists (select 1 from public.agenda_groups g where g.id = new.group_id and g.user_id = new.user_id) then
    raise exception 'Ese grupo no es tuyo';
  end if;
  if new.hobby_id is not null
     and not exists (select 1 from public.agenda_hobbies h where h.id = new.hobby_id and h.user_id = new.user_id) then
    raise exception 'Ese hobby no es tuyo';
  end if;
  return new;
end $$;
create trigger agenda_items_links_guard before insert or update of group_id, hobby_id on public.agenda_items
  for each row execute function public.agenda_items_links_guard();

-- Un grupo solo vive en un calendario de su mismo dueno
create or replace function public.agenda_groups_calendar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.calendar_id is not null
     and not exists (select 1 from public.agenda_calendars c where c.id = new.calendar_id and c.user_id = new.user_id) then
    raise exception 'Ese calendario no es tuyo';
  end if;
  return new;
end $$;
create trigger agenda_groups_calendar_guard before insert or update of calendar_id on public.agenda_groups
  for each row execute function public.agenda_groups_calendar_guard();

-- HQ: tres niveles de prioridad (el check original venia en linea, sin nombre fijo)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%priority%'
  loop
    execute format('alter table public.tasks drop constraint %I', c);
  end loop;
end $$;
alter table public.tasks add constraint tasks_priority_check check (priority in ('normal', 'low', 'medium', 'urgent'));
