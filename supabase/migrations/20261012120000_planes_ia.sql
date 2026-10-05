-- Fase 3: cupos de IA por plan (docs/negocio/modelo-de-negocio.md, secciones 6 y 7). Se cuentan en el servidor
-- (agenda-agent y cuaderno-agent llaman a usar_cupo antes de pensar) y, si la IA falla, se devuelve el uso.
--   ia_rockie_mes   mensajes con Rockie (Agenda, chat y voz): Gratis 30 (100 la primera semana), Plus 200, Pro 400
--   ia_notas_mes    preguntar, conversar, ordenar o revisar tus notas: Gratis 10, Plus 100, Pro 150
--   ia_aprender_mes Aprender (armar un cuaderno desde un tema, PDF o video): Gratis 1, Plus 8, Pro 20
--   ia_pro_mes      respuestas con el modelo más potente (solo Pro): 30; después sigue con el de Plus

insert into public.planes_limites (plan, clave, valor) values
  ('gratis', 'ia_rockie_mes', 30),   ('plus', 'ia_rockie_mes', 200),   ('pro', 'ia_rockie_mes', 400),
  ('gratis', 'ia_notas_mes', 10),    ('plus', 'ia_notas_mes', 100),    ('pro', 'ia_notas_mes', 150),
  ('gratis', 'ia_aprender_mes', 1),  ('plus', 'ia_aprender_mes', 8),   ('pro', 'ia_aprender_mes', 20),
  ('gratis', 'ia_pro_mes', 0),       ('plus', 'ia_pro_mes', 0),        ('pro', 'ia_pro_mes', 30);

/** El límite que de verdad aplica: en Gratis, la primera semana trae 100 mensajes con Rockie para conocerlo. */
create or replace function public.limite_efectivo(uid uuid, p_clave text) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when p_clave = 'ia_rockie_mes' and public.plan_de(uid) = 'gratis'
         and exists (select 1 from profiles p where p.id = uid and p.created_at > now() - interval '7 days')
      then greatest(coalesce(public.limite_de(uid, p_clave), 0), 100)
    else public.limite_de(uid, p_clave)
  end
$$;

/** Cuenta un uso de un cupo mensual y dice si se puede (atómico). Devuelve también el plan (para elegir la IA). */
create or replace function public.usar_cupo(p_clave text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim integer;
  per date;
  n integer;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  if p_clave !~ '^[a-z_]{3,40}$' then raise exception 'Cupo desconocido'; end if;
  lim := public.limite_efectivo(uid, p_clave);
  per := date_trunc('month', public.user_today(uid))::date;
  insert into planes_uso (user_id, clave, periodo, cantidad) values (uid, p_clave, per, 0)
    on conflict (user_id, clave, periodo) do nothing;
  select cantidad into n from planes_uso where user_id = uid and clave = p_clave and periodo = per for update;
  if lim is not null and n >= lim then
    return jsonb_build_object('ok', false, 'usado', n, 'limite', lim, 'plan', public.plan_de(uid));
  end if;
  update planes_uso set cantidad = cantidad + 1 where user_id = uid and clave = p_clave and periodo = per;
  return jsonb_build_object('ok', true, 'usado', n + 1, 'limite', lim, 'plan', public.plan_de(uid));
end $$;

/** Devuelve un uso (la IA falló o estaba saturada: no se cobra ese intento). Solo el servidor (llave de servicio):
 *  si la app pudiera llamarla, cualquiera se devolvería usos sin límite. */
create or replace function public.devolver_cupo(p_user uuid, p_clave text) returns void
language sql security definer set search_path = public as $$
  update planes_uso set cantidad = greatest(cantidad - 1, 0)
   where user_id = p_user and clave = p_clave
     and periodo = date_trunc('month', public.user_today(p_user))::date
$$;

/** Todo lo que la app necesita saber del plan de quien pregunta (ahora con el límite efectivo de Rockie). */
create or replace function public.mi_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s planes_suscripciones;
  est timestamptz;
  lim jsonb;
  uso jsonb;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into s from planes_suscripciones where user_id = uid and (hasta is null or hasta > now());
  select hasta into est from planes_estudiantes where user_id = uid and hasta > now();
  select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) into lim
    from planes_limites where plan = coalesce(s.plan, 'gratis');
  lim := lim || jsonb_build_object('ia_rockie_mes', public.limite_efectivo(uid, 'ia_rockie_mes'));
  select coalesce(jsonb_object_agg(clave, cantidad), '{}'::jsonb) into uso
    from planes_uso where user_id = uid and periodo = date_trunc('month', public.user_today(uid))::date;
  return jsonb_build_object(
    'plan', coalesce(s.plan, 'gratis'),
    'tarifa', s.tarifa,
    'hasta', s.hasta,
    'estudiante_hasta', est,
    'limites', lim,
    'uso_mes', uso,
    'pizarras_hoy', (select count(*) from cuaderno_notes n
                      where n.user_id = uid and n.kind = 'pizarra'
                        and n.created_at >= public.planes_inicio_hoy(uid)),
    'notas_compartidas', (select count(*) from cuaderno_notes n where n.user_id = uid and n.space_id is not null),
    'equipos', (select count(*) from spaces sp where sp.created_by = uid)
  );
end $$;

revoke all on function public.limite_efectivo(uuid, text) from public, anon, authenticated;
revoke all on function public.devolver_cupo(uuid, text) from public, anon, authenticated;
grant execute on function public.devolver_cupo(uuid, text) to service_role;
