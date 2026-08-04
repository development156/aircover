import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) await auth.protect()
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
