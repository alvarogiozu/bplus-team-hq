-- Cobro con Culqi (fase 4 de docs/negocio/modelo-de-negocio.md). El precio lo decide la base (planes_precios),
-- nunca el navegador: la Edge Function culqi-cobro lee de aquí cuánto cobrar, cobra con la llave secreta de Culqi
-- (solo vive en el servidor) y, si el cobro sale bien, aplica el plan con aplicar_pago.

-- ——— precios (con IGV, en céntimos de sol) ———
create table public.planes_precios (
  plan     text not null check (plan in ('plus', 'pro', 'club')),
  tarifa   text not null check (tarifa in ('normal', 'estudiante')),
  periodo  text not null check (periodo in ('mes', 'anio')),
  centimos integer not null check (centimos > 0),
  meses    integer not null check (meses > 0),
  primary key (plan, tarifa, periodo)
);
alter table public.planes_precios enable row level security;
create policy planes_precios_leer on public.planes_precios for select to anon, authenticated using (true);

-- anual = 12 meses con ~20% de descuento
insert into public.planes_precios (plan, tarifa, periodo, centimos, meses) values
  ('plus', 'normal', 'mes', 1990, 1),     ('plus', 'normal', 'anio', 19100, 12),
  ('plus', 'estudiante', 'mes', 1290, 1), ('plus', 'estudiante', 'anio', 12380, 12),
  ('pro', 'normal', 'mes', 3490, 1),      ('pro', 'normal', 'anio', 33500, 12),
  ('club', 'normal', 'mes', 9900, 1),     ('club', 'normal', 'anio', 95000, 12);

-- ——— pagos (lo que cobró Culqi: para tu historial, soporte y reembolsos) ———
create table public.planes_pagos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  space_id    uuid references public.spaces(id) on delete set null,
  plan        text not null,
  tarifa      text not null,
  periodo     text not null,
  centimos    integer not null,
  moneda      text not null default 'PEN',
  culqi_cargo text unique,
  estado      text not null check (estado in ('pagado', 'fallido', 'reembolsado')),
  hasta       timestamptz,
  created_at  timestamptz not null default now()
);
create index planes_pagos_user on public.planes_pagos (user_id, created_at desc);
alter table public.planes_pagos enable row level security;
create policy planes_pagos_mios on public.planes_pagos for select to authenticated using (user_id = auth.uid());

-- ——— aplicar un pago (solo la Edge Function, con la llave de servicio) ———
create or replace function public.aplicar_pago(p_user uuid, p_plan text, p_tarifa text, p_meses integer, p_space uuid default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  s planes_suscripciones;
  base timestamptz;
  nuevo timestamptz;
begin
  if p_meses is null or p_meses < 1 then raise exception 'Meses inválidos'; end if;
  if p_plan = 'club' then
    if p_space is null then raise exception 'Falta el equipo del plan Club'; end if;
    select greatest(now(), coalesce(hasta, now())) into base from planes_clubes where space_id = p_space;
    base := coalesce(base, now());
    nuevo := base + make_interval(months => p_meses);
    insert into planes_clubes (space_id, origen, desde, hasta) values (p_space, 'culqi', now(), nuevo)
      on conflict (space_id) do update set
        hasta = case when planes_clubes.hasta is null then null else excluded.hasta end,
        origen = 'culqi', updated_at = now();
    return nuevo;
  end if;
  if p_plan not in ('plus', 'pro') then raise exception 'Plan inválido'; end if;
  select * into s from planes_suscripciones where user_id = p_user and (hasta is null or hasta > now());
  -- mismo plan: se suma el tiempo a lo que le quedaba; otro plan: empieza hoy
  base := case when s.user_id is not null and s.plan = p_plan then coalesce(s.hasta, now()) else now() end;
  nuevo := base + make_interval(months => p_meses);
  insert into planes_suscripciones (user_id, plan, tarifa, origen, desde, hasta)
    values (p_user, p_plan, p_tarifa, 'culqi', now(), nuevo)
    on conflict (user_id) do update set
      plan = excluded.plan, tarifa = excluded.tarifa, origen = 'culqi',
      desde = case when planes_suscripciones.plan = excluded.plan then planes_suscripciones.desde else now() end,
      hasta = excluded.hasta, updated_at = now();
  return nuevo;
end $$;

revoke all on function public.aplicar_pago(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.aplicar_pago(uuid, text, text, integer, uuid) to service_role;
