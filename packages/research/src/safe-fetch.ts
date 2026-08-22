import { lookup } from 'node:dns/promises'

import { pinnedFetch } from './pinned-fetch'

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
 * DNS REBINDING — CLOSED 2026-08-12, and worth stating because this comment
 * used to record it as an accepted residual. Resolving, checking, then calling
 * `fetch` leaves a window: the runtime resolves the name a SECOND time, and a
 * record with a one-second TTL can answer publicly the first time and
 * 169.254.169.254 the second. The default transport is now `pinnedFetch`, which
 * supplies `node:http`'s `lookup` — called by the socket at connect time, so the
 * address approved is the address used. Ported from the onboarding lane's own
 * fetcher, which had solved this before it was replaced by this package.
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
  const [a, b, c] = parts as [number, number, number, number]
  if (a === 0 || a === 127) return true // this-host, loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local — cloud metadata lives here
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  // Reserved ranges carried over from the onboarding lane's own address guard,
  // which listed them and this did not. None is routable, so none can be a real
  // customer's site — and a range nobody can legitimately be in is one a crawler
  // should refuse rather than time out on.
  if (a === 192 && b === 0 && c === 0) return true // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  return false
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or null if it is not one.
 *
 * PARSING IS THE POINT. The version this replaced matched SPELLINGS — a single
 * `^::ffff:(\d+\.\d+\.\d+\.\d+)$` regex — so it judged the IPv4-mapped form
 * only when the mapped address happened to be written in dotted quad. MEASURED
 * 2026-08-23: `::ffff:169.254.169.254` was blocked and `::ffff:a9fe:a9fe` was
 * ALLOWED. Those are the same 128 bits. `a9fe:a9fe` is `169.254.169.254`, the
 * cloud metadata endpoint, and `dns.lookup` may return either spelling.
 *
 * A guard that blocks one spelling of an address and admits another blocks
 * nothing at all, because the spelling is the attacker's to choose.
 */
function hextets(input: string): number[] | null {
  let addr = input.toLowerCase().split('%')[0] ?? ''

  // A dotted-quad tail IS the low 32 bits (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`).
  // Rewritten as two hextets so there is one representation to reason about.
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr)
  if (dotted) {
    const v4 = parseIpv4Bits(dotted[2]!)
    if (v4 === null) return null
    addr = `${dotted[1]!}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const part = (text: string): string[] => (text === '' ? [] : text.split(':'))
  const head = part(halves[0] ?? '')
  const tail = halves.length === 2 ? part(halves[1] ?? '') : []

  const groups =
    halves.length === 2
      ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
      : head
  if (groups.length !== 8) return null

  const out: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    out.push(Number.parseInt(g, 16))
  }
  return out
}

/** The 32-bit value of a dotted quad, or null. */
function parseIpv4Bits(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const octet = Number(p)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/** Judge 32 bits as the IPv4 address they are, reusing the audited range list. */
const embeddedV4IsPrivate = (v4: number): boolean =>
  isPrivateIpv4([(v4 >>> 24) & 255, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255].join('.'))

function isPrivateIpv6(ip: string): boolean {
  const h = hextets(ip)
  // Unparseable is REFUSED, not allowed. Everything reaching here came from a
  // resolver, so a shape we cannot read is a shape we cannot judge.
  if (h === null) return true

  const [h0, h1, h2, h3, h4, h5, h6, h7] = h as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const low32 = ((h6 << 16) >>> 0) + h7
  const topSixZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0

  if (topSixZero && low32 === 0) return true // ::           unspecified
  if (topSixZero && low32 === 1) return true // ::1          loopback
  // ::a.b.c.d — the deprecated IPv4-compatible form, and it tunnels v4 exactly
  // like the mapped form does.
  if (topSixZero) return embeddedV4IsPrivate(low32)
  // ::ffff:0:0/96 — IPv4-mapped, in EITHER spelling now.
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return embeddedV4IsPrivate(low32)
  }
  // 64:ff9b::/96 and 64:ff9b:1::/48 — NAT64. A prefix that exists specifically
  // to carry the whole IPv4 space, so it inherits every v4 range. Listed by the
  // onboarding lane's address guard and NOT by this one; deleting that file on
  // 2026-08-23 is what made this line this file's responsibility.
  if (h0 === 0x0064 && h1 === 0xff9b) {
    if (h2 === 0x0001) return true // local-use NAT64: no legitimate crawl target
    if (h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return embeddedV4IsPrivate(low32)
  }
  // 2002::/16 — 6to4, where the v4 address sits in the SECOND and THIRD hextets.
  if (h0 === 0x2002) return embeddedV4IsPrivate((((h1 << 16) >>> 0) + h2) >>> 0)

  if ((h0 & 0xfe00) === 0xfc00) return true // fc00::/7   unique-local
  if ((h0 & 0xffc0) === 0xfe80) return true // fe80::/10  link-local
  if ((h0 & 0xff00) === 0xff00) return true // ff00::/8   multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return true // 2001:db8::/32 documentation
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
  // `pinnedFetch`, not the global — see the DNS-rebinding note at the top of
  // this file. Tests inject `fetchImpl` and are unaffected either way.
  const doFetch = opts.fetchImpl ?? pinnedFetch
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
