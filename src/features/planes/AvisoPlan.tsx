import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { pagoEnLinea } from '../../lib/culqi'
import { NOMBRE_PLAN, usePlan, type MiPlan } from '../../lib/planes'
import type { Periodo, PlanPago } from '../../lib/precios'
import { supabase } from '../../lib/supabase'
import { useIrAPlanes } from './Limite'
import './planes.css'

// El aviso de tu plan, con Rockie: vence pronto, venció (3 días de gracia), no se pudo renovar con tu tarjeta,
// volviste a Gratis… Siempre con el botón para resolverlo ahí mismo (renovar = dos toques) y, si ayuda, lo que
// hiciste este mes (solo cantidades). Nunca bloquea: se cierra con «Ahora no» y vuelve a su tiempo.

const ComprarPlan = lazy(() => import('./Comprar').then((m) => ({ default: m.ComprarPlan })))

type Accion = { texto: string; hacer: 'renovar' | 'club' | 'planes'; space?: string; periodo?: Periodo }
type Aviso = {
  /** para no repetirlo: se guarda cuándo lo cerraste */
  clave: string
  /** días hasta volver a mostrarlo después de cerrarlo */
  cada: number
  tono: 'info' | 'urgente' | 'suave'
  titulo: string
  texto: string
  accion?: Accion
  resumen?: boolean
}

const K = 'rockie.avisos'
const DIA = 864e5

function cerrados(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(K) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function cerrar(clave: string) {
  try {
    const c = cerrados()
    // se guardan los últimos 30 (los viejos no sirven)
    const todo = Object.entries({ ...c, [clave]: Date.now() }).sort((a, b) => b[1] - a[1]).slice(0, 30)
    localStorage.setItem(K, JSON.stringify(Object.fromEntries(todo)))
  } catch {
    /* sin almacenamiento: vuelve a salir la próxima vez */
  }
}

const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** «hoy», «mañana», «ayer» o «el viernes 14 de noviembre» */
function cuando(iso: string) {
  const d = new Date(iso)
  const dias = Math.round((inicio(d) - inicio(new Date())) / DIA)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias === -1) return 'ayer'
  return `el ${d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}`
}

function elegirAviso(p: MiPlan, nombres: Record<string, string>): Aviso | null {
  const s = p.suscripcion
  const ren = p.renovacion
  const nombre = s ? NOMBRE_PLAN[s.plan] : ''
  const hoy = new Date()
  const mes = hoy.getMonth() + 1
  // marzo y agosto: empiezan los ciclos en el Perú
  const clases = (mes === 3 || mes === 8) && hoy.getDate() <= 21

  if (s?.hasta && (p.estado === 'por_vencer' || p.estado === 'gracia')) {
    if (ren?.activa && ren.intentos > 0) {
      return {
        clave: `falla:${s.hasta}:${ren.intentos}`,
        cada: 1,
        tono: 'urgente',
        titulo: `No pudimos renovar tu ${nombre}`,
        texto: `${ren.error || 'El banco no aprobó el cobro.'}${p.estado === 'gracia' && s.gracia_hasta ? ` Lo mantienes hasta ${cuando(s.gracia_hasta)}.` : ''} Renuévalo con Yape u otra tarjeta.`,
        accion: { texto: 'Renovar ahora', hacer: 'renovar' },
      }
    }
    if (ren?.activa && p.estado === 'por_vencer') {
      return {
        clave: `renueva:${s.hasta}`,
        cada: 999,
        tono: 'suave',
        titulo: `Tu ${nombre} se renueva ${cuando(s.hasta)}`,
        texto: `Con tu ${ren.marca ?? 'tarjeta'}${ren.ultimos4 ? ` •••• ${ren.ultimos4}` : ''}. No tienes que hacer nada.`,
        accion: { texto: 'Ver mi plan', hacer: 'planes' },
      }
    }
    if (p.estado === 'por_vencer') {
      return {
        clave: `vence:${s.hasta}`,
        cada: 1,
        tono: 'info',
        titulo: `Tu ${nombre} vence ${cuando(s.hasta)}`,
        texto: 'Renuévalo en dos toques y sigue sin límites.',
        accion: { texto: 'Renovar', hacer: 'renovar' },
        resumen: true,
      }
    }
    return {
      clave: `gracia:${s.hasta}`,
      cada: 1,
      tono: 'urgente',
      titulo: `Tu ${nombre} venció`,
      texto: `Te lo guardamos hasta ${cuando(s.gracia_hasta ?? s.hasta)}. Renuévalo y no pierdes nada.`,
      accion: { texto: 'Renovar', hacer: 'renovar' },
      resumen: true,
    }
  }
  if (s?.pausa_hasta && p.estado === 'pausado' && new Date(s.pausa_hasta).getTime() - Date.now() < 3 * DIA) {
    return {
      clave: `pausa:${s.pausa_hasta}`,
      cada: 999,
      tono: 'suave',
      titulo: `Tu pausa termina ${cuando(s.pausa_hasta)}`,
      texto: `Tu ${nombre} vuelve solo, con los ${s.pausa_restante_dias ?? ''} días que te quedaban.`,
      accion: { texto: 'Ver mi plan', hacer: 'planes' },
    }
  }
  if (s && p.estado === 'vencido') {
    return {
      clave: `vencido:${s.hasta}`,
      cada: 3,
      tono: 'suave',
      titulo: clases ? 'Empieza el ciclo: ¿volvemos?' : 'Volviste a Gratis',
      texto: `Todo lo que creaste sigue aquí. Tu ${nombre} te espera como lo dejaste.`,
      accion: { texto: `Volver a ${nombre}`, hacer: 'renovar' },
    }
  }
  if (p.plan === 'gratis' && p.ultimo_pago && clases) {
    const n = NOMBRE_PLAN[p.ultimo_pago.plan]
    return {
      clave: `clases:${hoy.getFullYear()}-${mes}`,
      cada: 7,
      tono: 'suave',
      titulo: 'Empieza el ciclo: ¿volvemos?',
      texto: `Tu ${n} te espera con todo como lo dejaste.`,
      accion: { texto: `Volver a ${n}`, hacer: 'renovar' },
    }
  }
  for (const c of p.clubes) {
    if (c.renovacion?.activa && c.renovacion.intentos === 0) continue
    const n = nombres[c.space_id] ? `«${nombres[c.space_id]}»` : 'tu club'
    const accion: Accion = { texto: 'Renovar', hacer: 'club', space: c.space_id, periodo: c.renovacion?.periodo }
    if (c.estado === 'por_vencer') {
      return { clave: `club:${c.space_id}:${c.hasta}`, cada: 1, tono: 'info', titulo: `El plan Club de ${n} vence ${cuando(c.hasta)}`, texto: 'Renuévalo para que tus miembros sigan sin límites.', accion }
    }
    if (c.estado === 'gracia') {
      return {
        clave: `club-gracia:${c.space_id}:${c.hasta}`,
        cada: 1,
        tono: 'urgente',
        titulo: `El plan Club de ${n} venció`,
        texto: 'Se lo guardamos 3 días más. Renuévalo y tu equipo no pierde nada.',
        accion,
      }
    }
  }
  return null
}

