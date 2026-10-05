import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { humanError, supabase } from '../../lib/supabase'
import { COMERCIO } from './comercio'
import { MarcoPublico } from './Publico'

// Libro de Reclamaciones virtual (INDECOPI): integrado en la web, sin formularios ni archivos externos. Lo puede
// llenar cualquiera, con o sin cuenta. Se guarda con un número correlativo (registrar_reclamo) y se muestra la
// constancia para imprimir o guardar en PDF.

type Hoja = {
  tipo: 'reclamo' | 'queja'
  nombre: string
  documento_tipo: 'DNI' | 'CE' | 'Pasaporte' | 'RUC'
  documento_numero: string
  domicilio: string
  telefono: string
  correo: string
  menor_de_edad: boolean
  apoderado: string
  bien_tipo: 'producto' | 'servicio'
  monto: string
  descripcion_bien: string
  detalle: string
  pedido: string
}

const VACIA: Hoja = {
  tipo: 'reclamo',
  nombre: '',
  documento_tipo: 'DNI',
  documento_numero: '',
  domicilio: '',
  telefono: '',
  correo: '',
  menor_de_edad: false,
  apoderado: '',
  bien_tipo: 'servicio',
  monto: '',
  descripcion_bien: '',
  detalle: '',
  pedido: '',
}

