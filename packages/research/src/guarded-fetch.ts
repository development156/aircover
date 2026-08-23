import { assertPublicUrl, UnsafeUrlError, type SafeUrlOptions } from './safe-fetch'
import { pinnedFetch } from './pinned-fetch'

/**
 * A `fetch` THAT CANNOT BE AIMED AT OUR OWN NETWORK, shaped so an existing
 * caller can take it as a drop-in transport.
 *
 * ── THE HOLE THIS WAS WRITTEN FOR ────────────────────────────────────────────
 * Radar's nightly pass fetched competitor pages with `globalThis.fetch` — the
 * raw global, no guard of any kind — and `cheap-check.ts` asked it for
 * `redirect: 'follow'`, so undici resolved every hop where nothing could see it.
 * Any signed-in account could add `http://169.254.169.254/latest/meta-data/` as a
 * competitor and have the deployment read its own cloud credentials into a
 * snapshot row, on a schedule, forever. No encoding trick was required; the
 * plain dotted quad worked.
 *
 * `safeFetch` beside this file already solves the problem, but it is a PAGE
 * READER: it owns the byte cap, the content-type rule and its own fixed headers,
 * and returns text rather than a response. The cheap check cannot use it — the
 * conditional GET is the entire economics of that job, and `if-none-match` has
 * nowhere to go. So the guard is offered here at the transport layer instead,
 * where a caller keeps its own headers, its own 304 handling and its own reading
 * of the body.
 *
 * ── WHY THE REDIRECT LOOP IS HERE AND NOT IN THE CALLER ──────────────────────
 * A store-time check on the URL is not a control. A Radar source is typed once
 * and fetched nightly for months, and DNS is mutable in between: the record that
 * answered a public address in March can answer 169.254.169.254 in April without
 * the stored row changing a character. The only place the decision can be made
 * honestly is at the socket, on the night. `redirect: 'manual'` plus
 * re-validation per hop is what makes that true for hop two as well as hop one —
 * `redirect: 'follow'` hands hop two to undici, where no guard of ours runs.
 */

export interface GuardedFetchOptions extends SafeUrlOptions {
  maxRedirects?: number
  /** Swapped in tests. Defaults to the DNS-pinned transport. */
  transport?: typeof fetch
  /** Hard ceiling on the bytes a caller can be handed. */
  maxBytes?: number
}

const DEFAULT_MAX_REDIRECTS = 5

/**
 * The same 2 MB `safeFetch` uses. Far more than any page this reads needs, and
 * the point is the ceiling rather than the number.
 */
export const DEFAULT_MAX_BYTES = 2_000_000

/**
 * Truncate the body at `maxBytes`, so `res.text()` cannot be a memory kill.
 *
 * ── THE HALF-CLOSED DOOR THIS FIXES ─────────────────────────────────────────
 * `safeFetch` has a byte cap and enforces it against the bytes that ARRIVE,
 * because a Content-Length header is a claim. The transport under it has none —
 * it streams — and `cheapCheck`, the caller this file was written for, does a
 * bare `await res.text()` on an address a customer chose and then normalises the
 * whole string. So closing SSRF on that path would have left the same door open
 * to a page that simply never stops sending.
 *
 * The cap lives HERE rather than in the caller for the reason the guard does: a
 * caller that says nothing gets it, and every future caller inherits it without
 * having to know.
 */
function capped(res: Response, maxBytes: number): Response {
  const body = res.body
  if (!body) return res

  let total = 0
  const reader = body.getReader()
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) return controller.close()
      if (!value) return
      total += value.byteLength
      if (total >= maxBytes) {
        controller.enqueue(value.subarray(0, value.byteLength - (total - maxBytes)))
        await reader.cancel().catch(() => {})
        controller.close()
        return
      }
      controller.enqueue(value)
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {})
    },
  })

  const headers = new Headers(res.headers)
  // `content-length` described the body the server meant to send, which is no
  // longer the body the caller reads.
  headers.delete('content-length')
  return new Response(limited, { status: res.status, statusText: res.statusText, headers })
}

/**
 * Build a `fetch`-shaped function whose every hop is validated.
 *
 * The returned `Response` carries the FINAL url — `new Response()` leaves `url`
 * empty, and callers that record where the bytes came from would otherwise
 * silently record the first hop instead. Defined on the instance rather than
 * faked with a header, so `res.url` means what it has always meant.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): typeof fetch {
  const transport = options.transport ?? pinnedFetch
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  return async (input, init) => {
    let current = typeof input === 'string' ? input : input.toString()

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = await assertPublicUrl(current, options)
      const res = await transport(url.toString(), { ...init, redirect: 'manual' })

      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (location === null) {
        // A 3xx with no Location is not a redirect, it is the answer.
        const out = capped(res, maxBytes)
        Object.defineProperty(out, 'url', { value: url.toString(), configurable: true })
        return out
      }
      current = new URL(location, url).toString()
    }

    throw new UnsafeUrlError('too many redirects')
  }
}

/** The guarded transport, with its defaults. */
export const guardedFetch: typeof fetch = createGuardedFetch()
