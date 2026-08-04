/** A single chat turn. `cache` marks the stable, cache-controlled prefix (e.g. the Brand Brain block). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  cache?: boolean
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  /** Ask the provider for a JSON-object response. */
  jsonMode?: boolean
}

/** Raw per-call token counts; costUsd + latency are derived by the runner. */
export interface ProviderUsage {
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
}

export interface ChatResponse {
  text: string
  usage: ProviderUsage
}

/**
 * An image generation call.
 *
 * Separate from ChatRequest because it is not a chat: there is no message list,
 * no JSON mode, no token budget that means anything, and the answer is bytes.
 * Modelling it as a chat with a special flag would put four fields on every text
 * call that only ever apply to one.
 */
export interface ImageRequest {
  model: string
  prompt: string
  width: number
  height: number
}

export interface ImageResponse {
  /** Raw base64, no data-URL prefix — the caller decides what to do with bytes. */
  base64: string
  /** What the provider CLAIMED. The caller sniffs the bytes and may disagree. */
  mime: string
  usage: ProviderUsage
}

export interface Provider {
  readonly name: string
  chat(req: ChatRequest): Promise<ChatResponse>
  /**
   * OPTIONAL, and its absence is meaningful: most providers here are text-only,
   * and a runner that finds no image-capable provider must fail honestly rather
   * than fall back to a text model that would return a paragraph describing a
   * picture. Only the OpenRouter client implements it.
   */
  image?(req: ImageRequest): Promise<ImageResponse>
}

/** Injectable transport (defaults to global fetch) so provider clients test without a network. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * A failed provider call. Carries only the provider name + HTTP status — never
 * the api key, request body, or decrypted payload — so it is safe to log.
 */
export class ProviderCallError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderCallError'
  }
}
