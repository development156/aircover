import { describe, expect, it, vi } from 'vitest'

import { createOpenRouterProvider } from './openrouter'
import { ProviderCallError } from './types'

/**
 * THE IMAGE PATH, WHICH HAD NO TESTS AT ALL UNTIL THIS FILE.
 *
 * MEASURED before writing it: `grep -rln runImage` across the repository
 * returned four files, and one of them was a stub that throws to satisfy an
 * interface. `providers.test.ts` ends at `createOpenAIProvider` and never calls
 * `image()`. So the one code path in this product that spends real money per
 * press was the one path nobody had watched work.
 *
 * ── WHAT IS BEING GUARDED ───────────────────────────────────────────────────
 * Every assertion below is about money or about bytes reaching a customer:
 *
 *   · the request goes to the IMAGES endpoint, not chat completions, because
 *     only that one reports what the generation actually cost;
 *   · a 200 carrying no image is a FAILURE, because returning zero bytes hands
 *     the caller nothing to put in somebody's library after charging them;
 *   · a missing cost is UNDEFINED and never zero, because a screen that renders
 *     a missing price as nothing spent states a price nobody quoted;
 *   · no failure message ever carries the provider's body, because the body can
 *     echo the customer's prompt.
 */

const KEY = 'test-key'

function respond(json: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(json), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

const ONE_PIXEL = 'iVBORw0KGgoAAAANSUhEUg=='

const ok = {
  created: 1,
  model: 'google/gemini-2.5-flash-image',
  data: [{ b64_json: ONE_PIXEL, media_type: 'image/png' }],
  usage: { prompt_tokens: 12, completion_tokens: 0, total_tokens: 12, cost: 0.0031 },
}

describe('the OpenRouter image call', () => {
  it('posts to the images endpoint, not to chat completions', async () => {
    const doFetch = respond(ok)
    const provider = createOpenRouterProvider(KEY, doFetch)
    await provider.image!({ model: 'm', prompt: 'a shopfront', width: 1080, height: 1350 })

    const [url] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/images')
    expect(url).not.toContain('chat/completions')
  })

  it('asks for the exact canvas, so a story is not answered with a square', async () => {
    const doFetch = respond(ok)
    const provider = createOpenRouterProvider(KEY, doFetch)
    await provider.image!({ model: 'm', prompt: 'p', width: 1080, height: 1920 })

    const [, init] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(JSON.parse(String(init.body))).toMatchObject({ size: '1080x1920' })
  })

  /**
   * THE ONE THAT PAYS FOR THIS FILE. `usage.cost` is the real dollar figure and
   * the only reason to be on this endpoint at all.
   */
  it('carries the real cost the provider reported', async () => {
    const provider = createOpenRouterProvider(KEY, respond(ok))
    const out = await provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 })
    expect(out.costUsd).toBe(0.0031)
  })

  it('leaves the cost UNDEFINED when the provider did not say, never zero', async () => {
    const provider = createOpenRouterProvider(
      KEY,
      respond({ ...ok, usage: { prompt_tokens: 1, completion_tokens: 0 } }),
    )
    const out = await provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 })
    expect(out.costUsd).toBeUndefined()
    expect(out.costUsd).not.toBe(0)
  })

  it('returns the bytes and the claimed type', async () => {
    const provider = createOpenRouterProvider(KEY, respond(ok))
    const out = await provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 })
    expect(out.base64).toBe(ONE_PIXEL)
    expect(out.mime).toBe('image/png')
  })

  /**
   * The chat endpoint returned a data URL and some providers still do. Rejecting
   * one would turn a perfectly usable picture into a refusal.
   */
  it('accepts a data URL as well as raw base64', async () => {
    const provider = createOpenRouterProvider(
      KEY,
      respond({ ...ok, data: [{ b64_json: `data:image/webp;base64,${ONE_PIXEL}` }] }),
    )
    const out = await provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 })
    expect(out.base64).toBe(ONE_PIXEL)
    expect(out.mime).toBe('image/webp')
  })

  describe('references', () => {
    it('sends none at all when there are none, rather than an empty list', async () => {
      const doFetch = respond(ok)
      const provider = createOpenRouterProvider(KEY, doFetch)
      await provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 })

      const [, init] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
        .calls[0]!
      expect(JSON.parse(String(init.body))).not.toHaveProperty('input_references')
    })

    it('sends none when the list is empty, because that is the same request', async () => {
      const doFetch = respond(ok)
      const provider = createOpenRouterProvider(KEY, doFetch)
      await provider.image!({
        model: 'm',
        prompt: 'p',
        width: 1024,
        height: 1024,
        references: [],
      })
      const [, init] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
        .calls[0]!
      expect(JSON.parse(String(init.body))).not.toHaveProperty('input_references')
    })

    it('sends references in the documented shape, in order', async () => {
      const doFetch = respond(ok)
      const provider = createOpenRouterProvider(KEY, doFetch)
      await provider.image!({
        model: 'm',
        prompt: 'p',
        width: 1024,
        height: 1024,
        references: ['https://example.test/a.png', 'data:image/png;base64,AAA'],
      })
      const [, init] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
        .calls[0]!
      expect(JSON.parse(String(init.body)).input_references).toEqual([
        { type: 'image_url', image_url: { url: 'https://example.test/a.png' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ])
    })
  })

  describe('failures, none of which may leak the body', () => {
    it('a 200 carrying no image is a failure, not empty bytes', async () => {
      const provider = createOpenRouterProvider(KEY, respond({ created: 1, data: [] }))
      await expect(
        provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }),
      ).rejects.toThrow(ProviderCallError)
    })

    it('an empty base64 string is refused, because zero bytes is not a picture', async () => {
      const provider = createOpenRouterProvider(KEY, respond({ ...ok, data: [{ b64_json: '' }] }))
      await expect(
        provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }),
      ).rejects.toThrow(/no image/i)
    })

    it('a non-200 carries the status and NOT the body', async () => {
      const provider = createOpenRouterProvider(
        KEY,
        respond({ error: 'a shopfront in Jaipur at dawn' }, 429),
      )
      await expect(
        provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }),
      ).rejects.toThrow(/HTTP 429/)
      await expect(
        provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }),
      ).rejects.not.toThrow(/Jaipur/)
    })

    it('a body that is not JSON is a failure rather than a silent empty picture', async () => {
      const doFetch = vi.fn(
        async () => new Response('<html>', { status: 200 }),
      ) as unknown as typeof fetch
      const provider = createOpenRouterProvider(KEY, doFetch)
      await expect(
        provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }),
      ).rejects.toThrow(/non-JSON/i)
    })

    it('a network error names the error KIND and never the prompt', async () => {
      const doFetch = vi.fn(async () => {
        throw new TypeError('connect ECONNREFUSED')
      }) as unknown as typeof fetch
      const provider = createOpenRouterProvider(KEY, doFetch)
      await expect(
        provider.image!({ model: 'm', prompt: 'a secret plan', width: 1024, height: 1024 }),
      ).rejects.toThrow(/network error: TypeError/)
    })
  })
})
