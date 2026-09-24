-- ============================================================
-- Rockie Cuaderno v2 — cuadernos (como OneNote/Obsidian), imágenes
-- y dibujos privados, y llaves para conectar Claude (MCP).
--
--   cuaderno_books   cuadernos de color y sus secciones (parent_id = una sola capa)
--   cuaderno_notes   + book_id (en qué cuaderno/sección vive) y position
--   storage 'cuaderno'  imágenes y dibujos: <user_id>/<archivo>, solo su dueño
--   cuaderno_tokens  llaves personales para Claude (se guarda solo el hash)
-- ============================================================

create table public.cuaderno_books (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id  uuid references public.cuaderno_books(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  -- nombre de un token de color (coral, amber, green, accent, berry, olive, navy, title), nunca un hex
  color      text not null default 'accent' check (color in ('coral', 'amber', 'green', 'accent', 'berry', 'olive', 'navy', 'title')),
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cuaderno_books_user on public.cuaderno_books (user_id, position);

alter table public.cuaderno_notes add column book_id uuid references public.cuaderno_books(id) on delete set null;
alter table public.cuaderno_notes add column position double precision not null default 0;
create index cuaderno_notes_book on public.cuaderno_notes (book_id, position);

create trigger cuaderno_books_touch before update on public.cuaderno_books
  for each row execute function public.touch_updated_at();

-- Una sola capa de secciones, y todo del mismo dueño.
create or replace function public.cuaderno_books_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'No cambia de dueño';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'Una sección no puede contenerse'; end if;
    if not exists (select 1 from cuaderno_books b where b.id = new.parent_id and b.user_id = new.user_id and b.parent_id is null) then
      raise exception 'Las secciones van dentro de un cuaderno tuyo (una sola capa)';
    end if;
  end if;
  return new;
end $$;
create trigger cuaderno_books_guard before insert or update on public.cuaderno_books
  for each row execute function public.cuaderno_books_guard();

-- La nota solo puede ir a un cuaderno propio (se suma al guard existente).
create or replace function public.cuaderno_notes_book_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.book_id is not null and not exists (select 1 from cuaderno_books b where b.id = new.book_id and b.user_id = new.user_id) then
    raise exception 'Ese cuaderno no es tuyo';
  end if;
  return new;
end $$;
create trigger cuaderno_notes_book_guard before insert or update of book_id on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_book_guard();

alter table public.cuaderno_books enable row level security;
revoke all on public.cuaderno_books from anon;
grant select, insert, update, delete on public.cuaderno_books to authenticated;
create policy cuaderno_books_own on public.cuaderno_books for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- imágenes y dibujos (privados) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cuaderno', 'cuaderno', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy cuaderno_files_read on storage.objects for select to authenticated
  using (bucket_id = 'cuaderno' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cuaderno_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'cuaderno' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cuaderno_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cuaderno' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- llaves para Claude (conector MCP) ----------
create table public.cuaderno_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null default 'Claude' check (char_length(name) between 1 and 60),
  token_hash   text not null unique check (char_length(token_hash) = 64),
  hint         text not null check (char_length(hint) <= 12), -- últimos caracteres, para reconocerla
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.cuaderno_tokens enable row level security;
revoke all on public.cuaderno_tokens from anon;
grant select, insert, delete on public.cuaderno_tokens to authenticated;
create policy cuaderno_tokens_own on public.cuaderno_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Solo el servidor MCP (service role): quién es dueño de una llave.
create or replace function public.cuaderno_token_user(p_hash text) returns uuid
language sql security definer set search_path = public as $$
  update cuaderno_tokens set last_used_at = now() where token_hash = p_hash returning user_id
$$;
revoke execute on function public.cuaderno_token_user(text) from public, anon, authenticated;

-- Búsqueda por significado para el MCP (service role, con el dueño explícito).
create or replace function public.cuaderno_similar_for(p_user uuid, q extensions.vector(768), k int default 8)
returns table (id uuid, title text, area text, snippet text, score double precision)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.title, n.area, left(n.body, 280), 1 - (n.embedding <=> q)
  from cuaderno_notes n
  where n.user_id = p_user and n.embedding is not null
  order by n.embedding <=> q
  limit least(greatest(k, 1), 20)
$$;
revoke execute on function public.cuaderno_similar_for(uuid, extensions.vector, int) from public, anon, authenticated;

revoke execute on function public.cuaderno_books_guard() from public, anon;
revoke execute on function public.cuaderno_notes_book_guard() from public, anon;
