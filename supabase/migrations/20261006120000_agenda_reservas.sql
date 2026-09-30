-- ============================================================
-- Rockie Agenda — Reservar tiempo
-- Una reserva aparta un espacio del día sin decidir todavía qué harás ("Hobbies 1 h",
-- "Estudio 2 h"). Cada reserva tiene opciones para llenarla (guitarra 30 min, ajedrez 30 min…):
-- son las filas de agenda_hobbies con reserve_id. En el día:
--   · el bloque reservado es un agenda_item con is_reserve = true (y reserve_id = su plantilla)
--   · lo que lo llena son agenda_items con in_reserve = id del bloque reservado
-- Los hobbies que ya existían pasan a ser opciones de una reserva «Hobbies».
-- ============================================================

create table public.agenda_reserves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  icon         text not null default 'star' check (char_length(icon) <= 24),
  color        text not null default '#8a6fb3' check (color ~ '^#[0-9a-fA-F]{6}$'),
  duration_min int not null default 60 check (duration_min between 15 and 720),
  position     int not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index agenda_reserves_user_idx on public.agenda_reserves (user_id, position);
alter table public.agenda_reserves enable row level security;
revoke all on public.agenda_reserves from anon;
grant select, insert, update, delete on public.agenda_reserves to authenticated;
create policy agenda_reserves_own on public.agenda_reserves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.agenda_reserves;

alter table public.agenda_hobbies add column reserve_id uuid references public.agenda_reserves(id) on delete set null;

alter table public.agenda_items
  add column is_reserve boolean not null default false,
  add column reserve_id uuid references public.agenda_reserves(id) on delete set null,
  add column in_reserve uuid references public.agenda_items(id) on delete set null;
create index agenda_items_in_reserve_idx on public.agenda_items (in_reserve) where in_reserve is not null;

-- Un ítem solo apunta a grupos, hobbies, reservas y bloques reservados de su mismo dueño
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
  if new.reserve_id is not null
     and not exists (select 1 from public.agenda_reserves r where r.id = new.reserve_id and r.user_id = new.user_id) then
    raise exception 'Esa reserva no es tuya';
  end if;
  if new.in_reserve is not null
     and not exists (select 1 from public.agenda_items i where i.id = new.in_reserve and i.user_id = new.user_id and i.is_reserve) then
    raise exception 'Ese espacio reservado no es tuyo';
  end if;
  return new;
end $$;
drop trigger if exists agenda_items_links_guard on public.agenda_items;
create trigger agenda_items_links_guard before insert or update of group_id, hobby_id, reserve_id, in_reserve on public.agenda_items
  for each row execute function public.agenda_items_links_guard();

create or replace function public.agenda_hobbies_reserve_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reserve_id is not null
     and not exists (select 1 from public.agenda_reserves r where r.id = new.reserve_id and r.user_id = new.user_id) then
    raise exception 'Esa reserva no es tuya';
  end if;
  return new;
end $$;
create trigger agenda_hobbies_reserve_guard before insert or update of reserve_id on public.agenda_hobbies
  for each row execute function public.agenda_hobbies_reserve_guard();

-- Los hobbies que ya había se juntan en una reserva «Hobbies» (1 h) por persona
insert into public.agenda_reserves (user_id, name, icon, color, duration_min, position)
select distinct h.user_id, 'Hobbies', 'star', '#8a6fb3', 60, 0
from public.agenda_hobbies h
where not h.archived;

update public.agenda_hobbies h
set reserve_id = r.id
from public.agenda_reserves r
where r.user_id = h.user_id and r.name = 'Hobbies' and h.reserve_id is null;
