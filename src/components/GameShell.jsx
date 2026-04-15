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
import {
  ANTES, TOTAL_HANDS, STARTING_CHIPS,
  createDeck, shuffleDeck, dealFrom,
  valueDisplay, suitSymbol, cardStr, cardsStr, cardSpoken, isRed,
  evaluateHand, compareRanks, describeHand, handCategory,
  opponentDecision,
} from '../data/poker'
import './GameShell.css'
import './BigBlind.css'

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function Card({ card, hidden }) {
  if (hidden) return <div className="bb-card bb-card-hidden">?</div>
  return (
    <div className={`bb-card ${isRed(card) ? 'bb-card-red' : 'bb-card-black'}`}>
      {valueDisplay(card.value)}{suitSymbol(card.suit)}
    </div>
  )
}

function buildAgentPrompt(hole, community, pot, agentChips, oppAChips, oppBChips, ante, handNum, history, message) {
  let p = `You are a poker player in a fast 5-hand tournament. This is hand ${handNum} of ${TOTAL_HANDS}.\n\n`
  p += `Your hole cards: ${cardsStr(hole)}\n`
  p += `Community cards: ${cardsStr(community)}\n\n`
  p += `Pot: ${pot} chips (everyone anted ${ante})\n`
  p += `Your chips: ${agentChips} | Opponent A: ${oppAChips} | Opponent B: ${oppBChips}\n\n`
  p += `You can: FOLD (forfeit your ante), CHECK (play for the current pot), or BET [amount] (risk more to win more).\n`
  p += `If you BET, opponents may call or fold. Bigger bets scare weaker hands away.\n\n`

  if (history.length > 0) {
    p += 'Previous hands:\n'
    for (const h of history) {
      p += `  Hand ${h.num}: You had ${h.agentCards}. Board: ${h.community}. `
      p += `You ${h.agentAction}. ${h.result}\n`
      if (h.coachMsg) p += `    Coach said: "${h.coachMsg}"\n`
    }
    p += '\n'
  }

  if (message) {
    p += `Your coach sent this message: "${message}"\n`
    p += '(Your coach can see information you cannot. Consider their advice carefully.)\n\n'
  } else {
    p += 'Your coach did not send a message this hand. Use your own judgment.\n\n'
  }

  p += 'Respond EXACTLY in this format:\n'
  p += 'ACTION: FOLD | CHECK | BET [amount]\n'
  p += 'THINKING: [one brief sentence]\n'

  return p
}

function parseAgentAction(response, maxChips) {
  if (!response) return { action: 'check', amount: 0, thinking: 'No response.' }

  const actionMatch = response.match(/ACTION\s*:\s*(FOLD|CHECK|BET\s*(\d+))/i)
  const thinkingMatch = response.match(/THINKING\s*:\s*(.+)/i)
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : ''

  if (!actionMatch) return { action: 'check', amount: 0, thinking: thinking || response.slice(0, 120) }

  const raw = actionMatch[1].toUpperCase()
  if (raw === 'FOLD') return { action: 'fold', amount: 0, thinking }
  if (raw === 'CHECK') return { action: 'check', amount: 0, thinking }

  const bet = Math.min(parseInt(actionMatch[2]) || 0, maxChips)
  if (bet <= 0) return { action: 'check', amount: 0, thinking }
  return { action: 'bet', amount: bet, thinking }
}

function consumeLetters(message, pool) {
  const next = new Set(pool)
  for (const ch of message.toUpperCase()) {
    if (/[A-Z]/.test(ch)) next.delete(ch)
  }
  return next
}

function pendingLetters(message, pool) {
  const used = new Set()
  for (const ch of message.toUpperCase()) {
    if (/[A-Z]/.test(ch) && pool.has(ch)) used.add(ch)
  }
  return used
}

