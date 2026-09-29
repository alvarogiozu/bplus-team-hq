-- ============================================================
-- Rockie Agenda — Despertar/dormir por día, rutina semanal, eventos de varios días
-- y Google Calendar de ida y vuelta.
-- agenda_days: lo de UN día (arrastraste el sol o la luna). Manda sobre la rutina.
-- agenda_prefs.routine: {"0".."6": {"wake": min, "sleep": min}} (0 = domingo). Manda sobre
--   wake_min/sleep_min, que quedan como "lo de siempre".
-- agenda_items.end_day: último día (incluido) de algo de todo el día que dura varios días.
-- agenda_items.gcal_event_id + agenda_google.rockie_cal_id/sync_token/scopes: el calendario
--   «Rockie» dentro del Google de la persona (scope calendar.app.created).
-- ============================================================

create table public.agenda_days (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  wake_min   int check (wake_min between 0 and 1439),
  sleep_min  int check (sleep_min between 0 and 1439),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.agenda_days enable row level security;
revoke all on public.agenda_days from anon;
grant select, insert, update, delete on public.agenda_days to authenticated;
create policy agenda_days_own on public.agenda_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.agenda_days;

alter table public.agenda_prefs add column routine jsonb not null default '{}'::jsonb;

alter table public.agenda_items add column end_day date;
alter table public.agenda_items add constraint agenda_items_end_day_check
  check (end_day is null or (day is not null and end_day >= day and end_day <= day + 366));
create index agenda_items_span_idx on public.agenda_items (user_id, end_day) where end_day is not null;

alter table public.agenda_items add column gcal_event_id text;
alter table public.agenda_google
  add column rockie_cal_id text,
  add column sync_token text,
  add column scopes text;
