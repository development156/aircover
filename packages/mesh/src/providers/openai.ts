import type { FetchLike, Provider } from './types'
import { createOpenAiCompatibleProvider } from './openai-compatible'

const OPENAI_BASE = 'https://api.openai.com/v1'

/** Direct OpenAI fallback. OpenAI caches stable prefixes automatically, so messages ride as plain strings. */
export function createOpenAIProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  return createOpenAiCompatibleProvider({
    name: 'openai',
    baseUrl: OPENAI_BASE,
    apiKey,
    fetchImpl,
  })
}
