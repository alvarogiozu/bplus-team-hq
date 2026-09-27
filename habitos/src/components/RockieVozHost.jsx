import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RockieVoz from './RockieVoz.jsx'

// Un solo lugar abre a Rockie por voz: el botón del centro de la barra (celular), el de la barra
// lateral (PC) — ambos con el evento 'rockie:voz' — y los pedidos que llegan desde otra app de
// Rockie OS con ?rockie=… (p. ej. dijiste «ya medité» en la Agenda).
export const abrirVoz = () => window.dispatchEvent(new CustomEvent('rockie:voz'))

export default function RockieVozHost() {
  const [open, setOpen] = useState(false)
  const [pedido, setPedido] = useState('')
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const on = () => {
      setPedido('')
      setOpen(true)
    }
    window.addEventListener('rockie:voz', on)
    return () => window.removeEventListener('rockie:voz', on)
  }, [])

  useEffect(() => {
    const incoming = params.get('rockie')
    if (!incoming) return
    const next = new URLSearchParams(params)
    next.delete('rockie')
    setParams(next, { replace: true })
    setPedido(incoming)
    setOpen(true)
  }, [params, setParams])

  return <RockieVoz open={open} pedido={pedido} onClose={() => { setOpen(false); setPedido('') }} />
}
