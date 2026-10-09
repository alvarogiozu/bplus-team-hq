// Cobrar un plan con Culqi (Yape o tarjeta) y activarlo.
// - Yape: la app crea el token de Yape (celular + código de aprobación, con la llave PÚBLICA) y manda solo el token.
// - Tarjeta: se escribe en el formulario de Culqi y llega su token. Si el banco pide verificar a la persona (3DS),
//   respondemos { revisar: true }; la app verifica con Culqi3DS y vuelve a mandar el mismo token con el resultado.
// - Renovación automática (solo tarjeta): Culqi guarda la tarjeta (cliente + tarjeta). Rockie guarda solo sus ids
//   y la marca y los últimos 4 dígitos (planes_renovacion); planes-renovar la cobra cuando toca.
// El precio sale de la base (planes_precios), nunca del navegador. No se guarda ni se loguea nada de la tarjeta,
// del Yape ni de los datos que Culqi pide para guardar la tarjeta.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { cargoOk, culqi, limpiar3DS, mensajeCulqi, pideVerificar } from '../_shared/culqi.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const NOMBRE: Record<string, string> = { plus: 'Plus', pro: 'Pro', club: 'Club' }
const RANGO: Record<string, number> = { gratis: 0, plus: 1, pro: 2 }
const DURA: Record<string, string> = { mes: '1 mes', ciclo: '4 meses', anio: '1 año' }
const GRACIA = 3 * 864e5

type Pedido = {
  accion?: unknown
  plan?: unknown
  periodo?: unknown
  token?: unknown
  email?: unknown
  space_id?: unknown
  device?: unknown
  tds?: unknown
  renovar?: unknown
  cliente?: unknown
}
type Cliente = { nombre: string; apellido: string; celular: string; ciudad: string }

/** Lo que Culqi pide para guardar una tarjeta (va directo a Culqi; Rockie no lo guarda). */
function limpiarCliente(x: unknown): Cliente | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const t = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim().replace(/\s+/g, ' ') : '')
  const c = { nombre: t('nombre'), apellido: t('apellido'), celular: t('celular').replace(/[^\d]/g, '').replace(/^51(?=\d{9}$)/, ''), ciudad: t('ciudad') }
  if (c.nombre.length < 2 || c.nombre.length > 50 || c.apellido.length < 2 || c.apellido.length > 50) return null
  if (!/^9\d{8}$/.test(c.celular) || c.ciudad.length < 2 || c.ciudad.length > 30) return null
  return c
}

/** El cliente de Culqi de ese correo (si ya existe se reusa; si no, se crea). */
async function clienteCulqi(secreta: string, email: string, c: Cliente): Promise<{ id?: string; error?: string }> {
  const ya = await culqi(secreta, `/customers?email=${encodeURIComponent(email)}&limit=1`)
  const id = ya.j?.data?.[0]?.id
  if (typeof id === 'string') return { id }
  const n = await culqi(secreta, '/customers', {
    first_name: c.nombre,
    last_name: c.apellido,
    email,
    address: `${c.ciudad}, Perú`,
    address_city: c.ciudad,
    country_code: 'PE',
    phone_number: c.celular,
  })
  if (n.status === 201 && typeof n.j.id === 'string') return { id: n.j.id }
  return { error: mensajeCulqi(n.j) || 'Culqi no pudo registrar tus datos para guardar la tarjeta.' }
}

const borrarTarjeta = (secreta: string, id: string) => culqi(secreta, `/cards/${id}`, undefined, 'DELETE').catch(() => null)

async function esQa(admin: SupabaseClient, uid: string) {
  const { data } = await admin.from('profiles').select('username').eq('id', uid).maybeSingle()
  return Boolean(data?.username?.startsWith('qa.'))
}

// si Culqi o la red fallan a medio camino, la app recibe un mensaje claro (con CORS) en vez de un error sin cuerpo
Deno.serve((req) =>
  atender(req).catch((e) => {
    console.error('culqi-cobro', e instanceof Error ? e.message : e)
    return json({ error: 'No pudimos hablar con Culqi. Si te llegó el cobro, escríbenos y activamos tu plan; si no, inténtalo de nuevo.' }, 502)
  }),
)

