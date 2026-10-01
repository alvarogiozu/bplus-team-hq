// El llavero del Cofre: qué llaves tiene esta persona en este dispositivo y cómo consigue las que le faltan.
//
//   llave maestra (una por persona) ── vive SOLO en sus dispositivos (IndexedDB). Al servidor llega envuelta con el
//   │                                  código de recuperación (cofre_cuentas.recuperacion), que el servidor nunca ve.
//   ├─ cifra lo personal (notas, agenda, conversaciones con Rockie…)
//   └─ cifra su llave privada de identidad (ECDH), que sirve para recibir llaves de otros:
//        llave de un equipo / nota compartida ── se le entrega a cada miembro «sellada» con su llave pública
//                                                (cofre_sobres). El servidor guarda sobres que no puede abrir.
//
// Un dispositivo nuevo consigue la maestra con el código de recuperación o con un traspaso desde otro dispositivo
// abierto (código de un solo uso, 15 minutos). Nadie más —ni el dueño de Rockie— puede abrir el Cofre.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  abrirConCodigo,
  abrirSellado,
  b64u,
  deB64u,
  cifrarValor,
  descifrarValor,
  envolverConCodigo,
  exportarLlave,
  exportarPrivada,
  importarLlave,
  importarPrivada,
  nuevaIdentidad,
  nuevaLlave,
  nuevoCodigo,
  nuevoKid,
  sellarPara,
  type Envuelto,
  type Publica,
  type Sellado,
} from './cripto'

export type FaseCofre = 'sin-sesion' | 'cargando' | 'nuevo' | 'bloqueado' | 'abierto' | 'error'
export type EstadoCofre = { fase: FaseCofre; error?: string }

/** De dónde sale la llave de una fila: lo personal usa la maestra; lo compartido, la llave de su ámbito. */
/** espacio = un equipo · nota = una página compartida · agenda = lo de tu agenda que ve tu equipo (id = tu user id) */
export type AmbitoCompartido = 'espacio' | 'nota' | 'agenda'
export type Ambito = { tipo: 'personal' } | { tipo: AmbitoCompartido; id: string }

type Cuenta = { kid: string; publica: Publica; privada: string; recuperacion: Envuelto }
type Guardada = { kid: string; llave: CryptoKey }

// ——— IndexedDB: la maestra se guarda como CryptoKey (no como texto) ———

const DB = 'rockie-cofre'
const ALMACEN = 'llaves'

function idb<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((ok, mal) => {
    let pedido: IDBOpenDBRequest
    try {
      pedido = indexedDB.open(DB, 1)
    } catch (e) {
      return mal(e)
    }
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN)
    pedido.onerror = () => mal(pedido.error)
    pedido.onsuccess = () => {
      const db = pedido.result
      const tx = db.transaction(ALMACEN, modo)
      const r = fn(tx.objectStore(ALMACEN))
      tx.oncomplete = () => {
        db.close()
        ok(r.result as T)
      }
      tx.onerror = () => {
        db.close()
        mal(tx.error)
      }
    }
  })
}

export class Llavero {
  private uid: string | null = null
  private maestra: Guardada | null = null
  private privada: CryptoKey | null = null
  private publica: Publica | null = null
  private llaves = new Map<string, CryptoKey>()
  private sellados = new Map<string, Sellado>()
  /** De qué ámbito es cada llave que llegó en un sobre («espacio:<id>»). */
  private ambitoDeKid = new Map<string, string>()
  /** Llaves que se buscaron y no estaban (para no pedir la lista de sobres en cada valor). */
  private faltantes = new Map<string, number>()
  private actuales = new Map<string, { kid: string; rotar: boolean; t: number }>()
  private creando = new Map<string, Promise<{ kid: string; llave: CryptoKey } | null>>()
  private estado: EstadoCofre = { fase: 'sin-sesion' }
  /** Valores ya abiertos (por su texto cifrado): se borran junto con las llaves. */
  readonly abiertos = new Map<string, unknown>()
  private oyentes = new Set<() => void>()
  private cargaSobres: Promise<void> | null = null
  private ultimaCargaSobres = 0
  private inicio: Promise<void> | null = null
  private canal: BroadcastChannel | null = null
  private readonly db: SupabaseClient
  private readonly ref: string

