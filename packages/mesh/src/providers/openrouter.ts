import type { FetchLike, ImageRequest, ImageResponse, Provider } from './types'
import type { ChatMessage } from './types'
import { ProviderCallError } from './types'
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

/**
 * A data URL as OpenRouter returns generated images: `data:image/png;base64,…`.
 * Split rather than regex-replaced so a malformed value fails the test instead of
 * silently yielding a truncated payload.
 */
const DATA_URL = /^data:([a-z0-9.+/-]+);base64,(.+)$/is

/** The shape OpenRouter uses for image output on the chat-completions endpoint. */
interface OpenRouterImageCompletion {
  model?: string
  choices?: {
    message?: {
      images?: { image_url?: { url?: string } }[]
    }
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function createOpenRouterProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  const chatProvider = createOpenAiCompatibleProvider({
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
    const body = {
      model: req.model,
      messages: [{ role: 'user', content: req.prompt }],
      modalities: ['image', 'text'],
      // The provider decides the exact pixels; the size is expressed in the prompt
      // as well, because not every image model honours a structured hint.
      image_generation: { size: `${req.width}x${req.height}` },
    }

    let res: Response
    try {
      res = await doFetch(`${OPENROUTER_BASE}/chat/completions`, {
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

    let json: OpenRouterImageCompletion
    try {
      json = (await res.json()) as OpenRouterImageCompletion
    } catch {
      throw new ProviderCallError('openrouter', res.status, 'provider returned a non-JSON body')
    }

    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url
    if (typeof url !== 'string') {
      // A 200 with no image is not a success. Returning an empty string here would
      // hand the caller zero bytes to attach to a customer's post.
      throw new ProviderCallError('openrouter', res.status, 'provider returned no image')
    }

    const match = DATA_URL.exec(url.trim())
    if (!match?.[1] || !match[2]) {
      throw new ProviderCallError('openrouter', res.status, 'provider returned an unreadable image')
    }

    return {
      base64: match[2],
      mime: match[1].toLowerCase(),
      usage: {
        provider: 'openrouter',
        model: json.model ?? req.model,
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
        cachedTokens: 0,
      },
    }
  }

  return { ...chatProvider, image }
}
