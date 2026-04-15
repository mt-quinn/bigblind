import { readJsonBody, sendJson, requirePost } from '../_json.js'
import { kvSetJSON } from '../_storage.js'
import { profileKey, PROFILE_TTL_SECONDS } from '../_keys.js'

export default async function handler(req, res) {
  if (!requirePost(req, res)) return
  const body = await readJsonBody(req)
  const playerId = String(body?.playerId || '').trim()
  const state = body?.state
  if (!playerId) { sendJson(res, 400, { error: 'Missing playerId.' }); return }
  if (state === undefined || state === null) { sendJson(res, 400, { error: 'Missing state.' }); return }

  try {
    await kvSetJSON(profileKey(playerId), state, { exSeconds: PROFILE_TTL_SECONDS })
    sendJson(res, 200, { ok: true, state })
  } catch (err) {
    console.error('state/save error:', err)
    sendJson(res, 500, { error: err.message || 'Failed to save state.' })
  }
}
