import { setWordListForScoring } from './letterGenerator'

let wordSet = null
let wordArray = null
let loadPromise = null

export function loadDictionary() {
  if (wordSet) return Promise.resolve(wordSet)
  if (loadPromise) return loadPromise

  loadPromise = fetch('/words.txt')
    .then((res) => {
      if (!res.ok) throw new Error(`Dictionary load failed (${res.status})`)
      return res.text()
    })
    .then((text) => {
      wordArray = text.split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean)
      wordSet = new Set(wordArray)
      setWordListForScoring(wordArray)
      return wordSet
    })
    .catch((err) => {
      loadPromise = null
      throw err
    })

  return loadPromise
}

export function isValidWord(word) {
  if (!wordSet) return false
  return wordSet.has(word.toLowerCase())
}

export function isDictionaryLoaded() {
  return wordSet !== null
}
