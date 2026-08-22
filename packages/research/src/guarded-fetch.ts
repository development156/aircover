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
}

const DEFAULT_MAX_REDIRECTS = 5

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

  return async (input, init) => {
    let current = typeof input === 'string' ? input : input.toString()

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = await assertPublicUrl(current, options)
      const res = await transport(url.toString(), { ...init, redirect: 'manual' })

      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (location === null) {
        // A 3xx with no Location is not a redirect, it is the answer.
        Object.defineProperty(res, 'url', { value: url.toString(), configurable: true })
        return res
      }
      current = new URL(location, url).toString()
    }

    throw new UnsafeUrlError('too many redirects')
  }
}

/** The guarded transport, with its defaults. */
export const guardedFetch: typeof fetch = createGuardedFetch()
