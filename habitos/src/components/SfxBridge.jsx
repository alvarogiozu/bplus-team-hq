import { useEffect, useRef } from 'react'
import { useStore } from '../data/mockStore.jsx'
import { playSfx, setSfxEnabled, unlockSfx, lastPriorityAt } from '../lib/sfx.js'

const MILESTONES = [7, 14, 30, 50, 100]
const PRIORITY_SKIP_MS = 120

// Escucha senales del store y dispara SFX. Invisible: no renderiza UI.
export default function SfxBridge() {
  const { prefs, celebration, lastToast, lastCoinGain, lastLevelUp, streak } = useStore()
  const seen = useRef({ level: 0, toast: 0, coin: 0, celeb: 0 })

  useEffect(() => {
    setSfxEnabled(prefs?.sounds !== false)
  }, [prefs?.sounds])

  // iOS / Chrome: el AudioContext solo arranca tras un gesto del usuario.
  useEffect(() => {
    const unlock = () => unlockSfx()
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('touchstart', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!lastLevelUp || lastLevelUp === seen.current.level) return
    if (Date.now() - lastLevelUp > 4000) return
    seen.current.level = lastLevelUp
    playSfx('levelUp')
  }, [lastLevelUp])

  useEffect(() => {
    if (!lastToast || lastToast === seen.current.toast) return
    if (Date.now() - lastToast > 4000) return
    seen.current.toast = lastToast
    playSfx(MILESTONES.includes(streak) ? 'milestone' : 'streak')
  }, [lastToast, streak])

  useEffect(() => {
    if (!lastCoinGain?.t || lastCoinGain.t === seen.current.coin) return
    if (Date.now() - lastCoinGain.t > 4000) return
    seen.current.coin = lastCoinGain.t
    playSfx('coin')
  }, [lastCoinGain])

  useEffect(() => {
    if (!celebration?.t || celebration.t === seen.current.celeb) return
    if (Date.now() - celebration.t > 4000) return
    seen.current.celeb = celebration.t
    // Compra / level-up ya sonaron: no apilar success encima.
    if (performance.now() - lastPriorityAt < PRIORITY_SKIP_MS) return
    playSfx(celebration.kind === 'surprise' ? 'surprise' : 'success')
  }, [celebration])

  return null
}
