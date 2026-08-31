import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

/**
 * Every route that EXISTS, adjudicated against both matchers — read off the disk.
 *
 * ── WHY THIS EXISTS, GIVEN middleware.test.ts ALREADY EXISTS ─────────────────
 * `middleware.test.ts` is a superb guard over the paths somebody remembered to
 * type into it. It holds four hand-written arrays — PUBLIC_PATTERNS,
 * CLERK_BYPASS_PATHS, CLERK_MATCHED_PATHS, ADMIN_PATTERNS — and asserts the
 * source agrees with them. That structurally cannot catch a route that is in
 * NONE of them, because there is nothing to compare.
 *
 * MEASURED on this tree, 2026-08-23: `/api/webhooks/zernio` was exactly that
 * route. It is on `isPublicRoute` (so `auth.protect()` never runs on it) and it
 * is matched by BOTH `config.matcher` patterns (so clerkMiddleware DOES run on
 * it) — and it appears in neither CLERK_BYPASS_PATHS nor CLERK_MATCHED_PATHS,
 * so the existing guard adjudicated it in no direction and stayed green. That is
 * the same class of half-done edit as the Loop cron redirect, one layer over:
 * added to one list, never to the other, and nothing red.
 *
 * So this guard does not take a list of paths. It walks `src/app`, derives the
 * URL of every route handler and page, and requires each one to be CLASSIFIED.
 * A new route file fails this test until somebody decides which bucket it is in.
 *
 * ── THE FOUR BUCKETS, AND WHY ONLY ONE OF THEM IS FATAL ──────────────────────
 * `isPublicRoute` decides what clerkMiddleware DOES; `config.matcher` decides
 * whether it RUNS. The two are independent, so every route is one of four:
 *
 *   public + excluded   the self-authenticating rail. Clerk never sees it, and
 *                       the route checks its own credential in its first
 *                       statement. Four crons, two webhooks.
 *   public + matched    reachable by anyone, and Clerk still parses the request.
 *                       Correct for anything that RENDERS — see CSP below — and
 *                       an unforced 500 surface for anything that returns JSON.
 *   protected + matched the ordinary case. `auth.protect()` runs. Most of the app.
 *   protected + EXCLUDED  FATAL. clerkMiddleware never runs, so `auth.protect()`
 *                       never runs either, and nobody declared the route public
 *                       so nobody reviewed it as public. It is simply open, and
 *                       it looks protected in every list in the repo.
 *
 * The fourth bucket has never occurred. It is asserted anyway because it is the
 * one that cannot be noticed by reading either file on its own.
 *
 * ── WHY A PAGE MUST STAY MATCHED EVEN WHEN IT IS PUBLIC ──────────────────────
 * The middleware sets `Content-Security-Policy` on the response it returns. A
 * route excluded from `config.matcher` never reaches that line, so it is served
 * with NO CSP header at all. For a JSON webhook receiver that costs nothing; for
 * /sign-in or /embed/lead — HTML this application serves to a browser, one of
 * them inside a frame it does not own — it removes the header those pages most
 * need. That, and not preference, is why the bypass list is JSON endpoints only.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * · It reads middleware.ts as TEXT. A matcher assembled at runtime, or patterns
 *   moved into a shared const, would parse as zero patterns — which is why the
 *   parse asserts it found some, but a PARTIAL parse would still be believed.
 * · It does not run Next's own matcher compilation. `middleware.test.ts` says
 *   the same of itself; the live probe in `scripts/` is what closes that.
 * · It says nothing about whether a route's OWN credential check is correct —
 *   only that the route was classified. `lib/cron/wiring.test.ts` asserts the
 *   cron secret is the first statement; nothing equivalent exists for webhooks.
 * · Route groups and dynamic segments are resolved syntactically. A route
 *   reachable only through a rewrite in next.config would be missed entirely.
 */
const APP = resolve(import.meta.dirname, 'app')
const source = readFileSync(resolve(import.meta.dirname, 'middleware.ts'), 'utf8')

/** Strip `// …` before reading quoted strings — a comment quoting an example is not a pattern. */
const stripComments = (block: string): string =>
  block
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

function block(open: string, close: string): string {
  const start = source.indexOf(open)
  if (start === -1) throw new Error(`middleware.ts has no ${open}`)
  return stripComments(source.slice(start, source.indexOf(close, start)))
}