  constructor(db: SupabaseClient, ref: string) {
    this.db = db
    this.ref = ref
    try {
      // las apps del escritorio corren en ventanas (iframes) del mismo sitio: si una abre el Cofre, las demás también
      this.canal = new BroadcastChannel('rockie-cofre')
      this.canal.onmessage = (e) => {
        if (e.data?.ref === this.ref && e.data?.uid === this.uid) void this.recargar()
      }
    } catch {
      this.canal = null
    }
  }

  // ——— estado ———

  get fase(): FaseCofre {
    return this.estado.fase
  }

  get snapshot(): EstadoCofre {
    return this.estado
  }

  get usuario(): string | null {
    return this.uid
  }

  suscribir(fn: () => void): () => void {
    this.oyentes.add(fn)
    return () => this.oyentes.delete(fn)
  }

  private poner(e: EstadoCofre) {
    this.estado = e
    this.oyentes.forEach((f) => f())
  }

  private avisarOtrasVentanas() {
    this.canal?.postMessage({ ref: this.ref, uid: this.uid })
  }

  private clave(): string {
    return `${this.ref}:${this.uid}`
  }

  /** Espera a que el llavero termine de cargar (lo usa el cifrado antes de escribir). */
  listo(): Promise<void> {
    return this.inicio ?? Promise.resolve()
  }

  // ——— arranque ———

  /** Llamar cada vez que cambia la sesión. */
  iniciar(uid: string | null): Promise<void> {
    if (uid === this.uid && this.inicio) return this.inicio
    this.uid = uid
    this.olvidarMemoria()
    if (!uid) {
      this.poner({ fase: 'sin-sesion' })
      this.inicio = null
      return Promise.resolve()
    }
    this.inicio = this.cargar()
    return this.inicio
  }

  private recargar(): Promise<void> {
    if (!this.uid) return Promise.resolve()
    this.olvidarMemoria()
    this.inicio = this.cargar()
    return this.inicio
  }

  private olvidarMemoria() {
    this.maestra = null
    this.privada = null
    this.publica = null
    this.abiertos.clear()
    this.llaves.clear()
    this.sellados.clear()
    this.ambitoDeKid.clear()
    this.faltantes.clear()
    this.actuales.clear()
    this.creando.clear()
    this.ultimaCargaSobres = 0
  }

