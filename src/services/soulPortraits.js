import { PORTRAIT_RENDER_ORDER, PORTRAIT_SLOTS, SOUL_PORTRAIT_CATALOG, getPortraitAsset } from '../data/soulPortraitCatalog.js'

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))).slice(0, 16)
}

function hashSeed(input = '') {
  const text = String(input || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function scoreAsset(asset, desiredTags = []) {
  const assetTags = new Set(normalizeStringArray(asset?.tags))
  return desiredTags.reduce((score, tag) => score + (assetTags.has(tag) ? 3 : 0), 0)
}

export function getPortraitSeedText(fields = {}) {
  return [
    fields?.name || '',
    fields?.causeOfDeath || '',
    fields?.occupation || '',
    fields?.bio || '',
  ].join(' | ')
}

export function pickBestAssetForSlot(slot, desiredTags = [], seed = '') {
  const assets = SOUL_PORTRAIT_CATALOG[slot] || []
  if (!assets.length) return null
  const normalizedTags = normalizeStringArray(desiredTags)
  let best = assets[0]
  let bestScore = -1
  assets.forEach((asset, index) => {
    const score = scoreAsset(asset, normalizedTags)
    const tieBreaker = (hashSeed(`${seed}:${slot}:${asset.id}`) % 1000) / 1000
    const weighted = score + tieBreaker
    if (weighted > bestScore) {
      best = assets[index]
      bestScore = weighted
    }
  })
  return best
}

export function createFallbackPortrait(fields = {}, desiredTags = []) {
  const seed = getPortraitSeedText(fields)
  const tags = normalizeStringArray(desiredTags)
  const slots = Object.fromEntries(
    PORTRAIT_SLOTS.map((slot) => {
      const asset = pickBestAssetForSlot(slot, tags, seed)
      return [slot, asset?.id || (SOUL_PORTRAIT_CATALOG[slot]?.[0]?.id || '')]
    }),
  )

  return {
    version: 1,
    mode: 'fallback',
    vibeTags: tags.slice(0, 8),
    summary: '',
    slots,
  }
}

export function normalizeSoulPortrait(portrait, fields = {}) {
  const next = portrait && typeof portrait === 'object' ? portrait : {}
  const normalizedSlots = {}

  PORTRAIT_SLOTS.forEach((slot) => {
    const candidateId = String(next?.slots?.[slot] || '').trim()
    normalizedSlots[slot] = getPortraitAsset(slot, candidateId)?.id || ''
  })

  const missingRequired = PORTRAIT_SLOTS.some((slot) => !normalizedSlots[slot])
  if (missingRequired) {
    return createFallbackPortrait(fields, next?.vibeTags || [])
  }

  return {
    version: 1,
    mode: String(next?.mode || 'llm').trim() || 'llm',
    vibeTags: normalizeStringArray(next?.vibeTags),
    summary: String(next?.summary || '').trim().slice(0, 160),
    slots: normalizedSlots,
  }
}

export function portraitToLayers(portrait) {
  const normalized = normalizeSoulPortrait(portrait)
  return PORTRAIT_RENDER_ORDER.map((slot) => getPortraitAsset(slot, normalized.slots[slot])).filter(Boolean)
}
