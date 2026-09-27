function norm(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function storedWho() {
  try {
    const id = localStorage.getItem('bplus.hqWho')
    return id || null
  } catch {
    return null
  }
}

/** Resuelve el miembro del cuartel a partir de la sesion B+ (sin modal manual). */
export function resolveHqMemberId(members, { authUid, profileName, profileEmail } = {}) {
  if (!members?.length) return null

  if (authUid) {
    const linked = members.find((m) => m.auth_uid === authUid || m.authUid === authUid)
    if (linked) return linked.id
  }

  const saved = storedWho()
  if (saved && members.some((m) => m.id === saved)) return saved

  const first = norm(profileName).split(/\s+/).filter(Boolean)[0]
  if (first) {
    const byName = members.find((m) => {
      const n = norm(m.name)
      return n === first || n.startsWith(first) || norm(m.id) === first
    })
    if (byName) return byName.id
  }

  if (profileEmail) {
    const local = profileEmail.split('@')[0].toLowerCase()
    const byEmail = members.find((m) => m.id === local || norm(m.name) === norm(local))
    if (byEmail) return byEmail.id
  }

  return null
}

export function applyHqWho(state, identity) {
  if (!state || state.who) return { state, resolvedId: null }
  const resolvedId = resolveHqMemberId(state.members, identity)
  if (!resolvedId) return { state, resolvedId: null }
  return { state: { ...state, who: resolvedId }, resolvedId }
}
