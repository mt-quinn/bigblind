// Broad synthetic tagging pass for testing.
// Goal: produce varied, reusable semantic tags across the imported Picrew assets.
// These are not hand-curated for accuracy yet, but they give the generator enough
// signal to make diverse choices while we validate the pipeline.

function makeId(slot, index) {
  return `picrew2815216-${slot}-${String(index).padStart(2, '0')}`
}

function buildOverrides(slot, combos) {
  return Object.fromEntries(
    combos.map((tags, index) => [
      makeId(slot, index + 1),
      { tags },
    ]),
  )
}

const baseCombos = [
  ['default', 'soft-jaw', 'slim', 'grey-blue', 'gentle'],
  ['round-face', 'soft', 'friendly', 'open', 'warm'],
  ['long-face', 'narrow', 'somber', 'gaunt', 'grim'],
  ['wide-face', 'solid', 'sturdy', 'grounded', 'plain'],
  ['soft-jaw', 'sweet', 'gentle', 'calm', 'kind'],
  ['broad-head', 'stoic', 'stern', 'heavy', 'grim'],
  ['round-face', 'goofy', 'playful', 'friendly', 'awkward'],
  ['long-face', 'dramatic', 'theatrical', 'vain', 'stylized'],
  ['narrow', 'sharp', 'intense', 'scheming', 'hard'],
  ['soft', 'dreamy', 'gentle', 'tender', 'romantic'],
  ['broad-head', 'tough', 'weathered', 'rough', 'serious'],
  ['slim', 'clever', 'bookish', 'reserved', 'quiet'],
  ['round-face', 'innocent', 'sweet', 'open', 'earnest'],
  ['long-face', 'weird', 'haunted', 'offbeat', 'creature'],
  ['wide-face', 'bold', 'confident', 'loud', 'charismatic'],
  ['soft-jaw', 'sad', 'wounded', 'timid', 'uncertain'],
  ['broad-head', 'menacing', 'severe', 'cold', 'unyielding'],
  ['slim', 'mischievous', 'playful', 'quick', 'cheeky'],
  ['round-face', 'chaotic', 'silly', 'wild', 'funny'],
  ['long-face', 'deadpan', 'dry', 'tired', 'burned-out'],
  ['wide-face', 'heroic', 'earnest', 'steady', 'reliable'],
  ['narrow', 'cunning', 'sly', 'predatory', 'smug'],
  ['soft', 'romantic', 'pretty', 'gentle', 'glamorous'],
  ['broad-head', 'monstrous', 'creature', 'odd', 'rough'],
  ['slim', 'awkward', 'nervous', 'anxious', 'fussy'],
  ['round-face', 'blank', 'neutral', 'plain', 'quiet'],
  ['long-face', 'regal', 'grand', 'dramatic', 'composed'],
  ['wide-face', 'jolly', 'hearty', 'friendly', 'robust'],
]

const eyesCombos = [
  ['default', 'narrow', 'sleepy', 'mischievous', 'half-lidded'],
  ['wide', 'innocent', 'open', 'earnest', 'bright'],
  ['narrow', 'scheming', 'sly', 'sharp', 'predatory'],
  ['droopy', 'sad', 'tired', 'wounded', 'soft'],
  ['blank', 'deadpan', 'flat', 'unimpressed', 'dry'],
  ['wide', 'goofy', 'surprised', 'silly', 'cartoony'],
  ['narrow', 'angry', 'intense', 'hard', 'stern'],
  ['sleepy', 'burned-out', 'world-weary', 'deadpan', 'low-energy'],
  ['bright', 'cheerful', 'friendly', 'open', 'sweet'],
  ['scheming', 'smug', 'amused', 'knowing', 'playful'],
  ['tiny-pupil', 'weird', 'unsettling', 'chaotic', 'creature'],
  ['soft', 'gentle', 'kind', 'calm', 'tender'],
  ['sharp', 'focused', 'heroic', 'determined', 'steady'],
  ['dreamy', 'romantic', 'pretty', 'glamorous', 'soft'],
  ['wide', 'nervous', 'anxious', 'awkward', 'alert'],
  ['narrow', 'menacing', 'cold', 'grim', 'severe'],
  ['lopsided', 'quirky', 'offbeat', 'funny', 'odd'],
]

const noseCombos = [
  ['default', 'tiny', 'button', 'small', 'cute'],
  ['long', 'sharp', 'prominent', 'stern', 'angular'],
  ['round', 'soft', 'plain', 'friendly', 'simple'],
  ['wide', 'broad', 'sturdy', 'earthy', 'grounded'],
  ['upturned', 'playful', 'cheeky', 'light', 'sweet'],
  ['pointed', 'odd', 'creature', 'weird', 'stylized'],
]

