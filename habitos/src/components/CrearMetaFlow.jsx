import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { typeOf, edgeOf } from '../data/habitTypes.js'
import { META_COLORS, META_DEFAULT_ICON, MAX_METAS, sugerirHabitos } from '../data/mock/metas.js'
import { AREA_LIBRE, inferirArea, areaOf } from '../data/areas.js'
import HabitPicker from './HabitPicker.jsx'
import IconColorPicker from './IconColorPicker.jsx'
import CreateHabitSheet from './CreateHabitSheet.jsx'
import RuedaAreas from './RuedaAreas.jsx'
import PlazoPicker from './PlazoPicker.jsx'

// Crear/editar META (el "para que" de tus habitos). Panel a pantalla completa
// que entra de derecha a izquierda (mismo gesto que Crear grupo/reto).
// Filosofia (contract.js: Meta): TU declaras la meta en una frase y TU armas
// su arbol; B+ solo SUGIERE habitos candidatos segun el nombre (tocar una
// sugerencia crea el habito DE VERDAD via createHabit y lo deja seleccionado).
// Ademas puedes CREAR un habito aqui mismo: el boton abre el CreateHabitSheet
// completo como ventana centrada ENCIMA del flujo (CenterModal z90 > flow z80);
// al crear (o tocar afuera) sigues exactamente donde estabas armando la meta.
// Sin pagina en blanco, sin plan impuesto: agencia + cero paralisis.
// props: meta = null (crear) | Meta (editar). preselect = habitIds ya marcados
// al abrir en modo crear (deep-link "crear habito -> nueva meta").
// initialAreaId = area preelegida (desde la rueda vacia). onClose, flash.
export default function CrearMetaFlow({ meta = null, preselect = [], initialAreaId, onClose, flash }) {
  const { allHabits, metas, areas, createMeta, updateMeta, deleteMeta, createHabit, metasDeHabito, prefs } = useStore()
  // Modo 'solo metas': la pregunta de area no existe (el area se sigue
  // infiriendo del nombre por debajo — si un dia vuelve al modo areas, sus
  // metas ya la traen puesta).
  const soloMetas = prefs.vidaMode === 'metas'
  const editando = meta !== null
  const colorDefault = META_COLORS[metas.length % META_COLORS.length]
  const [icon, setIcon] = useState(meta?.icon || META_DEFAULT_ICON)
  const [color, setColor] = useState(meta?.color || colorDefault)
  const [pickerOpen, setPickerOpen] = useState(false)  // selector color+icono
  const btnSqueeze = useAnimationControls()  // squeeze del boton al abrir/cerrar

  // Presion "gomosa": el circulo se aplasta y rebota en cada toque (abrir Y cerrar).
  const togglePicker = () => {
    setPickerOpen(o => !o)
    if (navigator.vibrate) navigator.vibrate(7)
    btnSqueeze.start({
      scale: [1, 0.84, 1.07, 1],
      transition: { duration: 0.34, ease: 'easeOut', times: [0, 0.24, 0.6, 1] },
    })
  }
  const [nombre, setNombre] = useState(meta?.name || '')
  const [plazo, setPlazo] = useState(meta?.deadline || 'Sin fecha')
  // Area (doc 23): al CREAR se infiere sola del nombre mientras escribes;
  // tocar la rueda la fija a mano (y la inferencia deja de pisarla). Al EDITAR
  // se respeta la guardada. null = Libre (siempre valida: andamio, no reja).
  // Si vienes de la rueda vacia, initialAreaId ya viene elegido.
  const [areaId, setAreaId] = useState(
    editando ? (meta.areaId ?? null) : (initialAreaId !== undefined ? initialAreaId : null),
  )
  const [areaManual, setAreaManual] = useState(editando || initialAreaId !== undefined)
  const cambiarNombre = (v) => {
    setNombre(v)
    if (!areaManual) setAreaId(inferirArea(v))
  }
  const [sel, setSel] = useState(() => new Set(meta?.habitIds || preselect))
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  const [crearHabito, setCrearHabito] = useState(false)  // sheet de crear habito ENCIMA del flujo
  const [prefill, setPrefill] = useState(null)           // datos de la sugerencia adoptada (precargan el sheet)

  // Sugerencias por el nombre (el "B+ te sugiere"; en fase 3 las da Gemini)
  const sugerencias = useMemo(() => sugerirHabitos(nombre, allHabits), [nombre, allHabits])

  // Nota por fila: un habito puede alimentar VARIAS metas (piedra angular) —
  // elegirlo aqui NO lo quita de las otras: validar sumara en todas a la vez.
  const notas = useMemo(() => {
    const n = {}
    for (const h of allHabits) {
      const otras = metasDeHabito(h.id).filter(m => m.id !== meta?.id)
      if (otras.length > 0) {
        const extra = otras.length > 1 ? ` +${otras.length - 1}` : ''
        n[h.id] = `Tambien alimenta a "${otras[0].name}"${extra} · avanzaran juntas ✨`
      }
    }
    return n
  }, [allHabits, metasDeHabito, meta])

  // Tocar una sugerencia = abrir el sheet de crear habito PRECARGADO con ella:
  // el usuario confirma/ajusta hora y dias antes de crearlo (no se crea a ciegas).
  const adoptarSugerencia = (tpl) => {
    setPrefill(tpl)
    setCrearHabito(true)
  }

  const listo = nombre.trim().length > 0 && sel.size > 0
  const guardar = () => {
    if (!listo) {
      flash(!nombre.trim() ? 'Escribe tu meta en una frase 🙂' : 'Elige al menos un habito que te lleve ahi 🙂')
      return
    }
    if (editando) {
      updateMeta(meta.id, { nombre: nombre.trim(), icon, color, plazo, habitIds: [...sel], areaId })
      onClose()
      flash('Meta actualizada 🎯')
      return
    }
    const creada = createMeta({ nombre: nombre.trim(), icon, color, plazo, habitIds: [...sel], areaId })
    if (!creada) {
      flash(`Ya tienes ${MAX_METAS} metas: pocas y profundas 🙂 Cierra una para abrir otra`)
      return
    }
    onClose()
    flash(`¡Meta "${nombre.trim()}" creada! 🎯 ${sel.size} ${sel.size === 1 ? 'habito la alimenta' : 'habitos la alimentan'}`)
  }

  // Salir con la flecha atras: al EDITAR, la flecha COMITEA los cambios pendientes
  // (icono/color/nombre/plazo/habitos) — el boton "Guardar cambios" vive al fondo
  // del formulario, tras la lista de habitos, asi que cambiar solo el icono/color
  // arriba y tocar atras (el gesto natural) descartaba silenciosamente. Al CREAR,
  // atras cancela (aun no existe nada). Si la edicion quedo invalida (sin nombre o
  // sin habitos) no guardamos a medias: se cierra conservando la meta anterior.
  const cerrar = () => {
    if (editando && listo) {
      updateMeta(meta.id, { nombre: nombre.trim(), icon, color, plazo, habitIds: [...sel], areaId })
      flash('Meta actualizada 🎯')
    }
    onClose()
  }

  // Borrar con confirmacion en dos toques (los habitos no se tocan)
  const borrar = () => {
    if (!confirmaBorrar) { setConfirmaBorrar(true); return }
    deleteMeta(meta.id)
    onClose()
    flash('Meta eliminada. Tus habitos siguen intactos 🙂')
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <motion.div className="flow-screen" data-coach-pause
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={cerrar}><i className="ti ti-arrow-left" /></button>
        <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>{editando ? 'Editar meta' : 'Nueva meta'}</div>
      </div>

      <div className="flow-body">
        {/* La meta en UNA frase (emocional, no un plan). El circulo (icono en el
            color elegido) abre el selector color+icono, igual que un habito. */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿QUE QUIERES LOGRAR?</div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <motion.button
              type="button"
              onClick={togglePicker}
              aria-label="Cambiar color e icono"
              animate={btnSqueeze}
              whileTap={{ scale: 0.9, y: 2 }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
              style={{ position: 'relative', width: 52, height: 52, borderRadius: 'var(--r-md)', background: color, border: 'none', boxShadow: `0 3px 0 ${edgeOf(color)}`, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${icon}`} style={{ color: '#fff', fontSize: 'var(--text-2xl)' }} />
              <span style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 11 }}>
                <i className="ti ti-pencil" />
              </span>
            </motion.button>
            <input className="amg-input q" value={nombre} onChange={e => cambiarNombre(e.target.value)} placeholder="Ej: Levantar 100kg en press banca" />
          </div>

          {/* Selector color+icono (compartido con habitos; iconos neutros) */}
          <AnimatePresence initial={false}>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                transition={{
                  height: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.28, ease: 'easeOut' },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="amg-card" style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <IconColorPicker color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
                  <button type="button" className="amg-btn-green q" style={{ padding: '7px var(--space-4)', fontSize: 'var(--text-xs)', alignSelf: 'flex-start' }} onClick={() => setPickerOpen(false)}>
                    <i className="ti ti-check" /> Listo
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Area de la vida (doc 23): rueda circular para escoger (Cuerpo/Mente/
            Alma). Se infiere sola del nombre; tocar un icono la fija. "Libre"
            queda como chip aparte (andamio, no reja). Oculta en 'solo metas'. */}
        {!soloMetas && <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿A QUE AREA DE TU VIDA APUNTA?</div>
          <RuedaAreas
            size={220}
            stats={areas.map(a => ({
              ...a,
              metas: [],
              pct: areaId === a.id ? 100 : 0,
              nHabits: 0,
              vacia: areaId !== a.id,
            }))}
            selectedId={areaId}
            onSelect={(id) => {
              setAreaManual(true)
              setAreaId(prev => (prev === id ? null : id))  // re-tocar = Libre
            }}
            mode="pick"
            empty={areaId == null}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => { setAreaManual(true); setAreaId(null) }}
              className="q"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                border: areaId == null ? 'none' : '2px solid var(--card-line)',
                background: areaId == null ? AREA_LIBRE.color : 'var(--card)',
                color: areaId == null ? '#fff' : 'var(--ink-soft)',
                boxShadow: areaId == null ? `0 2px 0 ${AREA_LIBRE.edge}` : '0 2px 0 var(--card-edge)',
              }}
            >
              <i className={`ti ${AREA_LIBRE.icon}`} style={{ fontSize: 'var(--text-sm)' }} /> {AREA_LIBRE.name}
            </button>
          </div>
          <div className="q" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', textAlign: 'center' }}>
            {areaOf(areaId, areas).desc}
          </div>
        </div>}

        {/* Plazo: Por dias (rueda 1-365) | Por fecha (dia/mes/ano) | Sin fecha */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿PARA CUANDO?</div>
          <PlazoPicker value={plazo} onChange={setPlazo} />
        </div>

        {/* TU armas el arbol: multi-seleccion de TUS habitos + crear uno nuevo
            aqui mismo (ventana centrada encima; al cerrar sigues aqui) */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿QUE HABITOS TE LLEVAN AHI? · TU ELIGES</div>
          <HabitPicker habits={allHabits} value={sel} onChange={setSel} multi notes={notas} />
          <button
            type="button" onClick={() => { setPrefill(null); setCrearHabito(true) }}
            className="q"
            style={{
              marginTop: 'var(--space-2)', width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)',
              border: '2px dashed var(--paper-dark)', borderRadius: 'var(--r-md)',
              background: 'var(--card)', color: 'var(--olive)', cursor: 'pointer',
              fontSize: 'var(--text-sm)', fontWeight: 700,
            }}
          >
            <i className="ti ti-plus" /> Crear un habito nuevo aqui
          </button>
        </div>

        {/* B+ sugiere (opcional, nunca impone): tocar crea el habito y lo enlaza */}
        {sugerencias.length > 0 && (
          <div>
            <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>B+ TE SUGIERE · TOCA PARA AJUSTAR Y ENLAZAR</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {sugerencias.map(tpl => (
                <button
                  key={tpl.name} type="button" onClick={() => adoptarSugerencia(tpl)}
                  className="q"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px var(--space-3)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                    fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-soft)',
                    background: 'var(--card)', border: '2px dashed var(--paper-dark)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-sm)' }}>{typeOf(tpl.type).emoji}</span> {tpl.name}
                  <i className="ti ti-plus" style={{ fontSize: 'var(--text-xs)', color: 'var(--olive)' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="amg-cta amg-cta--brand q" onClick={guardar} style={{ opacity: listo ? 1 : 0.55, transition: 'opacity 0.2s ease' }}>
          {editando ? 'Guardar cambios 🎯' : 'Crear meta 🎯'}
        </button>

        {editando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <motion.button
              type="button" onClick={borrar}
              className="q"
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                width: '100%', minHeight: 'var(--tap-min)', cursor: 'pointer',
                borderRadius: 'var(--r-md)', fontSize: 'var(--text-sm)', fontWeight: 700,
                border: confirmaBorrar ? 'none' : '2px solid var(--coral)',
                background: confirmaBorrar ? 'var(--coral)' : 'transparent',
                color: confirmaBorrar ? '#fff' : 'var(--coral)',
                boxShadow: confirmaBorrar ? '0 3px 0 var(--coral-edge)' : 'none',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              <i className="ti ti-trash" />
              {confirmaBorrar ? '¿Seguro? Toca de nuevo para eliminar' : 'Eliminar meta'}
            </motion.button>
            <div className="q" style={{ textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
              Tus habitos no se tocan: solo pierden el enlace
            </div>
          </div>
        )}

        {!editando && metas.length > 0 && (
          <div className="q" style={{ textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
            {metas.length}/{MAX_METAS} metas · pocas y profundas
          </div>
        )}
      </div>

      {/* Crear habito SIN salir del flujo: el sheet completo (icono, color, hora,
          dias) como ventana centrada encima; el habito nace enlazado a esta meta */}
      <CreateHabitSheet
        open={crearHabito}
        prefill={prefill}
        onClose={() => { setCrearHabito(false); setPrefill(null) }}
        withMeta={false}
        onCreate={(payload) => {
          const { metaIds, nuevaMeta, ...data } = payload  // aqui la meta es ESTA: fuera flags
          const h = createHabit(data)
          setSel(prev => new Set(prev).add(h.id))
          flash(`"${h.name}" creado y enlazado ✨`)
        }}
      />
    </motion.div>,
    target,
  )
}
