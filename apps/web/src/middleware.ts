import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { provesOpsAdmin } from '@/lib/ops/gate-decision'
import { cspFor } from '@/lib/security/csp'

// Inverted model: everything is protected except this list. Route groups
// like (app) never appear in URLs, so they cannot be matched here.
//
// NOTE: `/api/webhooks(.*)` is deliberately NOT here. A blanket public prefix is
// a standing unauthenticated hole waiting for a route — anything later mounted
// under it would be reachable by anyone the moment it lands. When a webhook
// route is added, list its EXACT path here and, in the route itself:
//   · verify the provider signature before doing any work;
//   · accept the LIVE provider only — the fixture provider's HMAC secret is
//     well-known, so honouring it on a public endpoint is a credit-forgery path;
//   · never echo a raw provider/DB error into the response envelope.
// Failing closed (a missed entry breaks the webhook) is the safe direction.
//
// The four Admin-Ops entries obey that rule: exact paths, each verifying its own
// credential inside the route — Turnstile + rate limit on the beta form, a
// constant-time `x-ops-token` compare on the ingest endpoint, the Clerk
// signature on the webhook. `/embed/beta` is genuinely public by design (doc 13 §5).
//
// `/api/cron/sweeps` is listed as an EXACT path, per the rule above — no `(.*)`, so
// nothing else under /api/cron is exposed by adding it. It must be public because Vercel
// invokes it with no user session: `auth.protect()` would answer a redirect to /sign-in,
// and Vercel cron does not follow redirects, so the sweep would report a green run every
// five minutes while doing nothing at all. The route authenticates itself instead —
// `isAuthorizedCronRequest` is its first statement, comparing a bearer secret in constant
// time and failing closed when CRON_SECRET is unset.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/embed/beta',
  '/api/public/beta-apply',
  '/api/admin/devops/ingest',
  '/api/webhooks/clerk',
  '/api/cron/sweeps',
])

// The `/admin` surface and its authenticated APIs. The token-authed ingest route
// also lives under /api/admin/, but it is matched as public above and public is
// evaluated first.
const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/admin/(.*)'])

/**
 * Is the caller an active ops admin?
 *
 * Asked of the database through the caller's own Clerk token, so the answer is
 * RLS's rather than this file's: `app.is_ops_admin()` gates every select on
 * ops_admins, which makes the ability to see ANY row of that table the proof
 * itself. A stranger gets an empty array; so does a revoked seat.
 *
 * Anything unexpected — missing env, non-2xx, a thrown fetch — is false. An
 * admin console that opens when its authorisation check breaks is worse than one
 * that 404s until somebody investigates.
 */
async function isActiveOpsAdmin(token: string | null): Promise<boolean> {
  if (!token) return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false

  try {
    const response = await fetch(
      `${new URL(supabaseUrl).origin}/rest/v1/ops_admins?select=id&status=eq.active&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, cache: 'no-store' },
    )
    if (!response.ok) return false
    return provesOpsAdmin(await response.json())
  } catch {
    return false
  }
}

/** Doc 13 §2: non-admins get a plain 404, never a login upsell. */
function notFound(csp: string): NextResponse {
  return new NextResponse(null, { status: 404, headers: { 'Content-Security-Policy': csp } })
}

export default clerkMiddleware(
  async (auth, req) => {
    const csp = cspFor(req.nextUrl.pathname)

    // Public is tested FIRST and that ordering is load-bearing, not stylistic.
    // `/api/admin/devops/ingest` matches the admin matcher by prefix but
    // authenticates a token rather than a session, so evaluating the admin
    // branch first 404s every sync — which is exactly what it did until an
    // end-to-end run caught it. Route-handler unit tests could not: they call
    // POST directly and never traverse middleware.
    if (isPublicRoute(req)) {
      // Nothing to enforce here; each of these routes verifies its own
      // credential in-route (Turnstile, ops token, Clerk webhook signature).
    } else if (isAdminRoute(req)) {
      // Deliberately NOT auth.protect(): that redirects to /sign-in, which tells
      // an anonymous scanner that /admin exists and is worth coming back to.
      // Signed out and signed-in-but-not-an-admin get the identical empty 404.
      const { userId, getToken } = await auth()
      if (!userId || !(await isActiveOpsAdmin(await getToken()))) return notFound(csp)
    } else {
      await auth.protect()
    }

    // This is the coarse gate only. Every /admin page still calls
    // requireOpsAdmin() and every server action re-checks, because a routing
    // layer is the wrong place for the last word on authorisation.
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', csp)
    return response
  },
  // `<ClerkProvider signInUrl>` only governs client components; auth.protect()
  // resolves its redirect target from the MIDDLEWARE's signInUrl (or the
  // NEXT_PUBLIC_CLERK_SIGN_IN_URL env). Without this it falls back to the
  // hosted Account Portal — bypassing our themed in-app (auth) pages.
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
)

export const config = {
  matcher: [
    // Clerk-recommended shape: skip Next internals + static assets unless
    // referenced in search params. (Next 16 renames middleware → proxy; n/a on 15.)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
