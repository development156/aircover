import 'server-only'

import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'

import { isPublicAddress } from './address-guard'
import { normaliseUrl } from './door'

/**
 * Fetch a user-supplied URL, safely.
 *
 * ── Why this is not `fetch()` ────────────────────────────────────────────────
 *
 * The obvious shape is: resolve the hostname, check the address is public, then
 * `fetch(url)`. That check is worth very little. Between the resolution we
 * inspect and the connection the runtime opens, the name is resolved a SECOND
 * time — and nothing says the two answers agree. A DNS record with a one-second
 * TTL that returns a public address on the first lookup and 169.254.169.254 on
 * the second walks straight through it. That is DNS rebinding, and it is the
 * standard way this exact feature gets exploited.
 *
 * `node:http` accepts a `lookup` function, and it is called BY THE SOCKET at
 * connect time. Validating there means the address we approved is the address
 * the connection actually uses — there is no second resolution to disagree
 * with. Node's global `fetch` gives no way to supply one, which is the whole
 * reason this file uses the lower-level client.
 *
 * Everything else is ordinary hygiene: http/https only, redirects followed by
 * hand so every hop is re-validated, a byte cap, a timeout, no credentials, and
 * only HTML accepted.
 */

export const FETCH_TIMEOUT_MS = 8_000
export const MAX_HTML_BYTES = 1_500_000
export const MAX_REDIRECTS = 3

const USER_AGENT = 'SahodaBot/1.0 (+https://sahoda.com; brand onboarding, user-initiated)'

export type FetchSiteResult =
  { ok: true; html: string; finalUrl: string } | { ok: false; reason: string }

/** Node calls this from the socket. Refusing here refuses the connection. */
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)

    const safe = addresses.filter((entry) => isPublicAddress(entry.address, entry.family))
    if (safe.length === 0) {
      const blocked: NodeJS.ErrnoException = new Error('BLOCKED_ADDRESS')
      blocked.code = 'BLOCKED_ADDRESS'
      return callback(blocked, '', 0)
    }

    if (options.all) return callback(null, safe)
    return callback(null, safe[0]!.address, safe[0]!.family)
  })
}

const PRIVATE_ADDRESS_REASON =
  'That address is on a private network, so we cannot read it. Type a sentence instead.'

/**
 * Validate a host that is ALREADY an IP address.
 *
 * The socket-level `lookup` guard above has one blind spot, and it is the
 * obvious attack: Node does not resolve a host that is already an IP literal,
 * so `http://127.0.0.1/` and `http://169.254.169.254/` never call `lookup` at
 * all and connect straight through. Proven by test — before this check, a
 * request for `http://127.0.0.1:<port>/` reached a live loopback server.
 *
 * Returns null when the host is a name (nothing to check here; the socket guard
 * owns that case).
 */
function literalAddressRefusal(hostname: string): string | null {
  const isIpv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  // `new URL()` strips the brackets from an IPv6 host, so a colon is the tell.
  const isIpv6Literal = hostname.includes(':')
  if (!isIpv4Literal && !isIpv6Literal) return null

  return isPublicAddress(hostname) ? null : PRIVATE_ADDRESS_REASON
}

interface RawResponse {
  status: number
  location: string | null
  contentType: string
  body: string
}

function requestOnce(url: URL): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const options: RequestOptions = {
      method: 'GET',
      // `lookup` is typed loosely in @types/node; the shape above is what the
      // socket actually calls.
      lookup: guardedLookup as unknown as RequestOptions['lookup'],
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    }

    const request = send(url, options, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0
      const location = (response.headers.location as string | undefined) ?? null
      const contentType = (response.headers['content-type'] as string | undefined) ?? ''

      // A redirect or a non-HTML body is decided from the headers alone —
      // draining megabytes of a PDF or a video to then discard it is waste we
      // can simply decline.
      if (status >= 300 && status < 400) {
        response.destroy()
        return resolve({ status, location, contentType, body: '' })
      }
      if (contentType && !/text\/(html|plain)|application\/xhtml/i.test(contentType)) {
        response.destroy()
        return resolve({ status, location: null, contentType, body: '' })
      }

      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_HTML_BYTES) {
          // Truncating is deliberate: a brand describes itself well before the
          // 1.5MB mark, and the alternative is failing on every bloated site.
          response.destroy()
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('close', () =>
        resolve({
          status,
          location: null,
          contentType,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })

    request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(new Error('TIMEOUT')))
    request.on('error', reject)
    request.end()
  })
}

function failureFor(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  const message = (error as Error | undefined)?.message

  if (code === 'BLOCKED_ADDRESS') return PRIVATE_ADDRESS_REASON
  if (message === 'TIMEOUT' || code === 'ETIMEDOUT') {
    return 'That site took too long to answer. Type a sentence instead.'
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'We could not find that site — check the address, or type a sentence instead.'
  }
  return 'We could not reach that site. Type a sentence instead.'
}

/**
 * Fetch a page's HTML. Never throws; every failure is a sentence the user can
 * act on, and every one of them offers the same way forward (type a sentence),
 * because that is the door that always works.
 */
export async function fetchSite(rawUrl: string): Promise<FetchSiteResult> {
  let current = normaliseUrl(rawUrl)
  if (!current) return { ok: false, reason: 'That does not look like a web address.' }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = new URL(current)

    // Inside the loop, not before it: a redirect to a literal private address
    // has to face exactly the same check as one the user typed.
    const refusal = literalAddressRefusal(target.hostname)
    if (refusal) return { ok: false, reason: refusal }

    let response: RawResponse
    try {
      response = await requestOnce(target)
    } catch (error) {
      return { ok: false, reason: failureFor(error) }
    }

    if (response.status >= 300 && response.status < 400 && response.location) {
      // Re-normalised, so a redirect to `file://` or to a bare private host is
      // rejected by the same rules the typed URL faced. Relative locations are
      // resolved against the hop we are on.
      const next = normaliseUrl(new URL(response.location, current).toString())
      if (!next) return { ok: false, reason: 'That site redirected somewhere we cannot follow.' }
      current = next
      continue
    }

    if (response.status !== 200) {
      return {
        ok: false,
        reason: `That site answered with an error (${response.status}). Type a sentence instead.`,
      }
    }
    if (!response.body) {
      return { ok: false, reason: 'That address is not a web page. Type a sentence instead.' }
    }
    return { ok: true, html: response.body, finalUrl: current }
  }

  return { ok: false, reason: 'That site redirected too many times. Type a sentence instead.' }
}
