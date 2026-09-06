import { describe, expect, it } from 'vitest'
import { TINYFISH_RENDER_ESTIMATE_MICROS, tinyfishFetch } from './tinyfish'

function transport(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }
  return { calls, fetch }
}

describe('tinyfishFetch, the rendered rung of the website ladder', () => {
  it('asks for live HTML with the key in X-API-Key and returns the Zyte-shaped result', async () => {
    const t = transport(200, {
      results: [
        { url: 'https://rival.in/', final_url: 'https://rival.in/home', text: '<html>menu</html>' },
      ],
    })
    const out = await tinyfishFetch('https://rival.in/', { apiKey: 'tf_k', fetch: t.fetch })
    expect(out).toEqual({
      html: '<html>menu</html>',
      finalUrl: 'https://rival.in/home',
      statusCode: 200,
    })
    const [call] = t.calls
    expect(call!.url).toBe('https://api.fetch.tinyfish.ai')
    expect((call!.init!.headers as Record<string, string>)['x-api-key']).toBe('tf_k')
    expect(JSON.parse(String(call!.init!.body))).toEqual({
      urls: ['https://rival.in/'],
      format: 'html',
      ttl: 0,
    })
  })

  it('a page the vendor could not read is an error, never an empty page hashed as "unchanged"', async () => {
    const t = transport(200, {
      results: [],
      errors: [{ url: 'https://rival.in/', error: 'blocked' }],
    })
    await expect(
      tinyfishFetch('https://rival.in/', { apiKey: 'k', fetch: t.fetch }),
    ).rejects.toThrow('tinyfish: no html returned')
  })

  it('a non-2xx carries the status and never the vendor prose or the key', async () => {
    const t = transport(429, { error: 'slow down, key k' })
    const error: unknown = await tinyfishFetch('https://rival.in/', {
      apiKey: 'k',
      fetch: t.fetch,
    }).catch((e: unknown) => e)
    expect((error as Error).message).toBe('tinyfish: http 429')
  })

  it('the reserved estimate is zero, because a rate limit is not a bill', () => {
    expect(TINYFISH_RENDER_ESTIMATE_MICROS).toBe(0)
  })
})
