/**
 * The surfaces that render WITHOUT Clerk, and the header that tells the root
 * layout so.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * MEASURED 2026-09-02 against the production build: `/embed/lead` transferred
 * 564,661 bytes, of which 241,200 bytes in 8 requests were Clerk's browser SDK
 * and its UI chunks, plus a telemetry POST, on a public contact form with no
 * user. Inside a third-party iframe the document itself went 307 → Clerk
 * handshake → 307 → 307 → 200 before a four-field form appeared.
 *
 * Two things cause that and this module names both. `clerkMiddleware` ran on
 * these paths (they are public, but public only decides what it DOES, not
 * whether it RUNS), and `ClerkProvider` wraps the root layout, so every page
 * ships the SDK. `middleware.ts` answers these paths before Clerk runs and
 * stamps the request with `SURFACE_HEADER`; `app/layout.tsx` reads it and
 * renders the same shell without the provider.
 *
 * The middleware DELETES this header from every other request before it is
 * forwarded, so the layout only ever sees a value the middleware set. A visitor
 * cannot type it into a request to `/sign-in` and strip the provider from a
 * page that needs it.
 *
 * Pure, no imports: the middleware imports it on the edge, the layout on the
 * server, and a test in either project can call it without a runtime.
 */

/** Set by the middleware on the request, read by the root layout. */
export const SURFACE_HEADER = 'x-sahoda-surface'

/** The one value the header carries today. */
export const EMBED_SURFACE = 'embed'

/**
 * `/embed/*` is HTML framed into pages this application does not own, with no
 * user to be. `/design-system` renders tokens and primitives and reads no
 * session. Neither has a Clerk component anywhere beneath it.
 *
 * Exact on `/design-system` for the same reason `isPublicRoute` is: a sibling
 * added tomorrow must be classified on purpose, not inherit this.
 */
export function isClerkFreeSurface(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith('/embed/') || pathname === '/design-system'
}
