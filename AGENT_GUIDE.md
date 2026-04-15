# TGB Game Jam Template — Agent Guide

This document is written for LLM agents building new games on top of this template. It explains every pre-built feature, what must not be broken, what should inform your design, and what is optional. Read the entire document before writing any code.

---

## What This Template Is

A Vite + React SPA deployed as a Vercel serverless app. It provides:
- A locked-down portrait mobile web shell that works on phones and simulates a phone on desktop
- An LLM proxy that keeps API keys on the server
- A TTS (text-to-speech) service via ElevenLabs with browser fallback
- Server-side persistence via Vercel KV / Redis / local dev fallback
- Runtime capability detection so the client knows which services are available
- A Picrew-based placeholder avatar system
- Background music and SFX audio management
- A reference flow showing onboarding, dashboard, chat interaction, and state persistence

The template is designed for game jams. Ship fast, keep it functional.

---

## Feature Tiers

Features are organized into three tiers. Follow them strictly.

### Tier 1: HARD REQUIREMENTS (never break these)

These constraints must be present in every game built from this template. If your design would violate one, redesign rather than remove the constraint.

#### 1a. Portrait Mobile Web Frame

The app runs inside a constrained portrait-mode mobile frame that must never overflow or scroll the outer page.

**What this means in practice:**
- `index.html` defines a `.phone-frame` container: 9:16 aspect on desktop (centered, rounded, max 450px wide), full-screen on mobile (<=768px).
- The viewport meta tag disables user zoom: `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
- `html`, `body`, and `#root` are set to `100dvh` with `overflow: hidden`.
- Every screen you build must fit inside this frame without causing the body to scroll.
- Use `flex: 1 1 auto; min-height: 0; overflow-y: auto` on scrollable content areas, never on the frame itself.

**Files that enforce this:**
- `index.html` — the shell CSS and viewport meta
- `src/App.jsx` — wraps everything in `<div className="phone-frame">`

**Do not:**
- Remove or weaken the viewport meta restrictions
- Add content that causes `body` or `#root` to scroll
- Change the `.phone-frame` sizing behavior
- Use `position: fixed` relative to the viewport (use the phone-frame as your coordinate system)

#### 1b. LLM-Enabled Text

Every game must use the LLM proxy for dynamic text generation. Pre-authored fallback text is not acceptable as the primary content path. The LLM is the content engine.

**Architecture:**
- Client calls `getSingleResponseWithTimeout(prompt, options)` from `src/services/llmService.js`
- This posts to `/api/llm/chat` which proxies to OpenAI or Anthropic
- API keys live on the server only (environment variables)
- The client never sees API keys

**Key files:**
- `src/services/llmService.js` — client-side LLM interface with provider abstraction, timeout, error classification
- `api/llm/chat.js` — server-side proxy supporting OpenAI and Anthropic
- `src/services/runtimeCapabilities.js` — client discovers which providers are available
- `api/config/capabilities.js` — server endpoint that reports key availability

**How to use the LLM:**
```js
import { getSingleResponseWithTimeout, LlmError } from '../services/llmService'

try {
  const reply = await getSingleResponseWithTimeout(prompt, {
    maxTokens: 200,
    timeoutMs: 20000,
    temperature: 0.9,
  })
  // reply is a string or null
} catch (err) {
  if (err instanceof LlmError) {
    if (err.fatal) {
      // Config error: missing key, auth failure — show to user
    } else {
      // Transient: timeout, rate limit — retry or show error
    }
  }
}
```

**LlmError codes:** `no_provider`, `missing_api_key`, `auth_error`, `invalid_request` (fatal); `rate_limit`, `timeout`, `upstream_down`, `network_error`, `http_error` (transient).

**Do not:**
- Call OpenAI/Anthropic APIs directly from client code
- Store API keys in client-visible code or VITE_ env vars
- Use pre-authored fallback content as the primary gameplay path
- Swallow LLM errors silently — always surface them to the user with the error code so debugging is possible

#### 1c. Good LLM Debugging Paths

When the LLM fails, the user must be able to understand why. This is a hard requirement because game jam participants need to debug configuration issues quickly.

