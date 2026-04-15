import { getSingleResponseWithTimeout } from './llmService.js'
import { describePortraitCatalog, PORTRAIT_SLOTS } from '../data/soulPortraitCatalog.js'
import { createFallbackPortrait, getPortraitSeedText, normalizeSoulPortrait } from './soulPortraits.js'

function extractJsonObject(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return null
  try { return JSON.parse(raw) } catch {}
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) } catch {}
  }
  return null
}

function buildPrompt(fields = {}) {
  const shapeJson = JSON.stringify({
    summary: 'short phrase',
    vibeTags: ['tag'],
    slots: Object.fromEntries(PORTRAIT_SLOTS.map((slot) => [slot, '...'])),
  })
  return [
    'You are assembling a layered Picrew-style face portrait for a dead soul profile.',
    'Choose exactly one asset ID per slot from the catalog below.',
    'Base your choices on the soul profile text and the emotional/personality cues it implies.',
    'Aim for a coherent face, not maximum novelty.',
    'Choose an arms pose that feels compositionally coherent with the face and overall vibe.',
    'Return strict JSON only with this shape:',
    shapeJson,
    '',
    'Soul profile:',
    `Name: ${fields?.name || 'Unknown'}`,
    `Cause of Death: ${fields?.causeOfDeath || 'Unknown'}`,
    `Occupation: ${fields?.occupation || 'Unknown'}`,
    `Bio: ${fields?.bio || ''}`,
    '',
    'Catalog:',
    describePortraitCatalog(),
  ].join('\n')
}

function validatePortraitPayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (!payload.slots || typeof payload.slots !== 'object') return false
  return PORTRAIT_SLOTS.every((slot) => typeof payload.slots[slot] === 'string' && payload.slots[slot].trim())
}

export async function generateSoulPortrait(fields = {}) {
  const fallback = createFallbackPortrait(fields)
  try {
    const raw = await getSingleResponseWithTimeout(buildPrompt(fields), {
      maxTokens: 260,
      timeoutMs: 25000,
      temperature: 0.9,
    })
    const parsed = extractJsonObject(raw)
    if (!validatePortraitPayload(parsed)) {
      return normalizeSoulPortrait({
        ...fallback,
        mode: 'fallback',
        summary: '',
        vibeTags: [],
      }, fields)
    }
    return normalizeSoulPortrait({
      version: 1,
      mode: 'llm',
      summary: String(parsed.summary || '').trim(),
      vibeTags: Array.isArray(parsed.vibeTags) ? parsed.vibeTags : [],
      slots: parsed.slots,
    }, fields)
  } catch {
    const hintedTags = getPortraitSeedText(fields)
      .toLowerCase()
      .match(/\b(holy|grim|gentle|romantic|dramatic|bookish|dangerous|warm|stoic|chaotic|funny|weird|vain)\b/g) || []
    return createFallbackPortrait(fields, hintedTags)
  }
}
