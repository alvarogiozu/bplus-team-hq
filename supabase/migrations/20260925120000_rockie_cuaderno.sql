-- ============================================================
-- Rockie Cuaderno — el segundo cerebro (mismas cuentas que el HQ)
-- Todo es privado de cada persona (RLS por user_id): ni el equipo
-- del HQ ve tus notas. Rockie solo PROPONE; el cliente escribe con
-- la sesión de la persona.
--
--   cuaderno_entries  el diario: capturas crudas (voz o texto) + propuestas de Rockie
--   cuaderno_notes    notas atómicas (Markdown) con su embedding para "parecidas"
--   cuaderno_links    conexiones nota↔nota o nota↔proyecto del HQ, siempre con su porqué
--   cuaderno_cards    tarjetas de repaso (Leitner, 5 cajas)
--   cuaderno_days     cuánto repasaste cada día (racha)
-- ============================================================

create extension if not exists vector with schema extensions;

create table public.cuaderno_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  text       text not null check (char_length(text) between 1 and 4000),
  source     text not null default 'texto' check (source in ('voz', 'texto')),
  -- nuevo = Rockie aún no lo vio · propuesto = hay propuestas por decidir · listo = nada pendiente
  status     text not null default 'nuevo' check (status in ('nuevo', 'propuesto', 'listo')),
  say        text not null default '' check (char_length(say) <= 600),
  proposals  jsonb not null default '[]'::jsonb check (jsonb_typeof(proposals) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cuaderno_entries_user_day on public.cuaderno_entries (user_id, day);
create index cuaderno_entries_open on public.cuaderno_entries (user_id) where status <> 'listo';

create table public.cuaderno_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null default '' check (char_length(body) <= 60000),
  area        text not null default 'libre' check (area in ('cuerpo', 'mente', 'alma', 'proyectos', 'libre')),
  entry_id    uuid references public.cuaderno_entries(id) on delete set null,
  embedding   extensions.vector(768),
  embedded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index cuaderno_notes_user on public.cuaderno_notes (user_id, updated_at desc);
create index cuaderno_notes_embedding on public.cuaderno_notes using hnsw (embedding extensions.vector_cosine_ops);

create table public.cuaderno_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  a_id       uuid not null references public.cuaderno_notes(id) on delete cascade,
  b_id       uuid references public.cuaderno_notes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  constraint cuaderno_links_one_target check ((b_id is null) <> (project_id is null)),
  constraint cuaderno_links_not_self check (b_id is null or a_id <> b_id)
);
create unique index cuaderno_links_pair on public.cuaderno_links (user_id, least(a_id, b_id), greatest(a_id, b_id)) where b_id is not null;
create unique index cuaderno_links_project on public.cuaderno_links (user_id, a_id, project_id) where project_id is not null;

create table public.cuaderno_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note_id     uuid not null references public.cuaderno_notes(id) on delete cascade,
  q           text not null check (char_length(q) between 1 and 300),
  a           text not null check (char_length(a) between 1 and 600),
  box         int not null default 1 check (box between 1 and 5),
  due         date not null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index cuaderno_cards_due on public.cuaderno_cards (user_id, due);

create table public.cuaderno_days (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  reviewed   int not null default 0 check (reviewed >= 0),
  remembered int not null default 0 check (remembered >= 0),
  primary key (user_id, day)
);

create trigger cuaderno_entries_touch before update on public.cuaderno_entries
  for each row execute function public.touch_updated_at();
create trigger cuaderno_notes_touch before update on public.cuaderno_notes
  for each row execute function public.touch_updated_at();
create trigger cuaderno_cards_touch before update on public.cuaderno_cards
  for each row execute function public.touch_updated_at();

-- Todo lo que se enlaza tiene que ser tuyo (o de un proyecto de tu equipo).
create or replace function public.cuaderno_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'No cambia de dueño';
  end if;
  if tg_table_name = 'cuaderno_notes' then
    if new.entry_id is not null and not exists (select 1 from cuaderno_entries e where e.id = new.entry_id and e.user_id = new.user_id) then
      raise exception 'Esa entrada del diario no es tuya';
    end if;
  elsif tg_table_name = 'cuaderno_links' then
    if not exists (select 1 from cuaderno_notes n where n.id = new.a_id and n.user_id = new.user_id)
       or (new.b_id is not null and not exists (select 1 from cuaderno_notes n where n.id = new.b_id and n.user_id = new.user_id)) then
      raise exception 'Solo puedes conectar tus notas';
    end if;
    if new.project_id is not null and not exists (select 1 from projects p where p.id = new.project_id and is_member(p.space_id)) then
      raise exception 'Ese proyecto no es de tu equipo';
    end if;
  elsif tg_table_name = 'cuaderno_cards' then
    if not exists (select 1 from cuaderno_notes n where n.id = new.note_id and n.user_id = new.user_id) then
      raise exception 'Esa nota no es tuya';
    end if;
  end if;
  return new;
end $$;
create trigger cuaderno_notes_guard before insert or update on public.cuaderno_notes
  for each row execute function public.cuaderno_guard();
create trigger cuaderno_links_guard before insert or update on public.cuaderno_links
  for each row execute function public.cuaderno_guard();
create trigger cuaderno_cards_guard before insert or update on public.cuaderno_cards
  for each row execute function public.cuaderno_guard();

alter table public.cuaderno_entries enable row level security;
alter table public.cuaderno_notes enable row level security;
alter table public.cuaderno_links enable row level security;
alter table public.cuaderno_cards enable row level security;
alter table public.cuaderno_days enable row level security;
revoke all on public.cuaderno_entries, public.cuaderno_notes, public.cuaderno_links, public.cuaderno_cards, public.cuaderno_days from anon;
grant select, insert, update, delete on public.cuaderno_entries, public.cuaderno_notes, public.cuaderno_links, public.cuaderno_cards, public.cuaderno_days to authenticated;

create policy cuaderno_entries_own on public.cuaderno_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cuaderno_notes_own on public.cuaderno_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cuaderno_links_own on public.cuaderno_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cuaderno_cards_own on public.cuaderno_cards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cuaderno_days_own on public.cuaderno_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- "parecidas": búsqueda por significado (la usa la Edge Function con tu sesión) ----------
create or replace function public.cuaderno_similar(q extensions.vector(768), k int default 8, exclude uuid[] default '{}')
returns table (id uuid, title text, area text, snippet text, score double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select n.id, n.title, n.area, left(n.body, 280), 1 - (n.embedding <=> q)
  from cuaderno_notes n
  where n.user_id = auth.uid() and n.embedding is not null and not (n.id = any(exclude))
  order by n.embedding <=> q
  limit least(greatest(k, 1), 20)
$$;

-- updated_at y embedded_at salen del mismo now(): así "embedded_at < updated_at" significa "cambió desde la última vez"
create or replace function public.cuaderno_set_embedding(note uuid, emb extensions.vector(768)) returns void
language sql security invoker set search_path = public, extensions as $$
  update cuaderno_notes set embedding = emb, embedded_at = now() where id = note and user_id = auth.uid()
$$;

revoke execute on function public.cuaderno_similar(extensions.vector, int, uuid[]) from public, anon;
revoke execute on function public.cuaderno_set_embedding(uuid, extensions.vector) from public, anon;
grant execute on function public.cuaderno_similar(extensions.vector, int, uuid[]) to authenticated;
grant execute on function public.cuaderno_set_embedding(uuid, extensions.vector) to authenticated;
revoke execute on function public.cuaderno_guard() from public, anon;
