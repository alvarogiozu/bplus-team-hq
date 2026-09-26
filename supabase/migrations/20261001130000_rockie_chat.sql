-- ============================================================
-- Un solo chat con Rockie: lo que le dices en la Agenda, el HQ (Equipo) o el Cuaderno queda
-- en la misma conversación, en cualquier dispositivo. Es personal (solo tú la ves) y guarda
-- las últimas 200 frases; la IA recibe las más recientes como contexto.
-- ============================================================

create table public.rockie_turns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  app         text not null check (app in ('agenda', 'equipo', 'cuaderno', 'habitos')),
  role        text not null check (role in ('user', 'assistant')),
  text        text not null check (char_length(btrim(text)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index rockie_turns_user_idx on public.rockie_turns (user_id, created_at desc);

-- poda: quedan las 200 más nuevas de cada persona
create or replace function public.rockie_turns_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from rockie_turns
  where user_id = new.user_id
    and id in (select id from rockie_turns where user_id = new.user_id order by created_at desc offset 200);
  return null;
end $$;
create trigger rockie_turns_prune after insert on public.rockie_turns
  for each row execute function public.rockie_turns_prune();

alter table public.rockie_turns enable row level security;
revoke all on public.rockie_turns from anon;
grant select, insert, delete on public.rockie_turns to authenticated;
create policy rockie_turns_own on public.rockie_turns for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.rockie_turns;
