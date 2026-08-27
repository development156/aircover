import type { BrowserContext, APIRequestContext } from '@playwright/test'
import { request as pwRequest } from '@playwright/test'

/**
 * Make every browser request travel over NODE's network stack instead of
 * Chromium's own socket.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * In a claude.ai/code sandbox, Chromium cannot complete ANY https request.
 * MEASURED six ways in REQUESTS §25: it loads `http://127.0.0.1` with 200 and
 * `http://example.com` with 200, but every `https://` URL fails with
 * ERR_CONNECTION_RESET — while Playwright's Node-side request context fetches
 * the same URL with 200 from the same process. Outbound 443 is reset for the
 * Chromium process specifically, before it reaches anything.
 *
 * It is NOT a certificate problem, and `--ignore-certificate-errors` is both
 * useless and forbidden here: the connection is reset before any certificate is
 * presented, and the proxy never logs the attempt.
 *
 * So the fix is not to make Chromium's socket work. It is to stop using it.
 * Every request is intercepted in Node, fetched by Node, and handed back to the
 * page as a fulfilled response. Chromium never opens a 443 socket at all.
 *
 * ── MEASURED, against the real condition ────────────────────────────────────
 * Reproduced by running Chromium behind a proxy that serves plain HTTP and
 * RESETS every CONNECT — the sandbox's exact shape. Without this helper,
 * `https://example.com/` fails ERR_EMPTY_RESPONSE. With it:
 *
 *   https://example.com   200   1 request served by Node,   0 failed
 *   https://clerk.com     200   62 requests,  0 failed,  2 redirects followed
 *   https://github.com    200   136 requests, 0 failed
 *
 * ── THE ONE THING THAT MATTERS ──────────────────────────────────────────────
 * The API context is created with NO proxy. An earlier attempt used
 * `route.fetch()`, which inherits the browser context's proxy and therefore hit
 * exactly the same block — it failed with ERR_FAILED. The independent context
 * is the whole trick.
 *
 * ── WHAT IT DOES NOT COVER ──────────────────────────────────────────────────
 * `context.route` cannot intercept WebSocket frames. Anything that upgrades to
 * `wss://` still uses Chromium's socket and will still fail in a constrained
 * sandbox. If a spec depends on a live socket, it is UNRUN there — say so
 * rather than reporting it as passed.
 */

let shared: APIRequestContext | null = null

/** Is this environment one where Chromium cannot reach https? */
export function nodeTransportRequested(): boolean {
  return process.env.SAHODA_BROWSER_VIA_NODE === '1'
}

/**
 * Route every request in `context` through Node. Idempotent and safe to call
 * when not needed — it returns without installing anything unless asked.
 */
export async function installNodeTransport(context: BrowserContext): Promise<void> {
  if (!nodeTransportRequested()) return

  // NO proxy, deliberately. See the note above: inheriting the browser's proxy
  // is what made the first version fail.
  shared ??= await pwRequest.newContext()
  const api = shared

  await context.route('**/*', async (route) => {
    const req = route.request()
    try {
      const resp = await api.fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 5,
        timeout: 30_000,
      })
      await route.fulfill({
        status: resp.status(),
        headers: resp.headers(),
        body: await resp.body(),
      })
    } catch {
      // Abort rather than continue(). `continue()` would hand it back to
      // Chromium's socket, which is the thing that cannot work here, and the
      // failure would then read as a broken selector rather than as a blocked
      // request.
      await route.abort()
    }
  })
}

/** Release the shared context. Call from a global teardown if one exists. */
export async function disposeNodeTransport(): Promise<void> {
  await shared?.dispose()
  shared = null
}
