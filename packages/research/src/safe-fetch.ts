import { lookup } from 'node:dns/promises'

import { ipLiteral, isPrivateAddress } from './ip'
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

/**
 * ADDRESS CLASSIFICATION LIVES IN `ip.ts` AND NO LONGER HERE.
 *
 * What used to be here were two prefix-regex classifiers, and the IPv6 half had
 * a hole wide enough to reach the cloud metadata endpoint: its only IPv4-mapped
 * branch matched `::ffff:169.254.169.254`, a string `new URL` never produces —
 * it serialises that literal as `::ffff:a9fe:a9fe`, which fell through every test
 * and was returned as PUBLIC. Fourteen of sixteen hostile IPv6 forms walked
 * through, MEASURED. `ip.ts` decides with arithmetic instead, and re-exporting
 * from here keeps `isPrivateAddress` at the import path its callers already use.
 */
export { isPrivateAddress, isPrivateIpv4, isPrivateIpv6, ipLiteral } from './ip'

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

  /**
   * AN IP LITERAL IS JUDGED HERE, NOT BY DNS.
   *
   * `url.hostname` keeps the brackets on an IPv6 literal, and
   * `dns.lookup('[::1]')` answers ENOTFOUND — so `http://[::1]/` was refused
   * with "hostname does not resolve", which is an ACCIDENT rather than a
   * decision. It reads as a working guard while resting on a DNS error message,
   * and the moment any caller strips the brackets first the refusal disappears.
   * Classify the literal directly and the refusal says what it means.
   */
  const literal = ipLiteral(url.hostname)
  if (literal) {
    if (isPrivateAddress(literal.address, literal.family)) {
      throw new UnsafeUrlError('resolves to a private address')
    }
    return url
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
