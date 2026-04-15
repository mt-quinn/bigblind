# TGB Game Jam Template

A mobile-first web game template with built-in LLM, TTS, and server storage. Designed so that an LLM coding agent (Cursor, Copilot, Windsurf, etc.) can rapidly build game jam games on top of a proven constraint set — without the human having to specify mobile layout, API proxying, or persistence from scratch.

---

## Prerequisites

You need the following installed on your machine before starting:

- **Node.js** (v18 or later) — [download here](https://nodejs.org/)
- **Git** — [download here](https://git-scm.com/)
- **A code editor with LLM agent support** — [Cursor](https://cursor.com/) is recommended, but any editor with an AI coding agent works (VS Code + Copilot, Windsurf, etc.)
- **An OpenAI or Anthropic API key** — at least one is required for the LLM features. Get one from [platform.openai.com](https://platform.openai.com/) or [console.anthropic.com](https://console.anthropic.com/).

Optional:
- **An ElevenLabs API key** — for high-quality text-to-speech. Get one from [elevenlabs.io](https://elevenlabs.io/). Without this, TTS falls back to the browser's built-in speech synthesis.
- **A Vercel account** — for deploying to production. Free tier works. [vercel.com](https://vercel.com/)

---

## Step 1: Clone the Repo

Open a terminal and run:

```bash
git clone https://github.com/thegameband/TGBJamTemplate.git
cd TGBJamTemplate
```

This gives you a local copy of the template.

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs React, Vite, and the server-side packages (Vercel KV, Redis client, etc.).

---

## Step 3: Set Up Your Environment

Copy the example environment file and fill in your API key:

```bash
cp .env.example .env
```

Open `.env` in your editor and add your key:

```
OPENAI_API_KEY=sk-proj-...
```

That's the only required key. Everything else is optional:

| Variable | Required | What it does |
|----------|----------|--------------|
| `OPENAI_API_KEY` | Yes* | Powers LLM text generation |
| `ELEVENLABS_API_KEY` | No | High-quality text-to-speech voices |
| `KV_REST_API_URL` | No | Vercel KV for production data persistence |
| `KV_REST_API_TOKEN` | No | Vercel KV authentication |


For local development, data persistence works automatically using a local file — no database setup needed.

---

## Step 4: Run the Dev Server

```bash
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173`). You should see the template's reference app: an onboarding screen, a dashboard with tabs, and a chat demo that talks to the LLM.

If you see an LLM error in the chat, double-check that your `.env` file has a valid API key and that you restarted the dev server after creating it.

---

## Step 5: Open the Project in Your LLM Agent

Open the `TGBJamTemplate` folder in your LLM-enabled editor (e.g., Cursor).

### What to tell the agent

Give it a prompt like this:

> Read `AGENT_GUIDE.md` in this repo from top to bottom. It describes every feature, constraint, and pattern in this template. Then build me a [describe your game here].

The `AGENT_GUIDE.md` file is the complete instruction manual written specifically for LLM agents. It explains:

- **What must never be broken** (the mobile frame, LLM integration, error debugging)
- **What patterns to follow** (stage-based navigation, tab layout, card/button conventions, audio)
- **What features are optional** (TTS, Picrew avatars, music, SFX) — and that the agent should ask you before including or dropping them

### Example prompts

For a simple game:

> Read AGENT_GUIDE.md. Build a trivia game where the LLM generates questions about a random topic and the player answers. Track the score on the dashboard.

For something more complex:

> Read AGENT_GUIDE.md. Build a detective interrogation game where the player questions an LLM-generated suspect. Use the Picrew system for suspect portraits and TTS for their voice responses.

For maximum control:

> Read AGENT_GUIDE.md. I want a game that [description]. Use TTS for narration. Don't use the Picrew system — use emoji instead. Keep the UI aesthetic from the reference but change the color scheme to blue.

The agent will build on top of the template's existing mobile shell, API proxy, and persistence layer, so you don't have to explain those things.

---

## Deploying to Vercel

When you're ready to share your game:

1. Create a repo on GitHub and push your code
2. Go to [vercel.com](https://vercel.com/) and click "Import Project"
3. Select your GitHub repo
4. In the Vercel dashboard, go to Settings > Environment Variables and add:
   - `OPENAI_API_KEY` (required)
   - `ELEVENLABS_API_KEY` (if using TTS)
   - Vercel KV is auto-provisioned if you add it from the Vercel dashboard under Storage
5. Click Deploy

The `vercel.json` in the repo handles all routing automatically.