/** The live `isPublicRoute` patterns, read from the source they are declared in. */
const PUBLIC_PATTERNS = [...block('createRouteMatcher([', '])').matchAll(/'([^']*)'/g)]
  .map((m) => m[1])
  .filter((p): p is string => p !== undefined && p.startsWith('/'))

/** The live `config.matcher` patterns, un-escaped to what the running matcher sees. */
const MATCHER_PATTERNS = [...block('matcher: [', '],').matchAll(/'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => m[1])
  .filter((p): p is string => p !== undefined)
  .map((p) => p.replace(/\\\\/g, '\\'))

const isPublicRoute = createRouteMatcher(PUBLIC_PATTERNS)
const isMatched = (path: string): boolean =>
  MATCHER_PATTERNS.some((p) => new RegExp(`^${p}$`).test(path))
const req = (path: string): NextRequest => new NextRequest(new URL(path, 'https://app.sahoda.com'))

/**
 * Derive the URL a file serves. Route groups `(app)` never appear in a URL;
 * parallel slots `@modal` do not either. A dynamic segment is filled with a
 * literal so the matchers have something concrete to answer about — the matcher
 * regexes are path-shaped and cannot be asked about `[id]`.
 */
function urlOf(relativeDir: string): string | null {
  const parts: string[] = []
  for (const segment of relativeDir.split('/').filter(Boolean)) {
    if (/^\(.*\)$/.test(segment)) continue
    if (segment.startsWith('@')) return null
    if (/^\[\[?\.\.\./.test(segment)) parts.push('catchall')
    else if (/^\[.*\]$/.test(segment)) parts.push('sample-id')
    else parts.push(segment)
  }
  return `/${parts.join('/')}`.replace(/\/$/, '') || '/'
}

interface Route {
  url: string
  kind: 'api' | 'page'
  file: string
}

function walk(dir: string, rel = ''): Route[] {
  const out: Route[] = []
  for (const entry of readdirSync(dir).sort()) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, `${rel}/${entry}`))
      continue
    }
    const url = urlOf(rel)
    if (url === null) continue
    if (entry === 'route.ts' || entry === 'route.tsx') out.push({ url, kind: 'api', file: full })
    if (entry === 'page.tsx') out.push({ url, kind: 'page', file: full })
  }
  return out
}

const ROUTES = walk(APP)

type Bucket = 'public+excluded' | 'public+matched' | 'protected+matched' | 'protected+excluded'
const bucketOf = (url: string): Bucket =>
  `${isPublicRoute(req(url)) ? 'public' : 'protected'}+${isMatched(url) ? 'matched' : 'excluded'}` as Bucket

/**
 * The self-authenticating rail: Clerk never runs, the route checks its own
 * credential first. Every entry here is a JSON endpoint — see the CSP note above
 * for why nothing that renders may join it.
 */
const EXPECTED_PUBLIC_EXCLUDED = new Set([
  '/api/cron/sweeps',
  '/api/cron/metrics',
  '/api/cron/loop',
  '/api/cron/playbooks',
  // Added 2026-08-25 with the weekly Radar scan. It is the FIFTH cron and the
  // first one that spends money on a provider, so a missing exemption here would
  // not merely report a green heartbeat over a 307 — it would report a green
  // heartbeat over a scan that never collected anything, for weeks, while the
  // pages it was meant to be watching changed and were never read again.
  '/api/cron/radar',
  // Added 2026-08-25 with the Marketing Brain's weekly pass. On the rail for the
  // same reason as its four siblings: Vercel cron presents CRON_SECRET as an
  // Authorization header and does not follow redirects, so without the exemption
  // every tick is a 307 to /sign-in that the heartbeat records as a run.
  '/api/cron/brain',
  // Added 2026-08-30 with the autopilot tick. On the rail for the same reason
  // as its five siblings, and this guard is one of the three that caught the
  // schedule arriving without its exemption — the shape where the heartbeat
  // reports green while every tick is a 307 and a customer who armed a channel
  // watches nothing happen.
  '/api/cron/autopilot',
  '/api/webhooks/cashfree',
  '/api/webhooks/clerk',
  // Added 2026-08-23. It arrived on `isPublicRoute` with the wt-webhooks merge and
  // was never added here, so Clerk kept parsing the `Authorization` header of an
  // endpoint that has no use for one — the malformed-bearer crash surface, on a
  // route the whole internet can reach. Identical in shape to /api/webhooks/cashfree
  // beside it: no Clerk import, an HMAC over the raw body as its first act, and a
  // JSON envelope for a reply, so it loses nothing by Clerk not running.
  '/api/webhooks/zernio',
])

