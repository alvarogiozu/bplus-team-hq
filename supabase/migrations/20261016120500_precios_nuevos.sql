-- Precios nuevos (docs/negocio/precios-y-margenes.md, sección 1), listos detrás de un interruptor.
-- Aplicar esta migración NO cambia ningún precio: solo deja preparado el cambio.
-- El día que Culqi apruebe la tienda y Álvaro dé el OK (su tarea 26), se activa con UNA llamada (llave de servicio):
--   select public.activar_precios_nuevos();
-- y se deshace (si hiciera falta) con:
--   select public.desactivar_precios_nuevos();
--
-- Fundador: quien ya tenía cuenta antes del cambio (o activó un código de fundador) mantiene el precio de hoy de Plus y
-- Pro para siempre. El estudiante no es fundador: paga el precio nuevo de estudiante (que sigue siendo el más barato).

-- ——— el catálogo acepta la tarifa fundador (sin filas todavía: nadie la ve hasta activar) ———
alter table public.planes_precios drop constraint if exists planes_precios_tarifa_check;
alter table public.planes_precios add constraint planes_precios_tarifa_check check (tarifa in ('normal', 'estudiante', 'fundador'));

-- ——— cuándo se activaron los precios nuevos (una sola fila; vacía = precios de hoy) ———
create table if not exists public.planes_cambio_precios (
  id       smallint primary key default 1 check (id = 1),
  activado timestamptz not null default now()
);
alter table public.planes_cambio_precios enable row level security;
create policy planes_cambio_precios_leer on public.planes_cambio_precios for select to anon, authenticated using (true);

