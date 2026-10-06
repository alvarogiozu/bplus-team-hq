-- Retención: que pagar sea fácil (Yape o tarjeta) y que nadie se pierda por un descuido.
--   · ciclo: Plus de estudiante por 4 meses (un semestre) en un solo pago
--   · 3 días de gracia al vencer: nadie pierde su plan de golpe
--   · pausa: congelar el plan 1 o 2 meses (una vez al año) en vez de irse
--   · renovación automática con tarjeta: Culqi guarda la tarjeta; Rockie solo sus ids (la cobra planes-renovar)
--   · avisos por correo antes de vencer (solo si la persona deja su correo)
--   · invita a un amigo: cuando paga, los dos ganan 1 mes
--   · tu mes en números (lo que muestra el aviso de renovación)

-- ——— ciclo (4 meses) para estudiantes ———
alter table public.planes_precios drop constraint if exists planes_precios_periodo_check;
alter table public.planes_precios add constraint planes_precios_periodo_check check (periodo in ('mes', 'ciclo', 'anio'));
insert into public.planes_precios (plan, tarifa, periodo, centimos, meses) values ('plus', 'estudiante', 'ciclo', 4490, 4)
  on conflict (plan, tarifa, periodo) do update set centimos = excluded.centimos, meses = excluded.meses;

-- ——— cómo se pagó (para soporte y para «Renovar» con lo mismo) ———
alter table public.planes_pagos add column metodo text check (metodo in ('yape', 'tarjeta', 'renovacion'));

-- ——— regalos (invitar a un amigo) ———
alter table public.planes_suscripciones drop constraint if exists planes_suscripciones_origen_check;
alter table public.planes_suscripciones add constraint planes_suscripciones_origen_check
  check (origen in ('codigo', 'culqi', 'manual', 'regalo'));

-- ——— pausa: mientras dura, el plan no vale; al terminar vuelve solo con los días que le quedaban ———
-- (al pausar, hasta = fin de la pausa + lo que quedaba: así todo lo demás sigue mirando solo «hasta»)
alter table public.planes_suscripciones
  add column pausa_desde timestamptz,
  add column pausa_hasta timestamptz,
  add column pausa_restante interval,
  add column ultima_pausa timestamptz;

/** ¿Vale el plan ahora? Sin vencimiento, o vence en el futuro (con 3 días de gracia), y no está en pausa. */
create or replace function public.planes_vigente(p_hasta timestamptz, p_pausa timestamptz) returns boolean
language sql stable as $$
  select (p_hasta is null or p_hasta + interval '3 days' > now()) and (p_pausa is null or p_pausa <= now())
$$;

create or replace function public.plan_de(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.plan from planes_suscripciones s where s.user_id = uid and public.planes_vigente(s.hasta, s.pausa_hasta)),
    'gratis'
  )
$$;

create or replace function public.club_activo(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from planes_clubes c where c.space_id = sid and public.planes_vigente(c.hasta, null))
$$;

