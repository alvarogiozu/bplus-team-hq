// El cifrado vive en UN solo lugar: el fetch del cliente de Supabase. Todas las pantallas siguen haciendo
// supabase.from('tabla').insert/update/select como siempre y aquí, antes de salir, se cifran las columnas
// que privacidad.json marca; al volver, todo valor cf1/cj1 se abre con la llave que diga su kid.
// Si una pantalla nueva escribe en una tabla registrada, queda cifrada sin hacer nada más.

import registro from './privacidad.json'
import { BLOQUEADO, RE_SOBRE, cifrarValor, descifrarValor, esCifrado } from './cripto'
import type { Ambito, Llavero } from './llavero'

type Regla = { llave: string; estado: string; cifrar: string[]; dueno?: string }
type Fila = Record<string, unknown>

const TABLAS = registro.tablas as unknown as Record<string, Regla>

export function reglaActiva(tabla: string): Regla | null {
  const r = TABLAS[tabla]
  return r && r.estado === 'activo' && r.cifrar.length ? r : null
}

/** Tablas personales que ya se cifran (para sellar lo que se guardó antes del Cofre). */
export function tablasPersonalesActivas(): { tabla: string; cifrar: string[]; dueno: string }[] {
  return Object.entries(TABLAS)
    .filter(([, r]) => r.estado === 'activo' && r.llave === 'personal' && r.cifrar.length && r.dueno)
    .map(([tabla, r]) => ({ tabla, cifrar: r.cifrar, dueno: r.dueno! }))
}

class ErrorCofre extends Error {}

