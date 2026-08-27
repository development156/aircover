import type { BrowserContext } from '@playwright/test'

/**
 * Make every OUTBOUND browser request travel over NODE's network stack instead
 * of Chromium's own socket.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * In a claude.ai/code sandbox, Chromium cannot complete ANY https request.
 * MEASURED six ways in REQUESTS §25: it loads `http://127.0.0.1` with 200 and
 * `http://example.com` with 200, but every `https://` URL fails with
 * ERR_CONNECTION_RESET — while Node fetches the same URL with 200 from the same
 * process. Outbound 443 is reset for the Chromium process specifically.
 *
 * It is NOT a certificate problem, and `--ignore-certificate-errors` is both
 * useless and forbidden here: the connection is reset before any certificate is
 * presented, and the proxy never logs the attempt.
 *
 * So the fix is not to make Chromium's socket work. It is to stop using it.
 *
 * ── THE TWO THINGS THAT MATTER, BOTH LEARNED THE HARD WAY ───────────────────
 *
 * 1 · LOOPBACK MUST NOT BE INTERCEPTED.
 *    Chromium reaches `http://127.0.0.1` fine even in the sandbox. Routing the
 *    app's own requests through Node gains nothing and cost a real failure: the
 *    Clerk ticket redirect to `http://127.0.0.1:PORT/sign-in?__clerk_ticket=…`
 *    was intercepted, the refetch did not reproduce it, and the abort surfaced
 *    as `net::ERR_FAILED` on a LOCALHOST url — which reads like a dead server,
 *    not like an over-eager router.
 *
 * 2 · IT MUST USE NODE'S OWN fetch, NEVER Playwright's APIRequestContext.
 *    `request.newContext()` looks independent and is not. Inside the test
 *    runner Playwright applies the config's `use.proxy` to it, so in any
 *    environment whose block IS a proxy the "escape hatch" walks straight back
 *    into the thing it was escaping. MEASURED: 16 aborts, every one
 *    `apiRequestContext.fetch: Proxy connection ended before receiving CONNECT
 *    response`, while Node's global fetch returned 200 for the same URL in the
 *    same process. An explicit `proxy: { server: 'direct://' }` override does
 *    not rescue it — that fails outright.
 *
 * 3 · IT MUST BE RE-INSTALLED AFTER `setupClerkTestingToken`.
 *    `@clerk/testing` registers its OWN context route over
 *    `^https://<fapi>/v1/.*` and services it with `route.fetch()` — the same
 *    call that inherits the browser's blocked network. MEASURED: Playwright
 *    runs the LAST-registered matching handler and Clerk's does not call
 *    `fallback()`, so once `signIn()` runs, every FAPI request bypasses this
 *    transport entirely. The symptom is narrow and misleading: clerk.browser.js
 *    loads 200 (a CDN url this transport still owns) while POST /v1/dev_browser
 *    fails five times, so the page paints and <SignIn> never mounts.
 *
 *    So this transport also carries `__clerk_testing_token` itself, and
 *    `signIn()` re-installs it after Clerk's setup to win the ordering back.
 *
 * 4 · SET-COOKIE MUST BE APPLIED TO THE CONTEXT BY HAND.
 *    `route.fulfill` takes a FLAT `Record<string, string>`, so a response
 *    carrying several Set-Cookie headers cannot survive it — and the loss is
 *    silent. MEASURED: Clerk's FAPI returned setCookie counts of 3, 3, 2 and 1,
 *    `POST /v1/client/sign_ins` came back `"status":"complete"`, and the trace
 *    showed ZERO Set-Cookie reaching the browser. The sign-in genuinely
 *    succeeded and the session cookie was dropped on the floor, so the app went
 *    on rendering a signed-out visitor and `waitForURL` waited out its full 30s
 *    against a page that was, as far as it could tell, simply never going to
 *    navigate.
 *
 *    So cookies are parsed off the Node response and pushed into the browser
 *    context with `addCookies`, and Set-Cookie is dropped from the fulfilled
 *    headers rather than passed through merged and malformed.
 *
 * 5 · NODE MUST FOLLOW REDIRECTS. Handing a 3xx back to Chromium is FATAL.
 *    `redirect: 'manual'` looks more faithful — let the browser follow its own
 *    redirects, so each hop's cookies arrive in order. It does not work, and it
 *    fails in a way that frames the transport as innocent.
 *
 *    MEASURED, in the same trace: `clerk-js@6/…` came back 307, Chromium
 *    followed it to `clerk-js@6.30.1/…`, and THAT request failed (-1) while
 *    this handler logged ZERO aborts. Playwright follows a fulfilled redirect
 *    on the BROWSER's own socket without re-entering the route, so the hop
 *    lands on exactly the network that does not work. With `follow`, the same
 *    trace is 40 requests, 40 × 200.
 *
 *    The cost is real and is accepted: `getSetCookie()` describes only the
 *    FINAL response, so a cookie set on an intermediate hop is lost. Nothing in
 *    this suite has needed one. If a flow ever depends on one, the fix is to
 *    follow the chain manually in Node — NOT to hand the 3xx back.
 *
 * ── WHAT IT DOES NOT COVER ──────────────────────────────────────────────────
 * `context.route` cannot intercept WebSocket frames. Anything that upgrades to
 * `wss://` still uses Chromium's socket and will still fail in a constrained
 * sandbox. If a spec depends on a live socket, it is UNRUN there — say so
 * rather than reporting it as passed.
 */