async function atender(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const secreta = Deno.env.get('CULQI_SECRET_KEY')
  if (!secreta) return json({ error: 'El pago en línea todavía no está activado. Usa un código por ahora.' }, 503)

  // quién paga (su sesión de Rockie)
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) return json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, 401)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let p: Pedido
  try {
    p = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const spaceId = typeof p.space_id === 'string' && /^[0-9a-f-]{36}$/.test(p.space_id) ? p.space_id : null

  // ——— quitar la tarjeta guardada (deja de renovarse y Culqi la borra) ———
  if (p.accion === 'quitar_tarjeta') {
    let q = admin.from('planes_renovacion').select('id, culqi_tarjeta').eq('user_id', user.id)
    q = spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null)
    const { data: r } = await q.maybeSingle()
    if (!r) return json({ ok: true })
    await borrarTarjeta(secreta, r.culqi_tarjeta)
    await admin.from('planes_renovacion').delete().eq('id', r.id)
    return json({ ok: true })
  }

  const plan = String(p.plan ?? '')
  const periodo = String(p.periodo ?? '')
  const token = String(p.token ?? '')
  const email = String(p.email ?? '').trim().toLowerCase()
  if (!['plus', 'pro', 'club'].includes(plan) || !['mes', 'ciclo', 'anio'].includes(periodo)) return json({ error: 'Plan o periodo inválido' }, 400)
  if (!/^(tkn|ype)_(live|test)_[a-zA-Z0-9]{6,}$/.test(token)) return json({ error: 'El pago no llegó bien. Inténtalo de nuevo.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return json({ error: 'Falta un correo válido para el comprobante.' }, 400)
  // llaves cruzadas (pk_test en la app con sk_live aquí, o al revés): Culqi rechazaría el token con un mensaje confuso
  const prueba = secreta.startsWith('sk_test_')
  if (token.includes('_test_') !== prueba) {
    console.error('culqi-cobro: llaves cruzadas', prueba ? 'token live con sk_test' : 'token test con sk_live')
    return json({ error: 'El pago en línea está en mantenimiento unos minutos. Usa un código o inténtalo más tarde.' }, 503)
  }
  const metodo = token.startsWith('ype_') ? 'yape' : 'tarjeta'
  const renovar = p.renovar === true && metodo === 'tarjeta'
  const device = typeof p.device === 'string' && /^[\w-]{6,100}$/.test(p.device) ? p.device : undefined
  const tds = limpiar3DS(p.tds)

  // ——— qué puede comprar ———
  if (plan === 'club') {
    if (!spaceId) return json({ error: 'Elige el equipo que será Club.' }, 400)
    const { data: dueno } = await admin
      .from('space_members')
      .select('user_id')
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle()
    if (!dueno) return json({ error: 'Solo quien creó el equipo puede pagarle el plan Club.' }, 403)
  } else {
    const { data: sus } = await admin.from('planes_suscripciones').select('plan, hasta, pausa_hasta').eq('user_id', user.id).maybeSingle()
    const ahora = Date.now()
    const pausado = Boolean(sus?.pausa_hasta && new Date(sus.pausa_hasta).getTime() > ahora)
    const vigente = Boolean(sus && !pausado && (!sus.hasta || new Date(sus.hasta).getTime() + GRACIA > ahora))
    if (vigente && !sus!.hasta) return json({ error: 'Ya tienes un plan sin vencimiento. Si quieres cambiarlo, escríbenos.' }, 409)
    if ((vigente || pausado) && RANGO[sus!.plan] > RANGO[plan]) {
      return json({ error: `Ya tienes ${NOMBRE[sus!.plan]}, que incluye todo lo de ${NOMBRE[plan]}.` }, 409)
    }
  }

  // ——— el precio: estudiante verificado > fundador (cuando hay precios nuevos) > normal; el ciclo es solo para estudiantes ———
  let tarifa = 'normal'
  const { data: suya, error: te } = await admin.rpc('planes_tarifa_de', { p_user: user.id, p_plan: plan })
  if (!te && typeof suya === 'string') tarifa = suya
  else if (plan === 'plus') {
    // respaldo si la base todavía no tiene planes_tarifa_de (migración 20261016120500)
    const { data: est } = await admin.from('planes_estudiantes').select('hasta').eq('user_id', user.id).maybeSingle()
    if (est && new Date(est.hasta).getTime() > Date.now()) tarifa = 'estudiante'
  }
  if (periodo === 'ciclo' && tarifa !== 'estudiante') return json({ error: 'El pago por ciclo es para estudiantes verificados (Plus).' }, 400)
  const { data: precio } = await admin
    .from('planes_precios')
    .select('centimos, meses')
    .eq('plan', plan)
    .eq('tarifa', tarifa)
    .eq('periodo', periodo)
    .maybeSingle()
  if (!precio) return json({ error: 'Ese plan no tiene precio todavía.' }, 400)

  const qa = prueba ? await esQa(admin, user.id) : false
  const pago = { user_id: user.id, space_id: spaceId, plan, tarifa, periodo, centimos: precio.centimos, metodo }

  // ——— renovación automática: Culqi guarda la tarjeta y se cobra con ella ———
  let fuente = token
  let guardada: { cliente: string; id: string; marca: string | null; ultimos4: string | null } | null = null
  let c: Cliente | null = null
  if (renovar) {
    c = limpiarCliente(p.cliente)
    if (!c) return json({ error: 'Para renovar solo, Culqi pide tu nombre, apellido, celular (9 dígitos) y ciudad.' }, 400)
    let q = admin.from('planes_renovacion').select('culqi_cliente').eq('user_id', user.id)
    q = spaceId && plan === 'club' ? q.eq('space_id', spaceId) : q.is('space_id', null)
    const { data: previa } = await q.maybeSingle()
    let clienteId = previa?.culqi_cliente as string | undefined
    if (!clienteId) {
      const r = await clienteCulqi(secreta, email, c)
      if (!r.id) return json({ error: r.error }, 402)
      clienteId = r.id
    }
    const t = await culqi(secreta, '/cards', { customer_id: clienteId, token_id: token, ...(tds ? { authentication_3DS: tds } : {}) })
    if (pideVerificar(t)) return json({ revisar: true })
    if (t.status !== 201 || typeof t.j.id !== 'string') {
      return json({ error: mensajeCulqi(t.j) || 'No se pudo guardar tu tarjeta. Prueba sin renovación automática.' }, 402)
    }
    const fuenteT = (t.j.source ?? t.j) as Record<string, any>
    guardada = {
      cliente: clienteId,
      id: t.j.id,
      marca: typeof fuenteT?.iin?.card_brand === 'string' ? fuenteT.iin.card_brand.slice(0, 30) : null,
      ultimos4: typeof fuenteT?.last_four === 'string' && /^\d{4}$/.test(fuenteT.last_four) ? fuenteT.last_four : null,
    }
    fuente = guardada.id
  }

  // ——— cobrar ———
  const cobro = await culqi(secreta, '/charges', {
    amount: precio.centimos,
    currency_code: 'PEN',
    email,
    source_id: fuente,
    description: `Rockie ${NOMBRE[plan]} (${DURA[periodo]})`.slice(0, 80),
    metadata: { user_id: user.id, plan, periodo, tarifa, metodo, renovar: renovar ? 'si' : 'no' },
    ...(device || c
      ? {
          antifraud_details: {
            ...(device ? { device_finger_print_id: device } : {}),
            ...(c
              ? { first_name: c.nombre, last_name: c.apellido, phone_number: c.celular, address: `${c.ciudad}, Perú`, address_city: c.ciudad, country_code: 'PE' }
              : {}),
          },
        }
      : {}),
    ...(tds ? { authentication_3DS: tds } : {}),
  })
  if (pideVerificar(cobro)) {
    if (guardada) {
      // la tarjeta guardada no se puede verificar de nuevo aquí: se suelta y se ofrece pagar sin renovación
      await borrarTarjeta(secreta, guardada.id)
      return json({ error: 'Tu banco pidió verificar otra vez. Prueba sin renovación automática o con Yape.' }, 402)
    }
    return json({ revisar: true })
  }
  if (!cargoOk(cobro)) {
    if (guardada) await borrarTarjeta(secreta, guardada.id)
    await admin.from('planes_pagos').insert({ ...pago, estado: 'fallido', prueba })
    return json({ error: mensajeCulqi(cobro.j) || 'El pago no pasó. Revisa los datos o prueba con otro medio.' }, 402)
  }

  // modo prueba (llave sk_test_): las tarjetas y el Yape de prueba de Culqi son públicos, así que el pago se registra
  // pero solo activa el plan a los usuarios de prueba (qa.*). Con la llave de producción, activa siempre.
  if (prueba && !qa) {
    if (guardada) await borrarTarjeta(secreta, guardada.id)
    await admin.from('planes_pagos').insert({ ...pago, culqi_cargo: cobro.j.id, estado: 'pagado', prueba: true })
    return json({ ok: true, prueba: true, plan, tarifa, periodo, hasta: null, centimos: precio.centimos })
  }

  // ——— activar el plan y guardar el pago ———
  const { data: hasta, error: ae } = await admin.rpc('aplicar_pago', {
    p_user: user.id,
    p_plan: plan,
    p_tarifa: tarifa,
    p_meses: precio.meses,
    p_space: spaceId,
  })
  await admin.from('planes_pagos').insert({ ...pago, culqi_cargo: cobro.j.id, estado: 'pagado', hasta: ae ? null : hasta, prueba })
  if (ae) {
    // el cobro sí pasó: no se pierde (queda en planes_pagos con su id de Culqi para activarlo a mano)
    console.error('aplicar_pago', ae.message)
    return json({ error: 'Tu pago pasó, pero no pudimos activar el plan. Escríbenos y lo activamos al tiro.', cargo: cobro.j.id }, 500)
  }

  // ——— la renovación automática: se guarda (o se cambia la tarjeta); si pagaste otro plan sin ella, se apaga ———
  let qr = admin.from('planes_renovacion').select('id, plan, culqi_tarjeta').eq('user_id', user.id)
  qr = plan === 'club' && spaceId ? qr.eq('space_id', spaceId) : qr.is('space_id', null)
  const { data: previa } = await qr.maybeSingle()
  if (guardada) {
    const fila = {
      user_id: user.id,
      space_id: plan === 'club' ? spaceId : null,
      plan,
      periodo,
      activa: true,
      culqi_cliente: guardada.cliente,
      culqi_tarjeta: guardada.id,
      marca: guardada.marca,
      ultimos4: guardada.ultimos4,
      intentos: 0,
      ultimo_error: null,
      updated_at: new Date().toISOString(),
    }
    if (previa) {
      if (previa.culqi_tarjeta !== guardada.id) await borrarTarjeta(secreta, previa.culqi_tarjeta)
      await admin.from('planes_renovacion').update(fila).eq('id', previa.id)
    } else {
      await admin.from('planes_renovacion').insert(fila)
    }
  } else if (previa && previa.plan !== plan) {
    // cambiaste de plan: la renovación era del anterior; queda apagada hasta que la actives para el nuevo
    await admin.from('planes_renovacion').update({ activa: false, updated_at: new Date().toISOString() }).eq('id', previa.id)
  }

  // ——— si llegaste invitado: tu primer pago les da un mes a los dos ———
  const { data: premio } = await admin.rpc('premiar_referido', { p_user: user.id })
  const regalo = Boolean((premio as { premiado?: boolean } | null)?.premiado)
  let hastaFinal = hasta as string | null
  if (regalo && plan !== 'club') {
    const { data: s } = await admin.from('planes_suscripciones').select('hasta').eq('user_id', user.id).maybeSingle()
    hastaFinal = s?.hasta ?? hastaFinal
  }

  return json({ ok: true, plan, tarifa, periodo, hasta: hastaFinal, centimos: precio.centimos, renovacion: Boolean(guardada), regalo })
}
