import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { request as httpRequest, type RequestOptions } from 'node:http'
import type { LookupFunction } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'

import { isPrivateAddress } from './safe-fetch'

/**
 * A `fetch` whose connection can only reach the address we approved.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────
 *
 * `assertPublicUrl` resolves the hostname, checks every address is public, and
 * then hands the URL to `fetch`. Between those two steps the name is resolved a
 * SECOND time, by the runtime, and nothing says the two answers agree. A record
 * with a one-second TTL that returns a public address on the first lookup and
 * 169.254.169.254 on the second walks straight through the check. That is DNS
 * rebinding, and it is the standard way this exact feature — "type a URL and we
 * will read it" — gets turned into a read of the deployment's cloud credentials.
 *
 * `safe-fetch.ts` recorded this as a known residual rather than hiding it, and
 * said closing it meant pinning the checked address into the connection. This is
 * that: `node:http`'s `lookup` option is called BY THE SOCKET at connect time,
 * so the address we approve is the address the connection actually uses. There
 * is no second resolution left to disagree with.
 *
 * Node's global `fetch` exposes no such hook — undici's dispatcher does, but
 * undici is not a dependency here and adding one is a stop-and-ask. The lower-
 * level client needs neither.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────────
 *
 * No redirect following, no byte cap, no content-type rules, no timeout of its
 * own. `safeFetch` owns all of those and re-validates every hop; this is a
 * transport and nothing more, which is why it can be swapped in under the
 * existing `fetchImpl` seam without any of that logic changing.
 *
 * IP LITERALS are already handled upstream: `dns.lookup('127.0.0.1')` returns
 * the literal, so `assertPublicUrl` rejects it before a socket is opened. The
 * guard below is a second line for the rebinding case, not the only line.
 */

/**
 * Node calls this from the socket. Refusing here refuses the connection.
 *
 * Typed as `net.LookupFunction` rather than by hand: `dns.lookup` is overloaded,
 * so `Parameters<typeof dnsLookup>[1]` resolves to the CALLBACK of the two-arg
 * overload and the whole signature silently means something else.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const opts: LookupOptions = typeof options === 'object' && options !== null ? options : {}

  dnsLookup(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)

    const found = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[]
    // EVERY address must be public, not merely the one we would pick: a host
    // with one public and one loopback A record is a bypass otherwise, and which
    // one the socket takes is not ours to predict.
    const blocked = found.some((entry) => isPrivateAddress(entry.address, entry.family))
    if (blocked || found.length === 0) {
      const refusal: NodeJS.ErrnoException = new Error(
        'refusing to connect: resolves to a private address',
      )
      refusal.code = 'BLOCKED_ADDRESS'
      return callback(refusal, '', 0)
    }

    if (opts.all) return callback(null, found)
    const first = found[0]!
    return callback(null, first.address, first.family)
  })
}

/**
 * The hostname as an IP, when it already is one. `null` for a name — that case
 * belongs to the socket guard above, which is the only thing that can see it.
 *
 * A URL parses `[::1]` with brackets; `isPrivateAddress` wants the bare address.
 */
function ipLiteral(hostname: string): { address: string; family: number } | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return { address: hostname, family: 4 }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return { address: hostname.slice(1, -1), family: 6 }
  }
  if (hostname.includes(':')) return { address: hostname, family: 6 }
  return null
}

/**
 * Minimal `fetch`-shaped wrapper over `node:http(s)`, carrying the guard.
 *
 * Returns a real `Response` so `safeFetch`'s streaming read, redirect handling
 * and header checks work against it unchanged. 3xx bodies are dropped — the
 * caller reads only `location` from them, and several redirect statuses forbid a
 * body on the `Response` constructor anyway.
 */
export const pinnedFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.toString())

  // THE SOCKET GUARD'S BLIND SPOT, closed here because this is exported and must
  // hold on its own. Node does not resolve a host that is already an IP literal,
  // so `http://127.0.0.1/` and `http://169.254.169.254/` never reach `lookup` at
  // all and would connect straight through. In the `safeFetch` path
  // `assertPublicUrl` rejects these first; a direct caller has no such upstream.
  const literal = ipLiteral(url.hostname)
  if (literal && isPrivateAddress(literal.address, literal.family)) {
    throw new Error('refusing to connect: private address')
  }

  const send = url.protocol === 'https:' ? httpsRequest : httpRequest

  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value
  })

  const options: RequestOptions = {
    method: init?.method ?? 'GET',
    headers,
    lookup: guardedLookup,
  }

  return new Promise<Response>((resolve, reject) => {
    const req = send(url, options, (res) => {
      const status = res.statusCode ?? 0
      const out = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue
        out.set(key, Array.isArray(value) ? value.join(', ') : value)
      }

      // A redirect's body is never read, and 204/304 forbid one outright.
      const bodyless = status >= 300 && status < 400
      if (bodyless) {
        res.resume()
        resolve(new Response(null, { status, headers: out }))
        return
      }

      resolve(
        new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers: out }),
      )
    })

    req.on('error', reject)

    const signal = init?.signal
    if (signal) {
      if (signal.aborted) req.destroy(new Error('aborted'))
      else signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true })
    }

    req.end()
  })
}