/** Headers that describe a connection, not a payload. Never forwarded. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authorization', 'te', 'trailer', 'upgrade']

/**
 * Headers that describe the ENCODED framing of a body Node has already decoded.
 * `fetch` transparently decompresses, but its header list still advertises the
 * compression and the compressed length. Passing both through is a lie the
 * browser would act on.
 */
const STALE_FRAMING = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'content-range',
  // Handled out of band by applySetCookies — see note 4. Passing it through
  // would deliver several cookies merged into one malformed value.
  'set-cookie',
]

/**
 * Turn one raw Set-Cookie line into a Playwright cookie.
 *
 * Returns null for anything unparseable rather than throwing: one odd cookie
 * must not take down every request on the page.
 */
function parseSetCookie(
  raw: string,
  requestUrl: string,
): Parameters<BrowserContext['addCookies']>[0][number] | null {
  const [pair = '', ...attrs] = raw.split(';')
  const eq = pair.indexOf('=')
  if (eq < 1) return null

  const cookie: Record<string, unknown> = {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim(),
  }

  let domain: string | undefined
  let path: string | undefined

  for (const attr of attrs) {
    const i = attr.indexOf('=')
    const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase()
    const val = i < 0 ? '' : attr.slice(i + 1).trim()
    if (key === 'domain') domain = val.replace(/^\./, '')
    else if (key === 'path') path = val
    else if (key === 'secure') cookie.secure = true
    else if (key === 'httponly') cookie.httpOnly = true
    else if (key === 'samesite') {
      const v = val.toLowerCase()
      cookie.sameSite = v === 'strict' ? 'Strict' : v === 'none' ? 'None' : 'Lax'
    } else if (key === 'max-age') {
      const n = Number(val)
      if (Number.isFinite(n)) cookie.expires = Math.floor(Date.now() / 1000) + n
    } else if (key === 'expires' && cookie.expires === undefined) {
      const t = Date.parse(val)
      if (!Number.isNaN(t)) cookie.expires = Math.floor(t / 1000)
    }
  }

  // addCookies wants EITHER url OR domain+path, never a half-specified pair.
  if (domain) {
    cookie.domain = domain
    cookie.path = path ?? '/'
  } else {
    cookie.url = new URL(requestUrl).origin
    if (path) {
      cookie.domain = new URL(requestUrl).hostname
      cookie.path = path
      delete cookie.url
    }
  }

  return cookie as Parameters<BrowserContext['addCookies']>[0][number]
}

