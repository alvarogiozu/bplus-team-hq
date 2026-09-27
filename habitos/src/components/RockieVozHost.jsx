import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RockieVoz from './RockieVoz.jsx'

// Un solo lugar abre a Rockie por voz: el botón del centro de la barra (celular), el de la barra
// lateral (PC) — ambos con el evento 'rockie:voz' — y lo que llega desde otra app de Rockie OS:
// ?rockie=… (un pedido: dijiste «ya medité» en la Agenda) o ?voz=escuchar|escribir|manos
// (el Rockie del Inicio: abre la hoja escuchando, con el teclado o en manos libres).
export const abrirVoz = () => window.dispatchEvent(new CustomEvent('rockie:voz'))

export default function RockieVozHost() {
  const [open, setOpen] = useState(false)
  const [pedido, setPedido] = useState('')
  const [modo, setModo] = useState('escuchar')
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const on = () => {
      setPedido('')
      setModo('escuchar')
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
    setModo(['escribir', 'manos'].includes(voz) ? voz : 'escuchar')
    setOpen(true)
  }, [params, setParams])

  return <RockieVoz open={open} pedido={pedido} modo={modo} onClose={() => { setOpen(false); setPedido('') }} />
}
