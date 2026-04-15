const SUITS = ['h', 'd', 'c', 's']
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' }
const VALUE_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
const VALUE_FULL = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
}
const SUIT_FULL = { h: 'Hearts', d: 'Diamonds', c: 'Clubs', s: 'Spades' }

const ANTES = [2, 4, 8, 16, 32]
const TOTAL_HANDS = 5
const STARTING_CHIPS = 100

function createDeck() {
  const deck = []
  for (const s of SUITS) {
    for (const v of VALUES) deck.push({ value: v, suit: s })
  }
  return deck
}

function shuffleDeck(deck) {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function dealFrom(deck, count) {
  return { dealt: deck.slice(0, count), remaining: deck.slice(count) }
}

function valueDisplay(v) { return VALUE_NAMES[v] || String(v) }
function suitSymbol(s) { return SUIT_SYMBOLS[s] || s }
function cardStr(c) { return valueDisplay(c.value) + suitSymbol(c.suit) }
function cardsStr(cards) { return cards.map(cardStr).join(' ') }
function cardSpoken(c) { return `${VALUE_FULL[c.value]} of ${SUIT_FULL[c.suit]}` }

function isRed(card) { return card.suit === 'h' || card.suit === 'd' }

// Pick k items from arr
function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ]
}

function rankFiveCards(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value)
  const vals = sorted.map(c => c.value)
  const suits = sorted.map(c => c.suit)

  const flush = suits.every(s => s === suits[0])
  const unique = [...new Set(vals)]
  let straight = false, straightHigh = 0
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) { straight = true; straightHigh = unique[0] }
    if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) { straight = true; straightHigh = 5 }
  }

  const counts = {}
  for (const v of vals) counts[v] = (counts[v] || 0) + 1
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ v: Number(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v)

  if (flush && straight) return [8, straightHigh]
  if (groups[0].c === 4) return [7, groups[0].v, groups[1].v]
  if (groups[0].c === 3 && groups[1].c === 2) return [6, groups[0].v, groups[1].v]
  if (flush) return [5, ...vals]
  if (straight) return [4, straightHigh]
  if (groups[0].c === 3) {
    const k = groups.filter(g => g.c === 1).map(g => g.v)
    return [3, groups[0].v, ...k]
  }
  if (groups[0].c === 2 && groups[1].c === 2) {
    const pairs = groups.filter(g => g.c === 2).map(g => g.v).sort((a, b) => b - a)
    const kicker = groups.find(g => g.c === 1).v
    return [2, pairs[0], pairs[1], kicker]
  }
  if (groups[0].c === 2) {
    const k = groups.filter(g => g.c === 1).map(g => g.v).sort((a, b) => b - a)
    return [1, groups[0].v, ...k]
  }
  return [0, ...vals]
}

function evaluateHand(hole, community) {
  const all = [...hole, ...community]
  const combos = combinations(all, 5)
  let best = null
  for (const c of combos) {
    const r = rankFiveCards(c)
    if (!best || compareRanks(r, best) > 0) best = r
  }
  return best
}

function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1
    if ((a[i] || 0) < (b[i] || 0)) return -1
  }
  return 0
}

function describeHand(rank) {
  const vn = v => VALUE_FULL[v] || String(v)
  switch (rank[0]) {
    case 8: return rank[1] === 14 ? 'Royal Flush' : `Straight Flush, ${vn(rank[1])} high`
    case 7: return `Four ${vn(rank[1])}s`
    case 6: return `${vn(rank[1])}s full of ${vn(rank[2])}s`
    case 5: return `Flush, ${vn(rank[1])} high`
    case 4: return `Straight, ${vn(rank[1])} high`
    case 3: return `Three ${vn(rank[1])}s`
    case 2: return `${vn(rank[1])}s and ${vn(rank[2])}s`
    case 1: return `Pair of ${vn(rank[1])}s`
    default: return `${vn(rank[1])} high`
  }
}

function describeHandVerbose(rank) {
  const vn = v => VALUE_FULL[v] || String(v)
  const base = describeHand(rank)
  switch (rank[0]) {
    case 1: return rank[2] ? `${base}, ${vn(rank[2])} kicker` : base
    case 2: return rank[3] ? `${base}, ${vn(rank[3])} kicker` : base
    case 3: return rank[2] ? `${base}, ${vn(rank[2])} kicker` : base
    case 7: return rank[2] ? `${base}, ${vn(rank[2])} kicker` : base
    default: return base
  }
}

function handCategory(rank) {
  return ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'][rank[0]]
}

function handStrength(rank) {
  const w = [0.05, 0.18, 0.38, 0.52, 0.62, 0.67, 0.78, 0.88, 0.96]
  return Math.min(1, (w[rank[0]] || 0) + ((rank[1] || 2) - 2) / 12 * 0.08)
}

function opponentDecision(handRank, personality, agentAction, agentBet, chips) {
  if (agentAction === 'fold' || agentAction === 'check') return { action: 'check', amount: 0 }

  const strength = handStrength(handRank)
  const betRatio = agentBet / Math.max(chips, 1)
  const threshold = (personality === 'tight' ? 0.35 : 0.2) + betRatio * 0.25

  if (strength < threshold) return { action: 'fold', amount: 0 }
  return { action: 'call', amount: Math.min(agentBet, chips) }
}

export {
  SUITS, VALUES, SUIT_SYMBOLS, VALUE_NAMES, VALUE_FULL, SUIT_FULL,
  ANTES, TOTAL_HANDS, STARTING_CHIPS,
  createDeck, shuffleDeck, dealFrom,
  valueDisplay, suitSymbol, cardStr, cardsStr, cardSpoken, isRed,
  evaluateHand, compareRanks, describeHand, describeHandVerbose, handCategory, handStrength,
  opponentDecision,
}
