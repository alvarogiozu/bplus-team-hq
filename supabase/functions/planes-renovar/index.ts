// Todos los días (pg_cron, 9:00 de Lima):
// 1. Cobra las renovaciones automáticas que tocan (planes que vencen en menos de un día o están en sus 3 días de
//    gracia) con la tarjeta que Culqi guardó. Si no pasa, lo vuelve a intentar al día siguiente (hasta 3 veces) y la
//    app avisa a la persona.
// 2. Manda los avisos por correo (solo a quien dejó su correo): «tu plan vence pronto» y «tu plan venció».
// Solo hace lo que ya toca, y marca cada renovación antes de cobrarla: llamarla de más no cobra dos veces.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cargoOk, culqi, mensajeCulqi, pideVerificar } from '../_shared/culqi.ts'

const NOMBRE: Record<string, string> = { plus: 'Plus', pro: 'Pro', club: 'Club' }
const DURA: Record<string, string> = { mes: '1 mes', ciclo: '4 meses', anio: '1 año' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type PorRenovar = {
  renovacion: string
  usuario: string
  equipo: string | null
  plan_id: string
  tarifa_id: string
  periodo_id: string
  monto: number
  meses_n: number
  cliente: string
  tarjeta: string
  vence: string
  intentos_n: number
}
type Aviso = {
  usuario: string
  correo: string
  nivel: number
  plan_id: string
  vence: string
  auto: boolean
  marca: string | null
  ultimos4: string | null
  intentos_n: number
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`

// quién cobra, como en la web (copia de src/features/publico/comercio.ts: si cambia allá, cambia aquí)
const PIE_COMERCIO =
  'Rockie · ZUÑIGA CANAZAS ALVARO GIOVANNI · RUC 10765450981 · Miraflores, Lima, Perú<br>' +
  '<a href="https://rockie.plus" style="color:#9893a5">rockie.plus</a> · contacto@rockie.plus · ' +
  '<a href="https://rockie.plus/libro-de-reclamaciones" style="color:#9893a5">Libro de Reclamaciones</a>'

/** Un correo sencillo con la cara de Rockie: título, texto y un botón. */
function correoHtml(titulo: string, parrafos: string[], boton: { texto: string; url: string }) {
  const p = parrafos.map((x) => `<p style="margin:0 0 14px;color:#575279;font-size:15px;line-height:1.5">${x}</p>`).join('')
  return `<!doctype html><html lang="es"><body style="margin:0;background:#faf4ed;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf4ed;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffaf3;border:1.5px solid #f2e9e1;border-radius:18px;padding:28px 24px">
<tr><td style="text-align:center;padding-bottom:12px"><img src="https://rockie.plus/pagos/rockie-logo.png" width="72" height="72" alt="Rockie" style="border-radius:18px"></td></tr>
<tr><td><h1 style="margin:0 0 14px;color:#286983;font-size:21px;line-height:1.3;text-align:center">${titulo}</h1>${p}
<p style="text-align:center;margin:22px 0 8px"><a href="${boton.url}" style="display:inline-block;background:#2e88aa;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:999px;font-size:15px">${boton.texto}</a></p>
<p style="margin:18px 0 0;color:#9893a5;font-size:12px;line-height:1.5;text-align:center">Te escribimos porque pediste avisos de tu plan. Puedes quitarlos en Rockie → Tu plan.<br>${PIE_COMERCIO}</p>
</td></tr></table></td></tr></table></body></html>`
}

function textoAviso(a: Aviso, precio: number | null) {
  const plan = NOMBRE[a.plan_id] ?? 'tu plan'
  const renovar = { texto: 'Renovar en 10 segundos', url: 'https://rockie.plus/planes?renovar=1' }
  if (a.nivel === 1 && a.auto && a.intentos_n === 0) {
    const tarjeta = a.marca && a.ultimos4 ? `tu ${a.marca} •••• ${a.ultimos4}` : 'tu tarjeta guardada'
    return {
      asunto: `Renovaremos tu ${plan} el ${fecha(a.vence)}`,
      html: correoHtml(
        `Tu ${plan} se renueva solo`,
        [
          `El <b>${fecha(a.vence)}</b> renovaremos tu plan ${plan}${precio ? ` por <b>${soles(precio)}</b>` : ''} con ${tarjeta}.`,
          'No tienes que hacer nada. Si prefieres no renovarlo, cancélalo en un clic desde Tu plan: sigues con todo hasta ese día.',
        ],
        { texto: 'Ver mi plan', url: 'https://rockie.plus/planes' },
      ),
    }
  }
  if (a.nivel === 1) {
    return {
      asunto: `Tu ${plan} vence el ${fecha(a.vence)}`,
      html: correoHtml(
        `Tu ${plan} vence pronto`,
        [
          `Tu plan ${plan} vence el <b>${fecha(a.vence)}</b>.`,
          'Renuévalo en dos toques con Yape o tarjeta y sigue sin límites. Si no, vuelves a Gratis: no se borra nada de lo que creaste.',
        ],
        renovar,
      ),
    }
  }
  return {
    asunto: a.auto ? `No pudimos renovar tu ${plan}` : `Tu ${plan} venció: tienes 3 días para renovarlo`,
    html: correoHtml(
      a.auto ? `No pudimos renovar tu ${plan}` : `Tu ${plan} venció`,
      [
        a.auto
          ? 'Tu banco no aprobó el cobro de la renovación. Lo volveremos a intentar, o renuévalo tú ahora con Yape u otra tarjeta.'
          : 'Te guardamos tu plan 3 días más para que lo renueves sin perder nada.',
        'Después vuelves a Gratis. Todo lo que creaste sigue ahí.',
      ],
      renovar,
    ),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const secreta = Deno.env.get('CULQI_SECRET_KEY')
  const hecho = { renovados: 0, fallidos: 0, saltados: 0, avisos: 0, avisos_error: 0 }

  // ——— 1. renovaciones automáticas ———
  if (secreta) {
    const prueba = secreta.startsWith('sk_test_')
    const { data, error } = await admin.rpc('planes_por_renovar')
    if (error) console.error('planes_por_renovar', error.message)
    for (const f of (data ?? []) as PorRenovar[]) {
      if (prueba) {
        // en modo prueba solo se renuevan los usuarios de prueba (qa.*)
        const { data: perfil } = await admin.from('profiles').select('username').eq('id', f.usuario).maybeSingle()
        if (!perfil?.username?.startsWith('qa.')) {
          hecho.saltados++
          continue
        }
      }
      const pago = {
        user_id: f.usuario,
        space_id: f.equipo,
        plan: f.plan_id,
        tarifa: f.tarifa_id,
        periodo: f.periodo_id,
        centimos: f.monto,
        metodo: 'renovacion',
        prueba,
      }
      // si la red con Culqi se cae en una, cuenta como intento fallido y se sigue con las demás
      try {
        // el correo del comprobante lo tiene Culqi (es el de su cliente): Rockie no lo guarda
        const cli = await culqi(secreta, `/customers/${f.cliente}`)
        const email = typeof cli.j?.email === 'string' ? cli.j.email : null
        const cobro = email
          ? await culqi(secreta, '/charges', {
              amount: f.monto,
              currency_code: 'PEN',
              email,
              source_id: f.tarjeta,
              description: `Rockie ${NOMBRE[f.plan_id]} (renovación, ${DURA[f.periodo_id]})`.slice(0, 80),
              metadata: { user_id: f.usuario, plan: f.plan_id, periodo: f.periodo_id, tarifa: f.tarifa_id, metodo: 'renovacion' },
            })
          : null
        if (cobro && cargoOk(cobro)) {
          const { data: hasta, error: ae } = await admin.rpc('aplicar_pago', {
            p_user: f.usuario,
            p_plan: f.plan_id,
            p_tarifa: f.tarifa_id,
            p_meses: f.meses_n,
            p_space: f.equipo,
          })
          await admin.from('planes_pagos').insert({ ...pago, culqi_cargo: cobro.j.id, estado: 'pagado', hasta: ae ? null : hasta })
          if (ae) console.error('aplicar_pago (renovación)', ae.message)
          await admin
            .from('planes_renovacion')
            .update({ intentos: 0, ultimo_error: null, periodo: f.periodo_id, updated_at: new Date().toISOString() })
            .eq('id', f.renovacion)
          hecho.renovados++
        } else {
          const msg = !cobro
            ? 'Culqi no encontró los datos de tu tarjeta guardada.'
            : pideVerificar(cobro)
              ? 'Tu banco pidió confirmar el pago.'
              : mensajeCulqi(cobro.j) || 'El banco no aprobó el cobro.'
          await admin.from('planes_pagos').insert({ ...pago, estado: 'fallido' })
          await admin.rpc('planes_renovacion_fallo', { p_id: f.renovacion, p_error: msg })
          hecho.fallidos++
        }
      } catch (e) {
        console.error('renovación', f.renovacion, e instanceof Error ? e.message : e)
        await admin.rpc('planes_renovacion_fallo', { p_id: f.renovacion, p_error: 'No pudimos hablar con Culqi; lo intentamos de nuevo mañana.' })
        hecho.fallidos++
      }
    }
  }

  // ——— 2. avisos por correo (si hay con qué mandarlos) ———
  const resend = Deno.env.get('RESEND_API_KEY')
  if (resend) {
    const remitente = Deno.env.get('CORREO_REMITENTE') || 'Rockie <avisos@rockie.plus>'
    const { data, error } = await admin.rpc('planes_avisos_pendientes')
    if (error) console.error('planes_avisos_pendientes', error.message)
    const { data: precios } = await admin.from('planes_precios').select('plan, tarifa, periodo, centimos')
    for (const a of (data ?? []) as Aviso[]) {
      const { data: ren } = await admin.from('planes_renovacion').select('periodo').eq('user_id', a.usuario).is('space_id', null).maybeSingle()
      const { data: sus } = await admin.from('planes_suscripciones').select('tarifa').eq('user_id', a.usuario).maybeSingle()
      // su tarifa (estudiante o fundador) si tiene precio; si no, la normal
      const de = (t: string) => precios?.find((x) => x.plan === a.plan_id && x.tarifa === t && x.periodo === (ren?.periodo ?? 'mes'))?.centimos
      const precio = de(sus?.tarifa ?? 'normal') ?? de('normal') ?? null
      const t = textoAviso(a, precio)
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: remitente, to: [a.correo], subject: t.asunto, html: t.html, reply_to: 'contacto@rockie.plus' }),
      }).catch(() => null)
      if (r?.ok) {
        await admin
          .from('planes_avisos')
          .update({ enviado_para: a.vence, enviado_nivel: a.nivel, updated_at: new Date().toISOString() })
          .eq('user_id', a.usuario)
        hecho.avisos++
      } else {
        console.error('aviso por correo', r?.status, await r?.text().catch(() => ''))
        hecho.avisos_error++
      }
    }
  }

  return json(hecho)
})
