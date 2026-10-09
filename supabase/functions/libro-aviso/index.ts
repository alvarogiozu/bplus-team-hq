// Libro de Reclamaciones: por cada hoja nueva, 1) la copia al consumidor (constancia con su número, como pide
// INDECOPI) y 2) el aviso al dueño (contacto@rockie.plus reenvía a su correo), para responder dentro de 15 días hábiles.
// La llama el trigger libro_reclamaciones_avisar (pg_net) al registrarse una hoja, y cada hora un cron por si algo
// falló. Solo manda lo pendiente y lo marca: llamarla de más no reenvía nada. Sin RESEND_API_KEY no manda y las
// hojas quedan pendientes hasta que haya llave.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { COMERCIO, correoHtml, enviarCorreo, esc } from '../_shared/correo.ts'

type Hoja = {
  id: string
  numero: number
  created_at: string
  tipo: 'reclamo' | 'queja'
  nombre: string
  documento_tipo: string
  documento_numero: string
  domicilio: string
  telefono: string
  correo: string
  menor_de_edad: boolean
  apoderado: string
  bien_tipo: 'producto' | 'servicio'
  monto_centimos: number | null
  descripcion_bien: string
  detalle: string
  pedido: string
  copia_enviada_en: string | null
  aviso_dueno_en: string | null
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const num = (n: number) => String(n).padStart(6, '0')
const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' })

/** La hoja completa en una tabla (lo mismo para el consumidor y para el dueño). */
function tablaHoja(h: Hoja) {
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:6px 8px;color:#797593;font-size:13px;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 8px;color:#575279;font-size:14px">${v}</td></tr>`
  const texto = (s: string) => esc(s).replace(/\n/g, '<br>')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f2e9e1;border-radius:12px;border-collapse:separate">
${fila('Hoja N.º', `<b>${num(h.numero)}</b>`)}
${fila('Fecha', fecha(h.created_at))}
${fila('Proveedor', `${COMERCIO.nombre} · RUC ${COMERCIO.ruc} · ${COMERCIO.domicilio}`)}
${fila('Consumidor', `${esc(h.nombre)} · ${esc(h.documento_tipo)} ${esc(h.documento_numero)}`)}
${fila('Domicilio', esc(h.domicilio))}
${fila('Contacto', [esc(h.correo), esc(h.telefono)].filter(Boolean).join(' · '))}
${h.menor_de_edad ? fila('Menor de edad', `Sí · apoderado: ${esc(h.apoderado) || '—'}`) : ''}
${fila('Bien contratado', `${h.bien_tipo === 'producto' ? 'Producto' : 'Servicio'} · ${esc(h.descripcion_bien)}${h.monto_centimos != null ? ` · S/ ${(h.monto_centimos / 100).toFixed(2)}` : ''}`)}
${fila(h.tipo === 'reclamo' ? 'Reclamo' : 'Queja', texto(h.detalle))}
${fila('Pedido', texto(h.pedido))}
</table>`
}

const AYUDA =
  '<span style="font-size:13px;color:#797593">Reclamo: disconformidad con lo que compraste o contrataste. Queja: malestar con la atención, sin relación directa con lo contratado.</span>'

function copiaConsumidor(h: Hoja) {
  const que = h.tipo === 'reclamo' ? 'reclamo' : 'queja'
  return {
    asunto: `Tu ${que} N.º ${num(h.numero)} — Libro de Reclamaciones de Rockie`,
    html: correoHtml(
      `Recibimos tu ${que}`,
      [
        `Hola ${esc(h.nombre.split(' ')[0])}, esta es la copia de tu hoja del Libro de Reclamaciones. Guárdala: el número <b>${num(h.numero)}</b> es tu constancia.`,
        tablaHoja(h),
        `Te responderemos a este correo en un plazo máximo de <b>15 días hábiles</b>. ${AYUDA}`,
        'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.',
      ],
      'Te escribimos porque registraste esta hoja en el Libro de Reclamaciones de rockie.plus.',
    ),
  }
}

function avisoDueno(h: Hoja) {
  const que = h.tipo === 'reclamo' ? 'Reclamo' : 'Queja'
  const limite = new Date(new Date(h.created_at).getTime() + 21 * 86400000) // ~15 días hábiles
  return {
    asunto: `[Libro] ${que} N.º ${num(h.numero)} de ${h.nombre} — responder antes del ${limite.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' })}`,
    html: correoHtml(
      `${que} nueva en el Libro`,
      [
        `Llegó la hoja <b>${num(h.numero)}</b>. Por ley hay que responderla en <b>15 días hábiles</b> (como mucho el ${limite.toLocaleDateString('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' })}). Responder a este correo le escribe al consumidor.`,
        tablaHoja(h),
        'Al responder, anota la respuesta y la fecha en la hoja (tabla libro_reclamaciones: respuesta y respondido_en) desde el panel de Supabase.',
      ],
      'Aviso interno del Libro de Reclamaciones de rockie.plus.',
    ),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!Deno.env.get('RESEND_API_KEY')) return json({ ok: true, enviados: 0, nota: 'sin RESEND_API_KEY: quedan pendientes' })

  const { data, error } = await admin
    .from('libro_reclamaciones')
    .select('*')
    .or('copia_enviada_en.is.null,aviso_dueno_en.is.null')
    .order('numero')
    .limit(20)
  if (error) return json({ error: error.message }, 500)

  const dueno = Deno.env.get('LIBRO_AVISAR_A') || COMERCIO.correo
  const hecho = { copias: 0, avisos: 0, errores: 0 }
  for (const h of (data ?? []) as Hoja[]) {
    if (!h.copia_enviada_en) {
      const c = copiaConsumidor(h)
      if (await enviarCorreo({ para: [h.correo], asunto: c.asunto, html: c.html })) {
        await admin.from('libro_reclamaciones').update({ copia_enviada_en: new Date().toISOString() }).eq('id', h.id)
        hecho.copias++
      } else hecho.errores++
    }
    if (!h.aviso_dueno_en) {
      const a = avisoDueno(h)
      if (await enviarCorreo({ para: [dueno], asunto: a.asunto, html: a.html, responderA: h.correo })) {
        await admin.from('libro_reclamaciones').update({ aviso_dueno_en: new Date().toISOString() }).eq('id', h.id)
        hecho.avisos++
      } else hecho.errores++
    }
  }
  return json({ ok: true, ...hecho })
})
