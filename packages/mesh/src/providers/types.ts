/**
 * A document attached to a turn. `dataUrl` is `data:application/pdf;base64,…`
 * (or an https URL the provider fetches). UNTRUSTED, like any customer file.
 */
export interface ChatFile {
  filename: string
  dataUrl: string
  /**
   * Parse this document with a NAMED engine, overriding the request default.
   *
   * `cloudflare-ai` is free and reads a text layer. A design-heavy PDF whose
   * words live inside images returns almost nothing from it — measured: an
   * 869 KB proposal yielded 1,048 prompt tokens against an 800-token empty
   * baseline. `mistral-ocr` reads those, and costs $2 per 1,000 pages, so it is
   * never the default and never chosen on the customer's behalf.
   */
  engine?: 'cloudflare-ai' | 'mistral-ocr' | 'native'
}

/**
 * A provider's record of a file it already parsed. Replaying it on a later call
 * makes the provider reuse the parse instead of redoing it — which is the
 * difference between a free re-resolve and paying to read the same brand book
 * twice. `hash` identifies the parsed content.
 */
export interface FileAnnotation {
  type: 'file'
  file: { hash?: string; name?: string; content?: unknown }
}

/** A single chat turn. `cache` marks the stable, cache-controlled prefix (e.g. the Brand Brain block). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  cache?: boolean
  /** Attached documents. Only providers with `supportsFiles` may be sent these. */
  files?: ChatFile[]
  /** Prior parses replayed to avoid paying for the same parse twice. */
  annotations?: FileAnnotation[]
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  /** Ask the provider for a JSON-object response. */
  jsonMode?: boolean
  /**
   * PDF parsing engine, sent EXPLICITLY whenever a file rides along.
   *
   * Never omitted. OpenRouter's documented default is "native first, then fall
   * back to mistral-ocr" — so leaving this unset bills $2 per 1,000 pages for a
   * choice nobody made. `cloudflare-ai` is the free engine (`pdf-text` is
   * deprecated and redirects to it).
   */
  pdfEngine?: 'cloudflare-ai' | 'mistral-ocr' | 'native'
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
  /**
   * TRUE when the provider stopped because it hit `max_tokens`, not because the
   * model finished. This is the only signal that distinguishes "the answer was
   * cut off" from "the model wrote bad JSON" — and they need opposite responses:
   * bad JSON is worth one repair, a truncation retried under the SAME budget
   * truncates again. Inferring it from token counts is impossible after the
   * fact, because a repaired call reports both attempts summed.
   */
  truncated?: boolean
  usage: ProviderUsage
  /** Returned when the call parsed a file. Replay to skip (and not pay for) a re-parse. */
  annotations?: FileAnnotation[]
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
  /**
   * Whether this provider can accept `ChatMessage.files` AND honour an explicit
   * `pdfEngine`. Absent means NO, and that absence is load-bearing: the runner's
   * fallback chain is [OpenRouter, OpenAI], and OpenAI has no file-parser
   * plugin. Sending it a PDF anyway would parse the document as native input
   * tokens — a silent charge on the failure path, which is the one path no
   * happy-path test exercises. The runner skips providers without this.
   */
  readonly supportsFiles?: boolean
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
