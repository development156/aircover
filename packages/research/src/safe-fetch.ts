import { lookup } from 'node:dns/promises'

/**
 * Tier 1 fetches a FOUNDER-SUPPLIED URL from our own server. Firecrawl did not
 * have this problem: the request left their infrastructure, not ours. A direct
 * fetch does, and it is the classic SSRF shape — `http://169.254.169.254/`
 * reads the cloud metadata endpoint, `http://localhost:5432` probes our own
 * Postgres, and a redirect to either does it without the URL ever looking wrong.
 *
 * So the guard is not "validate the URL the user typed". It is "validate every
 * hop, after DNS, before the socket". Redirects are followed MANUALLY for
 * exactly that reason — `redirect: 'follow'` would resolve hop 2 inside undici
 * where we can never see it.
 *
 * KNOWN RESIDUAL: DNS rebinding. We resolve, check, then fetch, and a hostile
 * resolver can answer differently between those two steps. Closing it needs
 * pinning the checked address into the connection (a custom agent/dispatcher),
 * which is a bigger change than this tier warrants today. Recorded rather than
 * hidden.
 */

export class UnsafeUrlError extends Error {
  constructor(readonly reason: string) {
    super(`refusing to fetch: ${reason}`)
    this.name = 'UnsafeUrlError'
  }
}

/** IPv4 ranges that must never be reachable from a customer-supplied URL. */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 127) return true // this-host, loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local — cloud metadata lives here
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]!
  if (addr === '::' || addr === '::1') return true
  // IPv4-mapped (::ffff:10.0.0.1) — judge it as the v4 address it really is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped) return isPrivateIpv4(mapped[1]!)
  if (/^f[cd]/.test(addr)) return true // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true // fe80::/10 link-local
  if (/^ff/.test(addr)) return true // multicast
  return false
}

export function isPrivateAddress(ip: string, family: number): boolean {
  return family === 6 ? isPrivateIpv6(ip) : isPrivateIpv4(ip)
}

export interface SafeUrlOptions {
  /** Injected in tests so DNS is not a network dependency. */
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>
}

/**
 * Throws unless `raw` is an http(s) URL whose every resolved address is public.
 * Returns the parsed URL so callers cannot accidentally use the unchecked one.
 */
export async function assertPublicUrl(raw: string, opts: SafeUrlOptions = {}): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('not a URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // file:, data:, gopher: — every one of these is a way out of "fetch a page".
    throw new UnsafeUrlError(`unsupported scheme ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('credentials in URL')
  }

  const resolver = opts.resolve ?? ((host: string) => lookup(host, { all: true, verbatim: true }))
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await resolver(url.hostname)
  } catch {
    throw new UnsafeUrlError('hostname does not resolve')
  }
  if (addresses.length === 0) throw new UnsafeUrlError('hostname does not resolve')

  // EVERY address, not the first: a host with one public and one loopback A
  // record is a bypass if we only check what we happen to connect to.
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new UnsafeUrlError('resolves to a private address')
    }
  }

  return url
}

export interface FetchedPage {
  /** Final URL after redirects — the one that actually served the bytes. */
  url: string
  status: number
  contentType: string
  html: string
  /** True when we stopped reading at the cap rather than at the end of the body. */
  truncated: boolean
}

export interface SafeFetchOptions extends SafeUrlOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  fetchImpl?: typeof fetch
}

export const DEFAULT_TIMEOUT_MS = 15_000
/** A 2 MB page is already far more than a voice corpus needs, and an uncapped read is a memory DoS. */
export const DEFAULT_MAX_BYTES = 2_000_000
const DEFAULT_MAX_REDIRECTS = 5

const UA =
  'SahodaBrandBrain/1.0 (+https://sahoda.com/bot; reads the site a customer gave us, once, at signup)'

/**
 * Fetch one page with every hop validated, a byte cap, and a timeout.
 * Never throws on an HTTP error status — a 404 is a fact about the page and the
 * caller's classifier needs to see it. Throws only for unsafe URLs and
 * transport failures.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<FetchedPage> {
  const doFetch = opts.fetchImpl ?? fetch
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  let current = raw
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = await assertPublicUrl(current, opts)
    const res = await doFetch(url.toString(), {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location)
        return {
          url: url.toString(),
          status: res.status,
          contentType: '',
          html: '',
          truncated: false,
        }
      // Re-validated at the top of the next iteration — a redirect into a
      // private address is the whole reason this loop is manual.
      current = new URL(location, url).toString()
      continue
    }

    const contentType = res.headers.get('content-type') ?? ''
    // Only HTML. A PDF or an image is the upload door's job, not this one, and
    // reading 2 MB of binary into a string helps nobody.
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return { url: url.toString(), status: res.status, contentType, html: '', truncated: false }
    }

    const { text, truncated } = await readCapped(res, maxBytes)
    return { url: url.toString(), status: res.status, contentType, html: text, truncated }
  }

  throw new UnsafeUrlError('too many redirects')
}

/**
 * Read at most `maxBytes`. A Content-Length header is a claim, not a limit —
 * the cap has to be enforced against the bytes that actually arrive.
 */
async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const body = res.body
  if (!body) return { text: '', truncated: false }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)))
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }

  return { text: Buffer.concat(chunks).toString('utf8'), truncated }
}