-- ——— qué tarifa le toca a alguien para un plan (la usan el cobro, la renovación y la app) ———
-- estudiante verificado (solo Plus) > fundador (Plus y Pro, si ya hay precios de fundador) > normal
create or replace function public.planes_tarifa_de(p_user uuid, p_plan text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_plan = 'plus' and exists (select 1 from planes_estudiantes e where e.user_id = p_user and e.hasta > now())
      then 'estudiante'
    when p_plan in ('plus', 'pro')
         and exists (select 1 from planes_precios x where x.plan = p_plan and x.tarifa = 'fundador')
         and (exists (select 1 from profiles pr join planes_cambio_precios c on true where pr.id = p_user and pr.created_at < c.activado)
              or exists (select 1 from planes_suscripciones s where s.user_id = p_user and s.tarifa = 'fundador'))
      then 'fundador'
    else 'normal'
  end
$$;
revoke all on function public.planes_tarifa_de(uuid, text) from public, anon, authenticated;
grant execute on function public.planes_tarifa_de(uuid, text) to service_role;

/** La tuya (para mostrar el precio que de verdad vas a pagar). */
create or replace function public.mi_tarifa(p_plan text) returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'normal' else public.planes_tarifa_de(auth.uid(), p_plan) end
$$;
revoke all on function public.mi_tarifa(text) from public, anon;
grant execute on function public.mi_tarifa(text) to authenticated;

-- ——— la renovación automática cobra con la misma regla (antes: solo estudiante o normal) ———
create or replace function public.planes_por_renovar()
returns table (renovacion uuid, usuario uuid, equipo uuid, plan_id text, tarifa_id text, periodo_id text, monto integer,
               meses_n integer, cliente text, tarjeta text, vence timestamptz, intentos_n integer)
language sql security definer set search_path = public as $$
  with cand as (
    select r.id
      from planes_renovacion r
      left join planes_suscripciones s on r.space_id is null and s.user_id = r.user_id and s.plan = r.plan
      left join planes_clubes c on r.space_id is not null and c.space_id = r.space_id
     where r.activa and r.intentos < 3
       and (r.ultimo_intento is null or r.ultimo_intento < now() - interval '20 hours')
       and (case when r.space_id is null then (s.pausa_hasta is null or s.pausa_hasta <= now()) and s.hasta is not null
                 else c.hasta is not null end)
       and (case when r.space_id is null then s.hasta else c.hasta end) <= now() + interval '1 day'
       and (case when r.space_id is null then s.hasta else c.hasta end) + interval '3 days' > now()
     for update of r skip locked
  ), marcadas as (
    update planes_renovacion r set ultimo_intento = now(), updated_at = now()
      from cand where r.id = cand.id
    returning r.*
  )
  select m.id, m.user_id, m.space_id, m.plan, t.tarifa, p.periodo, p.centimos, p.meses, m.culqi_cliente, m.culqi_tarjeta,
         case when m.space_id is null then (select s.hasta from planes_suscripciones s where s.user_id = m.user_id)
              else (select c.hasta from planes_clubes c where c.space_id = m.space_id) end,
         m.intentos
    from marcadas m
    cross join lateral (
      select case when m.space_id is null then public.planes_tarifa_de(m.user_id, m.plan) else 'normal' end as tarifa
    ) t
    cross join lateral (
      -- el mismo periodo; si ya no existe para esa tarifa (p. ej. ciclo sin ser estudiante), mensual
      select x.periodo, x.centimos, x.meses from planes_precios x
       where x.plan = m.plan and x.tarifa = t.tarifa and x.periodo in (m.periodo, 'mes')
       order by (x.periodo = m.periodo) desc limit 1
    ) p
$$;

-- ——— el interruptor ———
create or replace function public.activar_precios_nuevos() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from planes_cambio_precios) then raise exception 'Los precios nuevos ya están activos'; end if;
  insert into planes_cambio_precios (id, activado) values (1, now());

  -- fundador = el precio de hoy de Plus y Pro, para siempre
  insert into planes_precios (plan, tarifa, periodo, centimos, meses)
    select plan, 'fundador', periodo, centimos, meses from planes_precios where plan in ('plus', 'pro') and tarifa = 'normal'
  on conflict (plan, tarifa, periodo) do nothing;

  -- la lista nueva (con IGV, en céntimos). Club no cambia.
  update planes_precios p set centimos = n.centimos
    from (values
      ('plus', 'normal', 'mes', 2490),
      ('plus', 'normal', 'anio', 23900),
      ('plus', 'estudiante', 'mes', 1490),
      ('plus', 'estudiante', 'ciclo', 4990),
      ('plus', 'estudiante', 'anio', 14300), -- no está en el documento: −20 % como los demás anuales (confirmar en la tarea 25b)
      ('pro', 'normal', 'mes', 3990),
      ('pro', 'normal', 'anio', 38300)
    ) as n(plan, tarifa, periodo, centimos)
   where p.plan = n.plan and p.tarifa = n.tarifa and p.periodo = n.periodo;

  return (select jsonb_agg(jsonb_build_object('plan', plan, 'tarifa', tarifa, 'periodo', periodo, 'centimos', centimos)
                           order by plan, tarifa, periodo) from planes_precios);
end $$;

/** Deshacer: vuelve a los precios de hoy (los de fundador) y quita la tarifa fundador del catálogo. */
create or replace function public.desactivar_precios_nuevos() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from planes_cambio_precios) then raise exception 'Los precios nuevos no están activos'; end if;
  update planes_precios p set centimos = f.centimos
    from planes_precios f
   where f.tarifa = 'fundador' and p.tarifa = 'normal' and p.plan = f.plan and p.periodo = f.periodo;
  update planes_precios p set centimos = n.centimos
    from (values ('plus', 'estudiante', 'mes', 1290), ('plus', 'estudiante', 'ciclo', 4490), ('plus', 'estudiante', 'anio', 12380))
      as n(plan, tarifa, periodo, centimos)
   where p.plan = n.plan and p.tarifa = n.tarifa and p.periodo = n.periodo;
  delete from planes_precios where tarifa = 'fundador';
  delete from planes_cambio_precios;
  return (select jsonb_agg(jsonb_build_object('plan', plan, 'tarifa', tarifa, 'periodo', periodo, 'centimos', centimos)
                           order by plan, tarifa, periodo) from planes_precios);
end $$;

revoke all on function public.activar_precios_nuevos(), public.desactivar_precios_nuevos() from public, anon, authenticated;
grant execute on function public.activar_precios_nuevos(), public.desactivar_precios_nuevos() to service_role;
