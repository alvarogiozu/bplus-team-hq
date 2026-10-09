-- Costo de IA por usuario, plan y función (docs/negocio/precios-y-margenes.md, regla 4.4).
-- Cada llamada a un modelo deja UNA fila con números: quién, qué función, qué modelo, tokens y milisegundos.
-- Nunca el contenido (ni el pedido ni la respuesta): no hay columna para eso.
-- La escriben solo las Edge Functions (llave de servicio) con ia_registrar. El costo se calcula al consultar con
-- ia_precios (se edita sin redesplegar cuando Google o Anthropic cambian precios).

create table public.ia_uso (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  creado      timestamptz not null default now(),
  funcion     text not null,                -- chat, agenda, equipo, cuaderno_preguntar, conector_buscar...
  plan        text not null default 'gratis',
  tarifa      text not null default 'normal',
  proveedor   text not null,                -- gemini | claude
  modelo      text not null default '',
  entrada     integer not null default 0,   -- tokens de entrada que se cobran a precio normal
  salida      integer not null default 0,   -- tokens de salida (incluye el pensamiento)
  cache       integer not null default 0,   -- tokens de entrada leídos de caché (más baratos)
  ms          integer not null default 0,
  ok          boolean not null default true -- false = el proveedor falló o estaba saturado (no cuesta, pero se mide)
);
create index ia_uso_creado on public.ia_uso (creado);
create index ia_uso_user on public.ia_uso (user_id, creado);
alter table public.ia_uso enable row level security; -- sin políticas: nadie la lee desde la app

/** Precio en USD por millón de tokens. patron es un LIKE sobre el modelo; gana el patrón más largo que calce.
 *  Los marcados «estimado» hay que confirmarlos en la página de precios del proveedor. */
create table public.ia_precios (
  patron      text primary key,
  entrada_usd numeric(10, 4) not null,
  salida_usd  numeric(10, 4) not null,
  cache_usd   numeric(10, 4) not null default 0,
  nota        text not null default ''
);
alter table public.ia_precios enable row level security;
insert into public.ia_precios (patron, entrada_usd, salida_usd, cache_usd, nota) values
  ('gemini-2.5-flash-lite%', 0.10, 0.40, 0.025, ''),
  ('gemini-2.5-flash%',      0.30, 2.50, 0.03,  ''),
  ('gemini-%flash-lite%',    0.10, 0.40, 0.025, 'estimado: 3.x lite y alias latest'),
  ('gemini-%flash%',         0.50, 3.00, 0.05,  'estimado: 3.x flash y alias latest'),
  ('gemini-%pro%',           2.00, 12.00, 0.20, 'estimado'),
  ('gemini-embedding%',      0.15, 0,    0,     ''),
  ('claude-opus%',           5.00, 25.00, 0.50, 'estimado'),
  ('claude-sonnet%',         3.00, 15.00, 0.30, 'estimado'),
  ('claude-haiku%',          1.00, 5.00, 0.10,  'estimado');

/** Cuánto deja cada plan al mes ANTES de la IA (precio sin IGV, menos comisión e infraestructura), para la alerta
 *  de margen. Estimado el 9 oct con IGV 18 %, comisión ~4.2 % + S/ 0.60 e infraestructura S/ 0.50 por persona. */
create table public.ia_margen_plan (
  plan        text not null,
  tarifa      text not null,
  precio_pen  numeric(8, 2) not null,
  deja_pen    numeric(8, 2) not null,
  primary key (plan, tarifa)
);
alter table public.ia_margen_plan enable row level security;
insert into public.ia_margen_plan (plan, tarifa, precio_pen, deja_pen) values
  ('plus', 'normal',     24.90, 18.95),
  ('plus', 'fundador',   19.90, 14.92),
  ('plus', 'estudiante', 14.90, 10.90),
  ('pro',  'normal',     39.90, 31.03),
  ('pro',  'fundador',   34.90, 27.01);

create table public.ia_config (clave text primary key, valor numeric not null);
alter table public.ia_config enable row level security;
insert into public.ia_config values ('usd_pen', 3.40), ('margen_minimo', 0.40);

