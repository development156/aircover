import type { ChatRequest, FetchLike, ImageRequest, ImageResponse, Provider } from './types'
import type { ChatMessage } from './types'
import { ProviderCallError } from './types'
import { createOpenAiCompatibleProvider } from './openai-compatible'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/**
 * OpenRouter passes Anthropic-style prompt caching through as a `cache_control`
 * breakpoint on the marked prefix message (the Brand Brain block).
 */
const encodeMessage = (m: ChatMessage): unknown => {
  const parts: unknown[] = []
  if (m.cache) {
    parts.push({ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } })
  } else if (m.files && m.files.length > 0) {
    parts.push({ type: 'text', text: m.content })
  }
  if (m.files) {
    for (const f of m.files) {
      parts.push({ type: 'file', file: { filename: f.filename, file_data: f.dataUrl } })
    }
  }

  const encoded: Record<string, unknown> =
    parts.length > 0 ? { role: m.role, content: parts } : { role: m.role, content: m.content }
  if (m.annotations && m.annotations.length > 0) encoded.annotations = m.annotations
  return encoded
}

/** The free engine. `pdf-text` is deprecated and redirects here. */
export const FREE_PDF_ENGINE = 'cloudflare-ai' as const

/**
 * `plugins` is a TOP-LEVEL body field, and it is only sent when a file is
 * actually attached — an unconditional plugin block would be a claim about
 * every text call.
 *
 * The engine is ALWAYS spelled out. OpenRouter's documented default is native
 * first, then a fall back to `mistral-ocr` at $2 per 1,000 pages: a charge for a
 * choice nobody made. There is deliberately no "if unset use the free one"
 * branch here — `pdfEngine` is required at the call site so the decision is
 * visible where a reader can see it.
 */
const extraBody = (req: ChatRequest): Record<string, unknown> => {
  const hasFile = req.messages.some((m) => (m.files?.length ?? 0) > 0)
  if (!hasFile) return {}
  // A per-message engine overrides the request default. That is how the paid
  // OCR retry is expressed: the caller attaches the same file again and names
  // `mistral-ocr` on it, so the choice travels WITH the document rather than
  // being a mode set somewhere else and forgotten.
  const perFile = req.messages.flatMap((m) => m.files ?? []).find((f) => f.engine)?.engine
  return {
    plugins: [{ id: 'file-parser', pdf: { engine: perFile ?? req.pdfEngine ?? FREE_PDF_ENGINE } }],
  }
}

/**
 * A data URL as OpenRouter returns generated images: `data:image/png;base64,…`.
 * Split rather than regex-replaced so a malformed value fails the test instead of
 * silently yielding a truncated payload.
 */
const DATA_URL = /^data:([a-z0-9.+/-]+);base64,(.+)$/is

/**
 * The shape OpenRouter's DEDICATED Images API returns.
 *
 * `POST /api/v1/images` is a separate endpoint from chat completions, documented
 * at https://openrouter.ai/docs/features/multimodal/image-generation and
 * confirmed against it on 2026-08-29 (docs/43 §2). Its response is
 * `{created, data:[{b64_json, media_type}], usage:{prompt_tokens,
 * completion_tokens, total_tokens, cost}}`.
 *
 * `usage.cost` is the whole reason for moving off chat completions: it is the
 * REAL dollar cost of the generation. The chat endpoint reports token counts for
 * a model billed per image, which produces a number nobody quoted.
 */
interface OpenRouterImagesResponse {
  model?: string
  data?: { b64_json?: string; media_type?: string }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
  }
}

export function createOpenRouterProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  const chatProvider = createOpenAiCompatibleProvider({
    name: 'openrouter',
    baseUrl: OPENROUTER_BASE,
    apiKey,
    fetchImpl,
    encodeMessage,
    extraBody,
    supportsFiles: true,
    headers: {
      'http-referer': 'https://sahoda.site',
      'x-title': 'SAHODA LABS',
    },
  })

  const doFetch: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init))

  /**
   * Generate one image.
   *
   * OpenRouter exposes image generation THROUGH chat-completions rather than a
   * separate endpoint: the request asks for the `image` modality and the answer
   * arrives on `message.images[].image_url.url` as a data URL. That is why this
   * lives here and not in the openai-compatible client — the URL is shared, the
   * response shape is not, and teaching the generic client about images would put
   * an images branch in the code path every text call takes.
   *
   * Every failure is a ProviderCallError carrying the status and nothing else, the
   * same rule the chat client follows: the body may echo the prompt.
   */
  async function image(req: ImageRequest): Promise<ImageResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      // The exact canvas. `size` is what the Images API takes, and asking for a
      // shape rather than a named ratio is what lets a story be a story: three
      // named sizes cover three aspect ratios and this product needs six.
      size: `${req.width}x${req.height}`,
    }

    // ABSENT when there are none, never an empty array. A field carrying `[]`
    // and a field that is not there are different requests, and only the second
    // one is "this generation had no references".
    if (req.references !== undefined && req.references.length > 0) {
      body.input_references = req.references.map((url) => ({
        type: 'image_url',
        image_url: { url },
      }))
    }

    let res: Response
    try {
      res = await doFetch(`${OPENROUTER_BASE}/images`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'http-referer': 'https://sahoda.site',
          'x-title': 'SAHODA LABS',
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new ProviderCallError(
        'openrouter',
        null,
        `network error: ${e instanceof Error ? e.name : 'unknown'}`,
      )
    }

    if (!res.ok) {
      throw new ProviderCallError('openrouter', res.status, `provider returned HTTP ${res.status}`)
    }

    let json: OpenRouterImagesResponse
    try {
      json = (await res.json()) as OpenRouterImagesResponse
    } catch {
      throw new ProviderCallError('openrouter', res.status, 'provider returned a non-JSON body')
    }

    const first = json.data?.[0]
    const b64 = first?.b64_json
    if (typeof b64 !== 'string' || b64 === '') {
      // A 200 with no image is not a success. Returning an empty string here
      // would hand the caller zero bytes to put in a customer's library.
      throw new ProviderCallError('openrouter', res.status, 'provider returned no image')
    }

    // The API returns raw base64 rather than a data URL. Tolerate a data URL
    // anyway: the chat endpoint returned one, some providers still do, and
    // rejecting it would turn a usable picture into a refusal.
    const asDataUrl = DATA_URL.exec(b64.trim())

    return {
      base64: asDataUrl ? asDataUrl[2]! : b64,
      // The provider's CLAIM. `sniffImage` reads the real format from the bytes
      // and the caller may disagree with this.
      mime: (asDataUrl?.[1] ?? first?.media_type ?? 'image/png').toLowerCase(),
      usage: {
        provider: 'openrouter',
        model: json.model ?? req.model,
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
        cachedTokens: 0,
      },
      // Undefined when the provider did not say, never zero. A screen that
      // renders a missing cost as nothing spent states a price nobody quoted.
      costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : undefined,
    }
  }

  return { ...chatProvider, image }
}
