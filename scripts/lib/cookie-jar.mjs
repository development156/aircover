/**
 * A cookie jar of exactly one, and the redirect chain that needs it.
 *
 * ## Why this exists — the probe was reporting a healthy site as dead
 *
 * MEASURED 2026-08-19: `scripts/probe-production.mjs` reported **0/6 routes
 * behave** against production, with `fetch failed` on every one. Production was
 * fine. Opened in a real browser at the same minute, `https://app.sahodalabs.com/`
 * redirects to `/sign-in` and renders "Sign in · Sahoda".
 *
 * The underlying error is `redirect count exceeded`. Clerk is running a
 * DEVELOPMENT instance in production, and a dev instance answers the first
 * document request with a handshake at
 * `…clerk.accounts.dev/v1/client/handshake?…__clerk_hs_reason=dev-browser-missing`.
 * That handshake sets its dev-browser cookie with `Set-Cookie` and redirects
 * back. `fetch` has NO cookie jar, so the cookie is dropped, the app sees the
 * browser as missing again, and it hands out another handshake — forever, until
 * Node gives up at twenty hops.
 *
 * The probe's own header claimed this could not happen: "Clerk's handshake sets
 * its dev-browser cookie via the redirect URL itself, so the chain still
 * resolves." That was an assumption, it was never true of a dev instance, and it
 * cost the probe its entire usefulness — a post-deploy check that fails on a
 * healthy deployment is worse than no check, because the first thing anyone does
 * with a boy who cries wolf is stop listening.
 *
 * ## What this is NOT
 *
 * Not an RFC 6265 implementation. There is no domain matching, no path matching,
 * no `Secure`/`SameSite` enforcement, no expiry. It keeps one jar for one probe
 * run against one host and sends everything back. That is correct for its single
 * purpose and would be wrong for anything else, so it lives beside the probe and
 * is not exported as a general utility.
 */

const MAX_HOPS = 12

/** `name=value; Path=/; HttpOnly` → `['name', 'value']`. Attributes discarded. */
function parseSetCookie(header) {
  const pair = header.split(';', 1)[0] ?? ''
  const eq = pair.indexOf('=')
  if (eq <= 0) return null
  return [pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()]
}

/**
 * Every `Set-Cookie` on a response, across the several shapes Node exposes them
 * in. `headers.get('set-cookie')` JOINS multiple cookies with ", " — and an
 * `Expires=Wed, 01 Jan` attribute contains its own comma, so splitting that
 * string is how a jar quietly loses cookies. `getSetCookie()` returns them as a
 * proper array and is the only reading that is safe.
 */
function setCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie()
  }
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

/**
 * Follow the redirect chain by hand, carrying cookies, and return the final
 * response plus the trail.
 *
 * Manual redirects rather than `redirect: 'follow'` for the whole reason above:
 * only by seeing each hop can the jar be updated between them.
 *
 * The trail is returned, not just the endpoint, because a chain that ends
 * correctly after eleven handshakes is a different fact from one that ends
 * correctly after one — and the second is the one that means "production is not
 * running dev keys any more".
 */
export async function fetchFollowingCookies(url, { headers = {}, signal } = {}) {
  const jar = new Map()
  const trail = []
  let current = url

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const response = await fetch(current, {
      headers: cookieHeader ? { ...headers, cookie: cookieHeader } : headers,
      redirect: 'manual',
      signal,
    })

    for (const raw of setCookies(response)) {
      const parsed = parseSetCookie(raw)
      // A deletion (`name=`) is honoured as a deletion. Keeping an emptied
      // cookie would send `name=` back forever and is how a jar out-stubborns
      // the server that is trying to reset it.
      if (parsed === null) continue
      if (parsed[1] === '') jar.delete(parsed[0])
      else jar.set(parsed[0], parsed[1])
    }

    trail.push({ url: current, status: response.status })

    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, trail, hops: trail.length }
    }
    current = new URL(location, current).toString()
  }

  // Reported as a real outcome, never as success. A chain that will not settle
  // is exactly what the dev-key handshake looks like, and it must stay visible.
  throw Object.assign(new Error(`redirect chain did not settle in ${MAX_HOPS} hops`), { trail })
}
