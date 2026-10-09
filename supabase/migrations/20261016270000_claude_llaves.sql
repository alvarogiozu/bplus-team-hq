-- Llave temporal para Claude: los proyectos (y lo personal) quedan SIEMPRE cifrados en la base y Claude igual los lee
-- y edita. Al activar Claude, el aparato de la persona entrega las llaves de ese ámbito a la función llave-claude, que
-- las envuelve con una llave del servidor (CLAUDE_KEK: secret de las funciones, NO está en la base ni en sus
-- respaldos) y las guarda aquí con vencimiento. El conector (cuaderno-mcp) las abre en memoria por pedido para
-- descifrar y cifrar; nada en claro queda en disco, logs ni respaldos. Reemplaza el modo «abierta» (en claro).
--  - ambito 'espacio' = un proyecto (solo su dueño); 'todo' = todo su Rockie (lo personal + sus equipos y notas).
--  - envuelto: AES-256-GCM con la KEK, atado a (user_id, ambito, space_id) para que no sirva en otra fila.
--  - La persona ve sus llaves (usos y último uso, para saber cuándo entró Claude) y las revoca borrándolas.
--    envuelto no lo lee nadie desde la app: solo la llave de servicio.
--  - Las vencidas se borran solas (cada hora): con ellas se va el blob.

create table if not exists public.claude_llaves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ambito      text not null check (ambito in ('espacio', 'todo')),
  space_id    uuid references public.spaces(id) on delete cascade,
  kids        text[] not null default '{}',
  envuelto    text not null,
  kek_version smallint not null default 1,
  dias        smallint not null default 30 check (dias in (1, 7, 30)),
  vence       timestamptz not null,
  creada      timestamptz not null default now(),
  renovada    timestamptz not null default now(),
  usos        integer not null default 0,
  ultimo_uso  timestamptz,
  constraint claude_llaves_ambito_espacio check ((ambito = 'espacio') = (space_id is not null))
);
create unique index if not exists claude_llaves_una_por_espacio on public.claude_llaves (user_id, space_id) where ambito = 'espacio';
create unique index if not exists claude_llaves_una_todo on public.claude_llaves (user_id) where ambito = 'todo';
create index if not exists claude_llaves_vence on public.claude_llaves (vence);

alter table public.claude_llaves enable row level security;
revoke all on public.claude_llaves from anon, authenticated;
-- la persona ve sus llaves SIN el blob, y las revoca borrándolas
grant select (id, user_id, ambito, space_id, kids, kek_version, dias, vence, creada, renovada, usos, ultimo_uso) on public.claude_llaves to authenticated;
grant delete on public.claude_llaves to authenticated;
drop policy if exists claude_llaves_mias on public.claude_llaves;
create policy claude_llaves_mias on public.claude_llaves for select to authenticated using (user_id = auth.uid());
drop policy if exists claude_llaves_revocar on public.claude_llaves;
create policy claude_llaves_revocar on public.claude_llaves for delete to authenticated using (user_id = auth.uid());

-- historial sin llaves: cuándo se dio, renovó, revocó o venció
create table if not exists public.claude_llaves_historial (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  ambito   text not null,
  space_id uuid,
  evento   text not null check (evento in ('creada', 'renovada', 'revocada', 'vencida')),
  cuando   timestamptz not null default now()
);
create index if not exists claude_llaves_historial_user on public.claude_llaves_historial (user_id, cuando desc);
alter table public.claude_llaves_historial enable row level security;
revoke all on public.claude_llaves_historial from anon, authenticated;
grant select on public.claude_llaves_historial to authenticated;
drop policy if exists claude_llaves_historial_mio on public.claude_llaves_historial;
create policy claude_llaves_historial_mio on public.claude_llaves_historial for select to authenticated using (user_id = auth.uid());

create or replace function public.claude_llaves_anotar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into claude_llaves_historial (user_id, ambito, space_id, evento) values (new.user_id, new.ambito, new.space_id, 'creada');
  elsif tg_op = 'UPDATE' and new.renovada is distinct from old.renovada then
    insert into claude_llaves_historial (user_id, ambito, space_id, evento) values (new.user_id, new.ambito, new.space_id, 'renovada');
  elsif tg_op = 'DELETE' then
    insert into claude_llaves_historial (user_id, ambito, space_id, evento)
    values (old.user_id, old.ambito, old.space_id, case when old.vence <= now() then 'vencida' else 'revocada' end);
  end if;
  return null;
end $$;
revoke execute on function public.claude_llaves_anotar() from public, anon, authenticated;
drop trigger if exists claude_llaves_anotar on public.claude_llaves;
create trigger claude_llaves_anotar after insert or update or delete on public.claude_llaves
  for each row execute function public.claude_llaves_anotar();

-- las vencidas se borran (y con ellas el blob) cada hora
select cron.unschedule(jobid) from cron.job where jobname = 'claude-llaves-vencidas';
select cron.schedule('claude-llaves-vencidas', '7 * * * *', $cron$ delete from public.claude_llaves where vence <= now() $cron$);
