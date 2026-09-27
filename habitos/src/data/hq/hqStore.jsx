import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { hqApi } from './hqApi.js'
import { hqLocalDb } from './hqLocalDb.js'
import { hqTeamXPOf, hqStreakOf } from './hqAchievements.js'

const HqContext = createContext(null)

export function HqStoreProvider({ children, authUid, profileName, profileEmail }) {
  const [state, setState] = useState(null)
  const [ready, setReady] = useState(false)
  const [lastValidate, setLastValidate] = useState(null)

  const identity = useMemo(
    () => ({ profileName, profileEmail }),
    [profileName, profileEmail],
  )

  const refresh = useCallback(async () => {
    const loaded = await hqApi.load(authUid, identity)
    setState({ ...loaded })
    return loaded
  }, [authUid, identity])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await hqApi.load(authUid, identity)
        if (alive) { setState(data); setReady(true) }
      } catch (e) {
        console.warn('[cuartel] load fallo, usando local', e)
        const data = hqLocalDb.state()
        if (alive) { setState(data); setReady(true) }
      }
    })()
    return () => { alive = false }
  }, [authUid, identity])

  useEffect(() => {
    if (!ready) return undefined
    return hqApi.subscribe(() => { refresh() })
  }, [ready, refresh])

  const mutate = useCallback(async (fn) => {
    const result = await fn()
    const data = await hqApi.load(authUid, identity)
    setState({ ...data })
    return result
  }, [authUid, identity])

  const value = useMemo(() => ({
    ready,
    authUid,
    state,
    who: state?.who,
    space: state?.space,
    members: state?.members || [],
    tasks: state?.tasks || [],
    columns: state?.columns || [],
    areas: state?.areas || [],
    hitos: state?.hitos || [],
    notes: state?.notes || [],
    xp: state?.xp || {},
    unlocked: state?.unlocked || [],
    teamXP: state ? hqTeamXPOf(state) : 0,
    streak: state ? hqStreakOf(state) : 0,
    lastValidate,
    refresh,
    setWho: (id) => {
      setState((prev) => (prev ? { ...prev, who: id } : prev))
      return mutate(() => hqApi.setWho(id, authUid))
    },
    updateSpace: (patch) => mutate(() => hqApi.updateSpace(patch)),
    addTask: (task) => mutate(() => hqApi.addTask(task)),
    updateTask: (id, patch) => mutate(() => hqApi.updateTask(id, patch)),
    moveTask: (id, col, index) => mutate(() => hqApi.moveTask(id, col, index)),
    removeTask: (id) => mutate(() => hqApi.removeTask(id)),
    validateTask: async (id, mode, proof) => {
      const result = await mutate(() => hqApi.validateTask(id, mode, proof))
      setLastValidate({ ...result, t: Date.now() })
      return result
    },
    addHito: (h) => mutate(() => hqApi.addHito(h)),
    updateHito: (id, patch) => mutate(() => hqApi.updateHito(id, patch)),
    removeHito: (id) => mutate(() => hqApi.removeHito(id)),
    addNote: (note) => mutate(() => hqApi.addNote(note)),
    updateNote: (id, patch) => mutate(() => hqApi.updateNote(id, patch)),
    removeNote: (id) => mutate(() => hqApi.removeNote(id)),
    updateMember: (id, patch) => mutate(() => hqApi.updateMember(id, patch)),
    exportJSON: () => hqApi.exportJSON(),
    importJSON: (text) => mutate(() => hqApi.importJSON(text)),
    areaOf: (id) => (state?.areas || []).find((a) => a.id === id),
    memberOf: (id) => (state?.members || []).find((m) => m.id === id),
    doneCol: () => (state?.columns || []).find((c) => c.kind === 'done'),
    tasksInCol: (colId) => (state?.tasks || [])
      .filter((t) => t.col === colId)
      .sort((a, b) => a.order - b.order),
  }), [ready, authUid, state, identity, mutate, refresh, lastValidate])

  return <HqContext.Provider value={value}>{children}</HqContext.Provider>
}

export function useHqStore() {
  const ctx = useContext(HqContext)
  if (!ctx) throw new Error('useHqStore fuera de HqStoreProvider')
  return ctx
}
