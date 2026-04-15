const PLAYER_STORAGE_KEY = 'game:player:v1'

function randomPlayerId() {
  const maybeUuid = globalThis?.crypto?.randomUUID?.()
  if (maybeUuid) return maybeUuid
  return `gp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreatePlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_STORAGE_KEY)
    if (existing) {
      const parsed = JSON.parse(existing)
      if (parsed?.playerId && typeof parsed.playerId === 'string') return parsed.playerId
    }
  } catch {
    // Ignore
  }
  const playerId = randomPlayerId()
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ playerId }))
  } catch {
    // Ignore
  }
  return playerId
}

export function getStoredPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_STORAGE_KEY)
    if (!existing) return ''
    const parsed = JSON.parse(existing)
    return typeof parsed?.playerId === 'string' ? parsed.playerId : ''
  } catch {
    return ''
  }
}

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getLocalDayKey(timezone = getBrowserTimezone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  let data = null
  try { data = await response.json() } catch { data = null }
  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`
    throw new Error(message)
  }
  return data
}

export async function loadState(playerId) {
  return postJson('/api/game/state/get', { playerId })
}

export async function saveState(playerId, state) {
  return postJson('/api/game/state/save', { playerId, state })
}
