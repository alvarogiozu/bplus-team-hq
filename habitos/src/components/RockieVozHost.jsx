import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RockieVoz from './RockieVoz.jsx'

// Un solo lugar abre a Rockie: el botón del centro de la barra (celular), el de la barra lateral
// (PC) — ambos con el evento 'rockie:voz' — y lo que llega desde otra app de Rockie OS:
// ?rockie=… (un pedido: dijiste «ya medité» en la Agenda) o ?voz=ver|escuchar|escribir|manos
// (el Rockie del Inicio: abre a Rockie, ya escuchando, con el teclado o en manos libres).
// Tocar a Rockie abre su conversación («ver»): el micrófono no graba hasta que lo tocas.
const MODOS = ['ver', 'escuchar', 'escribir', 'manos']
export const abrirVoz = (modo) => window.dispatchEvent(new CustomEvent('rockie:voz', { detail: MODOS.includes(modo) ? modo : 'ver' }))

export default function RockieVozHost() {
  const [open, setOpen] = useState(false)
  const [pedido, setPedido] = useState('')
  const [modo, setModo] = useState('ver')
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const on = (e) => {
      setPedido('')
      setModo(MODOS.includes(e.detail) ? e.detail : 'ver')
      setOpen(true)
    }
    window.addEventListener('rockie:voz', on)
    return () => window.removeEventListener('rockie:voz', on)
  }, [])

  useEffect(() => {
    const incoming = params.get('rockie')
    const voz = params.get('voz')
    if (!incoming && !voz) return
    const next = new URLSearchParams(params)
    next.delete('rockie')
    next.delete('voz')
    setParams(next, { replace: true })
    setPedido(incoming || '')
    setModo(MODOS.includes(voz) ? voz : 'ver')
    setOpen(true)
  }, [params, setParams])

  return <RockieVoz open={open} pedido={pedido} modo={modo} onClose={() => { setOpen(false); setPedido('') }} />
}
