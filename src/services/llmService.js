import { fetchRuntimeCapabilities, getCachedRuntimeCapabilities } from './runtimeCapabilities'

const LLM_PROXY_API_URL = '/api/llm/chat'
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-5.2'

if (typeof window !== 'undefined') {
  fetchRuntimeCapabilities().catch(() => {})
}

export class LlmError extends Error {
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.detail = detail
    this.fatal = [
      'no_provider', 'missing_api_key', 'auth_error', 'invalid_request',
    ].includes(code)
  }
}

function resolveLlmProviderConfig() {
  const capabilities = getCachedRuntimeCapabilities()
  const hasOpenAi = Boolean(capabilities.openai)
  const hasAnthropic = Boolean(capabilities.anthropic)
  const capabilitiesLoaded = Boolean(capabilities.loaded)

  if (capabilitiesLoaded && !hasOpenAi && !hasAnthropic) return null

  if (hasOpenAi || !capabilitiesLoaded) {
    return {
      provider: 'openai',
      apiUrl: LLM_PROXY_API_URL,
      model: OPENAI_MODEL,
      transport: 'proxy',
    }
  }

  if (hasAnthropic) {
    return {
      provider: 'anthropic',
      apiUrl: LLM_PROXY_API_URL,
      model: 'claude-opus-4-6',
      transport: 'proxy',
    }
  }

  return null
}

function buildProviderBody(config, options = {}) {
  const { messages = [], maxTokens = 200, temperature, presencePenalty, frequencyPenalty } = options
  if (config.provider === 'anthropic') {
    const body = { model: config.model, max_tokens: maxTokens, messages }
    if (temperature !== undefined) body.temperature = temperature
    return body
  }
  const body = { model: config.model, max_completion_tokens: maxTokens, messages }
  if (temperature !== undefined) body.temperature = temperature
  if (presencePenalty !== undefined) body.presence_penalty = presencePenalty
  if (frequencyPenalty !== undefined) body.frequency_penalty = frequencyPenalty
  return body
}

function extractProviderText(provider, data) {
  if (provider === 'anthropic') {
    const content = data?.content
    if (Array.isArray(content)) {
      return content.map((block) => (block?.type === 'text' ? block.text : '')).join('').trim()
    }
    return ''
  }
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

function classifyHttpError(status, body, provider) {
  const errorField = body?.error
  const upstreamMsg = typeof errorField === 'string'
    ? errorField
    : errorField?.message || body?.message || ''

  if (status === 401 || status === 403) {
    return new LlmError('auth_error',
      `LLM API key rejected (${status}). Check ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} in Vercel env vars.`,
      { status, provider, upstream: upstreamMsg })
  }
  if (status === 429) {
    return new LlmError('rate_limit',
      `LLM rate limited (429). Wait a moment and try again.`,
      { status, provider, upstream: upstreamMsg })
  }
  if (status === 503 && errorField === 'missing_api_key') {
    return new LlmError('missing_api_key',
      `No ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} set. Add it to your Vercel environment variables.`,
      { status, provider })
  }
  if (status === 400) {
    return new LlmError('invalid_request',
      `LLM rejected the request (400): ${upstreamMsg || 'bad request'}`,
      { status, provider, upstream: upstreamMsg })
  }
  if (status === 502) {
    return new LlmError('upstream_down',
      `LLM proxy could not reach ${provider} API (502): ${upstreamMsg || 'connection failed'}`,
      { status, provider, upstream: upstreamMsg })
  }
  return new LlmError('http_error',
    `LLM request failed (${status}): ${upstreamMsg || 'unknown error'}`,
    { status, provider, upstream: upstreamMsg })
}

export async function getSingleResponseWithTimeout(userPrompt, options = {}) {
  const { maxTokens = 200, timeoutMs = 25000 } = options
  const temperature = Number.isFinite(Number(options?.temperature))
    ? Math.min(1.2, Math.max(0, Number(options.temperature)))
    : undefined
  const presencePenalty = Number.isFinite(Number(options?.presencePenalty))
    ? Math.min(2, Math.max(0, Number(options.presencePenalty)))
    : undefined
  const frequencyPenalty = Number.isFinite(Number(options?.frequencyPenalty))
    ? Math.min(2, Math.max(0, Number(options.frequencyPenalty)))
    : undefined

  const providerConfig = resolveLlmProviderConfig()
  if (!providerConfig) {
    throw new LlmError('no_provider',
      'No LLM provider available. Ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is set in your Vercel environment variables, then redeploy.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerConfig.provider,
        body: buildProviderBody(providerConfig, {
          maxTokens,
          temperature,
          presencePenalty,
          frequencyPenalty,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      let body = {}
      try { body = await response.json() } catch { /* non-JSON error body */ }
      throw classifyHttpError(response.status, body, providerConfig.provider)
    }

    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data).trim()
    return text || null
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof LlmError) throw err
    if (err.name === 'AbortError') {
      throw new LlmError('timeout',
        `LLM request timed out after ${Math.round(timeoutMs / 1000)}s. The model may be overloaded.`,
        { timeoutMs, provider: providerConfig.provider })
    }
    throw new LlmError('network_error',
      `Could not reach LLM proxy: ${err.message}`,
      { provider: providerConfig.provider, originalError: err.message })
  }
}
