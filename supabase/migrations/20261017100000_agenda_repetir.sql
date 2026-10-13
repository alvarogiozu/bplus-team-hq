-- Eventos que se repiten en la Agenda. Una «serie» guarda la regla (cada día, cada semana en ciertos días, cada mes) y
-- cada vez que toca es una actividad normal de agenda_items con su serie_id: así todo lo demás (el día, el mes,
-- «Buscar hueco» con el equipo, Google, el conector, el Cofre) la trata como a cualquier otra, y cada una se puede
-- mover, marcar o borrar sola. La app las deja creadas unos meses hacia adelante y va sumando las que faltan
-- (generado_hasta), porque el título va cifrado y solo el dispositivo de la persona lo puede escribir.
create table public.agenda_series (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  freq           text not null check (freq in ('dia', 'semana', 'mes')),
  cada           smallint not null default 1 check (cada between 1 and 12),
  dias           smallint[] not null default '{}',   -- para 'semana': 0 = domingo … 6 = sábado
  inicio         date not null,                       -- primer día: ancla de «cada 2 semanas» y del día del mes
  hasta          date,                                -- último día (incluido); null = sin fin
  generado_hasta date not null,                       -- hasta qué día ya están creadas sus actividades
  created_at     timestamptz not null default now()
);
alter table public.agenda_series enable row level security;
revoke all on public.agenda_series from anon;
grant select, insert, update, delete on public.agenda_series to authenticated;
create policy agenda_series_own on public.agenda_series for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.agenda_items add column serie_id uuid references public.agenda_series(id) on delete set null;
create index agenda_items_serie on public.agenda_items (serie_id, day) where serie_id is not null;
