-- Planes de Rockie (docs/negocio/modelo-de-negocio.md): Gratis · Plus · Pro · Club.
-- Una sola fuente de verdad para los límites (planes_limites): la app los lee para mostrar cupos y la base
-- los hace cumplir con triggers, así no se saltan desde la consola. Nada de esto lee contenido de personas:
-- solo cuenta filas (cuántas pizarras, cuántos equipos) y fechas.
--
-- Cobro: mientras Culqi no esté conectado, el plan se activa con un CÓDIGO (precio fundador, Yape manual).
-- Los códigos se crean con scripts/codigos.mjs (llave de servicio); nadie los puede listar desde la app.

-- ——— catálogo de límites (null = sin límite) ———
create table public.planes_limites (
  plan  text not null check (plan in ('gratis', 'plus', 'pro', 'club')),
  clave text not null,
  valor integer,
  primary key (plan, clave)
);
alter table public.planes_limites enable row level security;
create policy planes_limites_leer on public.planes_limites for select to anon, authenticated using (true);

insert into public.planes_limites (plan, clave, valor) values
  -- Hábitos
  ('gratis', 'habitos_activos', 5),    ('plus', 'habitos_activos', null),    ('pro', 'habitos_activos', null),
  ('gratis', 'metas', 3),              ('plus', 'metas', 7),                 ('pro', 'metas', 7), -- 7 = el mapa completo (MAX_METAS de Hábitos)
  ('gratis', 'retos_activos', 1),      ('plus', 'retos_activos', null),      ('pro', 'retos_activos', null),
  ('gratis', 'estadisticas_dias', 30), ('plus', 'estadisticas_dias', null),  ('pro', 'estadisticas_dias', null),
  -- Cuaderno
  ('gratis', 'pizarras_dia', 3),       ('plus', 'pizarras_dia', null),       ('pro', 'pizarras_dia', null),
  ('gratis', 'paneles', 2),            ('plus', 'paneles', 6),               ('pro', 'paneles', 6),
  ('gratis', 'notas_compartidas', 3),  ('plus', 'notas_compartidas', null),  ('pro', 'notas_compartidas', null),
  ('gratis', 'conector_ia', 0),        ('plus', 'conector_ia', 1),           ('pro', 'conector_ia', 1),
  -- Agenda
  ('gratis', 'buscar_hueco_mes', 5),   ('plus', 'buscar_hueco_mes', null),   ('pro', 'buscar_hueco_mes', null),
  -- Equipos (club: lo que vale para un equipo con plan Club)
  ('gratis', 'equipos', 1),            ('plus', 'equipos', 3),               ('pro', 'equipos', 10),
  ('gratis', 'miembros_equipo', 8),    ('plus', 'miembros_equipo', 10),      ('pro', 'miembros_equipo', 25),
  ('club', 'miembros_equipo', null);

-- ——— suscripción de cada persona (sin fila o vencida = gratis) ———
create table public.planes_suscripciones (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  plan       text not null check (plan in ('plus', 'pro')),
  tarifa     text not null default 'normal' check (tarifa in ('normal', 'estudiante', 'fundador')),
  origen     text not null default 'codigo' check (origen in ('codigo', 'culqi', 'manual')),
  desde      timestamptz not null default now(),
  hasta      timestamptz, -- null = sin vencimiento (fundador)
  updated_at timestamptz not null default now()
);
alter table public.planes_suscripciones enable row level security;
create policy planes_suscripciones_mia on public.planes_suscripciones for select to authenticated using (user_id = auth.uid());

