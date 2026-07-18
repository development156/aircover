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

export interface Provider {
  readonly name: string
  chat(req: ChatRequest): Promise<ChatResponse>
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
