import fs from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ROOT = '/Users/quinn/Documents/Pearly Gates'
const RAW_ROOT = path.join(PROJECT_ROOT, 'public/picrew/2815216/raw')
const STACK_XML_PATH = path.join(RAW_ROOT, 'stack.xml')
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'src/data/picrew2815216Pack.js')

const SLOT_ALIAS = {
  face: 'base',
}

const OMIT_SLOTS = new Set(['background'])

const DEFAULT_SLOT_TAGS = {
  base: ['face-shape', 'skin-tone', 'head', 'manual-tagging-needed'],
  eyes: ['eye-shape', 'expression', 'manual-tagging-needed'],
  mouth: ['mouth-shape', 'expression', 'manual-tagging-needed'],
  nose: ['nose-shape', 'manual-tagging-needed'],
  ears: ['ear-shape', 'manual-tagging-needed'],
  hair: ['hair-style', 'hair-shape', 'manual-tagging-needed'],
  arms: ['pose', 'hands', 'manual-tagging-needed'],
}

function toPosix(value = '') {
  return String(value).replaceAll(path.sep, '/')
}

function toPublicUrlPath(relativePath = '') {
  return `/${toPosix(relativePath).split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
}

function parseStacks(xml = '') {
  const stackPattern = /<stack name="([^"]+)">([\s\S]*?)<\/stack>/g
  const layerPattern = /<layer\s+src="([^"]+)"([^>]*)\/>/g
  const stacks = []

  for (const match of xml.matchAll(stackPattern)) {
    const [, rawSlot, body] = match
    const sourceSlot = String(rawSlot || '').trim()
    if (!sourceSlot || OMIT_SLOTS.has(sourceSlot)) continue

    const slot = SLOT_ALIAS[sourceSlot] || sourceSlot
    const layers = []
    let index = 0
    for (const layerMatch of body.matchAll(layerPattern)) {
      const [, src, attrs] = layerMatch
      index += 1
      layers.push({
        index,
        src: String(src || '').trim(),
        visibleByDefault: !/visibility="hidden"/.test(String(attrs || '')),
      })
    }

    stacks.push({ sourceSlot, slot, layers })
  }

  return stacks
}

function buildModuleSource(stacks = []) {
  const header = [
    '// Generated from 2815216.ora via scripts/import-picrew-ora.mjs',
    '// Source Picrew: https://picrew.me/en/image_maker/2815216',
    '// Background assets intentionally omitted.',
    '',
  ].join('\n')

  const lines = [
    `${header}export const PICREW_2815216_PACK = ${JSON.stringify({
      id: 'picrew-2815216',
      title: 'Imported Picrew 2815216',
      sourceUrl: 'https://picrew.me/en/image_maker/2815216',
      canvas: { width: 600, height: 600 },
      omittedSlots: ['background'],
      slots: Object.fromEntries(
        stacks.map(({ slot, sourceSlot, layers }) => [
          slot,
          layers.map((layer) => ({
            id: `picrew2815216-${slot}-${String(layer.index).padStart(2, '0')}`,
            slot,
            sourceSlot,
            label: `${slot} option ${layer.index}`,
            src: toPublicUrlPath(`picrew/2815216/raw/${layer.src}`),
            originalSrc: layer.src,
            order: layer.index,
            visibleByDefault: layer.visibleByDefault,
            tags: DEFAULT_SLOT_TAGS[slot] || ['manual-tagging-needed'],
          })),
        ]),
      ),
    }, null, 2)};`,
    '',
    'export const PICREW_2815216_SLOT_ORDER = Object.keys(PICREW_2815216_PACK.slots);',
    '',
  ]

  return lines.join('\n')
}

const stackXml = await fs.readFile(STACK_XML_PATH, 'utf8')
const stacks = parseStacks(stackXml)
await fs.writeFile(OUTPUT_PATH, buildModuleSource(stacks), 'utf8')
console.log(`Wrote ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`)