**What this means:**
- Always display `LlmError` messages to the user, including the error code AND the full raw LLM output in a way the user can easily copy for debugging purposes
- Fatal errors (missing keys, auth failures) should be clearly distinguished and communicated from transient errors (timeouts, rate limits)
- The `runtimeCapabilities` system tells the client which providers are configured before any LLM call is made — use it to show clear guidance when no provider is available
- Never silently fall back to pre-authored text when the LLM fails. Show the error, let the user fix it.

**Pattern from the reference flow:**
```js
if (err instanceof LlmError) {
  const prefix = err.fatal ? '[Config Error]' : `[LLM ${err.code}]`
  setError(`${prefix} ${err.message}`)
}
```

### Tier 2: STRONG GUIDELINES (inform every design)

These patterns are proven and functional. You can adapt them to your game's theme and structure, but they should inform your design because they solve real mobile UX problems. Replicating them closely is acceptable and often preferable for speed.

#### 2a. Stage-Based Navigation

The reference app uses a `stage` state variable to switch between screens: `loading`, `onboarding`, `dashboard`, `chat`. This is intentional — a URL-based router adds complexity that game jams don't need.

**Pattern:**
- One main component owns the `stage` state
- Each stage renders a different screen
- Transitions happen via `setStage('...')`
- The entire app fits in the phone frame at every stage

#### 2b. Dashboard with Tabs

The dashboard uses inline tab buttons (not a router) for sub-navigation. Tabs are data-driven:
```js
const TABS = [
  { id: 'play', label: 'Play' },
  { id: 'info', label: 'Info' },
]
```

This pattern scales to any number of tabs and keeps navigation state local.

#### 2c. Onboarding / First-Visit Flow

New users see an onboarding screen before the dashboard. The server can signal first-visit status, or the client can detect it from empty state.

**Pattern:**
- Load player state on mount
- If state is empty, show onboarding
- After first action, save state and transition to dashboard
- Subsequent visits skip onboarding

#### 2d. Tutorial / Narrative Cards

In-flow tutorial messages use a `{ type: 'tutorial', id, message }` pattern in the chat log. They:
- Render differently from gameplay entries
- Can be cleared when gameplay begins
- Are narrated via TTS if available

#### 2e. Error and Status Display

Errors and status messages use dedicated styled containers (`.app-error`, `.app-status`) that:
- Are always visible when present
- Have constrained max-height with scroll
- Use word-break for long error messages
- Are placed consistently within each stage

#### 2f. Card, Button, and Form Conventions

The CSS provides a consistent component vocabulary:
- `.app-card` — dark translucent cards with border and gap
- `.app-btn-primary` — gold gradient CTA buttons
- `.app-btn-secondary` — dark outlined secondary buttons
- `.app-field-row` — form fields with labels and character counters
- `.app-stats-grid` — 2-column stat displays
- `.app-tabs` / `.app-tab` — segmented tab controls

Use these classes for visual consistency. Extend them by adding new classes rather than modifying the base tokens.

#### 2g. Audio Conventions

The template includes an audio service for background music and sound effects:
- `audioService.js` manages a looping background track, SFX cues, music ducking, and volume persistence
- Music starts on first user interaction (required by browser autoplay policy)
- SFX fire on button presses automatically via a global `pointerdown` handler
- Music mute state persists in localStorage

**SFX cues defined:** `buttonPress`, `questionAppears`, `answerAppears`, `resultGood`, `resultBad`. Add your own by extending the `SFX_CUES` object and placing audio files in `public/sounds/`.

#### 2h. Player Identity

Players get a random UUID stored in localStorage. No auth, no accounts. This is intentional for jams — it's fast and works offline.

- `gameApi.js` provides `getOrCreatePlayerId()` and `getStoredPlayerId()`
- The player ID is sent with all server requests
- Server state is keyed by player ID

### Tier 3: OPTIONAL FEATURES (ask the user before including or discarding)

These features are available in the template and likely useful, but they are game-specific. Before including or excluding them, ask the user whether their game needs them. Do not silently drop them.

#### 3a. TTS (Text-to-Speech)

ElevenLabs TTS with automatic browser SpeechSynthesis fallback.

**When to include:** Games with narration, character dialogue, accessibility requirements, or any spoken content.

**When to skip:** Purely visual/input games with no spoken content. But ASK first.

**Key files:**
- `src/services/ttsService.js` — full TTS client with queue, preloading, volume control, fallback chain
- `api/tts/synthesize.js` — server proxy for ElevenLabs (keeps API key server-side)

