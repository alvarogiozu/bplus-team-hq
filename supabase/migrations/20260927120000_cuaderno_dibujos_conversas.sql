-- ============================================================
-- Rockie Cuaderno v2.1 — dibujos que se pueden volver a editar,
-- PDFs como fuente para "Aprender un tema" y conversaciones con
-- Rockie que se guardan en el diario.
-- ============================================================

-- Trazos de cada dibujo (el PNG que se ve en la página vive en storage)
create table public.cuaderno_drawings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  width      int not null check (width between 100 and 4000),
  height     int not null check (height between 100 and 4000),
  strokes    jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cuaderno_drawings_touch before update on public.cuaderno_drawings
  for each row execute function public.touch_updated_at();
alter table public.cuaderno_drawings enable row level security;
revoke all on public.cuaderno_drawings from anon;
grant select, insert, update, delete on public.cuaderno_drawings to authenticated;
create policy cuaderno_drawings_own on public.cuaderno_drawings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reeditar un dibujo reemplaza su PNG (upsert = update); y los PDFs entran como fuente
create policy cuaderno_files_update on storage.objects for update to authenticated
  using (bucket_id = 'cuaderno' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cuaderno' and (storage.foldername(name))[1] = auth.uid()::text);
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'],
      file_size_limit = 15728640
  where id = 'cuaderno';

-- Una conversación con Rockie se guarda entera en el diario (y Rockie propone qué rescatar)
alter table public.cuaderno_entries drop constraint cuaderno_entries_source_check;
alter table public.cuaderno_entries add constraint cuaderno_entries_source_check check (source in ('voz', 'texto', 'conversa'));
alter table public.cuaderno_entries drop constraint cuaderno_entries_text_check;
alter table public.cuaderno_entries add constraint cuaderno_entries_text_check check (char_length(text) between 1 and 20000);
