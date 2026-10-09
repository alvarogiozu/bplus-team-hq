-- Cupos de IA por plan (docs/negocio/precios-y-margenes.md §4, decidido el 9 oct): Gratis 30 (100 la primera
-- semana), Plus 200, Pro 400 (ya en planes_limites) y bajar un poco el del ESTUDIANTE MENSUAL, el único plan que
-- pierde plata en el peor caso. Queda en 160 mensajes con Rockie al mes (−20 %); se cambia sin redesplegar en
-- ia_config ('ia_rockie_estudiante_mes'). El estudiante por ciclo (4 meses) y el anual siguen con los 200 de Plus.
-- Mensual = su último pago de tarifa estudiante fue de un mes (o no hay pago: código o manual, se trata como mensual).

insert into public.ia_config (clave, valor) values ('ia_rockie_estudiante_mes', 160)
  on conflict (clave) do nothing;

create or replace function public.limite_efectivo(uid uuid, p_clave text) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when p_clave = 'ia_rockie_mes' and public.plan_de(uid) = 'gratis'
         and exists (select 1 from profiles p where p.id = uid and p.created_at > now() - interval '7 days')
      then greatest(coalesce(public.limite_de(uid, p_clave), 0), 100)
    when p_clave = 'ia_rockie_mes' and public.plan_de(uid) = 'plus'
         and exists (select 1 from planes_suscripciones s where s.user_id = uid and s.tarifa = 'estudiante' and (s.hasta is null or s.hasta > now()))
         and coalesce((select pg.periodo from planes_pagos pg
                        where pg.user_id = uid and pg.space_id is null and pg.estado = 'pagado' and pg.tarifa = 'estudiante'
                        order by pg.created_at desc limit 1), 'mes') = 'mes'
      then least(coalesce(public.limite_de(uid, p_clave), 200),
                 coalesce((select valor::integer from ia_config where clave = 'ia_rockie_estudiante_mes'), 160))
    else public.limite_de(uid, p_clave)
  end
$$;
revoke all on function public.limite_efectivo(uuid, text) from public, anon, authenticated;
