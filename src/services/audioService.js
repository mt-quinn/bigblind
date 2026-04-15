const MUSIC_VOL_KEY = 'gameMusicVolume'
const MUSIC_MUTED_KEY = 'gameMusicMuted'
const SFX_VOL_KEY = 'gameSfxVolume'

const DEFAULT_MUSIC_VOLUME = 0.18
const DEFAULT_SFX_VOLUME = 0.6

function clamp01(v, fallback) {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

let musicAudio = null
let musicMuted = false
let musicVolume = DEFAULT_MUSIC_VOLUME
let sfxVolume = DEFAULT_SFX_VOLUME

if (typeof window !== 'undefined') {
  musicVolume = clamp01(localStorage.getItem(MUSIC_VOL_KEY), DEFAULT_MUSIC_VOLUME)
  sfxVolume = clamp01(localStorage.getItem(SFX_VOL_KEY), DEFAULT_SFX_VOLUME)
  musicMuted = localStorage.getItem(MUSIC_MUTED_KEY) === '1'
}

const SFX_CUES = {
  buttonPress:      { src: '/sounds/answer-appears.mp3', gain: -3 },
  questionAppears:  { src: '/sounds/question-appears.mp3', gain: 0 },
  answerAppears:    { src: '/sounds/answer-appears.mp3', gain: 0 },
  resultGood:       { src: '/sounds/result-good.mp3', gain: -9 },
  resultBad:        { src: '/sounds/result-bad.mp3', gain: -9 },
}

function dbToLinear(db) {
  return Math.pow(10, db / 20)
}

// -- Music --

function ensureMusicAudio() {
  if (musicAudio) return musicAudio
  if (typeof Audio === 'undefined') return null
  musicAudio = new Audio('/elevator-music.mp3')
  musicAudio.loop = true
  musicAudio.volume = musicMuted ? 0 : musicVolume
  musicAudio.preload = 'auto'
  return musicAudio
}

export function startMusic() {
  const audio = ensureMusicAudio()
  if (!audio) return
  audio.volume = musicMuted ? 0 : musicVolume
  audio.play().catch(() => {})
}

export function tryResumeMusic() {
  if (!musicAudio || !musicAudio.paused) return
  musicAudio.play().catch(() => {})
}

export function isMusicMuted() {
  return musicMuted
}

export function setMusicMuted(muted) {
  musicMuted = Boolean(muted)
  if (typeof window !== 'undefined') {
    localStorage.setItem(MUSIC_MUTED_KEY, musicMuted ? '1' : '0')
  }
  if (musicAudio) {
    musicAudio.volume = musicMuted ? 0 : musicVolume
  }
}

export function getMusicVolume() {
  return musicVolume
}

export function setMusicVolume(v) {
  musicVolume = clamp01(v, musicVolume)
  if (typeof window !== 'undefined') {
    localStorage.setItem(MUSIC_VOL_KEY, String(musicVolume))
  }
  if (musicAudio && !musicMuted) {
    musicAudio.volume = musicVolume
  }
}

// -- SFX --

export function getSfxVolume() {
  return sfxVolume
}

export function setSfxVolume(v) {
  sfxVolume = clamp01(v, sfxVolume)
  if (typeof window !== 'undefined') {
    localStorage.setItem(SFX_VOL_KEY, String(sfxVolume))
  }
}

const DUCK_CUES = new Set(['resultGood', 'resultBad'])
let duckTimeout = null

function duckMusic() {
  if (!musicAudio || musicMuted) return
  if (duckTimeout) clearTimeout(duckTimeout)
  musicAudio.volume = 0
  duckTimeout = null
}

function unduckMusic(delayMs = 0) {
  if (duckTimeout) clearTimeout(duckTimeout)
  duckTimeout = setTimeout(() => {
    duckTimeout = null
    if (musicAudio && !musicMuted) musicAudio.volume = musicVolume
  }, delayMs)
}

export function playSfx(cueId) {
  if (sfxVolume <= 0) return
  const cue = SFX_CUES[cueId]
  if (!cue) return
  if (typeof Audio === 'undefined') return
  try {
    const audio = new Audio(cue.src)
    audio.volume = sfxVolume * dbToLinear(cue.gain || 0)
    if (DUCK_CUES.has(cueId)) {
      duckMusic()
      audio.onended = () => unduckMusic(300)
    }
    audio.play().catch(() => {})
  } catch { /* non-fatal */ }
}
