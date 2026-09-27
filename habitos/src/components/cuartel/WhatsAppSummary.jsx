import { useHqStore } from '../../data/hq/hqStore.jsx'

export default function WhatsAppSummary() {
  const { space, tasks, columns, members, teamXP, streak } = useHqStore()
  const doneCol = columns.find((c) => c.kind === 'done')?.id
  const open = tasks.filter((t) => !doneCol || t.col !== doneCol).length
  const done = tasks.filter((t) => doneCol && t.col === doneCol).length

  const share = () => {
    const lines = [
      `*${space?.name || 'B+ Cuartel'}*`,
      `${open} abiertas · ${done} validadas · ${teamXP} XP · racha ${streak}d`,
      '',
      ...tasks.filter((t) => !doneCol || t.col !== doneCol).slice(0, 8).map((t) => {
        const m = members.find((x) => x.id === t.who)
        return `• ${t.t}${m ? ` _(${m.name})_` : ''}`
      }),
    ]
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <button type="button" className="amg-iconbtn" onClick={share} aria-label="Resumen WhatsApp" title="Enviar resumen">
      <i className="ti ti-brand-whatsapp" />
    </button>
  )
}
