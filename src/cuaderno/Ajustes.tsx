import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AccentPicker } from '../components/AccentPicker'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { ThemeChoice } from '../components/ThemeChoice'
import { useAuth, useMe } from '../features/auth/AuthProvider'
import { signOut } from '../features/auth/credentials'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import { NONE, useBooks, useCuadernoActions, useLinks, useNotes, useProjects } from './data'
import { DICT_LANGS, dictLang, dictationSupported, setDictLang } from './dictation'
import { CIcon } from './icons'
import { PAGE_WIDTHS, setPageWidth, setPaperChoice, usePageWidth, usePaperChoice, type Paper } from './prefs'
import {
  canWrite,
  connectFolder,
  connectedFolder,
  disconnectFolder,
  downloadZip,
  folderSupported,
  lastSync,
  syncFolder,
  type SyncResult,
} from './vaultSync'

// Ajustes del cuaderno: lo de Rockie OS que se comparte (tema y color, iguales en HQ, Agenda y
// Cuaderno) y lo propio del cuaderno (dictado y tu bóveda en Markdown).
export function CuadernoSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useMe()
  const [lang, setLang] = useState(dictLang)
  return (
    <Sheet open={open} onClose={onClose} title="Ajustes del cuaderno">
      <section className="cu-set">
        <h3>Apariencia</h3>
        <p className="cu-muted">El mismo tema y color en el HQ, la Agenda y el Cuaderno (y en todas tus pestañas).</p>
        <ThemeChoice />
        <AccentPicker />
      </section>

      <PagesSection />

      <section className="cu-set">
        <h3>Dictado</h3>
        <p className="cu-muted">
          {dictationSupported()
            ? 'Toca «Dictar» en una página: lo que dices se escribe ahí y Rockie puede ordenarlo.'
            : 'Este navegador no dicta. Usa Chrome, Edge o Safari.'}
        </p>
        <label className="cu-set-row">
          <span>Idioma en que dictas</span>
          <select
            className="cu-select"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value)
              setDictLang(e.target.value)
            }}
          >
            {DICT_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {open && <VaultSection />}

      <section className="cu-set">
        <h3>Cuenta</h3>
        <p className="cu-muted">@{profile.username} · las mismas credenciales que el HQ</p>
        <div className="cu-set-btns">
          <Link className="btn ghost sm" to="/ajustes" onClick={onClose}>
            <CIcon name="settings" size={16} /> Ajustes del HQ
          </Link>
          <Link className="btn ghost sm" to="/cambiar-clave" onClick={onClose}>
            Cambiar contraseña
          </Link>
          <button className="btn danger sm" onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </div>
      </section>
    </Sheet>
  )
}

const PAPER_OPTS: { id: Paper | ''; label: string; icon: string }[] = [
  { id: 'claro', label: 'Clara', icon: 'sun' },
  { id: 'oscuro', label: 'Oscura', icon: 'moon' },
  { id: '', label: 'Como el tema', icon: 'monitor' },
]

