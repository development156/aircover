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
  '/api/public/beta-apply',
  '/api/admin/devops/ingest',
  '/api/webhooks/clerk',
  '/api/cron/sweeps',
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

    it('does not expose anything else under /api/cron — the entry is exact, not a prefix', () => {
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

    it('does NOT blanket-expose /api/webhooks — only the exact Clerk path', () => {
      expect(isPublicRoute(req('/api/webhooks/cashfree'))).toBe(false)
      expect(isPublicRoute(req('/api/webhooks'))).toBe(false)
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

  describe('the source file still matches what this test pins', () => {
    it('declares exactly these public and admin patterns', async () => {
      const { readFile } = await import('node:fs/promises')
      const source = await readFile(new URL('./middleware.ts', import.meta.url), 'utf8')

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