**How to use:**
```js
import { speakAndWait, stopAllAudio, primeTTSPlayback } from '../services/ttsService'

// Prime playback on user interaction (required for mobile)
await primeTTSPlayback()

// Speak and wait for completion
await speakAndWait('Hello, welcome to the game!', 'avatar')

// Stop all audio
stopAllAudio()
```

**Speakers:** `dater`, `avatar`, `narrator` — each maps to an ElevenLabs voice ID. Change voice IDs in `ttsService.js` or via `setVoice()`.

**Runtime detection:** The client checks `capabilities.elevenlabs` before attempting server TTS. If unavailable, it falls back to browser speech synthesis automatically.

#### 3b. Picrew Placeholder Avatar System

A layered portrait system using pre-extracted Picrew assets. The LLM can generate portrait configurations by choosing asset IDs per facial slot.

**When to include:** Games with characters, profiles, NPCs, or any visual identity system.

**When to skip:** Abstract games with no characters. But ASK first — even minimal character representation benefits from this.

**Key files:**
- `src/data/soulPortraitCatalog.js` — asset catalog with slot definitions, IDs, tags, and file paths
- `src/data/picrew2815216Pack.js` — generated manifest of the imported Picrew assets
- `src/data/picrew2815216TagOverrides.js` — human-editable semantic tags
- `src/services/soulPortraits.js` — normalization, fallback generation, layer rendering
- `src/services/soulPortraitGenerator.js` — LLM-assisted portrait generation
- `src/components/SoulPortrait.jsx` — React component that renders layered portraits
- `public/picrew/` — the actual image assets
- `scripts/import-picrew-ora.mjs` — import script for new Picrew packs
- `docs/picrew-tagging.md` — tagging workflow documentation

**How to use:**
```jsx
import SoulPortrait from './components/SoulPortrait'
import { generateSoulPortrait } from '../services/soulPortraitGenerator'

// Render a portrait (null portrait gets a deterministic fallback)
<SoulPortrait portrait={portraitData} fields={characterFields} size="lg" />

// Generate via LLM
const portrait = await generateSoulPortrait({
  name: 'Gerald',
  occupation: 'Tax Auditor',
  causeOfDeath: 'Banana peel',
  bio: 'Collected ceramic cats.'
})
```

**Portrait sizes:** `xs` (28px), `sm` (42px), `md` (98px), `lg` (144px).

**Slots:** `base`, `eyes`, `nose`, `mouth`, `ears`, `hair`, `arms`. Each slot has multiple asset options with semantic tags for LLM selection.

#### 3c. Background Music

A looping background track (`public/elevator-music.mp3`) with mute toggle.

**When to include:** Most games benefit from ambient audio.

**When to skip:** If the game has its own audio system or no audio at all.

Replace `elevator-music.mp3` with your own track. The audio service handles looping, volume, and autoplay policy compliance.

#### 3d. Sound Effects

Pre-wired SFX cues for common game events.

**When to include:** Any game with interactive feedback.

**Files:** `public/sounds/*.mp3` and the `SFX_CUES` object in `audioService.js`.

---

## Environment Variables

### Required
- `OPENAI_API_KEY` — OpenAI API key (at minimum, one LLM key is required)

### Recommended
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Vercel KV for production persistence

### Optional
- `ANTHROPIC_API_KEY` — Anthropic API key (alternative to OpenAI)
- `OPENAI_MODEL` — override the default OpenAI model (default: `gpt-5.2`)
- `ANTHROPIC_MODEL` — override the default Anthropic model
- `ELEVENLABS_API_KEY` — ElevenLabs TTS key
- `ELEVENLABS_NARRATOR_VOICE_ID` — custom narrator voice
- `REDIS_URL` / `UPSTASH_REDIS_URL` / `STORAGE_URL` — alternative Redis connections

For local dev without KV/Redis, the storage layer falls back to a local JSON file in `os.tmpdir()`, then to an in-memory Map. This is automatic and requires no configuration.

---

## File Map