/** Cuánto ancho usan tus páginas y con qué hoja empiezan los dibujos (se guarda en este equipo). */
function PagesSection() {
  const width = usePageWidth()
  const paper = usePaperChoice()
  return (
    <section className="cu-set">
      <h3>Páginas y dibujos</h3>
      <div className="cu-set-row">
        <span>Ancho de las páginas</span>
        <div className="segmented" role="radiogroup" aria-label="Ancho de las páginas">
          {PAGE_WIDTHS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={width === o.id} aria-pressed={width === o.id} onClick={() => setPageWidth(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cu-set-row">
        <span>Hoja para dibujar</span>
        <div className="segmented" role="radiogroup" aria-label="Hoja para dibujar">
          {PAPER_OPTS.map((o) => (
            <button key={o.id || 'tema'} type="button" role="radio" aria-checked={paper === o.id} aria-pressed={paper === o.id} onClick={() => setPaperChoice(o.id)}>
              <Icon name={o.icon} className="sm" /> {o.label}
            </button>
          ))}
        </div>
      </div>
      <p className="cu-muted">Cada dibujo recuerda su hoja; dentro de la hoja de dibujo la cambias con el sol y la luna.</p>
    </section>
  )
}

type Folder = NonNullable<Awaited<ReturnType<typeof connectedFolder>>>

function useVaultData() {
  const books = useBooks().data ?? NONE
  const notes = useNotes().data ?? NONE
  const links = useLinks().data ?? NONE
  const projects = useProjects().data ?? NONE
  return { books, notes, links, projects }
}

const summary = (r: SyncResult) => {
  const parts = [
    r.written && `${r.written} ${r.written === 1 ? 'archivo escrito' : 'archivos escritos'}`,
    r.updated && `${r.updated} ${r.updated === 1 ? 'página actualizada' : 'páginas actualizadas'} desde la carpeta`,
    r.imported && `${r.imported} ${r.imported === 1 ? 'página nueva traída' : 'páginas nuevas traídas'}`,
    r.removed && `${r.removed} ${r.removed === 1 ? 'archivo viejo quitado' : 'archivos viejos quitados'}`,
    r.conflicts &&
      `${r.conflicts} ${r.conflicts === 1 ? 'página cambió en los dos lados (llegó como página aparte)' : 'páginas cambiaron en los dos lados (llegaron como páginas aparte)'}`,
  ].filter(Boolean)
  return parts.length ? `Listo: ${parts.join(' · ')}.` : 'Todo estaba al día.'
}

/** Tu bóveda en Markdown: una carpeta conectada (como Obsidian; puede estar en Google Drive) o un .zip. */
function VaultSection() {
  const { userId } = useAuth()
  const data = useVaultData()
  const actions = useCuadernoActions()
  const [dir, setDir] = useState<Folder | null>(null)
  const [last, setLast] = useState<number | null>(null)
  const [busy, setBusy] = useState<'sync' | 'zip' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [zipped, setZipped] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!userId) return
    void connectedFolder(userId).then(setDir)
    void lastSync(userId).then(setLast)
  }, [userId])

  const sync = async (d = dir) => {
    if (!d || !userId || busy) return
    setBusy('sync')
    setMsg(null)
    try {
      if (!(await canWrite(d, true))) {
        setMsg('El navegador no dio permiso para escribir en la carpeta.')
        return
      }
      const r = await syncFolder(userId, d, data, actions)
      setLast(Date.now())
      setMsg(summary(r))
      haptic([6, 18, 6])
    } catch (e) {
      setMsg(`No se pudo sincronizar: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }
  const connect = async () => {
    if (!userId) return
    try {
      const d = await connectFolder(userId)
      setDir(d)
      dispatchEvent(new Event('cu:vault'))
      await sync(d)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg(`No se pudo conectar: ${(e as Error).message}`)
    }
  }
  const disconnect = async () => {
    if (!userId) return
    await disconnectFolder(userId)
    setDir(null)
    setLast(null)
    setMsg('Desconectada. Los archivos siguen en la carpeta.')
    dispatchEvent(new Event('cu:vault'))
  }
  const zip = async () => {
    setBusy('zip')
    setMsg(null)
    try {
      const n = await downloadZip(data, (a, b) => setZipped([a, b]))
      setMsg(`Descargaste ${n} archivos.`)
    } catch (e) {
      setMsg(`No se pudo armar el .zip: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      setZipped(null)
    }
  }

  return (
    <section className="cu-set">
      <h3>Tu bóveda (Markdown, como Obsidian)</h3>
      <p className="cu-muted">
        Cada carpeta y cuaderno es una carpeta; cada página, un archivo .md con sus [[enlaces]] y conexiones; las pizarras, .canvas. Obsidian abre esa misma carpeta como bóveda.
      </p>
      {folderSupported() ? (
        dir ? (
          <div className="cu-vault">
            <span className="cu-vault-dir">
              <CIcon name="folder" size={18} />
              <span>
                <b>{dir.name}</b>
                <small>{last ? `Sincronizada ${timeAgo(new Date(last).toISOString())}` : 'Aún sin sincronizar'} · se sincroniza sola mientras el cuaderno esté abierto</small>
              </span>
            </span>
            <div className="cu-set-btns">
              <button className="btn sm" onClick={() => void sync()} disabled={Boolean(busy)}>
                <CIcon name="undo2" size={15} /> {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button className="btn ghost sm" onClick={() => void connect()} disabled={Boolean(busy)}>
                Cambiar carpeta
              </button>
              <button className="btn ghost sm" onClick={() => void disconnect()} disabled={Boolean(busy)}>
                Desconectar
              </button>
            </div>
          </div>
        ) : (
          <button className="btn sm" onClick={() => void connect()} disabled={Boolean(busy)}>
            <CIcon name="folder" size={16} /> Conectar una carpeta
          </button>
        )
      ) : (
        <p className="cu-muted">Conectar una carpeta funciona en Chrome o Edge de computadora. Aquí puedes descargar todo en un .zip.</p>
      )}
      <button className="btn ghost sm" onClick={() => void zip()} disabled={Boolean(busy)}>
        <CIcon name="upload" size={16} /> {busy === 'zip' ? (zipped ? `Armando… ${zipped[0]}/${zipped[1]}` : 'Armando…') : 'Descargar todo (.zip)'}
      </button>
      {msg && (
        <p className="cu-vault-msg" role="status">
          {msg}
        </p>
      )}
      <p className="cu-tip-small">
        <b>¿En Google Drive?</b> Instala Google Drive para escritorio y elige una carpeta dentro de «Mi unidad»: Drive la sube sola y la tienes en todos lados. Lo
        mismo con OneDrive o Dropbox.
      </p>
    </section>
  )
}

/** Mientras el cuaderno está abierto y la carpeta tiene permiso, se sincroniza sola 20 s después de cada cambio. */
export function useVaultAutoSync() {
  const { userId } = useAuth()
  const data = useVaultData()
  const actions = useCuadernoActions()
  const dir = useRef<Folder | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!userId) return
    const load = () =>
      void connectedFolder(userId).then((d) => {
        dir.current = d
        setTick((t) => t + 1)
      })
    load()
    addEventListener('cu:vault', load)
    return () => removeEventListener('cu:vault', load)
  }, [userId])
  useEffect(() => {
    const d = dir.current
    if (!d || !userId || !data.notes.length) return
    const t = setTimeout(() => {
      void (async () => {
        if (!(await canWrite(d, false))) return
        await syncFolder(userId, d, data, actions).catch(() => {})
      })()
    }, 20_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.notes, data.books, data.links, tick, userId])
}