/** Is this environment one where Chromium cannot reach https? */
export function nodeTransportRequested(): boolean {
  return process.env.SAHODA_BROWSER_VIA_NODE === '1'
}

function isLoopback(rawUrl: string): boolean {
  try {
    const h = new URL(rawUrl).hostname
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0'
  } catch {
    return false
  }
}

/**
 * Route every non-loopback request in `context` through Node. Idempotent and
 * safe to call when not needed — it installs nothing unless asked.
 */
export async function installNodeTransport(context: BrowserContext): Promise<void> {
  if (!nodeTransportRequested()) return

  await context.route('**/*', async (route) => {
    const req = route.request()

    // See note 1 above. Loopback goes straight to Chromium, untouched.
    if (isLoopback(req.url())) {
      await route.continue()
      return
    }

    try {
      // Clerk's bot protection needs `__clerk_testing_token` on every FAPI call.
      // Normally @clerk/testing's own route adds it; when this transport is on,
      // that route is shadowed (note 3), so this must add it instead. Both names
      // are @clerk/testing's public contract.
      let url = req.url()
      const fapi = process.env.CLERK_FAPI
      const token = process.env.CLERK_TESTING_TOKEN
      if (fapi && token && url.startsWith(`https://${fapi}/v1/`)) {
        const u = new URL(url)
        u.searchParams.set('__clerk_testing_token', token)
        url = u.toString()
      }

      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers())) {
        const key = k.toLowerCase()
        if (HOP_BY_HOP.includes(key) || key === 'host' || key === 'content-length') continue
        headers[key] = v
      }

      const method = req.method()
      // Uint8Array, not Buffer: `BodyInit` accepts an ArrayBufferView and the
      // DOM lib does not recognise Node's Buffer as one, though it is one.
      const post = method === 'GET' || method === 'HEAD' ? null : req.postDataBuffer()
      const body = post ? new Uint8Array(post) : undefined

      // Node's OWN fetch. See note 2 — this is the whole point of the helper.
      const resp = await fetch(url, {
        method,
        headers,
        body,
        // See note 5. Chromium follows redirects itself and re-enters this
        // handler, so every hop's cookies are applied in order.
        // See note 5. Node MUST follow; handing a 3xx back is fatal.
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      })

      const out: Record<string, string> = {}
      resp.headers.forEach((v, k) => {
        if (!STALE_FRAMING.includes(k.toLowerCase())) out[k] = v
      })

      const outBody = Buffer.from(await resp.arrayBuffer())
      // See note 4. Do this BEFORE fulfilling, so the cookie is in the jar by
      // the time the page reacts to the response.
      const setCookies = resp.headers.getSetCookie()
      if (setCookies.length > 0) {
        const parsed = setCookies
          .map((c) => parseSetCookie(c, url))
          .filter((c): c is NonNullable<typeof c> => c !== null)
        if (parsed.length > 0) {
          try {
            await context.addCookies(parsed)
          } catch (e) {
            console.error(`[node-transport] addCookies failed :: ${String(e).slice(0, 120)}`)
          }
        }
      }

      await route.fulfill({ status: resp.status, headers: out, body: outBody })
    } catch (err) {
      // Say WHY. A silently aborted request surfaces 30 seconds later as a
      // timeout on an unrelated assertion, which is how this helper's first two
      // defects hid for a full day.
      console.error(
        `[node-transport] ABORT ${req.method()} ${req.url().slice(0, 90)} :: ${String(err).slice(0, 140)}`,
      )
      await route.abort()
    }
  })
}

/** Kept for callers that used to dispose a shared context. Now a no-op. */
export async function disposeNodeTransport(): Promise<void> {}
