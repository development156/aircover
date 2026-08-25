import { describe, it, expect } from 'vitest'
import { createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

/**
 * The routing contract of `middleware.ts`, pinned.
 *
 * This file multiplexes three separate behaviours that arrived from two different branches
 * and were reconciled by hand during the 2026-07-28 trunk merge:
 *
 *   1. the cron route is PUBLIC        (wt-web — the Vercel sweep has no user session)
 *   2. the sign-in/embed routes are PUBLIC  (both branches)
 *   3. `/admin` is GATED, not redirected   (wt-admin — a 404, never a login upsell)
 *
 * Nothing on either branch tested any of it. A resolution that dropped `/api/cron/sweeps`
 * would leave the sweep redirecting to /sign-in — and because Vercel cron does not follow
 * redirects, it would report a green run every five minutes while doing nothing. A
 * resolution that dropped the admin matcher would expose the ops console. Both failures are
 * silent in every other test, in typecheck, and in a production build.
 *
 * The matchers are re-declared here rather than imported because importing the module
 * executes `clerkMiddleware(...)` at module scope, which needs a Clerk runtime. The pattern
 * arrays below are asserted against the real file's source text in the last test, so they
 * cannot drift from it without going red.
 */

const PUBLIC_PATTERNS = [
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/embed/beta',
  // The embeddable CONTACT form, added 2026-08-21 — door one into `leads`.
  // Public for the same reason /embed/beta is: it is framed into a third
  // party's page and there is no user to be. It reads no workspace and no
  // session; the slug in its query string is the public subdomain of a site,
  // and it is not a capability — `lead_submit` resolves the tenant from it
  // inside the database.
  '/embed/lead',
  // The design-system gallery. Added deliberately, and this pinned list is why
  // that had to be deliberate: it reads NO workspace, NO session and NO tenant
  // row — it renders `packages/shared/tokens.css` and the primitives, nothing
  // else. It is public so reviewers and every UI session can open the reference
  // without an account, and so its greyscale/contrast checks can run without a
  // Clerk fixture. If it ever grows a database read, it must leave this list.
  '/design-system',
  '/api/public/beta-apply',
  // The form's only endpoint. Verifies its own credential in its first three
  // steps — rate limit, zod plus honeypot, Turnstile — before the service-role
  // RPC, which takes a site SLUG and no workspace id.
  '/api/public/site-lead',
  '/api/admin/devops/ingest',
  '/api/webhooks/clerk',
  '/api/webhooks/cashfree',
  // Zernio's inbound events, added 2026-08-21. Public because Zernio POSTs with no
  // session; it authenticates itself with an HMAC-SHA256 over the raw body, checked
  // before anything reads the payload — `ingestZernioWebhook` accepts only a
  // `VerifiedZernioBody`, a branded type only the verifier can mint, so parsing
  // unsigned bytes is a compile error. A MISSING signature is a 401, not a skip.
  //
  // This entry is also what proved the comment strip below was needed: the
  // apostrophe in the first word of this comment was invisible to the parser as
  // written, and invented two routes out of prose.
  '/api/webhooks/zernio',
  '/api/cron/sweeps',
  '/api/cron/metrics',
  // The weekly Loop plan, added 2026-08-20. THREE separate guards refused this
  // change until it was made in all three places — cron/wiring.test.ts's exact-
  // path set, this list, and the matcher assertion below — which is the
  // redundancy working, not duplication: each catches a different half-done
  // edit, and a half-done edit here is a cron that redirects to /sign-in while
  // its heartbeat reports green.
  '/api/cron/loop',
  // The daily Playbook check, added 2026-08-22. FOUR guards refused it this
  // time — the three above plus `rls_tenant_isolation`, on an unrelated half of
  // the same lane — and every one of them was right. The sentence above is worth
  // re-reading with a fourth entry in hand: the redundancy is not duplication,
  // because a half-done edit HERE is a schedule that fires, gets a 307, and
  // reports green forever.
  '/api/cron/playbooks',
  // The fifth, 2026-08-25. Same shape, same reason, and the sentence above is
  // worth re-reading with a fifth entry in hand.
  '/api/cron/radar',
]

/**
 * STATIC MEDIA THE MATCHER MUST ALSO SKIP — a different category from the list
 * below, with a different invariant, which is why it is a different list.
 *
 * ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────
 * MEASURED 2026-08-24 against `next start`: `/sahodaboot-poster.jpg` answered
 * 200 to an unauthenticated request and `/sahodaboot.mp4` answered **404**. The
 * boot animation is 2.7 MB of brand asset and no extension on the matcher
 * covered video, so every play paid Clerk's request-state computation —
 * including the `Authorization`-header parse that the bypass block exists to
 * keep off static paths — while its own poster frame did not. It worked only
 * because the one person who fetches it has just signed in.
 *
 * ── WHY NOT ON `CLERK_BYPASS_PATHS` ─────────────────────────────────────────
 * That list carries three rules — exact `$`-anchored path, authenticates itself
 * in its first statement, returns JSON — and asserts every member is ALSO on
 * `isPublicRoute` so reverting the matcher cannot silently start redirecting it.
 * A file in `public/` satisfies none of them and needs none of them: there is
 * nothing to authenticate, nothing to return, and Next serves it from disk
 * whatever `isPublicRoute` says. Putting it there would have meant loosening a
 * rule that is doing its job.
 */
const STATIC_MEDIA_PATHS = [
  '/sahodaboot.mp4',
  // The sibling extension, so a WebM added later is covered on the day it lands
  // rather than on the day somebody notices.
  '/anything.webm',
]

/**
 * Paths `config.matcher` must NOT match, so clerkMiddleware never runs on them.
 *
 * Being on `isPublicRoute` is not the same thing: a "public" route still executes
 * clerkMiddleware, which still parses the request's `Authorization` header. `[LIVE
 * 2026-08-09]` a bearer token of `aaa.bbb.ccc` — three dot-separated parts that are not
 * base64url — makes Clerk throw where nothing catches it, and Vercel answers
 * **500 MIDDLEWARE_INVOCATION_FAILED** on EVERY matched path, public ones included.
 * Reproduced on /sign-in, /embed/beta, /api/public/beta-apply and the paths below.
 *
 * Every one of them authenticates itself — four CRON_SECRET compares, and an
 * HMAC/Svix signature — and gains nothing from Clerk, so the honest fix is for
 * Clerk not to see them at all.
 */
const CLERK_BYPASS_PATHS = [
  '/api/cron/sweeps',
  '/api/cron/metrics',
  // `/api/cron/loop` was ADDED HERE ON 2026-08-22, not with the Loop. The
  // matcher in middleware.ts has excluded it since 2026-08-20 — so the bypass
  // was real and this list, which is what pins it, did not mention it. Found
  // while adding the fourth cron beneath it. The header above says "all three
  // below" and "these four"; both counts were already wrong.
  '/api/cron/loop',
  '/api/cron/playbooks',
  '/api/cron/radar',
  '/api/webhooks/cashfree',
  '/api/webhooks/clerk',
  // Added 2026-08-23, by two lanes independently, and both reasons are kept
  // because they are different facts.
  //
  // WHY IT WAS MISSING (wt-repair): Zernio landed on `isPublicRoute` with the
  // wt-webhooks merge on 2026-08-21 and reached NEITHER this array nor
  // CLERK_MATCHED_PATHS, so this suite adjudicated it in no direction and stayed
  // green while Clerk kept parsing the `Authorization` header of a route the
  // whole internet can reach. Arrays of remembered paths cannot catch a path
  // nobody remembered, which is why `middleware.coverage.test.ts` now walks
  // src/app instead of holding a list.
  //
  // WHAT IT COST (wt-sec): it was the ONE self-authenticating webhook still
  // reaching Clerk. The live sweep that found it recorded ZERO 500s across 72
  // routes, so this closes a reachability gap rather than a live crash — the
  // difference between a route that cannot reach the failure and one that is
  // rescued from it by a try/catch.
  '/api/webhooks/zernio',
]

/** Paths that MUST keep reaching clerkMiddleware. A bypass that widens is a hole. */
const CLERK_MATCHED_PATHS = [
  '/api/posts/abc123/publish',
  '/api/admin/devops/ingest',
  '/api/oauth/zernio/start',
  '/api/oauth/zernio/return',
  '/api/public/beta-apply',
  '/api/debug/sentry',
  '/api/cron/other',
  '/api/webhooks/stripe',
  '/admin',
  '/admin/credits',
  '/home',
  '/wallet',
  '/sign-in',
  '/embed/beta',
  '/',
]
const ADMIN_PATTERNS = ['/admin(.*)', '/api/admin/(.*)']

const isPublicRoute = createRouteMatcher(PUBLIC_PATTERNS)
const isAdminRoute = createRouteMatcher(ADMIN_PATTERNS)

/**
 * Clerk's matcher reads `req.nextUrl.pathname`, so it needs a NextRequest — a plain
 * `Request` throws "Cannot read properties of undefined (reading 'pathname')".
 */
const req = (path: string) => new NextRequest(`https://sahodalabs.vercel.app${path}`)

describe('middleware routing contract', () => {
  describe('1 · the cron route is public', () => {
    it('treats /api/cron/sweeps as public so Vercel cron is never redirected', () => {
      expect(isPublicRoute(req('/api/cron/sweeps'))).toBe(true)
    })

    it('treats /api/cron/metrics as public for the same reason', () => {
      // The nightly metric pass. Redirected, it would report a green run every night
      // while collecting nothing — and a day of measurements cannot be collected later.
      expect(isPublicRoute(req('/api/cron/metrics'))).toBe(true)
    })

    it('does not expose anything else under /api/cron — the entries are exact, not a prefix', () => {
      expect(isPublicRoute(req('/api/cron/other'))).toBe(false)
      expect(isPublicRoute(req('/api/cron'))).toBe(false)
    })
  })

  describe('2 · public routes stay public', () => {
    it.each([
      '/sign-in',
      '/sign-in/factor-one',
      '/sign-up',
      '/embed/beta',
      '/api/public/beta-apply',
      '/api/admin/devops/ingest',
      '/api/webhooks/clerk',
    ])('%s is public', (path) => {
      expect(isPublicRoute(req(path))).toBe(true)
    })

    it('does NOT blanket-expose /api/webhooks — only the two exact paths', () => {
      // This assertion used to read `cashfree → false` and PASSED while production had
      // it public, because the drift guard below only checked one direction. Both
      // webhooks are listed by exact path; the prefix itself is still not exposed.
      expect(isPublicRoute(req('/api/webhooks'))).toBe(false)
      expect(isPublicRoute(req('/api/webhooks/stripe'))).toBe(false)
      expect(isPublicRoute(req('/api/webhooks/clerk/extra'))).toBe(false)
    })

    it('leaves ordinary app routes protected', () => {
      for (const path of ['/', '/home', '/wallet', '/planner', '/posts', '/connections']) {
        expect(isPublicRoute(req(path))).toBe(false)
        expect(isAdminRoute(req(path))).toBe(false)
      }
    })
  })

  describe('3 · /admin is gated', () => {
    it.each(['/admin', '/admin/credits', '/admin/team', '/api/admin/tasks'])(
      '%s matches the admin gate',
      (path) => {
        expect(isAdminRoute(req(path))).toBe(true)
      },
    )

    it('routes the ingest endpoint through PUBLIC even though it matches the admin prefix', () => {
      // Ordering is load-bearing in middleware.ts: public is evaluated first. This endpoint
      // authenticates a token, not a session, so hitting the admin branch would 404 every sync.
      expect(isPublicRoute(req('/api/admin/devops/ingest'))).toBe(true)
      expect(isAdminRoute(req('/api/admin/devops/ingest'))).toBe(true)
    })
  })

  /**
   * ── 4 · WHAT CLERK NEVER SEES ────────────────────────────────────────────────
   * `config.matcher` decides whether clerkMiddleware RUNS. `isPublicRoute` only decides
   * what it does once it has. The distinction became load-bearing when a malformed
   * bearer token was found to crash Clerk on every matched path (see CLERK_BYPASS_PATHS).
   *
   * The patterns are read out of the source and compiled as anchored RegExp, which is how
   * Next applies them. Not a substitute for the live probe — Next's own compilation is not
   * exercised here — but it turns a silently-widened bypass into a red test.
   */
  describe('4 · config.matcher keeps the self-authenticating routes away from Clerk', () => {
    const matcherPatterns = async (): Promise<string[]> => {
      const { readFile } = await import('node:fs/promises')
      const source = await readFile(new URL('./middleware.ts', import.meta.url), 'utf8')
      const block = source.slice(
        source.indexOf('matcher: ['),
        source.indexOf('],', source.indexOf('matcher: [')),
      )
      // Comment lines are stripped BEFORE the quotes are read. The block documents the
      // rejected shape by quoting it, and a scraper that cannot tell an example from a
      // live pattern reports the example as a matcher — which it did, and this test went
      // red against a correct source until the strip was added.
      const code = block
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
      const patterns = [...code.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
        .map((m) => m[1])
        .filter((p): p is string => p !== undefined)
        // The source escapes the backslash for the JS string literal; the RegExp below
        // needs the single backslash the running matcher actually sees.
        .map((p) => p.replace(/\\\\/g, '\\'))
      // A parse that silently found nothing would make every assertion below vacuous.
      expect(patterns.length, 'no matcher patterns parsed out of middleware.ts').toBeGreaterThan(0)
      return patterns
    }

    const matchesAny = (patterns: string[], path: string): boolean =>
      patterns.some((p) => new RegExp(`^${p}$`).test(path))

    it.each(CLERK_BYPASS_PATHS)(
      '%s is not matched, so clerkMiddleware never runs',
      async (path) => {
        expect(matchesAny(await matcherPatterns(), path)).toBe(false)
      },
    )

    it.each(STATIC_MEDIA_PATHS)(
      '%s is not matched, so a static file never pays for Clerk',
      async (path) => {
        expect(matchesAny(await matcherPatterns(), path)).toBe(false)
      },
    )

    it.each(CLERK_MATCHED_PATHS)('%s still reaches clerkMiddleware', async (path) => {
      expect(matchesAny(await matcherPatterns(), path)).toBe(true)
    })

    it('does not bypass a longer path that merely starts with a bypassed one', async () => {
      // `/api/cron/sweeps-v2` must NOT inherit the bypass. An unanchored lookahead would
      // hand any future sibling an unauthenticated route — the standing-hole hazard
      // middleware.ts's own comment block warns about, one layer down.
      const patterns = await matcherPatterns()
      for (const path of [
        '/api/cron/sweeps-v2',
        '/api/cron/sweepsx',
        '/api/webhooks/cashfree-test',
        '/api/webhooks/clerkx',
      ]) {
        expect(matchesAny(patterns, path), `${path} must stay behind Clerk`).toBe(true)
      }
    })

    it('every bypassed path still appears on isPublicRoute', async () => {
      // Belt and braces, and it survives the matcher being reverted: if the bypass is
      // ever undone, these routes must still not hit auth.protect().
      for (const path of CLERK_BYPASS_PATHS) {
        expect(isPublicRoute(req(path)), `${path} must also be public`).toBe(true)
      }
    })
  })

  describe('the source file still matches what this test pins', () => {
    it('declares exactly these public and admin patterns', async () => {
      const { readFile } = await import('node:fs/promises')
      const source = await readFile(new URL('./middleware.ts', import.meta.url), 'utf8')

      // BOTH directions. The one-way check let `/api/webhooks/cashfree` be added to
      // middleware.ts while this file asserted it was NOT public — and stay green,
      // because nothing compared the source's list back against this one.
      //
      // ── THE COMMENT STRIP IS LOAD-BEARING ──────────────────────────────────
      // This used to match `/'([^']+)'/g` over the RAW slice. Every entry in that
      // block is preceded by an explanatory comment, and an APOSTROPHE in one of
      // those comments — "Zernio's inbound events" — opens a quote that closes on
      // the next apostrophe, inventing a "route" made of prose.
      //
      // MEASURED 2026-08-21: adding one commented entry produced two phantom
      // patterns and a failure that named neither the real cause nor the real
      // entry. `lib/cron/wiring.test.ts` learned the same lesson on 2026-08-19 on
      // the same block of source; this file did not get the fix then.
      //
      // Stripping `//…` to end-of-line first is what makes the match see code.
      const declared = [
        ...source
          .slice(
            source.indexOf('createRouteMatcher(['),
            source.indexOf('])', source.indexOf('createRouteMatcher([')),
          )
          .split('\n')
          .map((line) => line.replace(/\/\/.*$/, ''))
          .join('\n')
          .matchAll(/'([^']+)'/g),
      ].map((m) => m[1])
      expect(new Set(declared)).toEqual(new Set(PUBLIC_PATTERNS))

      for (const pattern of PUBLIC_PATTERNS) {
        expect(source, `public route ${pattern} missing from middleware.ts`).toContain(
          `'${pattern}'`,
        )
      }
      for (const pattern of ADMIN_PATTERNS) {
        expect(source, `admin route ${pattern} missing from middleware.ts`).toContain(
          `'${pattern}'`,
        )
      }
      // The admin branch must answer 404, never redirect to sign-in (doc 13 §2): a redirect
      // tells an anonymous scanner that /admin exists. Scope the assertion to that branch
      // only — the final `else` legitimately calls auth.protect() for ordinary app routes.
      const branch = source.slice(
        source.indexOf('isAdminRoute(req)) {'),
        source.indexOf('} else {', source.indexOf('isAdminRoute(req)) {')),
      )
      // Strip line comments first: the branch carries a comment reading "Deliberately NOT
      // auth.protect()", which is documentation of the rule, not a violation of it.
      const code = branch
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
      expect(code, 'admin branch must exist').not.toHaveLength(0)
      expect(code, 'admin branch must 404').toContain('return notFound(csp)')
      expect(code, 'admin branch must not redirect').not.toContain('auth.protect()')
    })
  })
})