-- ——— plan Club: va con el equipo, no con la persona ———
create table public.planes_clubes (
  space_id   uuid primary key references public.spaces(id) on delete cascade,
  origen     text not null default 'codigo' check (origen in ('codigo', 'culqi', 'manual')),
  desde      timestamptz not null default now(),
  hasta      timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.planes_clubes enable row level security;
create policy planes_clubes_miembros on public.planes_clubes for select to authenticated using (public.is_member(space_id));

-- ——— estudiantes verificados (solo la fecha: ni el correo ni la universidad se guardan aquí) ———
create table public.planes_estudiantes (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  verificado_en timestamptz not null default now(),
  hasta         timestamptz not null
);
alter table public.planes_estudiantes enable row level security;
create policy planes_estudiantes_mio on public.planes_estudiantes for select to authenticated using (user_id = auth.uid());

-- dominios de correo de universidades (público: es un catálogo, no datos de nadie)
create table public.planes_universidades (
  dominio text primary key,
  nombre  text not null
);
alter table public.planes_universidades enable row level security;
create policy planes_universidades_leer on public.planes_universidades for select to anon, authenticated using (true);
insert into public.planes_universidades (dominio, nombre) values
  ('pucp.edu.pe', 'PUCP'), ('pucp.pe', 'PUCP'),
  ('unmsm.edu.pe', 'San Marcos'),
  ('uni.pe', 'UNI'), ('uni.edu.pe', 'UNI'),
  ('upc.edu.pe', 'UPC'),
  ('ulima.edu.pe', 'Universidad de Lima'), ('aloe.ulima.edu.pe', 'Universidad de Lima'),
  ('up.edu.pe', 'Universidad del Pacífico'), ('alum.up.edu.pe', 'Universidad del Pacífico'),
  ('upch.pe', 'Cayetano Heredia'), ('upch.edu.pe', 'Cayetano Heredia'),
  ('usil.pe', 'USIL'), ('usil.edu.pe', 'USIL'),
  ('utec.edu.pe', 'UTEC'),
  ('esan.edu.pe', 'ESAN'), ('ue.edu.pe', 'ESAN'),
  ('unalm.edu.pe', 'La Molina'), ('lamolina.edu.pe', 'La Molina'),
  ('urp.edu.pe', 'Ricardo Palma'),
  ('usmp.pe', 'San Martín de Porres'), ('usmp.edu.pe', 'San Martín de Porres'),
  ('utp.edu.pe', 'UTP'),
  ('ucv.edu.pe', 'César Vallejo'),
  ('upn.pe', 'UPN'), ('upn.edu.pe', 'UPN'),
  ('continental.edu.pe', 'Continental'),
  ('ucsm.edu.pe', 'Católica de Santa María'),
  ('unsa.edu.pe', 'San Agustín de Arequipa'),
  ('unitru.edu.pe', 'Nacional de Trujillo'),
  ('unsaac.edu.pe', 'San Antonio Abad del Cusco'),
  ('ucsp.edu.pe', 'Católica San Pablo'),
  ('udep.edu.pe', 'Universidad de Piura'),
  ('ucsur.edu.pe', 'Científica del Sur'),
  ('unfv.edu.pe', 'Federico Villarreal'),
  ('uarm.pe', 'Antonio Ruiz de Montoya'),
  ('tecsup.edu.pe', 'Tecsup'),
  ('senati.pe', 'SENATI');

-- ——— códigos para activar planes (precio fundador / pago por Yape) ———
create table public.planes_codigos (
  codigo     text primary key check (codigo = upper(codigo)),
  plan       text not null check (plan in ('plus', 'pro', 'club')),
  meses      integer check (meses is null or meses > 0), -- null = sin vencimiento
  tarifa     text not null default 'fundador' check (tarifa in ('normal', 'estudiante', 'fundador')),
  usos_max   integer not null default 1 check (usos_max > 0),
  usos       integer not null default 0,
  vence      timestamptz,
  nota       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.planes_codigos enable row level security; -- sin políticas: solo la llave de servicio

create table public.planes_canjes (
  codigo   text not null references public.planes_codigos(codigo) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  fecha    timestamptz not null default now(),
  primary key (codigo, user_id)
);
alter table public.planes_canjes enable row level security;
create policy planes_canjes_mios on public.planes_canjes for select to authenticated using (user_id = auth.uid());

-- ——— uso de cupos por mes (lo que no deja filas propias, como "Buscar hueco") ———
create table public.planes_uso (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  clave    text not null,
  periodo  date not null,
  cantidad integer not null default 0,
  primary key (user_id, clave, periodo)
);
alter table public.planes_uso enable row level security;
create policy planes_uso_mio on public.planes_uso for select to authenticated using (user_id = auth.uid());

-- ——— funciones ———
/** Cuándo empezó "hoy" para esa persona (su zona horaria; Lima por defecto). */
create or replace function public.planes_inicio_hoy(uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (public.user_today(uid)::timestamp) at time zone coalesce((select timezone from profiles where id = uid), 'America/Lima')
$$;
create or replace function public.plan_de(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.plan from planes_suscripciones s where s.user_id = uid and (s.hasta is null or s.hasta > now())),
    'gratis'
  )
$$;

create or replace function public.club_activo(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from planes_clubes c where c.space_id = sid and (c.hasta is null or c.hasta > now()))
$$;

/** El límite de una persona para una clave (null = sin límite). */
create or replace function public.limite_de(uid uuid, p_clave text) returns integer
language sql stable security definer set search_path = public as $$
  select l.valor from planes_limites l where l.plan = public.plan_de(uid) and l.clave = p_clave
$$;

/** Error de límite: el mensaje es para la persona; el hint (LIMITE:clave) es para que la app abra la hoja de planes. */
create or replace function public.planes_limite_error(p_clave text, p_texto text) returns void
language plpgsql as $$
begin
  raise exception using message = p_texto, hint = 'LIMITE:' || p_clave, errcode = 'P0001';
end $$;

/** Todo lo que la app necesita saber del plan de quien pregunta. */
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

/** Cuenta un uso de un cupo mensual y dice si se puede (atómico: dos pestañas no se lo saltan). */
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
  lim := public.limite_de(uid, p_clave);
  per := date_trunc('month', public.user_today(uid))::date;
  insert into planes_uso (user_id, clave, periodo, cantidad) values (uid, p_clave, per, 0)
    on conflict (user_id, clave, periodo) do nothing;
  select cantidad into n from planes_uso where user_id = uid and clave = p_clave and periodo = per for update;
  if lim is not null and n >= lim then
    return jsonb_build_object('ok', false, 'usado', n, 'limite', lim);
  end if;
  update planes_uso set cantidad = cantidad + 1 where user_id = uid and clave = p_clave and periodo = per;
  return jsonb_build_object('ok', true, 'usado', n + 1, 'limite', lim);
end $$;

/** Canjear un código: activa (o extiende) Plus/Pro para quien lo canjea, o Club para uno de sus equipos. */
create or replace function public.canjear_codigo(p_codigo text, p_space uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c planes_codigos;
  s planes_suscripciones;
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
    select greatest(now(), coalesce(hasta, now())) into base from planes_clubes where space_id = p_space;
    base := coalesce(base, now());
    nuevo_hasta := case when c.meses is null then null else base + make_interval(months => c.meses) end;
    insert into planes_clubes (space_id, origen, desde, hasta)
      values (p_space, 'codigo', now(), nuevo_hasta)
      on conflict (space_id) do update set hasta = case when planes_clubes.hasta is null or excluded.hasta is null then null else excluded.hasta end,
                                           origen = 'codigo', updated_at = now();
  else
    select * into s from planes_suscripciones where user_id = uid and (hasta is null or hasta > now());
    if s.user_id is not null and (rango->>s.plan)::int > (rango->>c.plan)::int then
      raise exception 'Ya tienes un plan mayor (%). Este código es de %.', initcap(s.plan), initcap(c.plan);
    end if;
    -- mismo plan: se suma el tiempo; plan mayor: empieza hoy
    base := case when s.user_id is not null and s.plan = c.plan then coalesce(s.hasta, now()) else now() end;
    nuevo_hasta := case
      when c.meses is null then null
      when s.user_id is not null and s.plan = c.plan and s.hasta is null then null
      else base + make_interval(months => c.meses) end;
    insert into planes_suscripciones (user_id, plan, tarifa, origen, desde, hasta)
      values (uid, c.plan, c.tarifa, 'codigo', now(), nuevo_hasta)
      on conflict (user_id) do update set plan = excluded.plan, tarifa = excluded.tarifa, origen = 'codigo',
                                          desde = case when planes_suscripciones.plan = excluded.plan then planes_suscripciones.desde else now() end,
                                          hasta = excluded.hasta, updated_at = now();
  end if;

  update planes_codigos set usos = usos + 1 where codigo = c.codigo;
  insert into planes_canjes (codigo, user_id, space_id) values (c.codigo, uid, p_space);
  return jsonb_build_object('plan', c.plan, 'hasta', nuevo_hasta);
end $$;

/** Estudiante: el correo de la cuenta (confirmado) tiene que ser de una universidad del catálogo. Vale un año. */
create or replace function public.verificar_estudiante() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  correo text;
  confirmado timestamptz;
  dom text;
  uni text;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  select lower(u.email), u.email_confirmed_at into correo, confirmado from auth.users u where u.id = uid;
  if correo is null or confirmado is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_correo');
  end if;
  dom := split_part(correo, '@', 2);
  select p.nombre into uni from planes_universidades p
    where dom = p.dominio or dom like '%.' || p.dominio
    order by length(p.dominio) desc limit 1;
  if uni is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_universidad');
  end if;
  insert into planes_estudiantes (user_id, verificado_en, hasta) values (uid, now(), now() + interval '1 year')
    on conflict (user_id) do update set verificado_en = now(), hasta = now() + interval '1 year';
  return jsonb_build_object('ok', true, 'universidad', uni, 'hasta', now() + interval '1 year');
end $$;

-- ——— los límites se cumplen en la base ———

-- Cuaderno: pizarras nuevas por día
create or replace function public.planes_tg_pizarras() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer; n integer;
begin
  if new.kind <> 'pizarra' then return new; end if;
  lim := public.limite_de(new.user_id, 'pizarras_dia');
  if lim is null then return new; end if;
  select count(*) into n from cuaderno_notes
    where user_id = new.user_id and kind = 'pizarra'
      and created_at >= public.planes_inicio_hoy(new.user_id);
  if n >= lim then
    perform public.planes_limite_error('pizarras_dia',
      format('Ya creaste %s pizarras hoy, el máximo del plan Gratis. Mañana puedes crear más, o pásate a Plus para que no tengan límite.', lim));
  end if;
  return new;
end $$;
create trigger planes_pizarras before insert on public.cuaderno_notes
  for each row execute function public.planes_tg_pizarras();

-- Cuaderno: páginas compartidas con un equipo
create or replace function public.planes_tg_compartidas() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer; n integer;
begin
  if new.space_id is null or old.space_id is not null then return new; end if;
  lim := public.limite_de(new.user_id, 'notas_compartidas');
  if lim is null then return new; end if;
  select count(*) into n from cuaderno_notes where user_id = new.user_id and space_id is not null and id <> new.id;
  if n >= lim then
    perform public.planes_limite_error('notas_compartidas',
      format('Ya compartes %s páginas, el máximo del plan Gratis. Deja de compartir alguna o pásate a Plus.', lim));
  end if;
  return new;
end $$;
create trigger planes_compartidas before update of space_id on public.cuaderno_notes
  for each row execute function public.planes_tg_compartidas();

-- Equipos: cuántos puede crear cada persona
create or replace function public.planes_tg_equipos() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer; n integer;
begin
  if new.created_by is null then return new; end if;
  lim := public.limite_de(new.created_by, 'equipos');
  if lim is null then return new; end if;
  select count(*) into n from spaces where created_by = new.created_by;
  if n >= lim then
    perform public.planes_limite_error('equipos',
      case when lim = 1 then 'Con el plan Gratis puedes crear 1 equipo, y ya lo tienes. Puedes unirte a todos los que quieras, o pasarte a Plus para crear más.'
           else format('Llegaste a %s equipos creados, el máximo de tu plan.', lim) end);
  end if;
  return new;
end $$;
create trigger planes_equipos before insert on public.spaces
  for each row execute function public.planes_tg_equipos();

-- Equipos: cuántas personas caben (lo decide el plan de quien lo creó, o el plan Club del equipo)
create or replace function public.planes_tg_miembros() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer; n integer; dueno uuid;
begin
  if public.club_activo(new.space_id) then return new; end if;
  select created_by into dueno from spaces where id = new.space_id;
  if dueno is null then return new; end if;
  lim := public.limite_de(dueno, 'miembros_equipo');
  if lim is null then return new; end if;
  select count(*) into n from space_members where space_id = new.space_id;
  if n >= lim then
    perform public.planes_limite_error('miembros_equipo',
      format('Este equipo ya tiene %s personas, el máximo de su plan. Pídele a quien lo creó que lo pase a un plan mayor o a Club.', lim));
  end if;
  return new;
end $$;
create trigger planes_miembros before insert on public.space_members
  for each row execute function public.planes_tg_miembros();

-- Cuaderno: conectar tu IA (Claude, ChatGPT) es de Plus y Pro. Las conexiones que ya existían siguen
-- funcionando (renovar una conexión es un update, no pasa por aquí); solo no se crean nuevas en Gratis.
create or replace function public.planes_tg_conector() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.limite_de(new.user_id, 'conector_ia'), 1) = 0 then
    perform public.planes_limite_error('conector_ia',
      'Conectar tu IA al Cuaderno es parte de Plus. Con Plus conectas tu Claude o ChatGPT y trabaja con tus notas.');
  end if;
  return new;
end $$;
create trigger planes_conector before insert on public.cuaderno_tokens
  for each row execute function public.planes_tg_conector();
create trigger planes_conector_codigo before insert on public.cuaderno_oauth_codes
  for each row execute function public.planes_tg_conector();

-- ——— permisos ———
revoke all on function public.plan_de(uuid), public.planes_inicio_hoy(uuid), public.club_activo(uuid), public.limite_de(uuid, text),
  public.planes_limite_error(text, text), public.planes_tg_pizarras(), public.planes_tg_compartidas(),
  public.planes_tg_equipos(), public.planes_tg_miembros(), public.planes_tg_conector() from public, anon, authenticated;
revoke all on function public.mi_plan(), public.usar_cupo(text), public.canjear_codigo(text, uuid),
  public.verificar_estudiante() from public, anon;
grant execute on function public.mi_plan(), public.usar_cupo(text), public.canjear_codigo(text, uuid),
  public.verificar_estudiante() to authenticated;
grant execute on function public.club_activo(uuid) to authenticated;