/** La anotan las Edge Functions (solo la llave de servicio): el plan y la tarifa se toman en ese momento. */
create or replace function public.ia_registrar(
  p_user uuid, p_funcion text, p_proveedor text, p_modelo text,
  p_entrada integer, p_salida integer, p_cache integer, p_ms integer, p_ok boolean
) returns void
language sql security definer set search_path = public as $$
  insert into ia_uso (user_id, funcion, plan, tarifa, proveedor, modelo, entrada, salida, cache, ms, ok)
  select p_user, left(p_funcion, 40), coalesce(public.plan_de(p_user), 'gratis'),
         coalesce((select s.tarifa from planes_suscripciones s where s.user_id = p_user and (s.hasta is null or s.hasta > now())), 'normal'),
         left(p_proveedor, 20), left(coalesce(p_modelo, ''), 80),
         greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_salida, 0), 0), greatest(coalesce(p_cache, 0), 0),
         greatest(coalesce(p_ms, 0), 0), coalesce(p_ok, true)
$$;
revoke all on function public.ia_registrar(uuid, text, text, text, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ia_registrar(uuid, text, text, text, integer, integer, integer, integer, boolean) to service_role;

/** Cada llamada con su costo en USD (null = modelo sin precio en ia_precios: agrégalo). */
create or replace view public.ia_uso_costo with (security_invoker = true) as
select u.*,
  (select (u.entrada * p.entrada_usd + u.salida * p.salida_usd + u.cache * p.cache_usd) / 1e6
     from ia_precios p where u.modelo like p.patron order by length(p.patron) desc limit 1) as costo_usd
from ia_uso u;

/** Por mes, plan y función: llamadas, personas, fallos, tokens y costo. */
create or replace view public.ia_costo_mes with (security_invoker = true) as
select date_trunc('month', creado)::date as mes, plan, funcion,
  count(*) filter (where ok) as llamadas,
  count(*) filter (where not ok) as fallos,
  count(distinct user_id) as personas,
  sum(entrada) as entrada, sum(salida) as salida, sum(cache) as cache,
  round(sum(costo_usd)::numeric, 4) as costo_usd,
  count(*) filter (where ok and costo_usd is null) as sin_precio,
  round(avg(ms) filter (where ok))::int as ms_promedio
from ia_uso_costo
group by 1, 2, 3;

/** Margen del mes por plan y tarifa: con el costo PROMEDIO por persona y con el de la que MÁS gastó.
 *  alerta = el promedio baja del margen mínimo (40 %); peor_en_perdida = alguien deja pérdida. */
create or replace view public.ia_alerta_margen with (security_invoker = true) as
with por_persona as (
  select date_trunc('month', creado)::date as mes, plan, tarifa, user_id, sum(costo_usd) as usd
  from ia_uso_costo where ok and user_id is not null
  group by 1, 2, 3, 4
), cfg as (
  select (select valor from ia_config where clave = 'usd_pen') as usd_pen,
         (select valor from ia_config where clave = 'margen_minimo') as minimo
)
select pp.mes, pp.plan, pp.tarifa, count(*) as personas,
  round(avg(pp.usd) * cfg.usd_pen, 2) as ia_pen_promedio,
  round(max(pp.usd) * cfg.usd_pen, 2) as ia_pen_maximo,
  round((m.deja_pen - avg(pp.usd) * cfg.usd_pen) / m.precio_pen, 3) as margen_promedio,
  round((m.deja_pen - max(pp.usd) * cfg.usd_pen) / m.precio_pen, 3) as margen_peor,
  (m.deja_pen - avg(pp.usd) * cfg.usd_pen) / m.precio_pen < cfg.minimo as alerta,
  (m.deja_pen - max(pp.usd) * cfg.usd_pen) < 0 as peor_en_perdida
from por_persona pp
cross join cfg
left join ia_margen_plan m on m.plan = pp.plan and m.tarifa = pp.tarifa
group by pp.mes, pp.plan, pp.tarifa, m.deja_pen, m.precio_pen, cfg.usd_pen, cfg.minimo;

revoke all on public.ia_uso, public.ia_precios, public.ia_margen_plan, public.ia_config,
  public.ia_uso_costo, public.ia_costo_mes, public.ia_alerta_margen from anon, authenticated;
