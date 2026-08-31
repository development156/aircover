import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

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
  // The embeddable contact form — door one into `leads`. Same shape and same
  // reasoning as /embed/beta: genuinely public by design, framed into a page
  // this application does not own, and it verifies its own credential —
  // Turnstile plus a rate limit, inside /api/public/site-lead, before anything
  // reaches the database.
  //
  // NO APOSTROPHE MAY APPEAR IN A COMMENT INSIDE THIS ARRAY. `middleware.test.ts`
  // reads the declared list by slicing this block and matching quoted strings,
  // so one lone apostrophe pairs with the next route literal and silently
  // corrupts the comparison. MEASURED: it did, on the first draft of this entry.
  '/embed/lead',
  // The design-system gallery. Public because it renders NOTHING but tokens and
  // primitives — no workspace, no session, no tenant row is read on this route,
  // and it is the reference every UI session and reviewer needs to open without
  // an account. If it ever needs a database read, it stops being public.
  '/design-system',
  '/api/public/beta-apply',
  // Door one into `leads`. Exact path. Rate limit, then zod plus the honeypot,
  // then Turnstile, then a service-role RPC that takes a site SLUG and no
  // workspace id — so the elevated write cannot be aimed.
  '/api/public/site-lead',
  '/api/admin/devops/ingest',
  '/api/webhooks/clerk',
  // Cashfree PG. Obeys all three rules above: `verifyCashfreeWebhook` is the first thing the
  // handler does and nothing below it can run on unverified bytes (the parser accepts only a
  // `LiveVerifiedBody`, which only the verifier can mint); the route imports
  // `@sahoda/billing/server-webhook`, an entry point the fixture provider is absent from, so
  // the well-known fixture secret is unreachable rather than merely unused; and every
  // rejection answers a fixed envelope, never a provider or DB message.
  '/api/webhooks/cashfree',
  // Zernio's inbound events (posts, messages, comments, reviews). Obeys all three
  // rules above: `verifyZernioWebhook` is the first thing the handler does after the
  // size check and nothing below it can run on unverified bytes — `ingestZernioWebhook`
  // accepts only a `VerifiedZernioBody`, which only the verifier can mint, so parsing
  // unsigned bytes is a compile error rather than a review comment. A MISSING
  // signature header is a 401, not a skip: the header is optional on Zernio's side,
  // which is a fact about how the subscription was configured and not permission to
  // trust an anonymous POST. Every rejection answers a fixed envelope that never
  // names which half of the check failed.
  '/api/webhooks/zernio',
  '/api/cron/sweeps',
  // The nightly metric-history pass. Same shape and same reasoning as the sweep
  // above: Vercel invokes it with no user session, so `auth.protect()` would answer
  // a redirect that cron does not follow and the pass would report a green run every
  // night while collecting nothing. It authenticates itself in its first statement
  // with the same constant-time CRON_SECRET compare, and fails closed when the
  // secret is unset. Exact path — nothing else under /api/cron is exposed by it.
  '/api/cron/metrics',
  // The Sunday Loop plan. Same reasoning as the two above, and the same reason
  // it is an EXACT path: Vercel cron presents CRON_SECRET as an Authorization
  // header and does NOT follow redirects, so without this the weekly tick would
  // be a 307 to /sign-in and the Loop would silently never run — while the
  // heartbeat, which records that the schedule FIRED, kept reporting green.
  // `isAuthorizedCronRequest` is the only thing in front of it, and it fails
  // closed when CRON_SECRET is unset.
  '/api/cron/loop',
  // The daily Playbook check. Same reasoning again, and the same exact-path
  // form. It is worth noting that this route SPENDS NOTHING — it proposes and
  // halts at the cost preview — so the failure it would cause without this line
  // is not a surprise bill but the quieter kind: a festival nobody was reminded
  // about, with the heartbeat reporting green the whole time because the
  // schedule did fire and got a 307.
  '/api/cron/playbooks',
  // The weekly Radar scan. Same reasoning as its four siblings, and an EXACT
  // path — nothing else under /api/cron is exposed by adding it. Vercel cron
  // presents CRON_SECRET as an Authorization header and does NOT follow the
  // redirect to /sign-in, so behind the middleware this route would answer a
  // redirect every Monday and the scan would look green while collecting
  // nothing. `isAuthorizedCronRequest` is what actually guards it, and it
  // refuses outright when CRON_SECRET is unset rather than running open — which
  // matters more here than on any sibling, because this is the one that spends.
  '/api/cron/radar',

  // The weekly Marketing Brain pass. Same reasoning, same exact-path form. This
  // one spends nothing at all — no model call, no ledger — so what a missing
  // line here would cost is the quiet failure again: a 307 to /sign-in that the
  // heartbeat records as a run that fired, while the observations table stays
  // empty and every report block that reads it says the customer has published
  // too little to notice anything about.
  '/api/cron/brain',

  // The autopilot tick, every ten minutes. Same reasoning, same exact-path
  // form, and the quiet failure it prevents is the worst of the set: behind the
  // middleware this route answers a 307, the heartbeat records a run that
  // fired, and a customer who armed a channel sees nothing go out and nothing
  // explain why. `isAuthorizedCronRequest` guards it, and SAHODA_AUTOPILOT_ENABLED
  // is what decides whether it does any work at all.
  '/api/cron/autopilot',
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

