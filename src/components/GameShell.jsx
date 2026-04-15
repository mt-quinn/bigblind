import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getOrCreatePlayerId,
  loadState,
  saveState,
} from '../services/gameApi'
import { getSingleResponseWithTimeout, LlmError } from '../services/llmService'
import { fetchRuntimeCapabilities, getCachedRuntimeCapabilities } from '../services/runtimeCapabilities'
import { isMusicMuted, setMusicMuted, startMusic, tryResumeMusic, playSfx } from '../services/audioService'
import { speakAndWait, stopAllAudio, primeTTSPlayback } from '../services/ttsService'
import { CODENAMES_WORDS } from '../data/wordList'
import './GameShell.css'
import './Codenames.css'

const GRID_SIZE = 16
const BLUE_COUNT = 6
const RED_COUNT = 4
const BLACK_COUNT = 1
const NEUTRAL_COUNT = GRID_SIZE - BLUE_COUNT - RED_COUNT - BLACK_COUNT
const MAX_LLM_RETRIES = 2

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateBoard() {
  const words = shuffle(CODENAMES_WORDS).slice(0, GRID_SIZE)
  const colors = shuffle([
    ...Array(BLUE_COUNT).fill('blue'),
    ...Array(RED_COUNT).fill('red'),
    ...Array(BLACK_COUNT).fill('black'),
    ...Array(NEUTRAL_COUNT).fill('neutral'),
  ])
  return words.map((word, i) => ({
    word: word.toUpperCase(),
    color: colors[i],
    revealed: false,
  }))
}

function countUnrevealed(board, color) {
  return board.filter(c => c.color === color && !c.revealed).length
}

function calcScore(board) {
  const blue = board.filter(c => c.color === 'blue' && c.revealed).length
  const red = board.filter(c => c.color === 'red' && c.revealed).length
  return blue - red
}

function checkGameOver(board) {
  if (countUnrevealed(board, 'blue') === 0) return 'all-blue'
  if (countUnrevealed(board, 'red') === 0) return 'all-red'
  if (board.some(c => c.color === 'black' && c.revealed)) return 'assassin'
  return null
}

function buildGuessPrompt(board, clue, history, guessesRemaining, guessesMade) {
  const unrevealed = board.filter(c => !c.revealed).map(c => c.word)
  const revealed = board.filter(c => c.revealed)

  let p = 'You are playing a word-association board game as the guesser. '
  p += 'Your partner (the spymaster) sees which words are safe and which are dangerous. '
  p += 'They give you a one-word clue and a number telling you how many board words relate to that clue.\n\n'

  p += 'UNREVEALED WORDS ON THE BOARD:\n' + unrevealed.join(', ') + '\n\n'

  if (revealed.length > 0) {
    p += 'ALREADY REVEALED:\n'
    for (const c of revealed) {
      const label = c.color === 'blue' ? 'BLUE (safe)'
        : c.color === 'red' ? 'RED (danger)'
        : c.color === 'black' ? 'BLACK (assassin)'
        : 'NEUTRAL'
      p += `- ${c.word}: ${label}\n`
    }
    p += '\n'
  }

  if (history.length > 0) {
    p += 'PREVIOUS TURNS:\n'
    for (const t of history) {
      p += `  Clue: "${t.clue.word} ${t.clue.number}"\n`
      for (const g of t.guesses) {
        const sym = g.color === 'blue' ? '+' : g.color === 'red' ? 'X' : g.color === 'black' ? '!' : '-'
        p += `    [${sym}] ${g.word}\n`
      }
      if (t.passed) p += '    (stopped guessing)\n'
    }
    p += '\n'
  }

  p += `CURRENT CLUE: "${clue.word}" ${clue.number}\n`
  p += `This means ${clue.number} unrevealed word(s) relate to "${clue.word}".\n`
  p += `You have exactly ${guessesRemaining} guess(es) remaining this turn.\n\n`

  if (guessesMade > 0) {
    p += 'You may say PASS to stop guessing if you are unsure.\n\n'
  } else {
    p += 'You must make at least one guess.\n\n'
  }

  p += 'Pick ONE word from the unrevealed list. Respond in EXACTLY this format:\n'
  p += 'GUESS: [word from the board, or PASS]\n'
  p += 'REASON: [one brief sentence]\n'

  return p
}

