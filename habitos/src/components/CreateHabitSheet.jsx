import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import CenterModal from './CenterModal.jsx'
import TimePickerField from './TimePickerField.jsx'
import { fmtTime, parseTime } from './ClockDial.jsx'
import { typeOf, edgeOf } from '../data/habitTypes.js'
import { AREA_LIBRE, areaOf } from '../data/areas.js'
import IconColorPicker from './IconColorPicker.jsx'
import MetaIcon from './MetaIcon.jsx'
import BrandIcon from './BrandIcon.jsx'
import '../routes/Habitos.css'

// --- Crear / editar habito: modal centrado en 3 pasos que se empujan de lado ---
// 'form'  : circulo de icono (izq) + nombre (der), hora y dias. El circulo abre 'icon'.
// 'icon'  : panel "Color e icono" -> paleta de colores arriba + iconos por categoria.
// 'time'  : picker de hora (reloj <-> rueda).
// Icono/color se guardan en el habito (habitLook los pinta en toda la app) y aplican
// igual a crear y a editar (mismo componente, prop editHabit).
// `withMeta` (solo al CREAR): bloque opcional Area -> Meta. El habito NO tiene
// area propia (doc 23): la hereda de las metas que alimenta. Aqui se filtra /
// agrupa por area de forma dinamica (catalogo del store, incl. custom).
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DEFAULT_MINS = 8 * 60
const DEFAULT_DAYS = [0, 0, 0, 0, 0, 0, 0]  // todos apagados: el usuario elige dia a dia