const hoy = () => new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ReclamacionesPage() {
  const [h, setH] = useState<Hoja>(VACIA)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [constancia, setConstancia] = useState<{ numero: number; fecha: string; hoja: Hoja } | null>(null)
  const set = <K extends keyof Hoja>(k: K, v: Hoja[K]) => setH((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (h.menor_de_edad && h.apoderado.trim().length < 3) return setError('Si eres menor de edad, escribe el nombre de tu padre, madre o apoderado.')
    const monto = h.monto.trim() ? Math.round(Number(h.monto.replace(',', '.')) * 100) : null
    if (monto !== null && (!Number.isFinite(monto) || monto < 0)) return setError('El monto tiene que ser un número (por ejemplo, 19.90).')
    setEnviando(true)
    const { data, error: err } = await supabase.rpc('registrar_reclamo' as never, {
      p: {
        tipo: h.tipo,
        nombre: h.nombre,
        documento_tipo: h.documento_tipo,
        documento_numero: h.documento_numero,
        domicilio: h.domicilio,
        telefono: h.telefono,
        correo: h.correo,
        menor_de_edad: h.menor_de_edad,
        apoderado: h.apoderado,
        bien_tipo: h.bien_tipo,
        monto_centimos: monto === null ? '' : String(monto),
        descripcion_bien: h.descripcion_bien,
        detalle: h.detalle,
        pedido: h.pedido,
      },
    } as never)
    setEnviando(false)
    if (err) {
      const m = humanError(err)
      return setError(/check constraint|violates/i.test(m) ? 'Revisa los datos: hay un campo muy corto o con un formato que no corresponde.' : m)
    }
    const r = data as unknown as { numero: number; fecha: string }
    setConstancia({ ...r, hoja: h })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const proveedor = (
    <div className="pub-rec-prov">
      <p>
        <b>{COMERCIO.titular}</b> · RUC {COMERCIO.ruc}
      </p>
      {COMERCIO.direccion && <p>Domicilio: {COMERCIO.direccion}</p>}
      <p>Web: {COMERCIO.web}</p>
    </div>
  )

  if (constancia) {
    const c = constancia.hoja
    const numero = `${String(constancia.numero).padStart(6, '0')}-${new Date(constancia.fecha).getFullYear()}`
    return (
      <MarcoPublico>
        <article className="pub-legal pub-rec">
          <h1>
            Hoja de {c.tipo === 'reclamo' ? 'reclamo' : 'queja'} <span className="pub-nowrap">N.° {numero}</span>
          </h1>
          <p className="pub-rec-ok">
            <Icon name="check" className="sm" /> Registrada el{' '}
            {new Date(constancia.fecha).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23' })}. Guarda esta constancia.
          </p>
          {proveedor}
          <dl className="pub-rec-dl">
            <dt>Consumidor</dt>
            <dd>
              {c.nombre} · {c.documento_tipo} {c.documento_numero}
            </dd>
            <dt>Domicilio</dt>
            <dd>{c.domicilio}</dd>
            <dt>Contacto</dt>
            <dd>
              {c.correo}
              {c.telefono ? ` · ${c.telefono}` : ''}
            </dd>
            {c.menor_de_edad && (
              <>
                <dt>Padre, madre o apoderado</dt>
                <dd>{c.apoderado}</dd>
              </>
            )}
            <dt>Bien contratado</dt>
            <dd>
              {c.bien_tipo === 'servicio' ? 'Servicio' : 'Producto'}: {c.descripcion_bien}
              {c.monto ? ` · Monto: S/ ${c.monto}` : ''}
            </dd>
            <dt>Detalle</dt>
            <dd>{c.detalle}</dd>
            <dt>Pedido</dt>
            <dd>{c.pedido}</dd>
          </dl>
          <p className="pub-rec-leyenda">
            Te responderemos al correo {c.correo} en un plazo máximo de 15 días hábiles. La formulación del reclamo no impide acudir a otras vías de solución de
            controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.
          </p>
          <div className="pub-hero-btns">
            <button className="btn" onClick={() => window.print()}>
              <Icon name="download" className="sm" /> Imprimir o guardar en PDF
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setConstancia(null)
                setH(VACIA)
              }}
            >
              Registrar otra
            </button>
          </div>
        </article>
      </MarcoPublico>
    )
  }

  return (
    <MarcoPublico>
      <article className="pub-legal pub-rec">
        <h1>Libro de Reclamaciones</h1>
        <p className="pub-legal-intro">
          Conforme al Código de Protección y Defensa del Consumidor, este establecimiento cuenta con un Libro de Reclamaciones a tu disposición. Fecha: {hoy()}.
        </p>
        {proveedor}
        <form className="pub-form" onSubmit={enviar}>
          <fieldset>
            <legend>1. Tus datos</legend>
            <label className="lbl" htmlFor="r-nombre">
              Nombre completo
            </label>
            <input id="r-nombre" required minLength={3} maxLength={120} value={h.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="name" />
            <div className="pub-form-fila">
              <div>
                <label className="lbl" htmlFor="r-doc-t">
                  Documento
                </label>
                <select id="r-doc-t" value={h.documento_tipo} onChange={(e) => set('documento_tipo', e.target.value as Hoja['documento_tipo'])}>
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="RUC">RUC</option>
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="r-doc">
                  Número
                </label>
                <input
                  id="r-doc"
                  required
                  minLength={6}
                  maxLength={20}
                  inputMode="numeric"
                  value={h.documento_numero}
                  onChange={(e) => set('documento_numero', e.target.value.trim())}
                />
              </div>
            </div>
            <label className="lbl" htmlFor="r-dom">
              Domicilio
            </label>
            <input id="r-dom" required minLength={5} maxLength={200} value={h.domicilio} onChange={(e) => set('domicilio', e.target.value)} autoComplete="street-address" />
            <div className="pub-form-fila">
              <div>
                <label className="lbl" htmlFor="r-correo">
                  Correo
                </label>
                <input id="r-correo" type="email" required maxLength={120} value={h.correo} onChange={(e) => set('correo', e.target.value)} autoComplete="email" />
              </div>
              <div>
                <label className="lbl" htmlFor="r-tel">
                  Teléfono (opcional)
                </label>
                <input id="r-tel" type="tel" maxLength={20} value={h.telefono} onChange={(e) => set('telefono', e.target.value)} autoComplete="tel" />
              </div>
            </div>
            <label className="checkline">
              <input type="checkbox" checked={h.menor_de_edad} onChange={(e) => set('menor_de_edad', e.target.checked)} /> Soy menor de edad
            </label>
            {h.menor_de_edad && (
              <>
                <label className="lbl" htmlFor="r-apo">
                  Nombre de tu padre, madre o apoderado
                </label>
                <input id="r-apo" required minLength={3} maxLength={160} value={h.apoderado} onChange={(e) => set('apoderado', e.target.value)} />
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>2. Lo que contrataste</legend>
            <div className="pub-form-fila">
              <div>
                <label className="lbl" htmlFor="r-bien">
                  Tipo
                </label>
                <select id="r-bien" value={h.bien_tipo} onChange={(e) => set('bien_tipo', e.target.value as Hoja['bien_tipo'])}>
                  <option value="servicio">Servicio</option>
                  <option value="producto">Producto</option>
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="r-monto">
                  Monto reclamado en S/ (opcional)
                </label>
                <input id="r-monto" inputMode="decimal" placeholder="19.90" value={h.monto} onChange={(e) => set('monto', e.target.value)} />
              </div>
            </div>
            <label className="lbl" htmlFor="r-desc">
              Descripción (por ejemplo, «Plan Plus mensual»)
            </label>
            <input id="r-desc" required minLength={3} maxLength={500} value={h.descripcion_bien} onChange={(e) => set('descripcion_bien', e.target.value)} />
          </fieldset>

          <fieldset>
            <legend>3. Tu reclamo o queja</legend>
            <div className="segmented pub-form-tipo" role="radiogroup" aria-label="Tipo">
              <button type="button" role="radio" aria-checked={h.tipo === 'reclamo'} onClick={() => set('tipo', 'reclamo')}>
                Reclamo
              </button>
              <button type="button" role="radio" aria-checked={h.tipo === 'queja'} onClick={() => set('tipo', 'queja')}>
                Queja
              </button>
            </div>
            <p className="hint">
              <b>Reclamo:</b> disconformidad con el producto o servicio. <b>Queja:</b> malestar con la atención, sin relación directa con el producto o
              servicio.
            </p>
            <label className="lbl" htmlFor="r-det">
              Detalle
            </label>
            <textarea id="r-det" required minLength={10} maxLength={3000} rows={5} value={h.detalle} onChange={(e) => set('detalle', e.target.value)} />
            <label className="lbl" htmlFor="r-ped">
              ¿Qué pides?
            </label>
            <textarea id="r-ped" required minLength={3} maxLength={1500} rows={3} value={h.pedido} onChange={(e) => set('pedido', e.target.value)} />
          </fieldset>

          <p className="pub-rec-leyenda">
            Te responderemos al correo que indiques en un plazo máximo de 15 días hábiles. La formulación del reclamo no impide acudir a otras vías de solución
            de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.
          </p>
          {error && (
            <p className="formerror" role="alert">
              {error}
            </p>
          )}
          <button className="btn" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar hoja'}
          </button>
        </form>
      </article>
    </MarcoPublico>
  )
}
