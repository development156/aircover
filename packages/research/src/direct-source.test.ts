import { describe, expect, it } from 'vitest'

import { createDirectSource } from './direct-source'

/**
 * `onLandingHtml` is the only way raw markup escapes this package — everything
 * else is converted to markdown and the HTML thrown away. Its contract is
 * "called from map() only, so exactly one page's HTML is ever exposed", and
 * until this file that was a comment rather than a checked property.
 */

const HOME = `<!doctype html><html><head>
  <title>Acme Chai</title>
  <meta name="theme-color" content="#c1440e">
</head><body>
  <p>We roast our own masala in Pune.</p>
  <a href="/about">About</a><a href="/menu">Menu</a>
</body></html>`

const INNER = `<!doctype html><html><head><title>About</title></head>
<body><p>Founded in 2011 above the bookshop.</p></body></html>`

function stubFetch(bodies: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const path = new URL(url).pathname
    return new Response(bodies[path] ?? INNER, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }) as typeof fetch
}

const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]

describe('onLandingHtml', () => {
  it('hands back the landing page markup, before it is converted away', async () => {
    let seen: string | null = null
    const source = createDirectSource({
      fetchImpl: stubFetch({ '/': HOME }),
      resolve: publicDns,
      onLandingHtml: (html) => {
        seen = html
      },
    })

    await source.map('https://acme.example/', 5)

    // The markdown the crawl keeps has no meta tag in it — that is the whole
    // reason this hook exists.
    expect(seen).toContain('theme-color')
    expect(seen).toContain('#c1440e')
  })

  it('fires from map() ONLY — a scrape of another page exposes nothing', async () => {
    // If this ever fired from scrape() too, five pages of HTML would leak out
    // per crawl and the "exactly one page, by construction" claim would be false.
    const calls: string[] = []
    const source = createDirectSource({
      fetchImpl: stubFetch({ '/': HOME }),
      resolve: publicDns,
      onLandingHtml: (html) => calls.push(html),
    })

    await source.map('https://acme.example/', 5)
    await source.scrape('https://acme.example/about')
    await source.scrape('https://acme.example/menu')

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('Acme Chai')
  })

  it('is optional — a source without it still crawls', async () => {
    const source = createDirectSource({
      fetchImpl: stubFetch({ '/': HOME }),
      resolve: publicDns,
    })

    const links = await source.map('https://acme.example/', 5)
    const page = await source.scrape('https://acme.example/')

    expect(links.length).toBeGreaterThan(0)
    expect(page.markdown).toContain('masala')
  })
})