export default function AvisoPlan() {
  const plan = usePlan()
  const ir = useIrAPlanes()
  const [visible, setVisible] = useState(false)
  const [, refrescar] = useState(0)
  const [comprar, setComprar] = useState<{ plan: PlanPago; periodo?: Periodo; equipo?: string } | null>(null)

  const ids = plan.clubes.map((c) => c.space_id)
  const nombres = useQuery({
    queryKey: ['planes', 'clubes-nombres', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 600_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('spaces').select('id, name').in('id', ids)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((s) => [s.id, s.name])) as Record<string, string>
    },
  })
  const aviso = useMemo(() => (plan.cargado ? elegirAviso(plan, nombres.data ?? {}) : null), [plan, nombres.data])
  const yaCerrado = aviso ? Date.now() - (cerrados()[aviso.clave] ?? 0) < aviso.cada * DIA : true

  const resumen = useQuery({
    queryKey: ['planes', 'resumen'],
    enabled: Boolean(aviso?.resumen && !yaCerrado),
    staleTime: 600_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mi_resumen' as never)
      if (error) throw error
      return data as unknown as { mensajes: number; notas: number; hechas: number }
    },
  })

  // un momento después de abrir: que no aparezca encima de todo de golpe
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [])

  if (comprar) {
    return (
      <Suspense fallback={null}>
        <ComprarPlan
          plan={comprar.plan}
          periodo={comprar.periodo}
          equipo={comprar.equipo}
          estudiante={Boolean(plan.estudiante_hasta)}
          onClose={() => setComprar(null)}
        />
      </Suspense>
    )
  }
  if (!visible || !aviso || yaCerrado) return null

  const listo = () => {
    cerrar(aviso.clave)
    refrescar((n) => n + 1)
  }
  // sin pago en línea (todavía con la llave de prueba de Culqi), renovar es con código: se va a Tu plan
  const enLinea = pagoEnLinea()
  const accion = aviso.accion && !enLinea && aviso.accion.hacer !== 'planes' ? { texto: 'Ver mi plan', hacer: 'planes' as const } : aviso.accion
  const hacer = (a: Accion) => {
    if (a.hacer === 'planes') {
      listo()
      return ir()
    }
    if (a.hacer === 'club') return setComprar({ plan: 'club', equipo: a.space, periodo: a.periodo })
    const ult = plan.ultimo_pago
    const p = (ult?.plan ?? plan.suscripcion?.plan ?? 'plus') as PlanPago
    setComprar({ plan: p, periodo: ult?.plan === p ? ult.periodo : undefined })
  }
  const r = resumen.data
  const cifras = r
    ? [
        r.hechas > 0 && `${r.hechas} ${r.hechas === 1 ? 'cosa hecha' : 'cosas hechas'}`,
        r.notas > 0 && `${r.notas} ${r.notas === 1 ? 'nota' : 'notas'}`,
        r.mensajes > 0 && `${r.mensajes} ${r.mensajes === 1 ? 'mensaje' : 'mensajes'} con Rockie`,
      ].filter(Boolean)
    : []

  return (
    <aside className={`pl-aviso ${aviso.tono}`} role="status" aria-live="polite" aria-label="Tu plan">
      <span className="pl-aviso-rk">
        <Rockie size={46} sleepy={aviso.tono === 'urgente'} />
      </span>
      <div className="pl-aviso-cuerpo">
        <b className="pl-aviso-t">{aviso.titulo}</b>
        <p>{aviso.texto}</p>
        {cifras.length > 0 && (
          <p className="pl-aviso-mes">
            <Icon name="flame" className="sm" /> En 30 días: {cifras.join(' · ')}
          </p>
        )}
        <div className="pl-aviso-acc">
          {accion && (
            <button className="btn sm" onClick={() => hacer(accion)}>
              {accion.texto}
            </button>
          )}
          <button className="btn ghost sm" onClick={listo}>
            Ahora no
          </button>
        </div>
      </div>
      <button className="pl-aviso-x" aria-label="Cerrar aviso" onClick={listo}>
        <Icon name="close" className="sm" />
      </button>
    </aside>
  )
}