/** Clerk's session cookie. The only token carrier a user cannot choose to stop sending. */
const CLERK_SESSION_COOKIE = '__session'

/** Doc 13 §2: non-admins get a plain 404, never a login upsell. */
function notFound(csp: string): NextResponse {
  return new NextResponse(null, { status: 404, headers: { 'Content-Security-Policy': csp } })
}

const clerk = clerkMiddleware(
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

/**
 * clerkMiddleware, wrapped so a throw inside it is not a 500 for the whole site.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `[LIVE 2026-08-09]` `Authorization: Bearer aaa.bbb.ccc` — three dot-separated parts
 * that are not base64url — throws inside Clerk's token decode and Vercel answers
 * **500 MIDDLEWARE_INVOCATION_FAILED**. It reproduced on every matched path, including
 * /sign-in and /embed/beta, from an unauthenticated request carrying one header.
 *
 * `config.matcher` below removes the self-authenticating routes from Clerk's path
 * entirely, but /sign-in and /embed/beta MUST stay matched, so exclusion alone leaves the
 * site crashable. This is the half that covers them.
 *
 * ── WHICH WAY IT FAILS ───────────────────────────────────────────────────────
 * Not one direction for everything — the direction is the point:
 *
 *   public       → OPEN. These routes never depended on Clerk for authorisation; each
 *                  verifies its own credential in-route. A crashed /sign-in is a total
 *                  outage with no way back in, and failing it closed is self-inflicted.
 *   /admin       → 404, the same answer the gate gives a stranger (doc 13 §2). A crash
 *                  must not become the one response confirming the console exists.
 *   bad COOKIE   → clear it and send them to /sign-in. A header is sent deliberately by
 *                  a caller who can stop sending it; `__session` is carried automatically
 *                  on every request, so a corrupted one wedges a real person out of every
 *                  page with no way to act. `[LIVE]` confirmed: `Cookie:
 *                  __session=aaa.bbb.ccc` on /home answered 503 before this branch.
 *                  Expiring the cookie is what unwedges them — a bare redirect would
 *                  carry the same cookie back and loop.
 *   the rest     → 503. We could not evaluate the session, so we cannot claim the caller
 *                  is anyone. Not a redirect: nothing about a malformed bearer header
 *                  suggests a login page will help, and the caller can fix their request.
 *
 * Deliberately narrow: it catches a throw, not a 4xx. Clerk answering 401/404 normally
 * never reaches here.
 */
export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
): Promise<NextResponse> {
  try {
    return (await clerk(req, event)) as NextResponse
  } catch (error) {
    const csp = cspFor(req.nextUrl.pathname)
    // Not `reportServerError`: that helper is `server-only`, calls Sentry's `after()` and
    // awaits a flush — none of which belong on the edge, and a throw from inside this
    // catch would 500 exactly the request we are here to rescue. The pathname and the
    // error's CLASS are logged and nothing else: the message can quote the malformed
    // bearer token that caused it, and a token belongs in no log we control.
    console.error(
      '[middleware] clerk threw',
      req.nextUrl.pathname,
      error instanceof Error ? error.name : typeof error,
    )

    if (isPublicRoute(req)) {
      const response = NextResponse.next()
      response.headers.set('Content-Security-Policy', csp)
      return response
    }
    if (isAdminRoute(req)) return notFound(csp)

    // A session cookie is carried automatically; a bearer header is not. Only the cookie
    // can wedge someone who did nothing wrong, so only the cookie is worth clearing.
    // Deliberately narrow: if the throw had another cause this signs out one request's
    // worth of session, which the sign-in page immediately re-establishes.
    if (req.cookies.has(CLERK_SESSION_COOKIE)) {
      const signIn = NextResponse.redirect(new URL('/sign-in', req.url))
      signIn.cookies.delete(CLERK_SESSION_COOKIE)
      signIn.headers.set('Content-Security-Policy', csp)
      return signIn
    }

    return new NextResponse(null, {
      status: 503,
      headers: { 'Content-Security-Policy': csp, 'Retry-After': '5' },
    })
  }
}

