const PREFIX = 'game:v1'

export const ROUND_TTL_SECONDS = 60 * 60 * 12
export const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 180
export const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 30
export const DAILY_ROUND_TTL_SECONDS = 60 * 60 * 36

export function profileKey(playerId) {
  return `${PREFIX}:profile:${playerId}`
}

export function profileIndexKey() {
  return `${PREFIX}:index:profiles`
}

export function historyKey(playerId) {
  return `${PREFIX}:history:${playerId}`
}

export function roundKey(roundId) {
  return `${PREFIX}:round:${roundId}`
}

export function dailyRoundKey(playerId, localDay) {
  return `${PREFIX}:daily:${playerId}:${localDay}`
}

export function currentWeekKey(nowMs = Date.now()) {
  const date = new Date(nowMs)
  const dayOfWeek = date.getUTCDay()
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - dayOfWeek)
  return start.toISOString().slice(0, 10)
}
