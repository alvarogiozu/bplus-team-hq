// Correos de Rockie por Resend: la plantilla con la cara de Rockie y el envío.
// (planes-renovar todavía tiene su propia copia de la plantilla; esta es la que deben usar las funciones nuevas.)

// quién cobra, como en la web (copia de src/features/publico/comercio.ts: si cambia allá, cambia aquí)
export const COMERCIO = {
  nombre: 'ZUÑIGA CANAZAS ALVARO GIOVANNI',
  ruc: '10765450981',
  domicilio: 'Miraflores, Lima, Perú',
  correo: 'contacto@rockie.plus',
}

export const PIE_COMERCIO =
  `Rockie · ${COMERCIO.nombre} · RUC ${COMERCIO.ruc} · ${COMERCIO.domicilio}<br>` +
  `<a href="https://rockie.plus" style="color:#9893a5">rockie.plus</a> · ${COMERCIO.correo} · ` +
  '<a href="https://rockie.plus/libro-de-reclamaciones" style="color:#9893a5">Libro de Reclamaciones</a>'

/** Lo que escribió una persona, listo para ir dentro del HTML sin romperlo. */
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Un correo sencillo con la cara de Rockie. `bloques` es HTML ya armado (escapa lo que venga de personas con esc);
 * `motivo` es la línea de abajo que explica por qué le escribimos.
 */
export function correoHtml(titulo: string, bloques: string[], motivo: string, boton?: { texto: string; url: string }) {
  const p = bloques.map((x) => `<div style="margin:0 0 14px;color:#575279;font-size:15px;line-height:1.5">${x}</div>`).join('')
  const b = boton
    ? `<p style="text-align:center;margin:22px 0 8px"><a href="${boton.url}" style="display:inline-block;background:#2e88aa;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:999px;font-size:15px">${boton.texto}</a></p>`
    : ''
  return `<!doctype html><html lang="es"><body style="margin:0;background:#faf4ed;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf4ed;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffaf3;border:1.5px solid #f2e9e1;border-radius:18px;padding:28px 24px">
<tr><td style="text-align:center;padding-bottom:12px"><img src="https://rockie.plus/pagos/rockie-logo.png" width="72" height="72" alt="Rockie" style="border-radius:18px"></td></tr>
<tr><td><h1 style="margin:0 0 14px;color:#286983;font-size:21px;line-height:1.3;text-align:center">${titulo}</h1>${p}${b}
<p style="margin:18px 0 0;color:#9893a5;font-size:12px;line-height:1.5;text-align:center">${motivo}<br>${PIE_COMERCIO}</p>
</td></tr></table></td></tr></table></body></html>`
}

/** Manda un correo. Sin RESEND_API_KEY no manda nada y devuelve false (quien llama lo deja pendiente). */
export async function enviarCorreo(c: { para: string[]; asunto: string; html: string; responderA?: string }): Promise<boolean> {
  const llave = Deno.env.get('RESEND_API_KEY')
  if (!llave) return false
  const remitente = Deno.env.get('CORREO_REMITENTE') || 'Rockie <avisos@rockie.plus>'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: remitente, to: c.para, subject: c.asunto, html: c.html, reply_to: c.responderA ?? COMERCIO.correo }),
  }).catch(() => null)
  if (!r?.ok) console.error('resend', r?.status, r ? (await r.text()).slice(0, 200) : 'sin respuesta')
  return Boolean(r?.ok)
}