```
index.html                          # Mobile shell + viewport + phone frame CSS
src/
  main.jsx                          # React entry
  App.jsx                           # Phone frame wrapper
  components/
    GameShell.jsx                   # Reference app (replace with your game)
    GameShell.css                   # Template CSS tokens and layout classes
    SoulPortrait.jsx                # Picrew portrait renderer
  services/
    gameApi.js                      # Client API: player ID, state load/save
    llmService.js                   # LLM proxy client with error classification
    ttsService.js                   # TTS with ElevenLabs + browser fallback
    audioService.js                 # Background music + SFX
    runtimeCapabilities.js          # Capability detection client
    soulPortraits.js                # Portrait normalization + fallback
    soulPortraitGenerator.js        # LLM-assisted portrait generation
  data/
    soulPortraitCatalog.js          # Picrew asset catalog
    picrew2815216Pack.js            # Picrew import manifest
    picrew2815216TagOverrides.js    # Semantic tags for assets
api/
  llm/chat.js                      # LLM proxy (OpenAI + Anthropic)
  tts/synthesize.js                 # TTS proxy (ElevenLabs)
  config/capabilities.js            # Runtime feature detection
  game/
    _storage.js                     # KV/Redis/local persistence layer
    _json.js                        # HTTP helpers (readJsonBody, sendJson, requirePost)
    _keys.js                        # Key prefixes and TTLs
    state/
      get.js                        # Load player state
      save.js                       # Save player state
public/
  picrew/                           # Picrew portrait assets
  sounds/                           # SFX audio files
  elevator-music.mp3                # Background music
vercel.json                         # Vercel SPA + API routing
```

---

## How to Build a New Game

1. **Start from `src/components/GameShell.jsx`**. This is the reference app. Replace it with your game while keeping the same structural patterns (stages, error display, LLM usage, frame constraints).

2. **Keep `index.html`, `src/App.jsx`, and `src/main.jsx` unchanged** unless you need to change fonts or theme colors. The mobile shell is defined here.

3. **Keep all files under `src/services/` and `api/`** unless you're extending them. These are the platform layer.

4. **Add game-specific API routes** under `api/game/` following the patterns in `state/get.js` and `state/save.js`. Use `_storage.js` for persistence, `_json.js` for request/response helpers.

5. **Add game-specific CSS** by creating new files or extending `GameShell.css`. Use the `app-` prefix for template-level classes and your own prefix for game-specific classes.

6. **Replace the SFX and music** in `public/sounds/` and `public/elevator-music.mp3` with your own assets. Update `SFX_CUES` in `audioService.js`.

---

## Common Mistakes to Avoid

1. **Silently dropping TTS.** If the game has any spoken content, wire up TTS. Don't skip it without asking.

2. **Breaking the mobile frame.** Every screen must fit in the phone frame. Test by resizing the browser. If the body scrolls, you've broken it.

3. **Calling LLM APIs directly from the client.** Always go through `/api/llm/chat`. The proxy exists to keep keys server-side.

4. **Swallowing LLM errors.** Always show the error code and message. Game jam participants need to debug config issues fast.

5. **Forgetting capability detection.** Check `capabilities.llmAny` before making LLM calls. Check `capabilities.elevenlabs` before assuming TTS works. Show clear guidance when a feature is unconfigured.

6. **Using position: fixed relative to viewport.** The phone frame is your coordinate system. Use absolute positioning within the frame, not fixed positioning on the viewport.

7. **Adding URL-based routing.** Stage-based navigation is intentional. A router adds complexity without benefit for single-screen game jam apps.

8. **Removing the viewport meta restrictions.** The `user-scalable=no` and `maximum-scale=1.0` are required for the app-like mobile feel.

9. **Ignoring the audio autoplay policy.** Music and TTS require a user interaction before they can play. Use `primeTTSPlayback()` on the first user action. The template handles this, but if you restructure the flow, maintain it.

10. **Forgetting to persist state.** Use `gameApi.js` to save and load player state via the KV-backed server route. LocalStorage alone is not sufficient for cross-device play.

---

## Deployment

1. Push to a GitHub repo
2. Import into Vercel
3. Add environment variables (at minimum `OPENAI_API_KEY`)
4. Deploy

The `vercel.json` handles routing: `/api/*` goes to serverless functions, everything else serves `index.html`.

For local dev:
```bash
npm install
npm run dev
```

Set `OPENAI_API_KEY` in a `.env` file for local LLM access. Storage falls back to local file/memory automatically.
