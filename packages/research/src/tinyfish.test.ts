import { describe, expect, it } from 'vitest'
import { createTinyFishSource, TINYFISH_SOURCE_NAME } from './tinyfish'
import { isVendorRefusal, PageSourceError } from './vendor-error'

function transport(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { calls, fetchImpl }
}

describe('TinyFish Fetch as tier 3', () => {
  it('reads a rendered page as markdown, keyed in X-API-Key, live (ttl 0), and spends nothing', async () => {
    const t = transport(200, {
      results: [
        {
          url: 'https://example.com/',
          final_url: 'https://example.com/home',
          title: 'Example',
          text: '# Example\n\nWe roast on Tuesdays.',
        },
      ],
      errors: [],
    })
    const source = createTinyFishSource({ apiKey: 'tf_test', fetchImpl: t.fetchImpl })

    const page = await source.scrape('https://example.com/')

    expect(source.name).toBe(TINYFISH_SOURCE_NAME)
    expect(source.creditsPerCall).toBe(0)
    expect(page).toEqual({
      url: 'https://example.com/home',
      title: 'Example',
      markdown: '# Example\n\nWe roast on Tuesdays.',
      statusCode: 200,
    })
    const [call] = t.calls
    expect(call!.url).toBe('https://api.fetch.tinyfish.ai')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('tf_test')
    expect(headers.authorization).toBeUndefined()
    expect(JSON.parse(String(call!.init.body))).toEqual({
      urls: ['https://example.com/'],
      format: 'markdown',
      ttl: 0,
    })
  })

  it('has no discovery of its own: map() is empty, so the ladder must hand it links', async () => {
    const t = transport(200, { results: [] })
    const source = createTinyFishSource({ apiKey: 'k', fetchImpl: t.fetchImpl })
    expect(await source.map('https://example.com/', 5)).toEqual([])
    expect(t.calls).toEqual([])
  })

  it('a URL listed under errors[] is one unanswered page, not a refusal', async () => {
    const t = transport(200, {
      results: [],
      errors: [{ url: 'https://example.com/menu', error: 'timeout' }],
    })
    const source = createTinyFishSource({ apiKey: 'k', fetchImpl: t.fetchImpl })
    const page = await source.scrape('https://example.com/menu')
    expect(page.statusCode).toBe(0)
    expect(page.markdown).toBe('')
  })

  it('a rate limit or a feature the account lacks is a refusal the crawl stops on; a 500 is not', async () => {
    for (const status of [402, 403, 429]) {
      const source = createTinyFishSource({
        apiKey: 'k',
        fetchImpl: transport(status, {}).fetchImpl,
      })
      const error = await source.scrape('https://example.com/').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PageSourceError)
      expect((error as PageSourceError).status).toBe(status)
      expect(isVendorRefusal(error)).toBe(true)
      // Never the key in the message.
      expect((error as Error).message).not.toContain('k')
    }
    const source = createTinyFishSource({ apiKey: 'k', fetchImpl: transport(500, {}).fetchImpl })
    const error = await source.scrape('https://example.com/').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PageSourceError)
    expect(isVendorRefusal(error)).toBe(false)
  })

  it('structured text (format json) is still a string to the corpus, never [object Object]', async () => {
    const t = transport(200, { results: [{ url: 'https://x.test/', text: { hours: '9-5' } }] })
    const source = createTinyFishSource({ apiKey: 'k', fetchImpl: t.fetchImpl })
    const page = await source.scrape('https://x.test/')
    expect(page.markdown).toBe('{"hours":"9-5"}')
    expect(page.markdown).not.toContain('[object')
  })
})