export default function CreateHabitSheet({ open, onClose, onCreate, editHabit, prefill = null, withMeta = true }) {
  const { metas, areas, createMeta } = useStore()
  const isEdit = !!editHabit
  // prefill: sembrar un habito NUEVO con datos de una sugerencia (nombre/tipo/
  // hora/dias) para que el usuario los CONFIRME/ajuste antes de crear. Solo
  // aplica al crear (no en edicion, donde manda editHabit).
  const seed = editHabit ?? prefill
  const [name, setName] = useState(seed?.name ?? '')
  const [type, setType] = useState(seed?.type ?? 'salud')
  const [icon, setIcon] = useState(seed?.icon ?? null)    // null = icono del tipo
  const [color, setColor] = useState(seed?.color ?? null) // null = color del tipo
  const [days, setDays] = useState(seed?.days ?? DEFAULT_DAYS)
  const [mins, setMins] = useState(seed?.time ? parseTime(seed.time) : DEFAULT_MINS)
  const [planting, setPlanting] = useState(false)
  const [step, setStep] = useState('form')   // 'form' | 'icon' | 'time'
  const [metaSel, setMetaSel] = useState(() => new Set())  // metas a enlazar al crear
  const [areaFiltro, setAreaFiltro] = useState('todas')     // 'todas' | areaId | 'libre'
  const [hint, setHint] = useState('')                     // aviso si falta nombre/dias al ir a meta
  const [shareSocial, setShareSocial] = useState(true)     // default publico: perfil + Juntos
  const [creandoMeta, setCreandoMeta] = useState(false)    // input inline para crear meta sin romper flujo
  const [nuevaMetaTxt, setNuevaMetaTxt] = useState('')
  const [showMetaInfo, setShowMetaInfo] = useState(false)   // explica por que vincular una meta a nuevos usuarios

  // Metas agrupadas por area (catalogo vivo del store). Cambia solo si crean
  // /borran areas o metas — la UI se actualiza sola.
  const gruposMeta = useMemo(() => {
    const byId = Object.fromEntries(areas.map(a => [a.id, []]))
    const libres = []
    for (const m of metas) {
      if (m.areaId && byId[m.areaId]) byId[m.areaId].push(m)
      else libres.push(m)
    }
    const grupos = areas
      .map(a => ({ area: a, metas: byId[a.id] || [] }))
      .filter(g => g.metas.length > 0)
    if (libres.length) grupos.push({ area: AREA_LIBRE, metas: libres })
    return grupos
  }, [metas, areas])

  const gruposVisibles = useMemo(() => {
    if (areaFiltro === 'todas') return gruposMeta
    if (areaFiltro === 'libre') return gruposMeta.filter(g => g.area.id == null)
    return gruposMeta.filter(g => g.area.id === areaFiltro)
  }, [gruposMeta, areaFiltro])

  // Chips de filtro: solo areas que tienen al menos una meta (+ Todas)
  const filtrosArea = useMemo(() => {
    const conMetas = gruposMeta.map(g => g.area)
    if (conMetas.length <= 1) return []  // sin filtro si hay 0-1 grupos
    return [{ id: 'todas', name: 'Todas', icon: 'ti-layout-grid', color: 'var(--ink-soft)' }, ...conMetas]
  }, [gruposMeta])

  useEffect(() => {
    if (!open) return
    setStep('form')
    if (editHabit) {
      setName(editHabit.name)
      setType(editHabit.type)
      setIcon(editHabit.icon ?? null)
      setColor(editHabit.color ?? null)
      setDays(editHabit.days)
      setMins(parseTime(editHabit.time))
      setShareSocial(editHabit.shareSocial !== false)
    } else if (prefill) {
      // Sugerencia adoptada: precarga sus datos pero deja al usuario ajustarlos
      setName(prefill.name ?? '')
      setType(prefill.type ?? 'salud')
      setIcon(prefill.icon ?? null)
      setColor(prefill.color ?? null)
      setDays(prefill.days ?? DEFAULT_DAYS)
      setMins(prefill.time ? parseTime(prefill.time) : DEFAULT_MINS)
      setShareSocial(prefill.shareSocial !== false)
    } else {
      setName('')
      setType('salud')
      setIcon(null)
      setColor(null)
      setDays([...DEFAULT_DAYS])
      setMins(DEFAULT_MINS)
      setShareSocial(true)
    }
    setMetaSel(new Set())
    setAreaFiltro('todas')
    setHint('')
    setPlanting(false)
  }, [open, editHabit, prefill])

  // Un habito puede alimentar varias metas. "Nueva meta" NO es un toggle:
  // crea el habito YA y abre CrearMetaFlow encima (slide der→izq) con el
  // habito preseleccionado — sin pasar por la pestana Metas.
  const toggleMeta = (id) => {
    setHint('')
    setMetaSel(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Look efectivo del borrador: lo custom o, si no, el del tipo
  const look = {
    icon: icon || typeOf(type).icon,
    color: color || typeOf(type).color,
  }

  const baseline = isEdit ? parseTime(editHabit.time) : DEFAULT_MINS

  const toggleDay = (i) => {
    setDays(prev => prev.map((d, idx) => (idx === i ? (d ? 0 : 1) : d)))
  }

  const resetForm = () => {
    setName('')
    setType('salud')
    setIcon(null)
    setColor(null)
    setDays([...DEFAULT_DAYS])
    setMins(DEFAULT_MINS)
    setShareSocial(true)
    setMetaSel(new Set())
    setAreaFiltro('todas')
    setHint('')
    setStep('form')
    setCreandoMeta(false)
    setNuevaMetaTxt('')
    setShowMetaInfo(false)
  }

  const allDaysSelected = days.every(d => d === 1)
  const toggleDiario = () => {
    if (navigator.vibrate) navigator.vibrate(6)
    if (allDaysSelected) setDays([0, 0, 0, 0, 0, 0, 0])
    else setDays([1, 1, 1, 1, 1, 1, 1])
  }

  const handleCrearMetaDirecta = () => {
    const nombreMeta = nuevaMetaTxt.trim()
    if (!nombreMeta) return
    const m = createMeta({ nombre: nombreMeta })
    if (m) {
      setMetaSel(prev => new Set(prev).add(m.id))
      if (navigator.vibrate) navigator.vibrate(6)
    }
    setNuevaMetaTxt('')
    setCreandoMeta(false)
  }

  const buildPayload = (nuevaMeta) => {
    const payload = { name: name.trim(), type, time: fmtTime(mins), days, icon, color, shareSocial, metaIds: [...metaSel], nuevaMeta }
    if (prefill?.photo) payload.photo = prefill.photo
    return payload
  }

  const handleCreate = () => {
    if (!puedeCrear) return
    setPlanting(true)
    if (navigator.vibrate) navigator.vibrate(6)
    if (isEdit) onCreate(editHabit.id, { name: name.trim(), type, time: fmtTime(mins), days, icon, color, shareSocial })
    else onCreate(buildPayload(false))
    setTimeout(() => {
      setPlanting(false)
      onClose()
      resetForm()
    }, 600)
  }

  // Tap en "+ Nueva meta": crea el habito y abre el flujo de meta YA (mismo
  // sitio, sin redirigir a /metas). Auto-completa dias si no estaban elegidos.
  const irANuevaMeta = () => {
    const habitDays = days.some(d => d === 1) ? days : [1, 1, 1, 1, 1, 1, 1]
    const habitName = name.trim() || 'Nuevo habito'
    if (planting) return
    setPlanting(true)
    setHint('')
    if (navigator.vibrate) navigator.vibrate(6)
    onCreate({
      name: habitName, type, time: fmtTime(mins), days: habitDays, icon, color, shareSocial, metaIds: [...metaSel], nuevaMeta: true,
      ...(prefill?.photo ? { photo: prefill.photo } : {}),
    })
    // Cierra el modal rapido para que entre el slide de CrearMetaFlow
    setTimeout(() => {
      setPlanting(false)
      onClose()
      resetForm()
    }, 180)
  }

  const puedeCrear = name.trim() && days.some(d => d === 1) && !planting

  // Restaurar el scroll del modal al cambiar de paso
  useEffect(() => {
    const card = document.querySelector('.center-modal-card')
    if (card) card.scrollTop = 0
  }, [step])

  return (
    <CenterModal open={open} onClose={() => { setStep('form'); onClose() }}>
      {/* Paso 1: formulario principal */}
      {step === 'form' && (
        <motion.div
          key="form"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
            {/* Hero: circulo de icono (abre "Color e icono") + nombre */}
            <div className="create-habit-hero" style={{ paddingRight: 32 }}>
              <button
                type="button"
                className="create-habit-avatar"
                onClick={() => setStep('icon')}
                style={{ background: look.color, boxShadow: `0 3px 0 ${edgeOf(look.color)}` }}
                aria-label="Cambiar color e icono"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.i
                    key={look.icon}
                    className={`ti ${look.icon}`}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                  />
                </AnimatePresence>
                <span className="create-habit-avatar-edit"><i className="ti ti-pencil" /></span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="q create-habit-label" style={{ marginBottom: 'var(--space-1)' }}>
                  {isEdit ? 'EDITAR HABITO' : 'NUEVO HABITO'}
                </div>
                <input
                  className="q create-habit-name create-habit-name--hero"
                  placeholder="Nombre del habito"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {/* Hora: campo compacto que abre el picker (reloj <-> rueda) */}
            <div>
              <div className="q create-habit-label">HORA</div>
              <button type="button" className="create-habit-time" onClick={() => setStep('time')}>
                <span
                  className="create-habit-time-ico"
                  style={{ background: `color-mix(in srgb, ${look.color} 14%, #fff)`, color: look.color }}
                ><i className="ti ti-clock" /></span>
                <span className="s create-habit-time-val">{fmtTime(mins)}</span>
                <span className="q create-habit-time-cta">Cambiar <i className="ti ti-chevron-right" /></span>
              </button>
            </div>

            {/* Dias: arrancan apagados; el usuario puede marcar uno a uno o todo en 1 tap */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                <div className="q create-habit-label">DIAS</div>
                <button
                  type="button"
                  onClick={toggleDiario}
                  className="q"
                  style={{
                    background: allDaysSelected ? 'var(--olive)' : 'var(--card-input, rgba(255,255,255,0.06))',
                    border: '1px solid var(--card-line)',
                    color: allDaysSelected ? '#fff' : 'var(--ink-soft)',
                    borderRadius: 'var(--r-pill)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-3xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <i className="ti ti-calendar-repeat" />
                  {allDaysSelected ? 'Todos marcados' : 'Marcar diario'}
                </button>
              </div>
              <div className="create-habit-days">
                {DAY_LABELS.map((d, i) => {
                  const on = days[i] === 1
                  return (
                    <button
                      key={d}
                      type="button"
                      className="q create-habit-day"
                      style={{
                        background: on ? look.color : 'var(--paper-alt)',
                        color: on ? '#fff' : 'var(--ink-muted)',
                        boxShadow: on ? `0 2px 0 ${edgeOf(look.color)}` : undefined,
                      }}
                      onClick={() => toggleDay(i)}
                    >{d}</button>
                  )
                })}
              </div>
              {!days.some(d => d === 1) && (
                <div className="q" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                  Elige al menos un dia
                </div>
              )}
            </div>

            {/* Area -> Meta (opcional): el habito hereda el area de sus metas.
                Filtro + grupos dinamicos segun catalogo del store. */}
            {!isEdit && withMeta && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div className="q create-habit-label">META (OPCIONAL)</div>
                  <button
                    type="button"
                    onClick={() => setShowMetaInfo(v => !v)}
                    className="q"
                    aria-label="Informacion sobre metas"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: showMetaInfo ? 'var(--olive)' : 'var(--ink-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 'var(--text-3xs)',
                      fontWeight: 600,
                      padding: '2px 4px',
                    }}
                  >
                    <i className="ti ti-info-circle" style={{ fontSize: 'var(--text-xs)' }} />
                    {showMetaInfo ? 'Ocultar info' : '¿Que es una meta?'}
                  </button>
                </div>

                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginBottom: 'var(--space-2)', lineHeight: 1.35 }}>
                  Vincula tu habito a una meta para ver tu progreso a largo plazo y sumar a su area.
                </div>

                {showMetaInfo && (
                  <div
                    style={{
                      background: 'var(--card-input, rgba(255,255,255,0.05))',
                      border: '1px solid var(--card-line)',
                      borderRadius: 'var(--r-md)',
                      padding: 'var(--space-2) var(--space-3)',
                      marginBottom: 'var(--space-2)',
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-soft)',
                      lineHeight: 1.4,
                    }}
                  >
                    🎯 <b>¿Por que vincular una meta?</b> El habito es la accion que repites cada dia (ej: <i>Correr 20 min</i>); la meta es el gran proposito que quieres alcanzar (ej: <i>Maraton 10K</i>). Al cumplir este habito, sumas avances directos a tu meta.
                  </div>
                )}

                {filtrosArea.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                    {filtrosArea.map(a => {
                      const fid = a.id == null ? 'libre' : a.id
                      const on = areaFiltro === fid
                      return (
                        <button
                          key={fid}
                          type="button"
                          onClick={() => setAreaFiltro(fid)}
                          className="q"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px var(--space-2)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                            fontSize: 'var(--text-3xs)', fontWeight: 700,
                            border: on ? 'none' : '2px solid var(--card-line)',
                            background: on ? a.color : 'var(--card)',
                            color: on ? '#fff' : (a.color || 'var(--ink-soft)'),
                            boxShadow: on && a.edge ? `0 2px 0 ${a.edge}` : '0 2px 0 var(--card-edge)',
                          }}
                        >
                          <BrandIcon name={a.brandIcon || a.icon || a.id} fallback={a.icon} size={14} />
                          {a.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {gruposVisibles.map(({ area, metas: ms }) => (
                    <div key={area.id ?? 'libre'}>
                      {areaFiltro === 'todas' && gruposMeta.length > 1 && (
                        <div className="q" style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: '0.8px',
                          textTransform: 'uppercase', color: area.color, marginBottom: 'var(--space-1)',
                        }}>
                          <BrandIcon name={area.brandIcon || area.icon || area.id} fallback={area.icon} size={13} />
                          {area.name}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {ms.map(m => {
                          const on = metaSel.has(m.id)
                          const areaMeta = areaOf(m.areaId, areas)
                          return (
                            <button
                              key={m.id} type="button" onClick={() => toggleMeta(m.id)}
                              className="q"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                                fontSize: 'var(--text-xs)', fontWeight: 700,
                                border: on ? 'none' : '2px solid var(--card-line)',
                                background: on ? m.color : 'var(--card)',
                                color: on ? '#fff' : 'var(--ink-soft)',
                                boxShadow: on ? `0 2px 0 ${edgeOf(m.color)}` : '0 2px 0 var(--card-edge)',
                                transition: 'background 0.15s ease, color 0.15s ease',
                              }}
                            >
                              <MetaIcon meta={m} size={13} boxed={on} />
                              {m.name}
                              {areaFiltro === 'todas' && areaMeta.id && (
                                <BrandIcon name={areaMeta.brandIcon || areaMeta.icon || areaMeta.id} fallback={areaMeta.icon} size={12} style={{ opacity: 0.9 }} />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Crear nueva meta directamente sin romper el flujo */}
                  {creandoMeta ? (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', width: '100%', marginTop: 2 }}>
                      <input
                        autoFocus
                        className="q"
                        placeholder="Nombre de la nueva meta..."
                        value={nuevaMetaTxt}
                        onChange={e => setNuevaMetaTxt(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCrearMetaDirecta()
                          if (e.key === 'Escape') { setCreandoMeta(false); setNuevaMetaTxt('') }
                        }}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)',
                          border: '2px solid var(--olive)',
                          background: 'var(--card-input, rgba(255,255,255,0.06))',
                          color: 'var(--ink)',
                          fontSize: 'var(--text-xs)',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleCrearMetaDirecta}
                        disabled={!nuevaMetaTxt.trim()}
                        className="q"
                        style={{
                          padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)',
                          background: 'var(--olive)', color: '#fff', border: 'none',
                          fontWeight: 700, fontSize: 'var(--text-xs)',
                          cursor: nuevaMetaTxt.trim() ? 'pointer' : 'default',
                          opacity: nuevaMetaTxt.trim() ? 1 : 0.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Crear
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCreandoMeta(false); setNuevaMetaTxt('') }}
                        aria-label="Cancelar"
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          border: 'none', background: 'transparent',
                          color: 'var(--ink-muted)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                      >
                        <i className="ti ti-x" />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button" onClick={() => setCreandoMeta(true)}
                        className="q"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                          fontSize: 'var(--text-xs)', fontWeight: 700,
                          border: '2px dashed var(--olive)',
                          background: 'var(--card)',
                          color: 'var(--olive)',
                        }}
                      >
                        <i className="ti ti-plus" style={{ fontSize: 'var(--text-xs)' }} /> Nueva meta
                      </button>
                    </div>
                  )}
                </div>

                <motion.div
                  initial={false}
                  animate={{
                    height: metaSel.size > 0 ? 18 : 0,
                    opacity: metaSel.size > 0 ? 1 : 0,
                    marginTop: metaSel.size > 0 ? 8 : 0,
                  }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  style={{ overflow: 'hidden', flexShrink: 0 }}
                >
                  <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', lineHeight: '18px', whiteSpace: 'nowrap' }}>
                    {metaSel.size === 1 ? '1 meta seleccionada' : `${metaSel.size} metas seleccionadas`}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Visibilidad: publico (default) = perfil + Juntos; privado = solo tu */}
            <button
              type="button"
              role="switch"
              aria-checked={shareSocial}
              className="q"
              onClick={() => setShareSocial(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)',
                border: 'none', cursor: 'pointer', background: 'transparent',
                padding: 'var(--space-1) 0', textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="q create-habit-label" style={{ marginBottom: 2 }}>VISIBILIDAD</span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
                  {shareSocial ? 'Publico' : 'Privado'}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 2, lineHeight: 1.35 }}>
                  {shareSocial ? 'Se ve en tu perfil y en Juntos' : 'Solo tu lo ves; no sale en el perfil'}
                </span>
              </span>
              <span
                aria-hidden
                style={{
                  position: 'relative', flexShrink: 0, width: 44, height: 26,
                  borderRadius: 'var(--r-pill)',
                  background: shareSocial ? 'var(--olive)' : 'var(--paper-dark)',
                  boxShadow: shareSocial ? '0 2px 0 var(--olive-edge)' : 'none',
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: shareSocial ? 21 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(87,82,121,0.22)',
                  transition: 'left 0.15s ease',
                }} />
              </span>
            </button>

            <motion.button
              type="button"
              className="q create-habit-cta"
              disabled={!puedeCrear}
              whileTap={{ y: 4 }}
              onClick={handleCreate}
              animate={planting ? { scale: [1, 1.04, 0.96, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              {planting
                ? <><i className="ti ti-diamond" /> {isEdit ? 'Guardado ✓' : 'Creado ✓'}</>
                : <><i className="ti ti-diamond" /> {isEdit ? 'Guardar cambios' : 'Crear habito'}</>}
            </motion.button>
          </motion.div>
        )}

        {/* ---------- Paso 2: Color e icono ---------- */}
        {step === 'icon' && (
          <motion.div
            key="icon"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            <button type="button" className="q create-habit-back" onClick={() => setStep('form')}>
              <i className="ti ti-chevron-left" /> {name.trim() || (isEdit ? 'Editar habito' : 'Nuevo habito')}
            </button>

            {/* Vista previa grande del look elegido */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                className="create-habit-preview-lg"
                style={{ background: look.color, boxShadow: `0 4px 0 ${edgeOf(look.color)}` }}
              >
                <i className={`ti ${look.icon}`} />
              </div>
              <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>Color e icono</div>
            </div>

            {/* Color + icono (selector compartido con Metas; iconos neutros) */}
            <IconColorPicker
              color={look.color}
              icon={look.icon}
              onColor={(c) => { setColor(c); if (navigator.vibrate) navigator.vibrate(4) }}
              onIcon={setIcon}
              onType={setType}
            />

            <button type="button" className="q create-habit-cta" onClick={() => setStep('form')}>
              <i className="ti ti-check" /> Listo
            </button>
          </motion.div>
        )}

        {/* ---------- Paso 3: hora ---------- */}
        {step === 'time' && (
          <motion.div
            key="time"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            <button type="button" className="q create-habit-back" onClick={() => setStep('form')}>
              <i className="ti ti-chevron-left" /> {name.trim() || (isEdit ? 'Editar habito' : 'Nuevo habito')}
            </button>

            <TimePickerField
              value={mins}
              origin={baseline}
              changed={mins !== baseline}
              forwardOnly={false}
              onChange={setMins}
            />

            <button type="button" className="q create-habit-cta" onClick={() => setStep('form')}>
              <i className="ti ti-check" /> Listo
            </button>
          </motion.div>
        )}
    </CenterModal>
  )
}
