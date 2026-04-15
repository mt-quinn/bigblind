import { readJsonBody, sendJson, requirePost } from '../_json.js'
import { kvGetJSON } from '../_storage.js'
import { profileKey } from '../_keys.js'

export default async function handler(req, res) {
  if (!requirePost(req, res)) return
  const body = await readJsonBody(req)
  const playerId = String(body?.playerId || '').trim()
  if (!playerId) { sendJson(res, 400, { error: 'Missing playerId.' }); return }

  try {
    const state = await kvGetJSON(profileKey(playerId))
    sendJson(res, 200, { state: state || null })
  } catch (err) {
    console.error('state/get error:', err)
    sendJson(res, 500, { error: err.message || 'Failed to load state.' })
  }
}
