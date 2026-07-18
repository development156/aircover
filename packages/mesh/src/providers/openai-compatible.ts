import type { ChatMessage, ChatRequest, ChatResponse, FetchLike, Provider } from './types'
import { ProviderCallError } from './types'

/** Shape of the OpenAI-compatible /chat/completions response we depend on. */
interface OpenAiChatCompletion {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

export interface OpenAiCompatibleOptions {
  name: string
  /** Base URL WITHOUT the trailing /chat/completions, e.g. https://openrouter.ai/api/v1 */
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
  headers?: Record<string, string>
  /** Provider-specific message encoder (default: plain {role, content}). */
  encodeMessage?: (m: ChatMessage) => unknown
}

const defaultEncode = (m: ChatMessage): unknown => ({ role: m.role, content: m.content })

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * A minimal, dependency-free client for any OpenAI-compatible chat-completions
 * endpoint (OpenRouter, OpenAI). Throws ProviderCallError on any failure so the
 * runner can fall back. Never logs the api key or request body.
 */
export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): Provider {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))
  const encode = opts.encodeMessage ?? defaultEncode

  return {
    name: opts.name,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body = {
        model: req.model,
        messages: req.messages.map(encode),
        max_tokens: req.maxTokens,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }

      let res: Response
      try {
        res = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${opts.apiKey}`,
            ...opts.headers,
          },
          body: JSON.stringify(body),
        })
      } catch (e) {
        throw new ProviderCallError(opts.name, null, `network error: ${errText(e)}`)
      }

      if (!res.ok) {
        // Status only — the response body may echo request context; never re-throw it.
        throw new ProviderCallError(opts.name, res.status, `provider returned HTTP ${res.status}`)
      }

      const json = (await res.json()) as OpenAiChatCompletion
      return {
        text: json.choices?.[0]?.message?.content ?? '',
        usage: {
          provider: opts.name,
          model: json.model ?? req.model,
          tokensIn: json.usage?.prompt_tokens ?? 0,
          tokensOut: json.usage?.completion_tokens ?? 0,
          cachedTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        },
      }
    },
  }
}