// ── WHAT CLERK NEVER SEES, AND WHY THAT IS DIFFERENT FROM "PUBLIC" ───────────
// `isPublicRoute` decides what clerkMiddleware DOES; this decides whether it RUNS at
// all. Everything above is still executed for a public route, including Clerk's parse of
// the request's `Authorization` header — and that parse is not total.
//
// `[LIVE 2026-08-09]` against production: a bearer token of `aaa.bbb.ccc` — three
// dot-separated parts that are not valid base64url — passes Clerk's "is it JWT-shaped"
// check and then throws inside the decode, where nothing catches it. Vercel answers
// **HTTP 500 MIDDLEWARE_INVOCATION_FAILED** on EVERY matched path. Reproduced on
// /sign-in, /embed/beta, /api/public/beta-apply and the routes named below; a
// 2-part token, a 4-part token and a well-formed 3-part token all answer 401 correctly.
// One header, no credentials, any route. @clerk/nextjs 7.5.20 / @clerk/backend 3.11.7.
//
// The SEVEN routes below authenticate themselves — four constant-time CRON_SECRET
// compares, a Cashfree HMAC, a Zernio HMAC and a Clerk/Svix signature — and take
// nothing from clerkMiddleware but that failure mode.
//
// The count is spelled out because it has been wrong twice. It read "four" over six
// entries for two days, and `/api/webhooks/zernio` was added to `isPublicRoute` on
// 2026-08-21 and to THIS list only on 2026-08-23 — so for two days the whole internet
// could reach a route on which Clerk still parsed an `Authorization` header it had no
// use for. Nothing went red: `middleware.test.ts` adjudicates the paths somebody typed
// into its arrays, and zernio was in neither of them. `middleware.coverage.test.ts`
// now walks src/app and requires every route on disk to be classified, which is the
// only shape of guard that can see a route missing from every list.
//
// AND IT WAS NOT A LIVE CRASH, which is worth stating rather than leaving implied.
// MEASURED 2026-08-23 against `next start`: 72 routes on disk, each sent
// `Authorization: Bearer aaa.bbb.ccc`, a two-part bearer, a well-formed-but-invalid
// bearer and `Cookie: __session=aaa.bbb.ccc`, by GET and by POST — ZERO 500s. The
// catch above does hold. Zernio alone among the three webhooks paid Clerk's header
// parse on every delivery and rested on that catch instead of on never being reached,
// so this closes a reachability gap: the difference between a route that cannot reach
// the failure and one that is rescued from it. Excluding them here is the only bypass that works: the crash happens
// while Clerk computes the request state, BEFORE our handler runs, so an early return
// inside the callback would never be reached.
//
// This does NOT close the hole for /sign-in or /embed/beta, which must stay matched. The
// try/catch around `clerk()` above is what covers those.
//
// Three rules for adding to this list, stricter than the public list's:
//   · EXACT paths, `$`-anchored — `/api/cron/sweeps-v2` must not inherit the bypass;
//   · the route must authenticate itself in its FIRST statement, since nothing else will;
//   · it must be in `isPublicRoute` too, so reverting this block cannot silently start
//     redirecting it to /sign-in;
//   · it must RETURN JSON. `middleware` is what sets `Content-Security-Policy`, so a
//     route excluded here is served with no CSP header at all. That costs a webhook
//     receiver nothing and would strip the header from /sign-in or /embed/lead — which
//     is why this list is endpoints only and `middleware.coverage.test.ts` asserts that
//     no page ever joins it.
// Both patterns need the exclusion: the second one catches everything under /api on its
// own, so excluding a path from the first alone does nothing. Next static-analyses these
// at build time, so they must be literal strings — a shared const would be ignored.
export const config = {
  matcher: [
    // Clerk-recommended shape: skip Next internals + static assets unless
    // referenced in search params. (Next 16 renames middleware → proxy; n/a on 15.)
    //
    // `mp4|webm` ADDED 2026-08-24, and it was a real hole rather than a tidy-up.
    // MEASURED against `next start`: `/sahodaboot-poster.jpg` answered 200 and
    // `/sahodaboot.mp4` answered **404** to the same unauthenticated request —
    // the boot animation is 2.7 MB of static brand asset that was being routed
    // through clerkMiddleware because no video extension was on this list, while
    // its own poster frame was not. It only ever worked because the one person
    // who fetches it has just signed in.
    //
    // Three costs, and the first is the one that matters: every play paid
    // Clerk's request-state computation on a 2.7 MB file, INCLUDING the
    // `Authorization`-header parse this whole block exists to keep off static
    // paths. The others are that the poster and the film disagreed about who may
    // see them, and that a film served through middleware inherits the 500 this
    // file's own header documents.
    //
    // It is a marketing animation shown to every new customer, with nothing in
    // it that is theirs — the same category as the poster beside it, which has
    // been public all along.
    '/((?!api/cron/sweeps$|api/cron/metrics$|api/cron/loop$|api/cron/playbooks$|api/cron/radar$|api/cron/brain$|api/cron/autopilot$|api/webhooks/cashfree$|api/webhooks/clerk$|api/webhooks/zernio$|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Shaped as `/(…)` — ONE group holding the whole expression — because that is the
    // only place Next accepts a raw regex. `'/(?!…)(api|trpc)(.*)'` reads to
    // path-to-regexp as a group opening with invalid content and fails the BUILD with
    // `Error parsing … invalid-route-source`. Loud and before deploy, which is the right
    // direction for this file, but it is why the lookahead lives inside the parentheses.
    '/((?!api/cron/sweeps$|api/cron/metrics$|api/cron/loop$|api/cron/playbooks$|api/cron/radar$|api/cron/brain$|api/cron/autopilot$|api/webhooks/cashfree$|api/webhooks/clerk$|api/webhooks/zernio$)(?:api|trpc).*)',
  ],
}