function parseGuessResponse(response, unrevealedWords) {
  if (!response) return { word: null, thinking: 'No response.' }

  const guessMatch = response.match(/GUESS\s*:\s*(.+)/i)
  const reasonMatch = response.match(/REASON\s*:\s*(.+)/i)

  let rawWord = guessMatch ? guessMatch[1].trim().replace(/^["']+|["']+$/g, '') : null
  const thinking = reasonMatch ? reasonMatch[1].trim() : ''

  if (rawWord && /^pass$/i.test(rawWord)) {
    return { word: 'PASS', thinking: thinking || 'Not confident enough to continue.' }
  }

  if (rawWord) {
    const exact = unrevealedWords.find(w => w === rawWord.toUpperCase())
    if (exact) return { word: exact, thinking }

    const firstToken = rawWord.split(/[\s,;.!?]/)[0].trim().toUpperCase()
    const tokenMatch = unrevealedWords.find(w => w === firstToken)
    if (tokenMatch) return { word: tokenMatch, thinking }
  }

  const sorted = [...unrevealedWords].sort((a, b) => b.length - a.length)
  for (const w of sorted) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(response)) {
      return { word: w, thinking: thinking || response.substring(0, 120) }
    }
  }

  return { word: null, thinking: response.substring(0, 200) }
}