  private async cargar(): Promise<void> {
    const uid = this.uid
    this.poner({ fase: 'cargando' })
    try {
      const [cuenta, guardada] = await Promise.all([this.leerCuenta(), this.leerDispositivo()])
      if (uid !== this.uid) return
      if (!cuenta) {
        if (guardada) await this.borrarDispositivo()
        this.poner({ fase: 'nuevo' })
        return
      }
      if (!guardada || guardada.kid !== cuenta.kid) {
        if (guardada) await this.borrarDispositivo()
        this.poner({ fase: 'bloqueado' })
        return
      }
      await this.abrir(guardada, cuenta)
    } catch (e) {
      if (uid !== this.uid) return
      this.poner({ fase: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async leerCuenta(): Promise<Cuenta | null> {
    const { data, error } = await this.db
      .from('cofre_cuentas')
      .select('kid, publica, privada, recuperacion')
      .eq('user_id', this.uid!)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as Cuenta | null) ?? null
  }

  private async leerDispositivo(): Promise<Guardada | null> {
    try {
      return (await idb<Guardada>('readonly', (s) => s.get(this.clave()))) ?? null
    } catch {
      return null
    }
  }

  private async guardarDispositivo(g: Guardada) {
    try {
      await idb('readwrite', (s) => s.put(g, this.clave()))
    } catch {
      // sin IndexedDB (modo privado antiguo): el Cofre queda abierto solo mientras dure esta pestaña
    }
  }

  private async borrarDispositivo() {
    try {
      await idb('readwrite', (s) => s.delete(this.clave()))
    } catch {
      /* nada que borrar */
    }
  }

  private async abrir(g: Guardada, cuenta: Cuenta) {
    const jwk = (await descifrarValor(g.llave, cuenta.privada)) as JsonWebKey
    this.privada = await importarPrivada(jwk)
    // la pública propia sale de la privada, no del servidor: así nadie puede cambiarla por la suya
    this.publica = { x: jwk.x!, y: jwk.y! }
    this.maestra = g
    this.llaves.set(g.kid, g.llave)
    this.poner({ fase: 'abierto' })
    void this.cargarSobres(true)
  }

  // ——— crear, abrir, traspasar ———

  /** Primera vez: crea la maestra y la identidad. Devuelve el código de recuperación (se muestra UNA vez). */
  async crear(): Promise<string> {
    if (this.fase !== 'nuevo') throw new Error('Este Cofre ya existe')
    const llave = await nuevaLlave()
    const kid = nuevoKid('p')
    const id = await nuevaIdentidad()
    const codigo = nuevoCodigo(6)
    const cuenta: Cuenta = {
      kid,
      publica: id.publica,
      privada: await cifrarValor(llave, kid, await exportarPrivada(id.privada)),
      recuperacion: await envolverConCodigo(codigo, await exportarLlave(llave)),
    }
    const { error } = await this.db.from('cofre_cuentas').insert({ user_id: this.uid, ...cuenta })
    if (error) {
      // otro dispositivo lo creó al mismo tiempo: hay que abrir ese
      await this.recargar()
      throw new Error(/duplicate|unique/i.test(error.message) ? 'Tu Cofre ya se creó en otro dispositivo.' : error.message)
    }
    const g = { kid, llave }
    await this.guardarDispositivo(g)
    await this.abrir(g, cuenta)
    this.avisarOtrasVentanas()
    return codigo
  }

  /** Abre el Cofre en este dispositivo con el código de recuperación. Lanza si el código no es. */
  async abrirConCodigo(codigo: string): Promise<void> {
    const cuenta = await this.leerCuenta()
    if (!cuenta) throw new Error('Esta cuenta todavía no tiene Cofre')
    let raw: Uint8Array
    try {
      raw = await abrirConCodigo(codigo, cuenta.recuperacion)
    } catch {
      throw new Error('Ese código no abre tu Cofre. Revisa que esté completo.')
    }
    const g = { kid: cuenta.kid, llave: await importarLlave(raw) }
    await this.guardarDispositivo(g)
    await this.abrir(g, cuenta)
    this.avisarOtrasVentanas()
  }

  /** Cambia el código de recuperación (el anterior deja de servir). Devuelve el nuevo. */
  async nuevoCodigoRecuperacion(): Promise<string> {
    if (!this.maestra) throw new Error('Abre tu Cofre primero')
    const codigo = nuevoCodigo(6)
    const recuperacion = await envolverConCodigo(codigo, await exportarLlave(this.maestra.llave))
    const { error } = await this.db
      .from('cofre_cuentas')
      .update({ recuperacion, actualizado: new Date().toISOString() })
      .eq('user_id', this.uid!)
    if (error) throw new Error(error.message)
    return codigo
  }

  /** Desde un dispositivo abierto: deja la maestra lista para otro dispositivo por 15 minutos. */
  async prepararTraspaso(): Promise<string> {
    if (!this.maestra) throw new Error('Abre tu Cofre primero')
    const codigo = nuevoCodigo(3)
    const paquete = await envolverConCodigo(codigo, await exportarLlave(this.maestra.llave), 600_000)
    const expira = new Date(Date.now() + 15 * 60_000).toISOString()
    const { error } = await this.db.from('cofre_traspasos').upsert({ user_id: this.uid, kid: this.maestra.kid, paquete, expira })
    if (error) throw new Error(error.message)
    return codigo
  }

  async cancelarTraspaso(): Promise<void> {
    await this.db.from('cofre_traspasos').delete().eq('user_id', this.uid!)
  }

  /** En el dispositivo nuevo: abre el Cofre con el código que muestra el otro dispositivo. */
  async recibirTraspaso(codigo: string): Promise<void> {
    const { data, error } = await this.db
      .from('cofre_traspasos')
      .select('kid, paquete, expira')
      .eq('user_id', this.uid!)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data || new Date(data.expira).getTime() < Date.now()) {
      throw new Error('No hay un traspaso activo. En tu otro dispositivo toca «Agregar dispositivo» otra vez.')
    }
    let raw: Uint8Array
    try {
      raw = await abrirConCodigo(codigo, data.paquete as Envuelto)
    } catch {
      throw new Error('Ese código no coincide con el de tu otro dispositivo.')
    }
    const cuenta = await this.leerCuenta()
    if (!cuenta || cuenta.kid !== data.kid) throw new Error('El traspaso ya no corresponde a tu Cofre.')
    const g = { kid: cuenta.kid, llave: await importarLlave(raw) }
    await this.guardarDispositivo(g)
    await this.abrir(g, cuenta)
    await this.cancelarTraspaso()
    this.avisarOtrasVentanas()
  }

  /** Borra la llave de este dispositivo (para una computadora prestada). Los datos siguen a salvo en el Cofre. */
  async olvidarDispositivo(): Promise<void> {
    await this.borrarDispositivo()
    this.olvidarMemoria()
    this.poner({ fase: 'bloqueado' })
    this.avisarOtrasVentanas()
  }

  // ——— llaves para cifrar y descifrar ———

  /** La llave con la que se cerró un valor (por su kid), o null si esta persona no la tiene. */
  async llavePorKid(kid: string): Promise<CryptoKey | null> {
    const ya = this.llaves.get(kid)
    if (ya) return ya
    if (!this.privada) return null
    if (!this.sellados.has(kid) && Date.now() - (this.faltantes.get(kid) ?? 0) > 3_000) {
      // una llave que no se conocía (recién creada en otra ventana o entregada por alguien del equipo): se
      // vuelve a pedir la lista, esperando antes la que ya iba (pudo empezar antes de que llegara este sobre)
      this.faltantes.set(kid, Date.now())
      if (this.cargaSobres) await this.cargaSobres
      await this.cargarSobres(true)
    }
    const s = this.sellados.get(kid)
    if (!s) return null
    try {
      const k = await importarLlave(await abrirSellado(this.privada, s))
      this.llaves.set(kid, k)
      return k
    } catch {
      return null
    }
  }

  /** Trae los sobres (llaves de equipos y notas compartidas) que le llegaron a esta persona. */
  private cargarSobres(forzar: boolean): Promise<void> {
    if (this.cargaSobres) return this.cargaSobres
    if (!forzar && Date.now() - this.ultimaCargaSobres < 5_000) return Promise.resolve()
    this.cargaSobres = (async () => {
      try {
        const { data } = await this.db.from('cofre_sobres').select('kid, sellado, ambito, ambito_id').eq('para', this.uid!)
        for (const r of (data ?? []) as { kid: string; sellado: Sellado; ambito: string; ambito_id: string }[]) {
          this.sellados.set(r.kid, r.sellado)
          this.ambitoDeKid.set(r.kid, `${r.ambito}:${r.ambito_id}`)
        }
      } finally {
        this.ultimaCargaSobres = Date.now()
        this.cargaSobres = null
      }
    })()
    return this.cargaSobres
  }

  /** ¿Llegaron llaves nuevas (alguien del equipo te entregó la suya)? Para volver a pedir lo que se veía con 🔒. */
  async revisarSobres(): Promise<boolean> {
    if (!this.privada) return false
    const antes = this.sellados.size
    await this.cargarSobres(true)
    return this.sellados.size > antes
  }

  /** Llave con la que se cifra lo nuevo de un ámbito. null = esta persona aún no la tiene (no se guarda nada). */
  async llaveParaEscribir(a: Ambito): Promise<{ kid: string; llave: CryptoKey } | null> {
    await this.listo()
    if (!this.maestra) return null
    if (a.tipo === 'personal') return { kid: this.maestra.kid, llave: this.maestra.llave }
    const clave = `${a.tipo}:${a.id}`
    let actual = this.actuales.get(clave)
    if (!actual || Date.now() - actual.t > 60_000) {
      const { data } = await this.db
        .from('cofre_ambitos')
        .select('kid, rotar')
        .eq('ambito', a.tipo)
        .eq('ambito_id', a.id)
        .maybeSingle()
      actual = data ? { kid: data.kid as string, rotar: Boolean(data.rotar), t: Date.now() } : undefined
      if (actual) this.actuales.set(clave, actual)
    }
    if (actual && !actual.rotar) {
      const k = await this.llavePorKid(actual.kid)
      return k ? { kid: actual.kid, llave: k } : null
    }
    // nadie ha creado la llave de este ámbito todavía (o alguien salió y toca cambiarla): la crea esta persona
    let p = this.creando.get(clave)
    if (!p) {
      p = this.crearLlaveDeAmbito(a, actual?.kid ?? null).finally(() => this.creando.delete(clave))
      this.creando.set(clave, p)
    }
    return p
  }

  private async crearLlaveDeAmbito(
    a: { tipo: AmbitoCompartido; id: string },
    anterior: string | null,
  ): Promise<{ kid: string; llave: CryptoKey } | null> {
    const llave = await nuevaLlave()
    const kid = nuevoKid(a.tipo === 'espacio' ? 's' : a.tipo === 'nota' ? 'n' : 'a')
    const raw = await exportarLlave(llave)
    // primero el sobre propio (si algo falla después, nadie queda con una llave que no puede abrir)
    const yo = await this.miPublica()
    const { error: e1 } = await this.db
      .from('cofre_sobres')
      .insert({ kid, para: this.uid, ambito: a.tipo, ambito_id: a.id, sellado: await sellarPara(yo, raw) })
    if (e1) return null
    const { data: ganador, error: e2 } = await this.db.rpc('cofre_reclamar', {
      p_ambito: a.tipo,
      p_ambito_id: a.id,
      p_kid: kid,
      p_anterior: anterior,
    })
    if (e2) return null
    const kidActual = String(ganador)
    this.actuales.set(`${a.tipo}:${a.id}`, { kid: kidActual, rotar: false, t: Date.now() })
    if (kidActual !== kid) {
      // otra persona la creó al mismo tiempo: se usa la suya (llega en su sobre)
      const k = await this.llavePorKid(kidActual)
      return k ? { kid: kidActual, llave: k } : null
    }
    this.llaves.set(kid, llave)
    this.ambitoDeKid.set(kid, `${a.tipo}:${a.id}`)
    await this.repartirPendientes()
    return { kid, llave }
  }

  /** Todas las llaves (también las viejas) que esta persona tiene de un ámbito, para meterlas en una invitación. */
  async llavesDe(a: { tipo: AmbitoCompartido; id: string }): Promise<Record<string, string>> {
    await this.llaveParaEscribir(a) // que exista al menos una
    await this.cargarSobres(true)
    const out: Record<string, string> = {}
    for (const [kid, amb] of this.ambitoDeKid) {
      if (amb !== `${a.tipo}:${a.id}`) continue
      const k = await this.llavePorKid(kid)
      if (k) out[kid] = b64u(await exportarLlave(k))
    }
    return out
  }

  /** Guarda como propias las llaves que trajo una invitación (cada una sellada para la pública de esta persona). */
  async adoptarLlaves(a: { tipo: AmbitoCompartido; id: string }, llaves: Record<string, string>): Promise<number> {
    await this.listo()
    if (!this.publica) return 0
    let n = 0
    for (const [kid, cruda] of Object.entries(llaves)) {
      const raw = deB64u(cruda)
      const { error } = await this.db.from('cofre_sobres').insert({
        kid,
        para: this.uid,
        ambito: a.tipo,
        ambito_id: a.id,
        sellado: await sellarPara(this.publica, raw),
      })
      if (error && !/duplicate|unique/i.test(error.message)) continue
      this.llaves.set(kid, await importarLlave(raw))
      this.ambitoDeKid.set(kid, `${a.tipo}:${a.id}`)
      this.abiertos.clear() // lo que se mostró con 🔒 ahora se puede abrir
      n++
    }
    return n
  }

  private async miPublica(): Promise<Publica> {
    if (!this.publica) throw new Error('Abre tu Cofre primero')
    return this.publica
  }

  /** Entrega las llaves que esta persona tiene a los miembros que todavía no las tienen (recién llegados). */
  async repartirPendientes(): Promise<number> {
    if (!this.maestra) return 0
    const { data, error } = await this.db.rpc('cofre_pendientes')
    if (error || !Array.isArray(data)) return 0
    let n = 0
    for (const p of data as { ambito: string; ambito_id: string; kid: string; para: string; publica: Publica }[]) {
      const k = await this.llavePorKid(p.kid)
      if (!k) continue
      const sellado = await sellarPara(p.publica, await exportarLlave(k))
      const { error: e } = await this.db
        .from('cofre_sobres')
        .insert({ kid: p.kid, para: p.para, ambito: p.ambito, ambito_id: p.ambito_id, sellado })
      if (!e) n++
    }
    return n
  }
}