-- ——— aplicar un pago: vigente o en gracia, se suma a lo que tenía (la gracia no se regala); en pausa, la termina ———
create or replace function public.aplicar_pago(p_user uuid, p_plan text, p_tarifa text, p_meses integer, p_space uuid default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  s planes_suscripciones;
  hasta_club timestamptz;
  base timestamptz;
  nuevo timestamptz;
begin
  if p_meses is null or p_meses < 1 then raise exception 'Meses inválidos'; end if;
  if p_plan = 'club' then
    if p_space is null then raise exception 'Falta el equipo del plan Club'; end if;
    select hasta into hasta_club from planes_clubes where space_id = p_space for update;
    base := case when hasta_club is not null and hasta_club + interval '3 days' > now() then hasta_club else now() end;
    nuevo := base + make_interval(months => p_meses);
    insert into planes_clubes (space_id, origen, desde, hasta) values (p_space, 'culqi', now(), nuevo)
      on conflict (space_id) do update set
        hasta = case when planes_clubes.hasta is null then null else excluded.hasta end,
        origen = 'culqi', updated_at = now();
    return nuevo;
  end if;
  if p_plan not in ('plus', 'pro') then raise exception 'Plan inválido'; end if;
  select * into s from planes_suscripciones where user_id = p_user for update;
  -- pagar durante una pausa la termina: vuelve hoy con los días que le quedaban
  if s.user_id is not null and s.pausa_hasta is not null and s.pausa_hasta > now() then
    s.hasta := now() + coalesce(s.pausa_restante, interval '0');
  end if;
  base := case
    when s.user_id is not null and s.plan = p_plan and s.hasta is not null and s.hasta + interval '3 days' > now() then s.hasta
    else now() end;
  nuevo := base + make_interval(months => p_meses);
  insert into planes_suscripciones (user_id, plan, tarifa, origen, desde, hasta)
    values (p_user, p_plan, p_tarifa, 'culqi', now(), nuevo)
    on conflict (user_id) do update set
      plan = excluded.plan, tarifa = excluded.tarifa, origen = 'culqi',
      desde = case when planes_suscripciones.plan = excluded.plan and s.hasta is not null and s.hasta + interval '3 days' > now()
                   then planes_suscripciones.desde else now() end,
      hasta = excluded.hasta, pausa_desde = null, pausa_hasta = null, pausa_restante = null, updated_at = now();
  return nuevo;
end $$;

-- ——— canjear un código: misma regla (gracia y pausa) ———
create or replace function public.canjear_codigo(p_codigo text, p_space uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c planes_codigos;
  s planes_suscripciones;
  vig boolean;
  hasta_club timestamptz;
  base timestamptz;
  nuevo_hasta timestamptz;
  rango constant jsonb := '{"gratis":0,"plus":1,"pro":2}';
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into c from planes_codigos where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'Ese código no existe. Revisa que esté bien escrito.'; end if;
  if c.vence is not null and c.vence <= now() then raise exception 'Ese código ya venció.'; end if;
  if c.usos >= c.usos_max then raise exception 'Ese código ya se usó.'; end if;
  if exists (select 1 from planes_canjes where codigo = c.codigo and user_id = uid) then
    raise exception 'Ya usaste este código.';
  end if;

  if c.plan = 'club' then
    if p_space is null then
      raise exception using message = 'Este código es de plan Club: elige el equipo que lo recibe.', hint = 'NECESITA_EQUIPO';
    end if;
    if not public.is_owner(p_space) then raise exception 'Solo quien creó el equipo puede activarle el plan Club.'; end if;
    select hasta into hasta_club from planes_clubes where space_id = p_space for update;
    base := case when hasta_club is not null and hasta_club + interval '3 days' > now() then hasta_club else now() end;
    nuevo_hasta := case when c.meses is null then null else base + make_interval(months => c.meses) end;
    insert into planes_clubes (space_id, origen, desde, hasta)
      values (p_space, 'codigo', now(), nuevo_hasta)
      on conflict (space_id) do update set hasta = case when planes_clubes.hasta is null or excluded.hasta is null then null else excluded.hasta end,
                                           origen = 'codigo', updated_at = now();
  else
    select * into s from planes_suscripciones where user_id = uid for update;
    if s.user_id is not null and s.pausa_hasta is not null and s.pausa_hasta > now() then
      s.hasta := now() + coalesce(s.pausa_restante, interval '0');
    end if;
    vig := s.user_id is not null and (s.hasta is null or s.hasta + interval '3 days' > now());
    if vig and (rango->>s.plan)::int > (rango->>c.plan)::int then
      raise exception 'Ya tienes un plan mayor (%). Este código es de %.', initcap(s.plan), initcap(c.plan);
    end if;
    -- mismo plan: se suma el tiempo; plan mayor: empieza hoy
    base := case when vig and s.plan = c.plan then coalesce(s.hasta, now()) else now() end;
    nuevo_hasta := case
      when c.meses is null then null
      when vig and s.plan = c.plan and s.hasta is null then null
      else base + make_interval(months => c.meses) end;
    insert into planes_suscripciones (user_id, plan, tarifa, origen, desde, hasta)
      values (uid, c.plan, c.tarifa, 'codigo', now(), nuevo_hasta)
      on conflict (user_id) do update set plan = excluded.plan, tarifa = excluded.tarifa, origen = 'codigo',
                                          desde = case when vig and planes_suscripciones.plan = excluded.plan then planes_suscripciones.desde else now() end,
                                          hasta = excluded.hasta, pausa_desde = null, pausa_hasta = null, pausa_restante = null,
                                          updated_at = now();
  end if;

  update planes_codigos set usos = usos + 1 where codigo = c.codigo;
  insert into planes_canjes (codigo, user_id, space_id) values (c.codigo, uid, p_space);
  return jsonb_build_object('plan', c.plan, 'hasta', nuevo_hasta);
end $$;

-- ——— pausar y reanudar ———
create or replace function public.pausar_plan(p_meses integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s planes_suscripciones;
  resta interval;
  fin timestamptz;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  if p_meses is null or p_meses not in (1, 2) then raise exception 'Puedes pausar 1 o 2 meses.'; end if;
  select * into s from planes_suscripciones where user_id = uid for update;
  if not found or not public.planes_vigente(s.hasta, s.pausa_hasta) then raise exception 'No tienes un plan activo para pausar.'; end if;
  if s.hasta is null then raise exception 'Tu plan no vence: no necesitas pausarlo.'; end if;
  if s.hasta <= now() + interval '3 days' then
    raise exception 'A tu plan le quedan menos de 3 días: mejor renuévalo o déjalo vencer.';
  end if;
  if s.ultima_pausa is not null and s.ultima_pausa > now() - interval '12 months' then
    raise exception 'Puedes pausar una vez al año. La próxima vez podrás desde el %.',
      to_char((s.ultima_pausa + interval '12 months') at time zone 'America/Lima', 'DD/MM/YYYY');
  end if;
  resta := s.hasta - now();
  fin := now() + make_interval(months => p_meses);
  update planes_suscripciones
     set pausa_desde = now(), pausa_hasta = fin, pausa_restante = resta, hasta = fin + resta,
         ultima_pausa = now(), updated_at = now()
   where user_id = uid;
  return jsonb_build_object('pausa_hasta', fin, 'hasta', fin + resta);
end $$;

create or replace function public.reanudar_plan() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s planes_suscripciones;
  nuevo timestamptz;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into s from planes_suscripciones where user_id = uid for update;
  if not found or s.pausa_hasta is null or s.pausa_hasta <= now() then raise exception 'Tu plan no está en pausa.'; end if;
  nuevo := now() + coalesce(s.pausa_restante, interval '0');
  update planes_suscripciones
     set hasta = nuevo, pausa_desde = null, pausa_hasta = null, pausa_restante = null, updated_at = now()
   where user_id = uid;
  return jsonb_build_object('hasta', nuevo);
end $$;

-- ——— renovación automática con tarjeta ———
-- La tarjeta la guarda Culqi (cliente + tarjeta). Aquí solo sus ids, para que planes-renovar cobre cuando toca,
-- y la marca y los últimos 4 dígitos, para mostrarte «Visa •••• 1234».
create table public.planes_renovacion (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade, -- quien paga
  space_id       uuid references public.spaces(id) on delete cascade,            -- plan Club de ese equipo (null = tu plan)
  plan           text not null check (plan in ('plus', 'pro', 'club')),
  periodo        text not null check (periodo in ('mes', 'ciclo', 'anio')),
  activa         boolean not null default true,
  culqi_cliente  text not null check (culqi_cliente ~ '^cus_(live|test)_[A-Za-z0-9]+$'),
  culqi_tarjeta  text not null check (culqi_tarjeta ~ '^crd_(live|test)_[A-Za-z0-9]+$'),
  marca          text check (char_length(marca) <= 30),
  ultimos4       text check (ultimos4 ~ '^[0-9]{4}$'),
  intentos       integer not null default 0,
  ultimo_intento timestamptz,
  ultimo_error   text check (char_length(ultimo_error) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index planes_renovacion_personal on public.planes_renovacion (user_id) where space_id is null;
create unique index planes_renovacion_club on public.planes_renovacion (space_id) where space_id is not null;
alter table public.planes_renovacion enable row level security;
create policy planes_renovacion_mia on public.planes_renovacion for select to authenticated using (user_id = auth.uid());

/** Activar o cancelar la renovación automática (la tarjeta sigue guardada en Culqi hasta que la quites). */
create or replace function public.renovacion_activa(p_activa boolean, p_space uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r planes_renovacion;
  s planes_suscripciones;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into r from planes_renovacion where user_id = uid and space_id is not distinct from p_space for update;
  if not found then raise exception 'No tienes una tarjeta guardada para renovar.'; end if;
  if p_activa and p_space is null then
    -- se renueva el plan que tienes hoy (si cambiaste de plan, ese)
    select * into s from planes_suscripciones where user_id = uid;
    if s.user_id is null or s.hasta is null or s.plan not in ('plus', 'pro') then
      raise exception 'No hay un plan con vencimiento que renovar.';
    end if;
    update planes_renovacion set activa = true, plan = s.plan,
           periodo = case when s.plan = 'pro' and r.periodo = 'ciclo' then 'mes' else r.periodo end,
           intentos = 0, ultimo_error = null, updated_at = now()
     where id = r.id;
  else
    update planes_renovacion set activa = p_activa, intentos = 0, ultimo_error = null, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('activa', p_activa);
end $$;

/** Las renovaciones que toca cobrar ahora (vencen en menos de un día o están en sus 3 días de gracia). Las marca
 *  como «intentando» para que dos llamadas a la vez no cobren dos veces. Solo planes-renovar (llave de servicio). */
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
      select case when m.plan = 'plus' and exists (select 1 from planes_estudiantes e where e.user_id = m.user_id and e.hasta > now())
                  then 'estudiante' else 'normal' end as tarifa
    ) t
    cross join lateral (
      -- el mismo periodo; si ya no existe para esa tarifa (p. ej. ciclo sin ser estudiante), mensual
      select x.periodo, x.centimos, x.meses from planes_precios x
       where x.plan = m.plan and x.tarifa = t.tarifa and x.periodo in (m.periodo, 'mes')
       order by (x.periodo = m.periodo) desc limit 1
    ) p
$$;

/** Un cobro de renovación que no pasó: suma un intento (a los 3 se deja de intentar y la app te avisa). */
create or replace function public.planes_renovacion_fallo(p_id uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update planes_renovacion set intentos = intentos + 1, ultimo_error = left(p_error, 300), updated_at = now() where id = p_id
$$;

-- ——— avisos por correo (solo si la persona lo pidió; lo quita cuando quiera desde Tu plan) ———
create table public.planes_avisos (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  correo        text not null check (char_length(correo) <= 120 and correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  enviado_para  timestamptz,                       -- para qué vencimiento fue el último aviso (no repetir)
  enviado_nivel smallint not null default 0,       -- 1 = antes de vencer, 2 = ya venció (en gracia)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.planes_avisos enable row level security;
create policy planes_avisos_mio on public.planes_avisos for select to authenticated using (user_id = auth.uid());

create or replace function public.avisos_correo(p_correo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := lower(trim(coalesce(p_correo, '')));
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  if c = '' then
    delete from planes_avisos where user_id = uid;
    return jsonb_build_object('correo', null);
  end if;
  if char_length(c) > 120 or c !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ese correo no parece válido.';
  end if;
  insert into planes_avisos (user_id, correo) values (uid, c)
    on conflict (user_id) do update set correo = excluded.correo, updated_at = now();
  return jsonb_build_object('correo', c);
end $$;

/** Los avisos por correo que toca mandar hoy. Solo planes-renovar (llave de servicio). */
create or replace function public.planes_avisos_pendientes()
returns table (usuario uuid, correo text, nivel smallint, plan_id text, vence timestamptz, auto boolean, marca text,
               ultimos4 text, intentos_n integer)
language sql stable security definer set search_path = public as $$
  select a.user_id, a.correo, x.nivel, s.plan, s.hasta, coalesce(r.activa, false), r.marca, r.ultimos4, coalesce(r.intentos, 0)
    from planes_avisos a
    join planes_suscripciones s on s.user_id = a.user_id
    left join planes_renovacion r on r.user_id = a.user_id and r.space_id is null
    cross join lateral (
      select case
        when s.hasta > now() and s.hasta <= now() + interval '3 days' then 1::smallint
        when s.hasta <= now() and s.hasta + interval '3 days' > now() then 2::smallint
      end as nivel
    ) x
   where s.hasta is not null and (s.pausa_hasta is null or s.pausa_hasta <= now())
     and x.nivel is not null
     and (a.enviado_para is distinct from s.hasta or a.enviado_nivel < x.nivel)
$$;

-- ——— invita a un amigo: cuando paga su primer plan, los dos ganan 1 mes ———
create table public.planes_invitaciones (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  codigo     text not null unique check (codigo ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.planes_invitaciones enable row level security;
create policy planes_invitaciones_mia on public.planes_invitaciones for select to authenticated using (user_id = auth.uid());

create table public.planes_referidos (
  referido   uuid primary key references public.profiles(id) on delete cascade,
  referente  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  premiado   timestamptz,
  check (referido <> referente)
);
create index planes_referidos_referente on public.planes_referidos (referente);
alter table public.planes_referidos enable row level security;
create policy planes_referidos_mios on public.planes_referidos for select to authenticated
  using (referente = auth.uid() or referido = auth.uid());

/** Tu código para invitar (se crea la primera vez) y cómo te va. */
create or replace function public.mi_invitacion() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select codigo into c from planes_invitaciones where user_id = uid;
  while c is null loop
    c := '';
    for i in 1..6 loop
      c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    begin
      insert into planes_invitaciones (user_id, codigo) values (uid, c);
    exception when unique_violation then
      -- el código ya era de otra persona (se prueba otro) o se creó en otra pestaña (se usa ese)
      select codigo into c from planes_invitaciones where user_id = uid;
    end;
  end loop;
  return jsonb_build_object(
    'codigo', c,
    'invitados', (select count(*) from planes_referidos where referente = uid),
    'premiados', (select count(*) from planes_referidos where referente = uid and premiado is not null),
    'me_invitaron', exists (select 1 from planes_referidos where referido = uid)
  );
end $$;

/** Quien llega con un link de invitación (cuenta nueva, sin pagos todavía). */
create or replace function public.usar_invitacion(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ref uuid;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select user_id into ref from planes_invitaciones where codigo = upper(trim(coalesce(p_codigo, '')));
  if ref is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if ref = uid then return jsonb_build_object('ok', false, 'motivo', 'propio'); end if;
  if exists (select 1 from planes_referidos where referido = uid) then return jsonb_build_object('ok', false, 'motivo', 'ya_tiene'); end if;
  if not exists (select 1 from profiles where id = uid and created_at > now() - interval '7 days') then
    return jsonb_build_object('ok', false, 'motivo', 'cuenta_antigua');
  end if;
  if exists (select 1 from planes_pagos where user_id = uid and estado = 'pagado' and not prueba) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_pago');
  end if;
  insert into planes_referidos (referido, referente) values (uid, ref) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

/** Un mes de regalo: se suma a tu plan (también si está en pausa); si estás en Gratis, un mes de Plus. */
create or replace function public.planes_regalar_mes(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s planes_suscripciones;
begin
  select * into s from planes_suscripciones where user_id = p_user for update;
  if s.user_id is not null and s.pausa_hasta is not null and s.pausa_hasta > now() then
    update planes_suscripciones
       set pausa_restante = coalesce(pausa_restante, interval '0') + interval '1 month', hasta = hasta + interval '1 month', updated_at = now()
     where user_id = p_user;
  elsif s.user_id is not null and public.planes_vigente(s.hasta, null) then
    if s.hasta is not null then -- sin vencimiento ya lo tiene todo
      update planes_suscripciones set hasta = greatest(hasta, now()) + interval '1 month', updated_at = now() where user_id = p_user;
    end if;
  else
    insert into planes_suscripciones (user_id, plan, tarifa, origen, desde, hasta)
      values (p_user, 'plus', 'normal', 'regalo', now(), now() + interval '1 month')
      on conflict (user_id) do update set plan = 'plus', tarifa = 'normal', origen = 'regalo', desde = now(),
        hasta = now() + interval '1 month', pausa_desde = null, pausa_hasta = null, pausa_restante = null, updated_at = now();
  end if;
end $$;

/** El primer pago de alguien que llegó invitado: un mes para cada uno (quien invita: hasta 12 meses al año). */
create or replace function public.premiar_referido(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r planes_referidos;
begin
  select * into r from planes_referidos where referido = p_user and premiado is null for update;
  if not found then return jsonb_build_object('premiado', false); end if;
  update planes_referidos set premiado = now() where referido = p_user;
  perform public.planes_regalar_mes(p_user);
  if (select count(*) from planes_referidos where referente = r.referente and premiado > now() - interval '1 year') <= 12 then
    perform public.planes_regalar_mes(r.referente);
  end if;
  return jsonb_build_object('premiado', true);
end $$;

-- ——— tu mes en números (para el aviso de renovación): solo cantidades, nunca el contenido ———
create or replace function public.mi_resumen() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mensajes', (select count(*) from rockie_turns t
                  where t.user_id = auth.uid() and t.role = 'user' and t.created_at > now() - interval '30 days'),
    'notas', (select count(*) from cuaderno_notes n where n.user_id = auth.uid() and n.created_at > now() - interval '30 days'),
    'hechas', (select count(*) from agenda_items a
                where a.user_id = auth.uid() and a.hq_task_id is null and a.done_at > now() - interval '30 days')
            + (select count(*) from tasks k
                where k.assignee_id = auth.uid() and k.status = 'done' and k.updated_at > now() - interval '30 days')
  )
$$;

-- ——— todo lo que la app necesita saber de tu plan (ahora con estado, pausa, renovación y clubes) ———
create or replace function public.mi_plan() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g constant interval := interval '3 days';
  s planes_suscripciones;
  vig boolean;
  pausado boolean;
  plan_ef text;
  estado text;
  est timestamptz;
  lim jsonb;
  uso jsonb;
  ult jsonb;
  ren jsonb;
  clubes jsonb;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into s from planes_suscripciones where user_id = uid;
  vig := s.user_id is not null and public.planes_vigente(s.hasta, s.pausa_hasta);
  pausado := s.user_id is not null and s.pausa_hasta is not null and s.pausa_hasta > now();
  plan_ef := case when vig then s.plan else 'gratis' end;
  estado := case
    when s.user_id is null then 'gratis'
    when pausado then 'pausado'
    when s.hasta is null then 'activo'
    when s.hasta > now() + g then 'activo'
    when s.hasta > now() then 'por_vencer'
    when s.hasta + g > now() then 'gracia'
    when s.hasta + g > now() - interval '45 days' then 'vencido'
    else 'gratis' end;
  select hasta into est from planes_estudiantes where user_id = uid and hasta > now();
  select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) into lim from planes_limites where plan = plan_ef;
  lim := lim || jsonb_build_object('ia_rockie_mes', public.limite_efectivo(uid, 'ia_rockie_mes'));
  select coalesce(jsonb_object_agg(clave, cantidad), '{}'::jsonb) into uso
    from planes_uso where user_id = uid and periodo = date_trunc('month', public.user_today(uid))::date;
  -- lo último que pagaste para ti (para «Renovar» con el mismo plan y periodo en dos toques)
  select jsonb_build_object('plan', p.plan, 'tarifa', p.tarifa, 'periodo', p.periodo, 'metodo', p.metodo, 'fecha', p.created_at)
    into ult
    from planes_pagos p
   where p.user_id = uid and p.space_id is null and p.estado = 'pagado' and (not p.prueba or p.hasta is not null)
   order by p.created_at desc limit 1;
  select jsonb_build_object('activa', r.activa, 'plan', r.plan, 'periodo', r.periodo, 'marca', r.marca, 'ultimos4', r.ultimos4,
                            'intentos', r.intentos, 'error', r.ultimo_error)
    into ren
    from planes_renovacion r where r.user_id = uid and r.space_id is null;
  select coalesce(jsonb_agg(jsonb_build_object(
           'space_id', c.space_id,
           'hasta', c.hasta,
           'estado', case when c.hasta > now() + g then 'activo' when c.hasta > now() then 'por_vencer'
                          when c.hasta + g > now() then 'gracia' else 'vencido' end,
           'renovacion', (select jsonb_build_object('activa', r.activa, 'periodo', r.periodo, 'marca', r.marca,
                                                    'ultimos4', r.ultimos4, 'intentos', r.intentos, 'error', r.ultimo_error)
                            from planes_renovacion r where r.space_id = c.space_id)
         ) order by c.hasta), '[]'::jsonb)
    into clubes
    from planes_clubes c join spaces sp on sp.id = c.space_id
   where sp.created_by = uid and c.hasta is not null and c.hasta + g > now() - interval '45 days';
  return jsonb_build_object(
    'plan', plan_ef,
    'tarifa', case when vig then s.tarifa end,
    'hasta', case when vig then s.hasta end,
    'estado', estado,
    'suscripcion', case when s.user_id is null then null else jsonb_build_object(
      'plan', s.plan,
      'tarifa', s.tarifa,
      'origen', s.origen,
      'hasta', s.hasta,
      'gracia_hasta', s.hasta + g,
      'pausa_hasta', case when pausado then s.pausa_hasta end,
      'pausa_restante_dias', case when pausado then ceil(extract(epoch from s.pausa_restante) / 86400) end,
      'puede_pausar', vig and not pausado and s.hasta is not null and s.hasta > now() + g
                      and (s.ultima_pausa is null or s.ultima_pausa < now() - interval '12 months')
    ) end,
    'ultimo_pago', ult,
    'renovacion', ren,
    'clubes', clubes,
    'avisos_correo', (select a.correo from planes_avisos a where a.user_id = uid),
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

-- ——— permisos: lo que la app puede llamar, y lo que solo el servidor ———
revoke all on function public.aplicar_pago(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.aplicar_pago(uuid, text, text, integer, uuid) to service_role;
revoke all on function public.planes_por_renovar(), public.planes_renovacion_fallo(uuid, text), public.planes_avisos_pendientes(),
  public.planes_regalar_mes(uuid), public.premiar_referido(uuid) from public, anon, authenticated;
grant execute on function public.planes_por_renovar(), public.planes_renovacion_fallo(uuid, text), public.planes_avisos_pendientes(),
  public.planes_regalar_mes(uuid), public.premiar_referido(uuid) to service_role;
revoke all on function public.pausar_plan(integer), public.reanudar_plan(), public.renovacion_activa(boolean, uuid),
  public.avisos_correo(text), public.mi_invitacion(), public.usar_invitacion(text), public.mi_resumen() from public, anon;
grant execute on function public.pausar_plan(integer), public.reanudar_plan(), public.renovacion_activa(boolean, uuid),
  public.avisos_correo(text), public.mi_invitacion(), public.usar_invitacion(text), public.mi_resumen() to authenticated;

-- ——— el cobro de renovaciones y los avisos: todos los días a las 9:00 (Lima) ———
-- planes-renovar solo hace lo que toca ese día (y marca cada renovación antes de cobrarla): llamarla de más no
-- cobra dos veces. Por eso no necesita llave (verify_jwt = false en supabase/config.toml).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'planes-renovar';
select cron.schedule('planes-renovar', '0 14 * * *', $cron$
  select net.http_post(
    url := 'https://xhtxhmfohtkezhpobbcr.supabase.co/functions/v1/planes-renovar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"origen": "cron"}'::jsonb,
    timeout_milliseconds := 120000
  )
$cron$);
