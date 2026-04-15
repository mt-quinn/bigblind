import { PICREW_2815216_PACK } from './picrew2815216Pack.js'
import { PICREW_2815216_TAG_OVERRIDES } from './picrew2815216TagOverrides.js'

const EXCLUDED_ASSET_IDS = new Set([
  'picrew2815216-hair-05',
  'picrew2815216-hair-08',
  'picrew2815216-hair-09',
])

function makeSlotLabel(slot) {
  if (slot === 'base') return 'Base Face'
  if (slot === 'eyes') return 'Eyes'
  if (slot === 'nose') return 'Nose'
  if (slot === 'mouth') return 'Mouth'
  if (slot === 'ears') return 'Ears'
  if (slot === 'hair') return 'Hair'
  if (slot === 'arms') return 'Arms'
  return slot.charAt(0).toUpperCase() + slot.slice(1)
}

export const PORTRAIT_SLOTS = ['base', 'eyes', 'nose', 'mouth', 'ears', 'hair', 'arms']
export const PORTRAIT_RENDER_ORDER = ['arms', 'ears', 'base', 'eyes', 'nose', 'mouth', 'hair']

function mergeTags(baseTags = [], overrideTags = []) {
  return Array.from(new Set([...(Array.isArray(baseTags) ? baseTags : []), ...(Array.isArray(overrideTags) ? overrideTags : [])]))
}

export const SOUL_PORTRAIT_CATALOG = Object.fromEntries(PORTRAIT_SLOTS.map((slot) => [
  slot,
  (Array.isArray(PICREW_2815216_PACK.slots?.[slot]) ? PICREW_2815216_PACK.slots[slot] : []).map((asset) => {
    const override = PICREW_2815216_TAG_OVERRIDES?.[asset.id] || {}
    return {
      ...asset,
      ...override,
      tags: mergeTags(asset.tags, override.tags),
    }
  }).filter((asset) => !EXCLUDED_ASSET_IDS.has(asset.id)),
]))

export const PORTRAIT_ASSETS = PORTRAIT_SLOTS.flatMap((slot) => SOUL_PORTRAIT_CATALOG[slot] || [])

export function getPortraitAsset(slot, id) {
  return (SOUL_PORTRAIT_CATALOG?.[slot] || []).find((asset) => asset.id === id) || null
}

export function getPortraitAssetById(id) {
  return PORTRAIT_ASSETS.find((asset) => asset.id === id) || null
}

export function describePortraitCatalog() {
  return PORTRAIT_SLOTS.map((slot) => {
    const assets = (SOUL_PORTRAIT_CATALOG[slot] || []).map((asset) => `${asset.id} (${(asset.tags || []).join(', ')})`)
    return `${makeSlotLabel(slot)} options:\n- ${assets.join('\n- ')}`
  }).join('\n\n')
}