function vacio(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

const debeCifrar = (v: unknown) => !vacio(v) && !esCifrado(v)

// ——— abrir lo que llega ———

async function abrirSobre(l: Llavero, sobre: string): Promise<unknown> {
  const abiertos = l.abiertos
  if (abiertos.has(sobre)) return abiertos.get(sobre)
  const json = sobre.startsWith('cj1.')
  const k = await l.llavePorKid(sobre.split('.')[1])
  if (!k) return json ? null : BLOQUEADO // sin guardar: la llave puede llegar después
  try {
    const v = await descifrarValor(k, sobre)
    if (abiertos.size > 5000) abiertos.delete(abiertos.keys().next().value!)
    abiertos.set(sobre, v)
    return v
  } catch {
    return json ? null : BLOQUEADO
  }
}

/** Parsea un JSON abriendo cada valor cifrado (enteros o metidos dentro de un texto). */
export async function abrirJson(l: Llavero, texto: string): Promise<unknown> {
  const sobres = texto.match(RE_SOBRE)
  if (!sobres) return JSON.parse(texto)
  await l.listo()
  const unicos = [...new Set(sobres)]
  const mapa = new Map(await Promise.all(unicos.map(async (s) => [s, await abrirSobre(l, s)] as const)))
  return JSON.parse(texto, (_k, v) => {
    if (typeof v !== 'string' || !v.includes('1.')) return v
    if (mapa.has(v)) return mapa.get(v)
    return v.replace(RE_SOBRE, (s) => {
      const x = mapa.get(s)
      return x == null ? BLOQUEADO : typeof x === 'string' ? x : JSON.stringify(x)
    })
  })
}

export async function abrirObjeto<T>(l: Llavero, o: T): Promise<T> {
  return (await abrirJson(l, JSON.stringify(o))) as T
}

// ——— cifrar lo que sale ———

function filtroEq(url: URL, col: string): string | null {
  const f = url.searchParams.get(col)
  return f?.startsWith('eq.') ? f.slice(3) : null
}

/** Valor para un filtro de PostgREST (entre comillas si trae caracteres reservados). */
function pgrst(v: string): string {
  return /^[\w\- áéíóúñÁÉÍÓÚÑüÜ]*$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

type Contexto = { l: Llavero; tabla: string; regla: Regla; url: URL; headers: Headers; crudo: typeof fetch }

async function ambitoDe(c: Contexto, f: Fila): Promise<Ambito> {
  if (c.regla.llave === 'personal') return { tipo: 'personal' }
  const [tipo, col] = c.regla.llave.split(':') as ['espacio' | 'nota', string]
  let id = (f[col] as string | undefined) ?? filtroEq(c.url, col)
  if (!id) {
    // un update que no trae el equipo: se pregunta de qué equipo es la fila
    const fid = filtroEq(c.url, 'id')
    if (fid) {
      const r = await c.crudo(`${c.url.origin}${c.url.pathname}?select=${col}&id=eq.${encodeURIComponent(fid)}`, {
        headers: { apikey: c.headers.get('apikey') ?? '', Authorization: c.headers.get('Authorization') ?? '' },
      })
      const filas = r.ok ? ((await r.json()) as Fila[]) : []
      id = (filas[0]?.[col] as string | undefined) ?? null
    }
  }
  if (!id) throw new ErrorCofre(`No se pudo saber con qué llave cifrar (${c.tabla}).`)
  return { tipo, id }
}

async function cifrarFilas(c: Contexto, filas: Fila[]) {
  if (!filas.some((f) => c.regla.cifrar.some((col) => debeCifrar(f[col])))) return
  await c.l.listo()
  if (c.l.fase !== 'abierto') throw new ErrorCofre('Abre tu Cofre para guardar esto.')
  for (const f of filas) {
    const cols = c.regla.cifrar.filter((col) => debeCifrar(f[col]))
    if (!cols.length) continue
    const k = await c.l.llaveParaEscribir(await ambitoDe(c, f))
    if (!k) {
      throw new ErrorCofre(
        c.regla.llave === 'personal'
          ? 'Abre tu Cofre para guardar esto.'
          : 'Todavía no tienes la llave de este equipo: te llega cuando alguien del equipo abra Rockie.',
      )
    }
    for (const col of cols) f[col] = await cifrarValor(k.llave, k.kid, f[col])
  }
}

function respuestaError(message: string): Response {
  return new Response(JSON.stringify({ code: 'COFRE', message, details: null, hint: null }), {
    status: 423,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ——— sellar lo que todavía está en claro (lo de antes del Cofre o lo que escribió el servidor) ———

const resellando = new Map<string, Promise<void>>()

function resellar(envuelto: typeof fetch, c: Contexto, filas: Fila[]) {
  if (c.l.fase !== 'abierto') return
  for (const f of filas) {
    const id = f.id
    if (typeof id !== 'string') continue
    const cols = c.regla.cifrar.filter((col) => col in f && debeCifrar(f[col]))
    const clave = `${c.tabla}:${id}`
    if (!cols.length || resellando.has(clave)) continue
    const cambios: Fila = {}
    const q = new URLSearchParams({ id: `eq.${id}` })
    for (const col of cols) {
      cambios[col] = f[col]
      // solo si nadie lo cambió mientras tanto (los textos largos y los JSON no se comparan)
      if (typeof f[col] === 'string' && (f[col] as string).length <= 200) q.set(col, `eq.${pgrst(f[col] as string)}`)
    }
    const h = new Headers({
      apikey: c.headers.get('apikey') ?? '',
      Authorization: c.headers.get('Authorization') ?? '',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    })
    const p = envuelto(`${c.url.origin}${c.url.pathname}?${q}`, { method: 'PATCH', headers: h, body: JSON.stringify(cambios) })
      .then(() => undefined)
      .catch(() => undefined)
    resellando.set(clave, p)
  }
}

/** Espera a que terminen de sellarse las filas viejas que se encontraron. */
export async function esperarResellados(): Promise<void> {
  await Promise.all(resellando.values())
}

// ——— el fetch ———

export function crearFetchCifrado(base: string, llavero: () => Llavero | null, crudo: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  const raiz = base.replace(/\/$/, '')
  const rest = `${raiz}/rest/v1/`
  const funciones = `${raiz}/functions/v1/`

  const envuelto: typeof fetch = async (input, init) => {
    const l = llavero()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!l || l.fase === 'sin-sesion' || !(url.startsWith(rest) || url.startsWith(funciones))) return crudo(input, init)
    if (url.startsWith(funciones)) return abrirRespuesta(await crudo(input, init), l)

    const u = new URL(url)
    const tabla = decodeURIComponent(u.pathname.slice(u.pathname.indexOf('/rest/v1/') + 9).split('/')[0])
    if (tabla.startsWith('cofre_')) return crudo(input, init) // el llavero mismo: sus valores ya van cifrados a su manera
    const regla = tabla === 'rpc' ? null : reglaActiva(tabla)
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const c: Contexto | null = regla ? { l, tabla, regla, url: u, headers, crudo } : null

    let body = init?.body
    if (c && typeof body === 'string' && (metodo === 'POST' || metodo === 'PATCH' || metodo === 'PUT')) {
      try {
        const json = JSON.parse(body)
        await cifrarFilas(c, Array.isArray(json) ? json : [json])
        body = JSON.stringify(json)
      } catch (e) {
        if (e instanceof ErrorCofre) return respuestaError(e.message)
        throw e
      }
    }
    const res = await crudo(url, { ...init, method: metodo, headers, body })
    return abrirRespuesta(res, l, metodo === 'GET' && c ? (filas) => resellar(envuelto, c, filas) : undefined)
  }
  return envuelto
}

async function abrirRespuesta(res: Response, l: Llavero, alLeer?: (filas: Fila[]) => void): Promise<Response> {
  if (!res.ok || res.status === 204 || !(res.headers.get('Content-Type') ?? '').includes('json')) return res
  const texto = await res.text()
  const init = { status: res.status, statusText: res.statusText, headers: res.headers }
  if (!texto) return new Response(texto, init)
  if (alLeer) {
    try {
      const crudo = JSON.parse(texto) as unknown
      const filas = (Array.isArray(crudo) ? crudo : [crudo]).filter((f): f is Fila => !!f && typeof f === 'object')
      alLeer(filas)
    } catch {
      /* no era JSON de filas */
    }
  }
  if (!RE_SOBRE.test(texto)) return new Response(texto, init)
  RE_SOBRE.lastIndex = 0
  return new Response(JSON.stringify(await abrirJson(l, texto)), init)
}

// ——— tiempo real: los cambios que llegan por websocket también se abren ———

type ConOn = { on: (...a: unknown[]) => unknown }

export function envolverRealtime<C extends { channel: (...a: never[]) => unknown }>(cliente: C, llavero: () => Llavero | null): C {
  const original = cliente.channel.bind(cliente) as (...a: unknown[]) => ConOn
  ;(cliente as unknown as { channel: (...a: unknown[]) => ConOn }).channel = (...args: unknown[]) => {
    const ch = original(...args)
    const on = ch.on.bind(ch)
    let cola = Promise.resolve()
    ch.on = (tipo: unknown, filtro: unknown, cb: unknown) => {
      if (tipo !== 'postgres_changes' || typeof cb !== 'function') return on(tipo, filtro, cb)
      return on(tipo, filtro, (payload: unknown) => {
        // en orden: cada cambio espera a que se abra el anterior
        cola = cola.then(async () => {
          const l = llavero()
          cb(l && l.fase !== 'sin-sesion' ? await abrirObjeto(l, payload) : payload)
        }).catch(() => undefined)
      })
    }
    return ch
  }
  return cliente
}
