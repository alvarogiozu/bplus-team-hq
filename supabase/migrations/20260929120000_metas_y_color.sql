-- ============================================================
-- Metas y objetivos (como las Goals de Asana, sin su burocracia) + color principal
-- personal + misión del espacio.
--
-- Una meta es MEDIBLE: va de start_value a target_value (número, %, o la avanza un
-- proyecto, o la avanzan sus sub-metas). Puede tener sub-metas (parent_id) y así se arma
-- el mapa de lo general a lo específico. Cada avance queda como check-in (historial).
-- ============================================================

-- Color principal elegido por cada persona (el azul de la app; null = el de B+)
alter table public.profiles add column accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$');
grant update (accent) on public.profiles to authenticated;

-- Misión del espacio (arriba de las metas)
alter table public.spaces add column mission text not null default '' check (char_length(mission) <= 600);

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  parent_id      uuid references public.goals(id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 160),
  description    text not null default '' check (char_length(description) <= 2000),
  owner_id       uuid references public.profiles(id) on delete set null,
  area_id        uuid references public.areas(id) on delete set null,        -- "equipo" de la meta
  kind           text not null default 'number' check (kind in ('number','percent','project','children')),
  unit           text not null default '' check (char_length(unit) <= 16),
  start_value    numeric not null default 0,
  target_value   numeric not null default 100,
  current_value  numeric not null default 0,
  project_id     uuid references public.projects(id) on delete set null,     -- kind = 'project'
  start_date     date,
  due_date       date,
  status_override text check (status_override in ('on_track','at_risk','off_track','done')),
  position       double precision not null default 0,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint goals_dates check (start_date is null or due_date is null or start_date <= due_date),
  constraint goals_target check (kind not in ('number','percent') or target_value <> start_value)
);
create index goals_space_idx on public.goals (space_id, position);
create index goals_parent_idx on public.goals (parent_id);

create table public.goal_checkins (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals(id) on delete cascade,
  space_id    uuid not null references public.spaces(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  value       numeric not null,
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index goal_checkins_goal_idx on public.goal_checkins (goal_id, created_at desc);

-- Coherencia: la sub-meta vive en el mismo espacio que su padre y no se arman ciclos;
-- el check-in pertenece al espacio de su meta.
create or replace function public.goals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Una meta no puede ser sub-meta de sí misma';
    end if;
    if not exists (select 1 from goals p where p.id = new.parent_id and p.space_id = new.space_id) then
      raise exception 'La meta padre es de otro espacio';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, parent_id from goals where id = new.parent_id
        union all
        select g.id, g.parent_id from goals g join up on g.id = up.parent_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'Eso armaría un círculo de metas';
    end if;
  end if;
  if new.owner_id is not null and not exists (select 1 from space_members where space_id = new.space_id and user_id = new.owner_id) then
    raise exception 'El dueño de la meta no es del equipo';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger goals_guard before insert or update on public.goals
  for each row execute function public.goals_guard();

create or replace function public.goal_checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select g.space_id into new.space_id from goals g where g.id = new.goal_id;
  if new.space_id is null then
    raise exception 'Meta no encontrada';
  end if;
  return new;
end $$;
create trigger goal_checkins_guard before insert on public.goal_checkins
  for each row execute function public.goal_checkins_guard();

alter table public.goals enable row level security;
alter table public.goal_checkins enable row level security;
revoke all on public.goals, public.goal_checkins from anon;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, delete on public.goal_checkins to authenticated;

create policy goals_members on public.goals for all to authenticated
  using (public.is_member(space_id)) with check (public.is_member(space_id));
create policy goal_checkins_read on public.goal_checkins for select to authenticated
  using (public.is_member(space_id));
create policy goal_checkins_write on public.goal_checkins for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(space_id));
create policy goal_checkins_delete on public.goal_checkins for delete to authenticated
  using (author_id = auth.uid());

alter publication supabase_realtime add table public.goals, public.goal_checkins;
