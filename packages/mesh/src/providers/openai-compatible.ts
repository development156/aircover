import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FetchLike,
  FileAnnotation,
  Provider,
} from './types'
import { ProviderCallError } from './types'

/** Shape of the OpenAI-compatible /chat/completions response we depend on. */
interface OpenAiChatCompletion {
  model?: string
  choices?: Array<{
    message?: { content?: string; annotations?: FileAnnotation[] }
    /** 'stop' | 'length' | … — 'length' means the token ceiling cut it off. */
    finish_reason?: string
    native_finish_reason?: string
  }>
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
  /**
   * Extra TOP-LEVEL body fields, computed per request. OpenRouter's `plugins`
   * (the PDF file-parser) is a sibling of `messages`, not a header and not part
   * of a message — there was no seam for it before.
   */
  extraBody?: (req: ChatRequest) => Record<string, unknown>
  /** True only for providers that accept files AND honour an explicit pdfEngine. */
  supportsFiles?: boolean
}

/**
 * Plain string content when there is nothing attached; the OpenAI content-part
 * array when there is. Annotations ride on the turn that carries them so a
 * replayed parse reaches the provider intact.
 */
const defaultEncode = (m: ChatMessage): unknown => {
  const base: Record<string, unknown> = { role: m.role }
  if (m.files && m.files.length > 0) {
    base.content = [
      { type: 'text', text: m.content },
      ...m.files.map((f) => ({
        type: 'file',
        file: { filename: f.filename, file_data: f.dataUrl },
      })),
    ]
  } else {
    base.content = m.content
  }
  if (m.annotations && m.annotations.length > 0) base.annotations = m.annotations
  return base
}

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
    ...(opts.supportsFiles ? { supportsFiles: true as const } : {}),
    async chat(req: ChatRequest): Promise<ChatResponse> {
      // Defence in depth behind the runner's own check: a provider that cannot
      // honour an explicit pdfEngine must never receive a file, because the
      // charge for parsing it lands silently as input tokens.
      if (!opts.supportsFiles && req.messages.some((m) => (m.files?.length ?? 0) > 0)) {
        throw new ProviderCallError(
          opts.name,
          null,
          'provider cannot accept files — refusing rather than paying to parse them natively',
        )
      }

      const body = {
        model: req.model,
        messages: req.messages.map(encode),
        max_tokens: req.maxTokens,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.extraBody?.(req) ?? {}),
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

      // A 200 with an empty/non-JSON body (truncated stream, proxy/gateway HTML)
      // must normalize to ProviderCallError so the runner falls back + logs + returns
      // a typed Result — never a raw SyntaxError that escapes run().
      let json: OpenAiChatCompletion
      try {
        json = (await res.json()) as OpenAiChatCompletion
      } catch {
        throw new ProviderCallError(opts.name, res.status, 'provider returned a non-JSON body')
      }
      const choice = json.choices?.[0]
      const annotations = choice?.message?.annotations
      // OpenRouter normalises to `finish_reason` but also passes the upstream
      // value through; either saying 'length' means the ceiling was hit.
      const truncated =
        choice?.finish_reason === 'length' || choice?.native_finish_reason === 'length'
      return {
        text: choice?.message?.content ?? '',
        ...(truncated ? { truncated: true } : {}),
        ...(annotations && annotations.length > 0 ? { annotations } : {}),
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
