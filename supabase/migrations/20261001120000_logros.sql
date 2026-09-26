-- ============================================================
-- Logros del equipo configurables y conectados a Metas.
-- Además de los 10 logros fijos (achievements_unlocked), cada equipo crea los suyos: con
-- título, ícono y color, y se desbloquean al cumplir una meta (o al llegar a un % de ella) o
-- a mano ("lo entregamos nosotros"). Desbloquear pasa por unlock_team_achievement: queda
-- quién y cuándo, y se anota en la actividad del equipo.
-- ============================================================

create table public.team_achievements (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 240),
  icon         text not null default 'trophy' check (icon in ('trophy', 'star', 'flame', 'goal', 'flag', 'check', 'sparkle', 'team')),
  color        text not null default '#eaa545' check (color ~ '^#[0-9a-fA-F]{6}$'),
  goal_id      uuid references public.goals(id) on delete set null,
  threshold    numeric not null default 1 check (threshold > 0 and threshold <= 1),
  unlocked_at  timestamptz,
  unlocked_by  uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index team_achievements_space_idx on public.team_achievements (space_id, created_at);
create index team_achievements_goal_idx on public.team_achievements (goal_id);

create or replace function public.team_achievements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.goal_id is not null and not exists (select 1 from goals g where g.id = new.goal_id and g.space_id = new.space_id) then
    raise exception 'La meta es de otro espacio';
  end if;
  if tg_op = 'UPDATE' and new.space_id <> old.space_id then
    raise exception 'Un logro no cambia de espacio';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger team_achievements_guard before insert or update on public.team_achievements
  for each row execute function public.team_achievements_guard();

-- Desbloquear (idempotente): true solo la primera vez, para celebrar una sola vez.
create or replace function public.unlock_team_achievement(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  a team_achievements;
begin
  select * into a from team_achievements where id = p_id;
  if not found or not public.is_member(a.space_id) then
    raise exception 'Logro no encontrado';
  end if;
  if a.unlocked_at is not null then
    return false;
  end if;
  update team_achievements set unlocked_at = now(), unlocked_by = auth.uid() where id = p_id and unlocked_at is null;
  if not found then
    return false;
  end if;
  insert into activity (space_id, actor_id, verb, entity_type, entity_id, summary)
  values (a.space_id, auth.uid(), 'achievement', 'team_achievement', a.id, 'desbloqueó el logro «' || a.title || '»');
  return true;
end $$;
revoke execute on function public.unlock_team_achievement(uuid) from public, anon;
grant execute on function public.unlock_team_achievement(uuid) to authenticated;

alter table public.team_achievements enable row level security;
revoke all on public.team_achievements from anon;
grant select, insert, update, delete on public.team_achievements to authenticated;
create policy team_achievements_members on public.team_achievements for all to authenticated
  using (public.is_member(space_id)) with check (public.is_member(space_id));

alter publication supabase_realtime add table public.team_achievements;
