// El cifrado vive en UN solo lugar: el fetch del cliente de Supabase. Todas las pantallas siguen haciendo
// supabase.from('tabla').insert/update/select como siempre y aquí, antes de salir, se cifran las columnas
// que privacidad.json marca; al volver, todo valor cf1/cj1 se abre con la llave que diga su kid.
// Si una pantalla nueva escribe en una tabla registrada, queda cifrada sin hacer nada más.

import registro from './privacidad.json'
import { BLOQUEADO, RE_SOBRE, cifrarArchivo, cifrarValor, descifrarArchivo, descifrarValor, esCifrado, kidDeArchivo } from './cripto'
import type { Ambito, Llavero } from './llavero'

type Regla = {
  llave: string
  estado: string
  cifrar: string[]
  dueno?: string
  sellarCon?: string
  /** otra llave cuando la columna «si» no está vacía (p. ej. una página compartida usa la llave de la página) */
  llaveSi?: { si: string; llave: string }
  /** si esta columna es true, la fila va en claro a propósito (libreta abierta para Claude) */
  enClaroSi?: string
  /** la columna que identifica la fila (si no es «id») */
  pk?: string
}
type ReglaArchivo = { llave: string; estado: string; enClaro?: string }
type Fila = Record<string, unknown>

const TABLAS = registro.tablas as unknown as Record<string, Regla>
const FUNCIONES = ((registro as unknown as { funciones?: Record<string, Regla> }).funciones ?? {}) as Record<string, Regla>
const ARCHIVOS = ((registro as unknown as { archivos?: Record<string, ReglaArchivo> }).archivos ?? {}) as Record<string, ReglaArchivo>

export function reglaActiva(tabla: string): Regla | null {
  const r = TABLAS[tabla]
  return r && r.estado === 'activo' && r.cifrar.length ? r : null
}

/** Tablas personales que ya se cifran (para sellar lo que se guardó antes del Cofre). */
export function tablasPersonalesActivas(): { tabla: string; cifrar: string[]; dueno: string; pk: string; extra: string[] }[] {
  return Object.entries(TABLAS)
    .filter(([, r]) => r.estado === 'activo' && r.llave === 'personal' && r.cifrar.length && r.dueno)
    .map(([tabla, r]) => ({ tabla, cifrar: r.cifrar, dueno: r.dueno!, pk: r.pk ?? 'id', extra: [r.enClaroSi, r.llaveSi?.si].filter((x): x is string => Boolean(x)) }))
}

/** Tablas de equipo que ya se cifran, con la columna que dice de qué equipo es cada fila. */
export function tablasDeEquipoActivas(): { tabla: string; cifrar: string[]; col: string; pk: string }[] {
  return Object.entries(TABLAS)
    .filter(([, r]) => r.estado === 'activo' && r.llave.startsWith('espacio:') && r.cifrar.length)
    .map(([tabla, r]) => ({ tabla, cifrar: r.cifrar, col: r.llave.split(':')[1], pk: r.pk ?? 'id' }))
}