const mouthCombos = [
  ['default', 'smirk', 'crooked', 'playful', 'mischievous'],
  ['smile', 'open-mouth', 'friendly', 'warm', 'cheerful'],
  ['frown', 'sad', 'wounded', 'soft', 'downturned'],
  ['flat', 'deadpan', 'blank', 'dry', 'still'],
  ['grin', 'chaotic', 'wild', 'goofy', 'big-expression'],
  ['snarl', 'angry', 'menacing', 'intense', 'sharp'],
  ['tiny-smile', 'shy', 'sweet', 'gentle', 'reserved'],
  ['smug', 'side-smile', 'cocky', 'knowing', 'amused'],
  ['open-mouth', 'surprised', 'awkward', 'nervous', 'uneasy'],
  ['grimace', 'strained', 'stressed', 'tense', 'uncomfortable'],
  ['toothy', 'bold', 'loud', 'showy', 'theatrical'],
  ['pout', 'petulant', 'vain', 'dramatic', 'fussy'],
  ['crooked', 'odd', 'offbeat', 'funny', 'quirky'],
  ['frown', 'stern', 'cold', 'judgmental', 'hard'],
  ['smile', 'dreamy', 'romantic', 'pretty', 'soft'],
  ['flat', 'stoic', 'composed', 'serious', 'steady'],
  ['grin', 'predatory', 'sly', 'scheming', 'sharp'],
  ['open-mouth', 'jolly', 'hearty', 'friendly', 'robust'],
  ['tiny-smile', 'bookish', 'quiet', 'modest', 'gentle'],
  ['lopsided', 'silly', 'awkward', 'goofy', 'chaotic'],
]

const earsCombos = [
  ['default', 'round', 'side-ears', 'plain', 'balanced'],
  ['small', 'soft', 'subtle', 'gentle', 'plain'],
  ['big', 'flared', 'loud', 'expressive', 'cartoony'],
  ['round', 'cute', 'sweet', 'friendly', 'soft'],
  ['pointed', 'sharp', 'odd', 'creature', 'stylized'],
  ['stubby', 'simple', 'plain', 'grounded', 'quiet'],
  ['wide', 'flared', 'bold', 'goofy', 'playful'],
  ['small', 'reserved', 'tidy', 'bookish', 'modest'],
  ['big', 'awkward', 'funny', 'quirky', 'offbeat'],
  ['pointed', 'menacing', 'hard', 'cold', 'intense'],
  ['round', 'jolly', 'warm', 'open', 'friendly'],
  ['small', 'sad', 'timid', 'gentle', 'soft'],
  ['flared', 'wild', 'chaotic', 'loud', 'strange'],
  ['pointed', 'regal', 'dramatic', 'fancy', 'stylized'],
]

const hairCombos = [
  ['default', 'spiky', 'radiating', 'chaotic', 'wild'],
  ['flat', 'tidy', 'simple', 'plain', 'quiet'],
  ['messy', 'playful', 'goofy', 'energetic', 'fun'],
  ['sharp', 'styled', 'vain', 'dramatic', 'confident'],
  ['soft', 'rounded', 'gentle', 'sweet', 'friendly'],
  ['wild', 'big', 'loud', 'chaotic', 'creature'],
  ['neat', 'bookish', 'modest', 'reserved', 'tidy'],
  ['punky', 'spiked', 'bold', 'rebellious', 'intense'],
  ['smooth', 'composed', 'stoic', 'serious', 'controlled'],
]

const armsCombos = [
  ['default', 'raised', 'reaching', 'playful', 'animated'],
  ['dangling', 'relaxed', 'calm', 'plain', 'still'],
  ['raised', 'cheering', 'excited', 'friendly', 'jolly'],
  ['shrug', 'awkward', 'uncertain', 'goofy', 'uneasy'],
  ['pointing', 'assertive', 'bold', 'loud', 'showy'],
  ['reaching', 'dramatic', 'theatrical', 'expressive', 'vain'],
  ['dangling', 'sad', 'tired', 'droopy', 'soft'],
  ['raised', 'menacing', 'grabby', 'wild', 'chaotic'],
  ['waving', 'friendly', 'open', 'welcoming', 'warm'],
]

export const PICREW_2815216_TAG_OVERRIDES = {
  ...buildOverrides('base', baseCombos),
  ...buildOverrides('eyes', eyesCombos),
  ...buildOverrides('nose', noseCombos),
  ...buildOverrides('mouth', mouthCombos),
  ...buildOverrides('ears', earsCombos),
  ...buildOverrides('hair', hairCombos),
  ...buildOverrides('arms', armsCombos),
}
