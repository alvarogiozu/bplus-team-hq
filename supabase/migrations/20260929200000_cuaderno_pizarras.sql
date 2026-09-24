-- ============================================================
-- Rockie Cuaderno v2.2 — pizarras infinitas (opcionales).
-- Una página puede ser una pizarra: su escena (trazos, notas adhesivas,
-- textos, páginas pegadas y flechas) vive en una tabla aparte para que
-- la lista de páginas siga liviana. El texto de la pizarra se copia al
-- cuerpo de la página (búsqueda, mapa y Rockie lo leen igual).
-- ============================================================

alter table public.cuaderno_notes
  add column kind text not null default 'pagina' check (kind in ('pagina', 'pizarra'));

create table public.cuaderno_boards (
  note_id    uuid primary key references public.cuaderno_notes(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scene      jsonb not null default '{}'::jsonb
             check (jsonb_typeof(scene) = 'object' and octet_length(scene::text) <= 3000000),
  updated_at timestamptz not null default now()
);
create trigger cuaderno_boards_touch before update on public.cuaderno_boards
  for each row execute function public.touch_updated_at();

alter table public.cuaderno_boards enable row level security;
revoke all on public.cuaderno_boards from anon;
grant select, insert, update, delete on public.cuaderno_boards to authenticated;
-- solo tus pizarras, y solo sobre tus propias páginas
create policy cuaderno_boards_own on public.cuaderno_boards for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cuaderno_notes n where n.id = note_id and n.user_id = auth.uid())
  );
