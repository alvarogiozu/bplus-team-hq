import { describe, expect, it } from 'vitest'
import {
  BLOQUEADO,
  abrirConCodigo,
  abrirSellado,
  cifrarArchivo,
  cifrarValor,
  descifrarArchivo,
  descifrarValor,
  envolverConCodigo,
  esCifrado,
  kidDeArchivo,
  nuevaIdentidad,
  nuevaLlave,
  nuevoCodigo,
  nuevoKid,
  sellarPara,
} from './cripto'
import { abrirJson, crearFetchCifrado } from './fetchCifrado'
import type { Llavero } from './llavero'

const enc = new TextEncoder()

async function llaveroFalso() {
  const llave = await nuevaLlave()
  const kid = nuevoKid('p')
  const l = {
    fase: 'abierto',
    abiertos: new Map(),
    listo: async () => undefined,
    llavePorKid: async (k: string) => (k === kid ? llave : null),
    llaveParaEscribir: async () => ({ kid, llave }),
  } as unknown as Llavero
  return { l, llave, kid }
}

describe('cifrado de valores', () => {
  it('un texto ida y vuelta, y nunca sale igual dos veces', async () => {
    const k = await nuevaLlave()
    const kid = nuevoKid('p')
    const a = await cifrarValor(k, kid, 'Cita con la psicóloga 🧠')
    const b = await cifrarValor(k, kid, 'Cita con la psicóloga 🧠')
    expect(a).not.toBe(b)
    expect(esCifrado(a)).toBe(true)
    expect(a.startsWith(`cf1.${kid}.`)).toBe(true)
    expect(await descifrarValor(k, a)).toBe('Cita con la psicóloga 🧠')
  })

  it('listas y objetos vuelven como JSON', async () => {
    const k = await nuevaLlave()
    const v = [{ t: 'leche', ok: true }, { t: 'pan', ok: false }]
    const s = await cifrarValor(k, 'pAAAAAAAAAAA', v)
    expect(s.startsWith('cj1.')).toBe(true)
    expect(await descifrarValor(k, s)).toEqual(v)
  })

  it('si alguien toca los datos o usa otra llave, no abre', async () => {
    const k = await nuevaLlave()
    const otra = await nuevaLlave()
    const s = await cifrarValor(k, 'pAAAAAAAAAAA', 'secreto')
    const tocado = s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA')
    await expect(descifrarValor(k, tocado)).rejects.toThrow()
    await expect(descifrarValor(otra, s)).rejects.toThrow()
  })
})

describe('sobres entre personas', () => {
  it('solo quien tiene la privada abre lo que se selló para su pública', async () => {
    const ana = await nuevaIdentidad()
    const beto = await nuevaIdentidad()
    const datos = enc.encode('llave del equipo')
    const s = await sellarPara(ana.publica, datos)
    expect(new TextDecoder().decode(await abrirSellado(ana.privada, s))).toBe('llave del equipo')
    await expect(abrirSellado(beto.privada, s)).rejects.toThrow()
  })
})

describe('códigos', () => {
  it('tienen el formato esperado', () => {
    expect(nuevoCodigo(6)).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(nuevoCodigo(3)).toMatch(/^([0-9A-Z]{4}-){2}[0-9A-Z]{4}$/)
  })

  it('abren aunque se escriban en minúsculas, sin guiones o con O en vez de 0', async () => {
    const codigo = '0123-4567-89AB-CDEF-GHJK-MNPQ'
    const e = await envolverConCodigo(codigo, enc.encode('maestra'), 1000)
    const escrito = codigo.toLowerCase().replace(/-/g, ' ').replace('0', 'o')
    expect(new TextDecoder().decode(await abrirConCodigo(escrito, e))).toBe('maestra')
    await expect(abrirConCodigo('0123-4567-89AB-CDEF-GHJK-MNPR', e)).rejects.toThrow()
  })
})

describe('archivos', () => {
  it('se cifran con su kid adelante', async () => {
    const k = await nuevaLlave()
    const datos = crypto.getRandomValues(new Uint8Array(5000))
    const c = await cifrarArchivo(k, 'sABCDEFGHIJK', datos)
    expect(kidDeArchivo(c)).toBe('sABCDEFGHIJK')
    expect(kidDeArchivo(datos)).toBeNull()
    expect(await descifrarArchivo(k, c)).toEqual(datos)
  })
})

