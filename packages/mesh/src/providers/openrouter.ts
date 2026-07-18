import type { ChatMessage, FetchLike, Provider } from './types'
import { createOpenAiCompatibleProvider } from './openai-compatible'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/**
 * OpenRouter passes Anthropic-style prompt caching through as a `cache_control`
 * breakpoint on the marked prefix message (the Brand Brain block).
 */
const encodeMessage = (m: ChatMessage): unknown =>
  m.cache
    ? {
        role: m.role,
        content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
      }
    : { role: m.role, content: m.content }

export function createOpenRouterProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  return createOpenAiCompatibleProvider({
    name: 'openrouter',
    baseUrl: OPENROUTER_BASE,
    apiKey,
    fetchImpl,
    encodeMessage,
    headers: {
      'http-referer': 'https://sahoda.site',
      'x-title': 'SAHODA LABS',
    },
  })
}