export default function GameShell() {
  const [stage, setStage] = useState('loading')
  const [playerId, setPlayerId] = useState('')
  const [gameState, setGameState] = useState(null)
  const [capabilities, setCapabilities] = useState({})
  const [error, setError] = useState('')
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted())

  const [board, setBoard] = useState([])
  const [turnNumber, setTurnNumber] = useState(1)
  const [turnHistory, setTurnHistory] = useState([])

  const [phase, setPhase] = useState('clue')
  const [clueInput, setClueInput] = useState('')
  const [numberInput, setNumberInput] = useState(2)
  const [currentClue, setCurrentClue] = useState(null)
  const [currentTurnGuesses, setCurrentTurnGuesses] = useState([])
  const [llmResponse, setLlmResponse] = useState(null)
  const [revealingIndex, setRevealingIndex] = useState(-1)

  const [showKey, setShowKey] = useState(true)
  const [gameOverReason, setGameOverReason] = useState(null)
  const [clueError, setClueError] = useState('')

  const turnHistoryRef = useRef(turnHistory)
  const abortRef = useRef(false)
  turnHistoryRef.current = turnHistory

  const clueInputRef = useRef(null)

  // ── INIT ──

  useEffect(() => {
    const pid = getOrCreatePlayerId()
    setPlayerId(pid)
    Promise.all([
      loadState(pid).catch(() => ({ state: null })),
      fetchRuntimeCapabilities().catch(() => ({})),
    ]).then(([stateResp, caps]) => {
      setGameState(stateResp?.state || null)
      setCapabilities(caps || {})
      setStage(stateResp?.state ? 'dashboard' : 'onboarding')
    }).catch((err) => {
      console.error(err)
      setError(err.message || 'Failed to load.')
      setStage('onboarding')
    })
  }, [])

  useEffect(() => {
    let started = false
    const kick = () => {
      if (started) return
      started = true
      startMusic()
      document.removeEventListener('pointerdown', kick)
      document.removeEventListener('keydown', kick)
    }
    document.addEventListener('pointerdown', kick, { once: true })
    document.addEventListener('keydown', kick, { once: true })
    return () => {
      document.removeEventListener('pointerdown', kick)
      document.removeEventListener('keydown', kick)
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const btn = e.target.closest?.('button, .app-btn')
      if (!btn || btn.dataset.noSfx != null) return
      playSfx('buttonPress')
      tryResumeMusic()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  useEffect(() => () => stopAllAudio(), [])

  const handleSaveState = async (newState) => {
    try {
      await saveState(playerId, newState)
      setGameState(newState)
    } catch (err) {
      console.error(err)
    }
  }

  // ── GAME START ──

  const startGame = useCallback(() => {
    setError('')
    primeTTSPlayback()

    const caps = getCachedRuntimeCapabilities()
    if (!caps.llmAny) {
      setError('No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment variables.')
      return
    }

    const newBoard = generateBoard()
    setBoard(newBoard)
    setTurnNumber(1)
    setTurnHistory([])
    turnHistoryRef.current = []
    setPhase('clue')
    setClueInput('')
    setNumberInput(2)
    setCurrentClue(null)
    setCurrentTurnGuesses([])
    setLlmResponse(null)
    setRevealingIndex(-1)
    setShowKey(true)
    setGameOverReason(null)
    setClueError('')
    abortRef.current = false
    setStage('playing')
  }, [])

  // ── CLUE SUBMISSION ──

  const submitClue = useCallback(async () => {
    const word = clueInput.trim().toUpperCase()

    if (!word) { setClueError('Enter a clue word'); return }
    if (!/^[A-Z-]+$/i.test(word)) { setClueError('Letters and hyphens only'); return }
    if (word.includes(' ')) { setClueError('Must be a single word'); return }
    if (board.some(c => !c.revealed && c.word === word)) {
      setClueError("Can't use a word on the board"); return
    }
    if (numberInput < 1) { setClueError('Number must be at least 1'); return }

    setClueError('')
    setError('')
    const clue = { word, number: numberInput }
    setCurrentClue(clue)
    setCurrentTurnGuesses([])
    setLlmResponse(null)

    await speakAndWait(`${word}, ${numberInput}`, 'narrator')

    runGuessLoop(clue, numberInput, 0, [], board, turnHistoryRef.current)
  }, [clueInput, numberInput, board])

  // ── LLM GUESS LOOP ──

  const runGuessLoop = async (clue, remaining, guessesMade, turnGuesses, curBoard, history) => {
    if (abortRef.current || remaining <= 0) {
      endTurn(clue, turnGuesses, false)
      return
    }

    setPhase('guessing')
    setLlmResponse(null)

    const unrevealed = curBoard.filter(c => !c.revealed).map(c => c.word)
    let retries = 0

    while (retries <= MAX_LLM_RETRIES) {
      try {
        const prompt = buildGuessPrompt(curBoard, clue, history, remaining, guessesMade)
        const response = await getSingleResponseWithTimeout(prompt, {
          maxTokens: 150,
          timeoutMs: 25000,
          temperature: 0.7,
        })

        if (abortRef.current) return

        const parsed = parseGuessResponse(response, unrevealed)
        setLlmResponse(parsed)

        // PASS
        if (parsed.word === 'PASS') {
          await speakAndWait(`I'll pass. ${parsed.thinking}`, 'avatar')
          endTurn(clue, turnGuesses, true)
          return
        }

        // Invalid parse → retry
        if (!parsed.word) {
          retries++
          if (retries > MAX_LLM_RETRIES) {
            setError(`Agent couldn't pick a valid word. Raw: ${response?.substring(0, 200)}`)
            endTurn(clue, turnGuesses, false)
            return
          }
          continue
        }

        // Valid guess
        await speakAndWait(`${parsed.word}. ${parsed.thinking}`, 'avatar')

        const cellIndex = curBoard.findIndex(c => !c.revealed && c.word === parsed.word)
        if (cellIndex === -1) {
          retries++
          continue
        }

        // Reveal animation
        setRevealingIndex(cellIndex)
        await new Promise(r => setTimeout(r, 900))

        const cell = curBoard[cellIndex]
        const newBoard = curBoard.map((c, i) =>
          i === cellIndex ? { ...c, revealed: true } : c
        )
        setBoard(newBoard)
        setRevealingIndex(-1)

        if (cell.color === 'blue') playSfx('resultGood')
        else playSfx('resultBad')

        const guessRecord = { word: parsed.word, color: cell.color, thinking: parsed.thinking }
        const newTurnGuesses = [...turnGuesses, guessRecord]
        setCurrentTurnGuesses(newTurnGuesses)

        // Check game over
        const over = checkGameOver(newBoard)
        if (over) {
          const finalScore = calcScore(newBoard)
          setGameOverReason(over)
          recordTurn(clue, newTurnGuesses, false)
          await new Promise(r => setTimeout(r, 600))
          setPhase('clue')
          setStage('gameover')
          if (gameState) {
            handleSaveState({
              ...gameState,
              gamesPlayed: (gameState.gamesPlayed || 0) + 1,
              bestScore: Math.max(gameState.bestScore || 0, finalScore),
            })
          }
          return
        }

        // Continue or end turn
        if (cell.color === 'blue' && remaining - 1 > 0) {
          await new Promise(r => setTimeout(r, 400))
          runGuessLoop(clue, remaining - 1, guessesMade + 1, newTurnGuesses, newBoard, history)
        } else {
          endTurn(clue, newTurnGuesses, false)
        }
        return

      } catch (err) {
        if (abortRef.current) return
        if (err instanceof LlmError) {
          const prefix = err.fatal ? '[Config Error]' : `[LLM ${err.code}]`
          setError(`${prefix} ${err.message}`)
        } else {
          setError(`LLM error: ${err.message}`)
        }
        endTurn(clue, turnGuesses, false)
        return
      }
    }
  }

  const recordTurn = (clue, guesses, passed) => {
    setTurnHistory(prev => {
      const next = [...prev, { clue, guesses, passed }]
      turnHistoryRef.current = next
      return next
    })
  }

  const endTurn = (clue, guesses, passed) => {
    recordTurn(clue, guesses, passed)
    setCurrentClue(null)
    setClueInput('')
    setLlmResponse(null)
    setCurrentTurnGuesses([])
    setPhase('clue')
    setTurnNumber(prev => prev + 1)
    setTimeout(() => clueInputRef.current?.focus(), 100)
  }

  // ── RENDER HELPERS ──

  const score = calcScore(board)
  const blueRemaining = countUnrevealed(board, 'blue')
  const redRemaining = countUnrevealed(board, 'red')
  const maxClueNumber = Math.max(1, blueRemaining)

  // ── LOADING ──

  if (stage === 'loading') {
    return (
      <div className="app-mode">
        <div className="app-card centered">
          <p className="app-muted">Loading...</p>
        </div>
      </div>
    )
  }

  // ── ONBOARDING ──

  if (stage === 'onboarding') {
    return (
      <div className="app-mode">
        <div className="app-card app-onboarding-shell">
          <div className="app-onboarding-hero">
            <h2 className="app-onboarding-title">dangerguessr</h2>
            <p className="app-onboarding-copy">
              You're the spymaster. Give one-word clues to guide your AI partner
              to the right words on the board.
            </p>
            <p className="app-onboarding-copy">
              Blue words score points. Red words lose points. Hit the black word
              and the game ends instantly.
            </p>
          </div>
          {error && <div className="app-error">{error}</div>}
          <button
            className="app-btn app-btn-primary app-onboarding-cta"
            onClick={() => {
              const init = { gamesPlayed: 0, bestScore: 0, createdAt: new Date().toISOString() }
              handleSaveState(init).then(() => startGame())
            }}
          >
            Play
          </button>
        </div>
      </div>
    )
  }

  // ── PLAYING ──

  if (stage === 'playing') {
    return (
      <div className="app-mode cn-game">
        <div className="cn-layout">
          <div className="cn-header">
            <div className="cn-score">
              <span className="cn-score-value">{score}</span>
              <span className="cn-score-label">Score</span>
            </div>
            <div className="cn-remaining">
              <span className="cn-blue-count">{blueRemaining}</span>
              <span className="cn-red-count">{redRemaining}</span>
            </div>
            <div className="cn-turn">
              <span className="cn-turn-value">{turnNumber}</span>
              <span className="cn-turn-label">Turn</span>
            </div>
          </div>

          <div className="cn-board">
            {board.map((cell, i) => {
              const isRevealing = revealingIndex === i
              const showColor = cell.revealed || isRevealing
              const keyTint = showKey && !cell.revealed && !isRevealing

              return (
                <div
                  key={i}
                  className={[
                    'cn-cell',
                    showColor ? `cn-cell-${cell.color}` : '',
                    cell.revealed ? 'cn-cell-revealed' : '',
                    isRevealing ? 'cn-cell-revealing' : '',
                    keyTint ? `cn-cell-key-${cell.color}` : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="cn-cell-word">{cell.word}</span>
                </div>
              )
            })}
          </div>

          <div className="cn-activity">
            {error && (
              <div className="app-error" style={{ fontSize: '0.78rem', marginBottom: 4 }}>{error}</div>
            )}

            {currentClue && (
              <div className="cn-current-clue">
                Clue: <strong>{currentClue.word}</strong> {currentClue.number}
              </div>
            )}

            {phase === 'guessing' && !llmResponse && (
              <div className="cn-thinking">
                <span className="cn-thinking-dot" />
                Thinking...
              </div>
            )}

            {llmResponse && (
              <div className="cn-guess-result">
                {llmResponse.word === 'PASS' ? (
                  <span className="cn-guess-pass">Passed — {llmResponse.thinking}</span>
                ) : llmResponse.word ? (
                  <>
                    <span className="cn-guess-word">{llmResponse.word}</span>
                    {llmResponse.thinking && (
                      <span className="cn-guess-reason">{llmResponse.thinking}</span>
                    )}
                  </>
                ) : (
                  <span className="cn-guess-pass">Couldn't parse response</span>
                )}
              </div>
            )}

            {currentTurnGuesses.length > 0 && (
              <div className="cn-turn-guesses">
                {currentTurnGuesses.map((g, i) => (
                  <span key={i} className={`cn-guess-chip cn-guess-chip-${g.color}`}>
                    {g.word}
                  </span>
                ))}
              </div>
            )}

            {phase === 'clue' && !currentClue && turnHistory.length === 0 && (
              <div className="cn-waiting-msg">Give a clue to start guessing</div>
            )}
          </div>

          {phase === 'clue' && (
            <div className="cn-input-area">
              {clueError && <div className="cn-clue-error">{clueError}</div>}
              <div className="cn-clue-row">
                <input
                  ref={clueInputRef}
                  className="cn-clue-input"
                  type="text"
                  placeholder="Enter clue word..."
                  value={clueInput}
                  onChange={e => {
                    setClueInput(e.target.value.replace(/\s/g, ''))
                    setClueError('')
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') submitClue() }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="cn-submit-row">
                <div className="cn-number-stepper">
                  <button
                    className="cn-stepper-btn"
                    onClick={() => setNumberInput(p => Math.min(maxClueNumber, p + 1))}
                    disabled={numberInput >= maxClueNumber}
                  >▲</button>
                  <input
                    className="cn-number-input"
                    type="text"
                    inputMode="numeric"
                    value={numberInput}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v) && v >= 1 && v <= maxClueNumber) setNumberInput(v)
                    }}
                  />
                  <button
                    className="cn-stepper-btn"
                    onClick={() => setNumberInput(p => Math.max(1, p - 1))}
                    disabled={numberInput <= 1}
                  >▼</button>
                </div>
                <button
                  className="app-btn app-btn-primary cn-submit-btn"
                  onClick={submitClue}
                  disabled={!clueInput.trim()}
                >
                  Give Clue
                </button>
              </div>
            </div>
          )}

          {phase === 'guessing' && (
            <div className="cn-waiting-msg">Your agent is guessing...</div>
          )}

          <div className="cn-bottom-bar">
            <button
              className={`cn-key-toggle ${showKey ? 'cn-key-active' : ''}`}
              onClick={() => setShowKey(p => !p)}
              data-no-sfx
            >
              {showKey ? 'Key On' : 'Key Off'}
            </button>
            <label className="app-music-toggle" data-no-sfx>
              <input
                type="checkbox"
                checked={!musicMuted}
                onChange={e => {
                  const m = !e.target.checked
                  setMusicMutedState(m)
                  setMusicMuted(m)
                }}
                data-no-sfx
              />
              <span>Music</span>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ── GAME OVER ──

  if (stage === 'gameover') {
    const endMessage = gameOverReason === 'all-blue'
      ? 'All agents found!'
      : gameOverReason === 'all-red'
        ? 'All enemy agents exposed...'
        : 'The assassin was contacted!'

    return (
      <div className="app-mode cn-game">
        <div className="cn-layout">
          <div className="cn-gameover-header">
            <h2 className="cn-gameover-title">Game Over</h2>
            <p className="cn-gameover-reason">{endMessage}</p>
            <div className="cn-gameover-score">
              <span className="cn-gameover-score-value">{score}</span>
              <span className="cn-gameover-score-label">Final Score</span>
            </div>
          </div>

          <div className="cn-board cn-board-final">
            {board.map((cell, i) => (
              <div
                key={i}
                className={[
                  'cn-cell',
                  `cn-cell-${cell.color}`,
                  cell.revealed ? 'cn-cell-revealed' : 'cn-cell-missed',
                ].join(' ')}
              >
                <span className="cn-cell-word">{cell.word}</span>
              </div>
            ))}
          </div>

          <button className="app-btn app-btn-primary cn-play-again" onClick={startGame}>
            Play Again
          </button>
          <button className="app-btn app-btn-secondary" onClick={() => setStage('dashboard')}>
            Menu
          </button>
        </div>
      </div>
    )
  }

  // ── DASHBOARD ──

  return (
    <div className="app-mode app-mode-dashboard">
      <div className="app-dashboard-shell">
        <div className="app-title-block">
          <h2 className="app-title">dangerguessr</h2>
          <p className="app-title-sub">Guide Your Agent</p>
          <hr className="app-title-rule" />
        </div>

        <div className="app-dashboard-body">
          {error && <div className="app-error">{error}</div>}

          <div className="app-card" style={{ alignItems: 'center', gap: 12 }}>
            <p className="app-muted" style={{ textAlign: 'center', margin: 0, fontSize: '0.92rem' }}>
              Give one-word clues to help your AI partner find the safe words
              on a 4×4 board. Avoid the reds and the assassin.
            </p>
          </div>

          {gameState && gameState.gamesPlayed > 0 && (
            <div className="app-stats-grid">
              <div className="app-stat-card">
                <span className="app-stat-value">{gameState.gamesPlayed || 0}</span>
                <span className="app-stat-label">Games Played</span>
              </div>
              <div className="app-stat-card">
                <span className="app-stat-value">{gameState.bestScore || 0}</span>
                <span className="app-stat-label">Best Score</span>
              </div>
            </div>
          )}

          <button className="app-btn app-btn-primary" onClick={startGame}>
            Play
          </button>
        </div>

        <label className="app-music-toggle" data-no-sfx>
          <input
            type="checkbox"
            checked={!musicMuted}
            onChange={e => {
              const m = !e.target.checked
              setMusicMutedState(m)
              setMusicMuted(m)
            }}
            data-no-sfx
          />
          <span>Music</span>
        </label>
      </div>
    </div>
  )
}
