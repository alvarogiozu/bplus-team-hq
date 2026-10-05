// Cobrar un plan con Culqi (tarjeta o Yape) y activarlo.
// El navegador solo manda el token que entrega el checkout de Culqi y qué plan quiere: el precio sale de la base
// (planes_precios) y el cobro se hace aquí con la llave secreta (secret CULQI_SECRET_KEY: nunca llega al
// navegador). Si Culqi dice que sí, se guarda el pago (planes_pagos) y se aplica el plan (aplicar_pago).
// No se guarda ni se loguea nada de la tarjeta: Culqi la tokeniza en su propio formulario.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const NOMBRE: Record<string, string> = { plus: 'Plus', pro: 'Pro', club: 'Club' }
const RANGO: Record<string, number> = { gratis: 0, plus: 1, pro: 2 }

type Pedido = { plan?: unknown; periodo?: unknown; token?: unknown; email?: unknown; space_id?: unknown }

Deno.serve(async (req) => {
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
  const plan = String(p.plan ?? '')
  const periodo = String(p.periodo ?? '')
  const token = String(p.token ?? '')
  const email = String(p.email ?? '').trim().toLowerCase()
  const spaceId = p.space_id ? String(p.space_id) : null
  if (!['plus', 'pro', 'club'].includes(plan) || !['mes', 'anio'].includes(periodo)) return json({ error: 'Plan o periodo inválido' }, 400)
  if (!/^[a-z]{3}_[a-zA-Z0-9_]{6,}$/.test(token)) return json({ error: 'El pago no llegó bien. Inténtalo de nuevo.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Falta un correo válido para el comprobante.' }, 400)

  // qué puede comprar
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
    const { data: sus } = await admin
      .from('planes_suscripciones')
      .select('plan, hasta')
      .eq('user_id', user.id)
      .maybeSingle()
    const activa = sus && (!sus.hasta || new Date(sus.hasta).getTime() > Date.now())
    if (activa && !sus.hasta) return json({ error: 'Ya tienes un plan sin vencimiento. Si quieres cambiarlo, escríbenos.' }, 409)
    if (activa && RANGO[sus.plan] > RANGO[plan]) return json({ error: `Ya tienes ${NOMBRE[sus.plan]}, que incluye todo lo de ${NOMBRE[plan]}.` }, 409)
  }

  // el precio: el de estudiante solo si está verificado
  let tarifa = 'normal'
  if (plan === 'plus') {
    const { data: est } = await admin.from('planes_estudiantes').select('hasta').eq('user_id', user.id).maybeSingle()
    if (est && new Date(est.hasta).getTime() > Date.now()) tarifa = 'estudiante'
  }
  const { data: precio } = await admin
    .from('planes_precios')
    .select('centimos, meses')
    .eq('plan', plan)
    .eq('tarifa', tarifa)
    .eq('periodo', periodo)
    .single()
  if (!precio) return json({ error: 'Ese plan no tiene precio todavía.' }, 400)

  // cobrar
  const r = await fetch('https://api.culqi.com/v2/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secreta}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: precio.centimos,
      currency_code: 'PEN',
      email,
      source_id: token,
      description: `Rockie ${NOMBRE[plan]} (${periodo === 'anio' ? '1 año' : '1 mes'})`.slice(0, 80),
      metadata: { user_id: user.id, plan, periodo, tarifa },
    }),
  })
  const cobro = (await r.json().catch(() => ({}))) as {
    object?: string
    id?: string
    outcome?: { type?: string; user_message?: string }
    user_message?: string
    merchant_message?: string
  }
  const ok = r.ok && cobro.object === 'charge' && Boolean(cobro.id)
  if (!ok) {
    await admin.from('planes_pagos').insert({
      user_id: user.id,
      space_id: spaceId,
      plan,
      tarifa,
      periodo,
      centimos: precio.centimos,
      estado: 'fallido',
    })
    return json({ error: cobro.user_message || cobro.outcome?.user_message || 'El pago no pasó. Revisa los datos o prueba con otro medio.' }, 402)
  }

  // modo prueba (llave sk_test_): las tarjetas de prueba de Culqi son públicas, así que el pago se registra pero
  // solo activa el plan a los usuarios de prueba (qa.*). Con la llave de producción, activa siempre.
  const prueba = secreta.startsWith('sk_test_')
  if (prueba) {
    const { data: perfil } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle()
    if (!perfil?.username?.startsWith('qa.')) {
      await admin.from('planes_pagos').insert({
        user_id: user.id,
        space_id: spaceId,
        plan,
        tarifa,
        periodo,
        centimos: precio.centimos,
        culqi_cargo: cobro.id,
        estado: 'pagado',
        prueba: true,
      })
      return json({ ok: true, prueba: true, plan, tarifa, periodo, hasta: null, centimos: precio.centimos })
    }
  }

  // activar el plan y guardar el pago
  const { data: hasta, error: ae } = await admin.rpc('aplicar_pago', {
    p_user: user.id,
    p_plan: plan,
    p_tarifa: tarifa,
    p_meses: precio.meses,
    p_space: spaceId,
  })
  await admin.from('planes_pagos').insert({
    user_id: user.id,
    space_id: spaceId,
    plan,
    tarifa,
    periodo,
    centimos: precio.centimos,
    culqi_cargo: cobro.id,
    estado: 'pagado',
    hasta: ae ? null : hasta,
    prueba,
  })
  if (ae) {
    // el cobro sí pasó: no se pierde (queda en planes_pagos con su id de Culqi para activarlo a mano)
    console.error('aplicar_pago', ae.message)
    return json({ error: 'Tu pago pasó, pero no pudimos activar el plan. Escríbenos y lo activamos al tiro.', cargo: cobro.id }, 500)
  }
  return json({ ok: true, plan, tarifa, periodo, hasta, centimos: precio.centimos })
})