/**
 * Public, and Clerk still runs. Every entry needs a REASON, because the default
 * answer for a public JSON endpoint is the bypass list above.
 */
const EXPECTED_PUBLIC_MATCHED = new Map<string, string>([
  ['/sign-in/catchall', 'renders Clerk components and needs the CSP header'],
  ['/sign-up/catchall', 'renders Clerk components and needs the CSP header'],
  ['/embed/beta', 'HTML served into a frame this app does not own — CSP is the point'],
  ['/embed/lead', 'HTML served into a frame this app does not own — CSP is the point'],
  ['/design-system', 'a rendered page; reads no tenant row, but still needs the CSP header'],
  [
    '/api/public/beta-apply',
    'JSON, and it could join the bypass list; kept matched because CLERK_MATCHED_PATHS pins it and moving it is a security decision for the audit lane, not a repair',
  ],
  [
    '/api/public/site-lead',
    'JSON; same as beta-apply — a candidate for the bypass list, deliberately not moved here',
  ],
  [
    '/api/admin/devops/ingest',
    'JSON; matched deliberately — the admin branch must be evaluated after public, and CLERK_MATCHED_PATHS pins that ordering',
  ],
])

describe('middleware covers every route that exists on disk', () => {
  it('parsed both matchers out of middleware.ts', () => {
    // A silent parse failure would make every assertion below vacuously green —
    // the exact shape this file exists to refuse.
    expect(PUBLIC_PATTERNS.length, 'no isPublicRoute patterns parsed').toBeGreaterThan(5)
    expect(MATCHER_PATTERNS.length, 'no config.matcher patterns parsed').toBe(2)
    expect(ROUTES.length, 'no routes walked out of src/app').toBeGreaterThan(50)
  })

  it('has no route that Clerk skips and nobody declared public', () => {
    // THE FATAL BUCKET. clerkMiddleware never runs, so auth.protect() never runs,
    // and the route is not on the public list so nobody reviewed it as reachable.
    // It reads as protected in every hand-written list in this repo.
    const open = ROUTES.filter((r) => bucketOf(r.url) === 'protected+excluded')
    expect(open.map((r) => `${r.url} (${r.file})`)).toEqual([])
  })

  it('exempts from Clerk exactly the routes on the self-authenticating rail', () => {
    const actual = ROUTES.filter((r) => bucketOf(r.url) === 'public+excluded').map((r) => r.url)
    expect(new Set(actual)).toEqual(EXPECTED_PUBLIC_EXCLUDED)
  })

  it('states a reason for every public route Clerk still runs on', () => {
    const actual = ROUTES.filter((r) => bucketOf(r.url) === 'public+matched').map((r) => r.url)
    expect(new Set(actual)).toEqual(new Set(EXPECTED_PUBLIC_MATCHED.keys()))
    for (const reason of EXPECTED_PUBLIC_MATCHED.values()) {
      expect(reason.length, 'a bucket entry with no reason is an unmade decision').toBeGreaterThan(
        20,
      )
    }
  })

  it('leaves every other route protected AND matched', () => {
    const classified = new Set([...EXPECTED_PUBLIC_EXCLUDED, ...EXPECTED_PUBLIC_MATCHED.keys()])
    for (const route of ROUTES) {
      if (classified.has(route.url)) continue
      expect(bucketOf(route.url), `${route.url} is not protected+matched`).toBe('protected+matched')
    }
  })

  it('never lets a rendered page leave the matcher, because it would lose its CSP header', () => {
    // Stated as a property of the KIND, not of a path list: a page added to the
    // bypass list tomorrow fails here without anyone having to remember this note.
    for (const route of ROUTES.filter((r) => r.kind === 'page')) {
      expect(isMatched(route.url), `${route.url} is a page and must keep its CSP header`).toBe(true)
    }
  })
})