describe('abrir respuestas', () => {
  it('abre valores enteros, metidos en textos del servidor y JSON; sin llave muestra 🔒', async () => {
    const { l, llave, kid } = await llaveroFalso()
    const t = await cifrarValor(llave, kid, 'Terminar carro')
    const j = await cifrarValor(llave, kid, [1, 2])
    const ajena = await cifrarValor(await nuevaLlave(), 'sZZZZZZZZZZZ', 'de otro equipo')
    const ajenaJson = await cifrarValor(await nuevaLlave(), 'sZZZZZZZZZZZ', { a: 1 })
    const texto = JSON.stringify([{ name: t, subtasks: j, summary: `creó «${t}»`, otro: ajena, oj: ajenaJson, n: 3 }])
    expect(await abrirJson(l, texto)).toEqual([
      { name: 'Terminar carro', subtasks: [1, 2], summary: 'creó «Terminar carro»', otro: BLOQUEADO, oj: null, n: 3 },
    ])
  })
})

describe('fetch cifrado', () => {
  it('cifra las columnas registradas al insertar y las abre al volver', async () => {
    const { l } = await llaveroFalso()
    let enviado: Record<string, unknown> = {}
    const crudo = (async (_url: string, init?: RequestInit) => {
      enviado = JSON.parse(String(init?.body))
      return new Response(JSON.stringify([enviado]), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
    const f = crearFetchCifrado('https://x.supabase.co', () => l, crudo)
    const res = await f('https://x.supabase.co/rest/v1/rockie_turns?select=*', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ app: 'agenda', role: 'user', text: 'Me siento mal hoy' }),
    })
    expect(enviado.app).toBe('agenda')
    expect(enviado.role).toBe('user')
    expect(esCifrado(enviado.text)).toBe(true)
    expect(await res.json()).toEqual([{ app: 'agenda', role: 'user', text: 'Me siento mal hoy' }])
  })

  it('sin el Cofre abierto no deja salir nada en claro', async () => {
    const l = { fase: 'bloqueado', listo: async () => undefined } as unknown as Llavero
    let llamado = false
    const crudo = (async () => {
      llamado = true
      return new Response('[]')
    }) as unknown as typeof fetch
    const f = crearFetchCifrado('https://x.supabase.co', () => l, crudo)
    const res = await f('https://x.supabase.co/rest/v1/rockie_turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'agenda', role: 'user', text: 'secreto' }),
    })
    expect(llamado).toBe(false)
    expect(res.status).toBe(423)
  })

  it('un texto cifrado que adentro trae otros (actividad sellada) se abre entero', async () => {
    const { l, llave, kid } = await llaveroFalso()
    const titulo = await cifrarValor(llave, kid, 'Armar el carrito')
    const resumen = await cifrarValor(llave, kid, `creó «${titulo}»`)
    expect(await abrirJson(l, JSON.stringify({ summary: resumen }))).toEqual({ summary: 'creó «Armar el carrito»' })
  })

  it('los archivos suben cifrados y bajan abiertos, con su tipo', async () => {
    const { l } = await llaveroFalso()
    let guardado: Blob | null = null
    const crudo = (async (_u: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        guardado = (init!.body as FormData).get('') as Blob
        return new Response('{"Key":"x"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(guardado, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
    }) as unknown as typeof fetch
    const f = crearFetchCifrado('https://x.supabase.co', () => l, crudo)
    const fd = new FormData()
    fd.append('cacheControl', '3600')
    fd.append('', new Blob(['Contrato secreto'], { type: 'text/plain' }))
    const url = 'https://x.supabase.co/storage/v1/object/materiales/equipo-1/abc/contrato.txt'
    await f(url, { method: 'POST', body: fd })
    const bytes = new Uint8Array(await guardado!.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('CFB1')
    expect(new TextDecoder().decode(bytes)).not.toContain('Contrato')
    const res = await f(url, { method: 'GET' })
    expect(res.headers.get('Content-Type')).toBe('text/plain')
    expect(await res.text()).toBe('Contrato secreto')
  })

  it('las tablas que no se cifran pasan igual', async () => {
    const { l } = await llaveroFalso()
    let enviado = ''
    const crudo = (async (_u: string, init?: RequestInit) => {
      enviado = String(init?.body)
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const f = crearFetchCifrado('https://x.supabase.co', () => l, crudo)
    await f('https://x.supabase.co/rest/v1/profiles?id=eq.1', { method: 'PATCH', body: '{"display_name":"Ana"}' })
    expect(enviado).toBe('{"display_name":"Ana"}')
  })
})