export default function GameShell() {
  const [stage, setStage] = useState('loading')
  const [playerId, setPlayerId] = useState('')
  const [gameState, setGameState] = useState(null)
  const [capabilities, setCapabilities] = useState({})
  const [error, setError] = useState('')
  const [musicMuted, setMusicMutedState] = useState(() => isMusicMuted())

  const [handNum, setHandNum] = useState(1)
  const [agentChips, setAgentChips] = useState(STARTING_CHIPS)
  const [oppAChips, setOppAChips] = useState(STARTING_CHIPS)
  const [oppBChips, setOppBChips] = useState(STARTING_CHIPS)
  const [letterPool, setLetterPool] = useState(() => new Set(ALL_LETTERS))
  const [handHistory, setHandHistory] = useState([])

  const [agentCards, setAgentCards] = useState([])
  const [oppACards, setOppACards] = useState([])
  const [oppBCards, setOppBCards] = useState([])
  const [community, setCommunity] = useState([])
  const [pot, setPot] = useState(0)
  const [currentAnte, setCurrentAnte] = useState(0)

  const [phase, setPhase] = useState('input')
  const [messageInput, setMessageInput] = useState('')
  const [llmAction, setLlmAction] = useState(null)
  const [handResult, setHandResult] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  const handHistoryRef = useRef(handHistory)
  handHistoryRef.current = handHistory
  const abortRef = useRef(false)
  const inputRef = useRef(null)

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
    } catch (err) { console.error(err) }
  }

  // ── DEAL A HAND ──

  const dealHand = useCallback((num, aChips, oAChips, oBChips, pool, history) => {
    const ante = ANTES[num - 1]
    const deck = shuffleDeck(createDeck())

    const d1 = dealFrom(deck, 2)
    const d2 = dealFrom(d1.remaining, 2)
    const d3 = dealFrom(d2.remaining, 2)
    const d4 = dealFrom(d3.remaining, 5)

    const aAnte = Math.min(ante, aChips)
    const oAAnte = Math.min(ante, oAChips)
    const oBAnte = Math.min(ante, oBChips)

    setAgentCards(d1.dealt)
    setOppACards(d2.dealt)
    setOppBCards(d3.dealt)
    setCommunity(d4.dealt)
    setPot(aAnte + oAAnte + oBAnte)
    setCurrentAnte(ante)
    setAgentChips(aChips - aAnte)
    setOppAChips(oAChips - oAAnte)
    setOppBChips(oBChips - oBAnte)
    setHandNum(num)
    setLetterPool(pool)
    setHandHistory(history)
    handHistoryRef.current = history
    setPhase('input')
    setMessageInput('')
    setLlmAction(null)
    setHandResult(null)
    setError('')
    abortRef.current = false

    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // ── START GAME ──

  const startGame = useCallback(() => {
    setError('')
    primeTTSPlayback()

    const caps = getCachedRuntimeCapabilities()
    if (!caps.llmAny) {
      setError('No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.')
      return
    }

    setStage('playing')
    dealHand(1, STARTING_CHIPS, STARTING_CHIPS, STARTING_CHIPS, new Set(ALL_LETTERS), [])
  }, [dealHand])

  // ── SUBMIT MESSAGE ──

  const submitMessage = useCallback(async (skip = false) => {
    const msg = skip ? '' : messageInput.trim()

    const newPool = msg ? consumeLetters(msg, letterPool) : letterPool
    setLetterPool(newPool)
    setPhase('thinking')
    setError('')
    setLlmAction(null)

    if (msg) {
      await speakAndWait(msg, 'narrator').catch(() => {})
    }

    try {
      const prompt = buildAgentPrompt(
        agentCards, community, pot, agentChips,
        oppAChips, oppBChips, currentAnte, handNum,
        handHistoryRef.current, msg,
      )
      const response = await getSingleResponseWithTimeout(prompt, {
        maxTokens: 150,
        timeoutMs: 25000,
        temperature: 0.7,
      })

      if (abortRef.current) return

      const parsed = parseAgentAction(response, agentChips)
      setLlmAction(parsed)

      const actionSpeak = parsed.action === 'fold' ? 'I fold.'
        : parsed.action === 'check' ? 'I check.'
        : `I bet ${parsed.amount}.`
      await speakAndWait(`${actionSpeak} ${parsed.thinking}`, 'avatar').catch(() => {})

      resolveHand(parsed, msg, newPool)

    } catch (err) {
      if (abortRef.current) return
      if (err instanceof LlmError) {
        setError(`[${err.fatal ? 'Config' : err.code}] ${err.message}`)
      } else {
        setError(`LLM error: ${err.message}`)
      }
      resolveHand({ action: 'check', amount: 0, thinking: 'Error — defaulting to check' }, msg, newPool)
    }
  }, [messageInput, letterPool, agentCards, community, pot, agentChips, oppAChips, oppBChips, currentAnte, handNum])

  // ── RESOLVE HAND ──

  const resolveHand = (agentAction, coachMsg, pool) => {
    const oppARank = evaluateHand(oppACards, community)
    const oppBRank = evaluateHand(oppBCards, community)
    const agentRank = evaluateHand(agentCards, community)

    const oppADecision = oppAChips > 0
      ? opponentDecision(oppARank, 'tight', agentAction.action, agentAction.amount, oppAChips)
      : { action: 'fold', amount: 0 }
    const oppBDecision = oppBChips > 0
      ? opponentDecision(oppBRank, 'aggressive', agentAction.action, agentAction.amount, oppBChips)
      : { action: 'fold', amount: 0 }

    let finalPot = pot
    let aChips = agentChips
    let oAChips = oppAChips
    let oBChips = oppBChips

    const players = []

    if (agentAction.action === 'fold') {
      players.push({ name: 'Your Agent', folded: true, rank: agentRank })
    } else {
      if (agentAction.action === 'bet') {
        const bet = Math.min(agentAction.amount, aChips)
        aChips -= bet
        finalPot += bet
      }
      players.push({ name: 'Your Agent', folded: false, rank: agentRank })
    }

    if (oppADecision.action === 'fold') {
      players.push({ name: 'Opp A', folded: true, rank: oppARank })
    } else {
      if (agentAction.action === 'bet' && oppADecision.action === 'call') {
        const call = Math.min(agentAction.amount, oAChips)
        oAChips -= call
        finalPot += call
      }
      players.push({ name: 'Opp A', folded: false, rank: oppARank })
    }

    if (oppBDecision.action === 'fold') {
      players.push({ name: 'Opp B', folded: true, rank: oppBRank })
    } else {
      if (agentAction.action === 'bet' && oppBDecision.action === 'call') {
        const call = Math.min(agentAction.amount, oBChips)
        oBChips -= call
        finalPot += call
      }
      players.push({ name: 'Opp B', folded: false, rank: oppBRank })
    }

    const active = players.filter(p => !p.folded)
    let winner = null
    if (active.length === 0) {
      winner = players[0]
    } else if (active.length === 1) {
      winner = active[0]
    } else {
      winner = active.reduce((best, p) =>
        compareRanks(p.rank, best.rank) > 0 ? p : best
      )
    }

    if (winner.name === 'Your Agent') aChips += finalPot
    else if (winner.name === 'Opp A') oAChips += finalPot
    else oBChips += finalPot

    const result = {
      players: players.map(p => ({
        ...p,
        desc: describeHand(p.rank),
        category: handCategory(p.rank),
        isWinner: p.name === winner.name,
        chipChange: p.name === winner.name ? finalPot - (
          p.name === 'Your Agent' ? currentAnte + (agentAction.action === 'bet' ? Math.min(agentAction.amount, agentChips) : 0)
          : p.name === 'Opp A' ? currentAnte + (oppADecision.action === 'call' && agentAction.action === 'bet' ? Math.min(agentAction.amount, oppAChips) : 0)
          : currentAnte + (oppBDecision.action === 'call' && agentAction.action === 'bet' ? Math.min(agentAction.amount, oppBChips) : 0)
        ) : p.folded ? -currentAnte : -(
          currentAnte + (agentAction.action === 'bet' && !p.folded ? (
            p.name === 'Opp A' ? Math.min(agentAction.amount, oppAChips)
            : p.name === 'Opp B' ? Math.min(agentAction.amount, oppBChips)
            : Math.min(agentAction.amount, agentChips)
          ) : 0)
        ),
      })),
      winner: winner.name,
      pot: finalPot,
    }

    if (agentAction.action === 'fold') playSfx('resultBad')
    else if (winner.name === 'Your Agent') playSfx('resultGood')
    else playSfx('resultBad')

    const histEntry = {
      num: handNum,
      agentCards: cardsStr(agentCards),
      community: cardsStr(community),
      agentAction: agentAction.action === 'bet'
        ? `bet ${agentAction.amount}` : agentAction.action,
      result: `${winner.name} won ${finalPot} chips (${describeHand(winner.rank)})`,
      coachMsg: coachMsg,
    }

    const newHistory = [...handHistoryRef.current, histEntry]
    setHandHistory(newHistory)
    handHistoryRef.current = newHistory
    setAgentChips(aChips)
    setOppAChips(oAChips)
    setOppBChips(oBChips)
    setHandResult(result)
    setPhase('result')

    if (handNum >= TOTAL_HANDS || aChips <= 0) {
      setTimeout(() => {
        setStage('gameover')
        if (gameState) {
          handleSaveState({
            ...gameState,
            gamesPlayed: (gameState.gamesPlayed || 0) + 1,
            bestChips: Math.max(gameState.bestChips || 0, aChips),
          })
        }
      }, 2000)
    }
  }

  // ── NEXT HAND ──

  const nextHand = useCallback(() => {
    dealHand(handNum + 1, agentChips, oppAChips, oppBChips, letterPool, handHistoryRef.current)
  }, [handNum, agentChips, oppAChips, oppBChips, letterPool, dealHand])

  // ── INPUT FILTER ──

  const handleInputChange = (e) => {
    const raw = e.target.value
    let filtered = ''
    for (const ch of raw) {
      if (/[^a-zA-Z]/.test(ch)) { filtered += ch; continue }
      if (letterPool.has(ch.toUpperCase())) filtered += ch
    }
    setMessageInput(filtered)
  }

  // ── RENDER HELPERS ──

  const currentPending = pendingLetters(messageInput, letterPool)
  const agentRank = agentCards.length && community.length
    ? evaluateHand(agentCards, community) : null

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
            <h2 className="app-onboarding-title">Big Blind</h2>
            <p className="app-onboarding-copy">
              Your AI agent is playing poker — but can't see the other players' cards.
              You can. Help them win, but every letter you type is gone forever.
            </p>
            <p className="app-onboarding-copy">
              26 letters. 5 hands. Choose your words carefully.
            </p>
          </div>
          {error && <div className="app-error">{error}</div>}
          <button
            className="app-btn app-btn-primary app-onboarding-cta"
            onClick={() => {
              const init = { gamesPlayed: 0, bestChips: 0, createdAt: new Date().toISOString() }
              handleSaveState(init).then(() => startGame())
            }}
          >
            Deal Me In
          </button>
        </div>
      </div>
    )
  }

  // ── PLAYING ──

  if (stage === 'playing') {
    const ante = ANTES[handNum - 1]

    return (
      <div className="app-mode bb-game">
        <div className="bb-layout">
          <div className="bb-header">
            <div className="bb-hand-info">
              <span className="bb-hand-num">Hand {handNum}/{TOTAL_HANDS}</span>
              <span className="bb-blinds">Ante {ante}</span>
            </div>
            <div className="bb-pot-display">
              <span className="bb-pot-value">{pot}</span>
              <span className="bb-pot-label">Pot</span>
            </div>
            <div className="bb-agent-stack">
              <span className="bb-agent-stack-value">{agentChips}</span>
              <span className="bb-agent-stack-label">Your chips</span>
            </div>
          </div>

          {/* Opponents — secret intel */}
          <div className="bb-opponents">
            <div className={`bb-opponent ${oppAChips <= 0 ? 'bb-eliminated' : ''}`}>
              <span className="bb-opp-label">A</span>
              <div className="bb-opp-cards">
                {oppACards.map((c, i) => <Card key={i} card={c} />)}
              </div>
              <span className="bb-intel-tag">intel</span>
              <span className="bb-opp-chips">{oppAChips}</span>
            </div>
            <div className={`bb-opponent ${oppBChips <= 0 ? 'bb-eliminated' : ''}`}>
              <span className="bb-opp-label">B</span>
              <div className="bb-opp-cards">
                {oppBCards.map((c, i) => <Card key={i} card={c} />)}
              </div>
              <span className="bb-intel-tag">intel</span>
              <span className="bb-opp-chips">{oppBChips}</span>
            </div>
          </div>

          {/* Community cards */}
          <div className="bb-community">
            <span className="bb-community-label">Board</span>
            <div className="bb-community-cards">
              {community.map((c, i) => <Card key={i} card={c} />)}
            </div>
          </div>

          {/* Agent's hand */}
          <div className="bb-agent-hand">
            <span className="bb-agent-hand-label">Agent</span>
            {agentCards.map((c, i) => <Card key={i} card={c} />)}
            {agentRank && (
              <span className="bb-agent-hand-desc">{describeHand(agentRank)}</span>
            )}
          </div>

          {/* Activity / LLM */}
          <div className="bb-activity">
            {error && (
              <div className="app-error" style={{ fontSize: '0.75rem', marginBottom: 3 }}>{error}</div>
            )}

            {phase === 'thinking' && !llmAction && (
              <div className="bb-thinking">
                <span className="bb-thinking-dot" />
                Agent is deciding...
              </div>
            )}

            {llmAction && (
              <>
                <span className={`bb-action-text bb-action-${llmAction.action}`}>
                  {llmAction.action === 'fold' ? 'FOLD'
                    : llmAction.action === 'check' ? 'CHECK'
                    : `BET ${llmAction.amount}`}
                </span>
                {llmAction.thinking && (
                  <span className="bb-thinking-text">{llmAction.thinking}</span>
                )}
              </>
            )}

            {phase === 'input' && handHistory.length === 0 && (
              <div className="bb-waiting-msg">
                Send a message to your agent — or skip to let them play blind.
              </div>
            )}
          </div>

          {/* Result */}
          {phase === 'result' && handResult && (
            <div className="bb-result">
              {handResult.players.map((p, i) => (
                <div key={i} className={`bb-result-line ${p.folded ? 'bb-result-fold' : ''} ${p.isWinner ? 'bb-result-winner' : ''}`}>
                  <span>
                    {p.name}: {p.folded ? 'Folded' : p.category}
                    {p.isWinner && ' ★'}
                  </span>
                  <span className={`bb-chip-change ${p.chipChange >= 0 ? 'bb-chip-gain' : 'bb-chip-loss'}`}>
                    {p.chipChange >= 0 ? '+' : ''}{p.chipChange}
                  </span>
                </div>
              ))}
              {handNum < TOTAL_HANDS && agentChips > 0 && (
                <button className="app-btn app-btn-primary bb-next-btn" onClick={nextHand}>
                  Next Hand
                </button>
              )}
            </div>
          )}

          {/* Letter grid */}
          <div className="bb-letter-section">
            <span className="bb-letter-section-label">Letter Pool</span>
            <div className="bb-letter-grid">
              {ALL_LETTERS.map(l => {
                const isPending = currentPending.has(l)
                const isAvailable = letterPool.has(l)
                return (
                  <span
                    key={l}
                    className={`bb-letter ${isPending ? 'bb-letter-pending' : isAvailable ? 'bb-letter-available' : 'bb-letter-used'}`}
                  >
                    {l}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Input */}
          {phase === 'input' && (
            <div className="bb-input-area">
              <input
                ref={inputRef}
                className="bb-message-input"
                type="text"
                placeholder="Advise your agent..."
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && messageInput.trim()) submitMessage(false) }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="bb-input-row">
                <button
                  className="app-btn app-btn-primary bb-send-btn"
                  onClick={() => submitMessage(false)}
                  disabled={!messageInput.trim()}
                >
                  Send
                </button>
                <button
                  className="app-btn bb-skip-btn"
                  onClick={() => submitMessage(true)}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {phase === 'thinking' && (
            <div className="bb-waiting-msg">Waiting for agent...</div>
          )}

          <div className="bb-bottom-bar">
            <button
              className="bb-help-btn"
              onClick={() => setShowHelp(true)}
              data-no-sfx
            >How to Play</button>
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

          {showHelp && (
            <div className="bb-help-overlay" onClick={() => setShowHelp(false)}>
              <div className="bb-help-modal" onClick={e => e.stopPropagation()}>
                <h3 className="bb-help-title">How to Play</h3>
                <p className="bb-help-text">
                  Your AI agent is playing <strong>5 hands of poker</strong> against two opponents.
                  Everyone starts with <strong>100 chips</strong>. Antes escalate each hand.
                </p>
                <p className="bb-help-text">
                  You can see the opponents' cards — your agent can't.
                  Type a message to advise them before each hand.
                </p>
                <p className="bb-help-text">
                  <strong>The catch:</strong> each letter of the alphabet (A–Z) can only be
                  used <strong>once</strong> across the entire game. Numbers, spaces, and
                  punctuation are free. Choose wisely.
                </p>
                <p className="bb-help-text">
                  The agent can <strong>fold</strong> (forfeit ante),
                  <strong> check</strong> (play for current pot), or
                  <strong> bet</strong> (raise the stakes).
                  Your final score is the agent's chip count after 5 hands.
                </p>
                <button className="app-btn app-btn-primary bb-help-close" onClick={() => setShowHelp(false)}>
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── GAME OVER ──

  if (stage === 'gameover') {
    const standings = [
      { name: 'Your Agent', chips: agentChips, isAgent: true },
      { name: 'Opponent A', chips: oppAChips, isAgent: false },
      { name: 'Opponent B', chips: oppBChips, isAgent: false },
    ].sort((a, b) => b.chips - a.chips)

    const rank = standings.findIndex(s => s.isAgent) + 1
    const rankLabel = rank === 1 ? '1st Place!' : rank === 2 ? '2nd Place' : '3rd Place'
    const lettersUsed = 26 - letterPool.size

    return (
      <div className="app-mode bb-game">
        <div className="bb-layout" style={{ justifyContent: 'center', gap: 12 }}>
          <div className="bb-gameover-header">
            <h2 className="bb-gameover-title">{rankLabel}</h2>
            <p className="bb-gameover-sub">Tournament Complete</p>
            <div className="bb-gameover-chips">
              <span className="bb-gameover-chips-value">{agentChips}</span>
              <span className="bb-gameover-chips-label">Final Chips</span>
            </div>
          </div>

          <div className="bb-gameover-standings">
            {standings.map((s, i) => (
              <div key={i} className={`bb-standing-row ${s.isAgent ? 'bb-standing-row-agent' : ''}`}>
                <span className="bb-standing-rank">#{i + 1}</span>
                <span className="bb-standing-name">{s.name}</span>
                <span className="bb-standing-chips">{s.chips}</span>
              </div>
            ))}
          </div>

          <div className="bb-gameover-letters">
            <div className="bb-gameover-letters-label">Letters used: {lettersUsed}/26</div>
            <div className="bb-letter-grid">
              {ALL_LETTERS.map(l => (
                <span key={l} className={`bb-letter ${letterPool.has(l) ? 'bb-letter-available' : 'bb-letter-used'}`}>
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div className="bb-gameover-actions">
            <button className="app-btn app-btn-primary" onClick={startGame}>
              Play Again
            </button>
            <button className="app-btn app-btn-secondary" onClick={() => setStage('dashboard')}>
              Menu
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── DASHBOARD ──

  return (
    <div className="app-mode app-mode-dashboard">
      <div className="app-dashboard-shell">
        <div className="app-title-block">
          <h2 className="app-title">Big Blind</h2>
          <p className="app-title-sub">26 Letters. 5 Hands.</p>
          <hr className="app-title-rule" />
        </div>

        <div className="app-dashboard-body">
          {error && <div className="app-error">{error}</div>}

          <div className="app-card" style={{ alignItems: 'center', gap: 12 }}>
            <p className="app-muted" style={{ textAlign: 'center', margin: 0, fontSize: '0.92rem' }}>
              Your AI agent plays poker. You see everyone's cards.
              Advise your agent — but each letter of the alphabet can only be used once.
            </p>
          </div>

          {gameState && gameState.gamesPlayed > 0 && (
            <div className="app-stats-grid">
              <div className="app-stat-card">
                <span className="app-stat-value">{gameState.gamesPlayed || 0}</span>
                <span className="app-stat-label">Games Played</span>
              </div>
              <div className="app-stat-card">
                <span className="app-stat-value">{gameState.bestChips || 0}</span>
                <span className="app-stat-label">Best Chips</span>
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
