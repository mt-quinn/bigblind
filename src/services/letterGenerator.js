const CONSONANTS_COMMON = 'TNRSLDMHC'.split('')
const CONSONANTS_MEDIUM = 'WFGPBK'.split('')
const RARE = 'JXQZ'.split('')
const VOWELS = 'AEIOU'.split('')

const MIN_WORDS_THRESHOLD = 80
const CANDIDATES_TO_TRY = 100

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateCandidate() {
  const used = new Set()
  const letters = []

  function add(letter) {
    if (used.has(letter)) return false
    used.add(letter)
    letters.push(letter)
    return true
  }

  const shuffledVowels = shuffle(VOWELS)
  add(shuffledVowels[0])
  add(shuffledVowels[1])

  const rareLetter = pick(RARE)
  add(rareLetter)
  if (rareLetter === 'Q' && !used.has('U')) {
    add('U')
  }

  while (letters.length < 7) {
    const pool = Math.random() < 0.6 ? CONSONANTS_COMMON : CONSONANTS_MEDIUM
    add(pick(pool))
  }

  return letters
}

function scoreLetterSet(letters, wordList) {
  const letterSet = new Set(letters.map((l) => l.toLowerCase()))
  let count = 0
  for (const word of wordList) {
    if (word.length < 3 || word.length > 10) continue
    let valid = true
    for (let i = 0; i < word.length; i++) {
      if (!letterSet.has(word[i])) {
        valid = false
        break
      }
    }
    if (valid) count++
  }
  return count
}

let cachedWordList = null

export function setWordListForScoring(wordList) {
  cachedWordList = wordList
}

export function generateLetters(count = 7) {
  if (!cachedWordList || cachedWordList.length === 0) {
    return shuffle(generateCandidate())
  }

  let bestSet = null
  let bestScore = -1

  for (let i = 0; i < CANDIDATES_TO_TRY; i++) {
    const candidate = generateCandidate()
    const score = scoreLetterSet(candidate, cachedWordList)
    if (score > bestScore) {
      bestScore = score
      bestSet = candidate
    }
    if (score >= MIN_WORDS_THRESHOLD && i >= 20) break
  }

  console.log(`[LetterGen] Best set: ${bestSet.join('')} with ${bestScore} formable words (from ${CANDIDATES_TO_TRY} candidates)`)
  return shuffle(bestSet)
}

export function shuffleLetters(letters) {
  return shuffle(letters)
}