/** Huella de lo que se cifra hoy: cuando cambia (una tanda nueva), se vuelve a barrer lo viejo. */
export function versionDelRegistro(): string {
  const activas = Object.entries(TABLAS)
    .filter(([, r]) => r.estado === 'activo' && r.cifrar.length)
    .map(([t, r]) => `${t}:${r.cifrar.join('+')}`)
    .sort()
    .join(',')
  let h = 0
  for (let i = 0; i < activas.length; i++) h = (h * 31 + activas.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
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

async function abrirSobre(l: Llavero, sobre: string, nivel: number): Promise<unknown> {
  const abiertos = l.abiertos
  if (abiertos.has(sobre)) return abiertos.get(sobre)
  const json = sobre.startsWith('cj1.')
  const k = await l.llavePorKid(sobre.split('.')[1])
  if (!k) return json ? null : BLOQUEADO // sin guardar: la llave puede llegar después
  let v: unknown
  try {
    v = await descifrarValor(k, sobre)
  } catch {
    return json ? null : BLOQUEADO
  }
  // un texto cifrado que adentro trae otros (la actividad sellada: «creó «cf1…»»): se abren también
  if (nivel < 2) {
    const adentro = JSON.stringify(v)
    if (adentro.match(RE_SOBRE)) v = await abrirJson(l, adentro, nivel + 1)
  }
  if (abiertos.size > 5000) abiertos.delete(abiertos.keys().next().value!)
  abiertos.set(sobre, v)
  return v
}

/** Parsea un JSON abriendo cada valor cifrado (enteros o metidos dentro de un texto). */
export async function abrirJson(l: Llavero, texto: string, nivel = 0): Promise<unknown> {
  const sobres = texto.match(RE_SOBRE)
  if (!sobres) return JSON.parse(texto)
  await l.listo()
  const unicos = [...new Set(sobres)]
  const mapa = new Map(await Promise.all(unicos.map(async (s) => [s, await abrirSobre(l, s, nivel)] as const)))
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

type Contexto = { l: Llavero; tabla: string; regla: Regla; url: URL; headers: Headers; crudo: typeof fetch; metodo: string }

/** Las columnas que la regla necesita para decidir (equipo, si está compartida, si está abierta para Claude):
 *  de la fila, de los filtros del pedido o, si no, se le pregunta a la base por esa fila. */
async function datosDeFila(c: Contexto, f: Fila, cols: string[]): Promise<Fila> {
  const out: Fila = { ...f }
  const faltan = cols.filter((k) => !(k in out))
  for (const k of faltan) {
    const v = filtroEq(c.url, k)
    if (v !== null) out[k] = v === 'true' ? true : v === 'false' ? false : v
  }
  const aun = faltan.filter((k) => !(k in out))
  const pk = c.regla.pk ?? 'id'
  const fid = (typeof f[pk] === 'string' || typeof f[pk] === 'number' ? String(f[pk]) : null) ?? filtroEq(c.url, pk)
  if (aun.length && fid && (c.metodo === 'PATCH' || c.metodo === 'PUT')) {
    const r = await c.crudo(`${c.url.origin}/rest/v1/${c.tabla}?select=${aun.join(',')}&${pk}=eq.${encodeURIComponent(fid)}`, {
      headers: { apikey: c.headers.get('apikey') ?? '', Authorization: c.headers.get('Authorization') ?? '' },
    })
    const filas = r.ok ? ((await r.json()) as Fila[]) : []
    if (filas[0]) Object.assign(out, filas[0])
  }
  return out
}

/** Con qué llave se cifra esta fila; null = va en claro a propósito (libreta abierta para Claude). */
async function decidir(c: Contexto, f: Fila): Promise<Ambito | null> {
  const r = c.regla
  const base = r.llaveSi && 'si' in r.llaveSi ? r.llaveSi : null
  const necesito = [r.enClaroSi, base?.si, r.llave.includes(':') ? r.llave.split(':')[1] : null, base?.llave.split(':')[1]]
    .filter((x): x is string => Boolean(x))
  const d = await datosDeFila(c, f, [...new Set(necesito)])
  if (r.enClaroSi && d[r.enClaroSi] === true) return null
  const llave = base && d[base.si] != null ? base.llave : r.llave
  if (llave === 'personal') return { tipo: 'personal' }
  const [tipo, col] = llave.split(':') as ['espacio' | 'nota', string]
  let id = d[col] as string | undefined
  if (!id && col === 'id' && c.metodo === 'POST') {
    // fila nueva cuya llave es la suya propia: nace con su id para poder cifrarla ya
    id = crypto.randomUUID()
    f.id = id
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
    const a = await decidir(c, f)
    if (!a) continue
    const k = await c.l.llaveParaEscribir(a)
    if (!k) {
      throw new ErrorCofre(
        a.tipo === 'personal'
          ? 'Abre tu Cofre para guardar esto.'
          : a.tipo === 'nota'
            ? 'Todavía no tienes la llave de esta página compartida: te llega cuando su dueño abra Rockie.'
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
// y, al revés, abrir lo que pasó a una libreta abierta para Claude.

// una fila por vez; si no se pudo (la llave del equipo todavía no llegaba, sin conexión…) se reintenta al
// volver a leerla, pero no antes de un minuto
const resellando = new Map<string, Promise<void>>()
const fallidos = new Map<string, number>()

function anotar(clave: string, intento: Promise<boolean>) {
  const p = intento
    .catch(() => false)
    .then((ok) => {
      resellando.delete(clave)
      if (ok) fallidos.delete(clave)
      else fallidos.set(clave, Date.now())
    })
  resellando.set(clave, p)
}

function resellar(envuelto: typeof fetch, c: Contexto, filas: Fila[]) {
  if (c.l.fase !== 'abierto') return
  for (const f of filas) {
    const pk = c.regla.pk ?? 'id'
    const crudoId = f[pk]
    if (typeof crudoId !== 'string' && typeof crudoId !== 'number') continue
    const id = String(crudoId)
    const enClaro = c.regla.cifrar.filter((col) => col in f && debeCifrar(f[col]))
    // abrir lo cifrado solo si la fila ya dice que está abierta (sin preguntarle a la base por cada fila)
    const cifradas = c.regla.enClaroSi && f[c.regla.enClaroSi] === true ? c.regla.cifrar.filter((col) => col in f && esCifrado(f[col])) : []
    const clave = `${c.tabla}:${id}`
    if ((!enClaro.length && !cifradas.length) || resellando.has(clave) || Date.now() - (fallidos.get(clave) ?? 0) < 60_000) continue
    const h = new Headers({
      apikey: c.headers.get('apikey') ?? '',
      Authorization: c.headers.get('Authorization') ?? '',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    })
    anotar(
      clave,
      (async () => {
        const a = await decidir({ ...c, metodo: 'PATCH' }, f)
        const cambios: Fila = {}
        const q = new URLSearchParams({ [pk]: `eq.${id}` })
        if (a) {
          if (!enClaro.length) return true
          if (c.regla.sellarCon) {
            // tabla que nadie edita (la arma el servidor): la base solo acepta cambiar texto en claro por su versión cifrada
            const k = await c.l.llaveParaEscribir(a)
            if (!k) return false
            for (const col of enClaro) cambios[col] = await cifrarValor(k.llave, k.kid, f[col])
            const r = await c.crudo(`${c.url.origin}/rest/v1/rpc/${c.regla.sellarCon}`, {
              method: 'POST',
              headers: h,
              body: JSON.stringify({ p_tabla: c.tabla, p_id: id, p_campos: cambios }),
            })
            return r.ok
          }
          for (const col of enClaro) {
            cambios[col] = f[col]
            // solo si nadie lo cambió mientras tanto (los textos largos y los JSON no se comparan).
            // En un filtro eq. el valor va tal cual: las comillas solo se usan dentro de in.(…) y or=(…)
            if (typeof f[col] === 'string' && (f[col] as string).length <= 200) q.set(col, `eq.${f[col] as string}`)
          }
        } else {
          // libreta abierta para Claude: lo cifrado se guarda abierto (la persona lo eligió)
          if (!cifradas.length) return true
          for (const col of cifradas) {
            const v = await abrirSobre(c.l, f[col] as string, 0)
            if (v === null || v === BLOQUEADO) return false
            cambios[col] = v
          }
        }
        const r = await envuelto(`${c.url.origin}${c.url.pathname}?${q}`, { method: 'PATCH', headers: h, body: JSON.stringify(cambios) })
        return r.ok
      })(),
    )
  }
}

/** Espera a que terminen de sellarse las filas viejas que se encontraron. */
export async function esperarResellados(): Promise<void> {
  await Promise.all(resellando.values())
}

// ——— archivos (Storage): se suben cifrados y se bajan abiertos ———
// Dentro del cifrado va también el tipo (image/jpeg…), para devolver el archivo tal cual era.

const RESERVADAS = new Set(['sign', 'upload', 'move', 'copy', 'info', 'list', 'public', 'authenticated', 'render'])

/** Archivos (bucket/ruta) que se bajaron sin cifrar: quien los muestra puede volver a subirlos cifrados. */
export const archivosEnClaro = new Set<string>()

function ambitoDeArchivo(regla: ReglaArchivo, ruta: string[]): Ambito {
  if (regla.llave === 'personal') return { tipo: 'personal' }
  // Cuaderno: <uid>/n/<nota>/… = imagen de una página (llave de la página: sirve si se comparte); el resto es tuyo
  if (regla.llave === 'cuaderno') return ruta[1] === 'n' && ruta[2] ? { tipo: 'nota', id: ruta[2] } : { tipo: 'personal' }
  const [tipo, i] = regla.llave.split(':') as ['espacio' | 'nota', string]
  const id = ruta[Number(i)]
  if (!id) throw new ErrorCofre('No se pudo saber con qué llave cifrar este archivo.')
  return { tipo, id }
}

function empacar(mime: string, datos: Uint8Array): Uint8Array {
  const m = new TextEncoder().encode(mime.slice(0, 200))
  const out = new Uint8Array(1 + m.length + datos.length)
  out[0] = m.length
  out.set(m, 1)
  out.set(datos, 1 + m.length)
  return out
}

function desempacar(b: Uint8Array): { mime: string; datos: Uint8Array } {
  const n = b[0]
  return { mime: new TextDecoder().decode(b.subarray(1, 1 + n)), datos: b.subarray(1 + n) }
}

async function cifrarSubida(l: Llavero, regla: ReglaArchivo, ruta: string[], body: BodyInit): Promise<BodyInit> {
  await l.listo()
  if (l.fase !== 'abierto') throw new ErrorCofre('Abre tu Cofre para subir archivos.')
  const k = await l.llaveParaEscribir(ambitoDeArchivo(regla, ruta))
  if (!k) throw new ErrorCofre('Todavía no tienes la llave de este equipo: te llega cuando alguien del equipo abra Rockie.')
  const cifrar = async (b: Blob) => {
    const plano = empacar(b.type || 'application/octet-stream', new Uint8Array(await b.arrayBuffer()))
    return new Blob([await cifrarArchivo(k.llave, k.kid, plano)], { type: b.type })
  }
  if (body instanceof FormData) {
    const fd = new FormData()
    for (const [clave, valor] of body.entries()) {
      if (valor instanceof Blob) fd.append(clave, await cifrar(valor), valor instanceof File ? valor.name : 'blob')
      else fd.append(clave, valor)
    }
    return fd
  }
  if (body instanceof Blob) return cifrar(body)
  if (body instanceof ArrayBuffer) return cifrar(new Blob([body]))
  if (ArrayBuffer.isView(body)) return cifrar(new Blob([body as Uint8Array]))
  throw new ErrorCofre('Este archivo no se pudo cifrar.')
}

async function abrirDescarga(l: Llavero, clave: string, activo: boolean, res: Response): Promise<Response> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const headers = new Headers(res.headers)
  headers.delete('Content-Length')
  const kid = kidDeArchivo(bytes)
  if (!kid) {
    if (activo) archivosEnClaro.add(clave)
    return new Response(bytes, { status: res.status, statusText: res.statusText, headers })
  }
  await l.listo()
  const k = await l.llavePorKid(kid)
  if (!k) return respuestaError('Este archivo está en un Cofre del que este dispositivo aún no tiene la llave.')
  try {
    const { mime, datos } = desempacar(await descifrarArchivo(k, bytes))
    headers.set('Content-Type', mime)
    return new Response(datos, { status: res.status, statusText: res.statusText, headers })
  } catch {
    return respuestaError('No se pudo abrir este archivo.')
  }
}

async function pasarArchivo(l: Llavero, url: string, init: RequestInit | undefined, crudo: typeof fetch): Promise<Response> {
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const resto = decodeURIComponent(new URL(url).pathname.split('/storage/v1/object/')[1] ?? '')
  const [bucket, ...ruta] = resto.split('/')
  if (!bucket || RESERVADAS.has(bucket)) return crudo(url, init)
  const regla = ARCHIVOS[bucket]
  // las fuentes que se mandan a la IA (un PDF para «Aprender») van en claro a propósito: la función las lee y las borra
  const fuenteParaIA = regla?.enClaro && ruta[ruta.length - 1]?.startsWith(regla.enClaro)
  const activo = regla?.estado === 'activo' && !fuenteParaIA
  if ((metodo === 'POST' || metodo === 'PUT') && activo && init?.body) {
    try {
      return crudo(url, { ...init, body: await cifrarSubida(l, regla, ruta, init.body) })
    } catch (e) {
      if (e instanceof ErrorCofre) return respuestaError(e.message)
      throw e
    }
  }
  const res = await crudo(url, init)
  if (metodo !== 'GET' || !res.ok) return res
  return abrirDescarga(l, `${bucket}/${ruta.join('/')}`, activo, res)
}

// ——— el fetch ———

export function crearFetchCifrado(base: string, llavero: () => Llavero | null, crudo: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  const raiz = base.replace(/\/$/, '')
  const rest = `${raiz}/rest/v1/`
  const funciones = `${raiz}/functions/v1/`
  const archivos = `${raiz}/storage/v1/object/`

  const envuelto: typeof fetch = async (input, init) => {
    const l = llavero()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!l || l.fase === 'sin-sesion') return crudo(input, init)
    if (url.startsWith(archivos)) return pasarArchivo(l, url, init, crudo)
    if (url.startsWith(funciones)) return abrirRespuesta(await crudo(input, init), l)
    if (!url.startsWith(rest)) return crudo(input, init)

    const u = new URL(url)
    const tabla = decodeURIComponent(u.pathname.slice(u.pathname.indexOf('/rest/v1/') + 9).split('/')[0])
    if (tabla.startsWith('cofre_')) return crudo(input, init) // el llavero mismo: sus valores ya van cifrados a su manera
    const fn = tabla === 'rpc' ? decodeURIComponent(u.pathname.split('/rest/v1/rpc/')[1] ?? '') : null
    const reglaFn = fn ? FUNCIONES[fn] : undefined
    const regla = fn ? (reglaFn?.estado === 'activo' ? reglaFn : null) : reglaActiva(tabla)
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const c: Contexto | null = regla ? { l, tabla: fn ?? tabla, regla, url: u, headers, crudo, metodo: fn ? 'RPC' : metodo } : null

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
    return abrirRespuesta(res, l, metodo === 'GET' && c && !fn ? (filas) => resellar(envuelto, c, filas) : undefined)
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
