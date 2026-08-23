import Image from 'next/image'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

/**
 * A URL that matches no route at all.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * Next's built-in 404, which MEASURED as a bare black-on-white "404 This page
 * could not be found." with no shell, no mark, no colour and no link anywhere —
 * the browser's back button was the only way out. For a signed-out visitor who
 * mistyped a URL, that page is the entire impression the product makes.
 *
 * ── WHY IT DOES NOT RENDER THE APP SHELL ─────────────────────────────────────
 * This is the ROOT boundary. It catches paths outside `(app)`, which means the
 * visitor may not be signed in and there may be no workspace to build a rail
 * from. It stands alone deliberately, and offers the two doors that work in
 * either state: Home for a session that exists, sign-in for one that does not.
 *
 * No "try again" — see `(app)/not-found.tsx`. A path that does not route will
 * not route on the second attempt.
 */
export const metadata = { title: 'Page not found' }

export default function RootNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[420px] text-center">
        <Link href="/" aria-label="Sahoda, go to the start" className="inline-block rounded-sm">
          {/* The supplied lockup, light and dark, exactly as the rail wears it. */}
          <Image
            src="/brand/logo-dark.png"
            alt="Sahoda"
            width={120}
            height={34}
            priority
            className="mx-auto block h-[34px] w-[120px] dark:hidden"
          />
          <Image
            src="/brand/logo-white.png"
            alt=""
            aria-hidden
            width={120}
            height={34}
            className="mx-auto hidden h-[34px] w-[120px] dark:block"
          />
        </Link>

        <h1 className="mt-8 text-[20px] leading-7 font-[650] tracking-[-0.02em]">
          This page isn&rsquo;t here
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          The address doesn&rsquo;t match anything in Sahoda. It may be an old link, or a typo.
        </p>

        {/* ONE door, deliberately. `middleware.ts` protects everything except
            /sign-in and /sign-up, so this link resolves correctly in BOTH states:
            a signed-in visitor lands on Home, a signed-out one is redirected to
            sign-in on the way. A second "Sign in" button would ask the reader to
            know which of the two they are, which is a question the app can answer
            for them — and typedRoutes rejects the literal /sign-in anyway, since
            it is a catch-all segment nothing else links to. */}
        <div className="mt-6 flex justify-center">
          <Link href="/home" className={buttonVariants({ variant: 'primary' })}>
            Go to Home
          </Link>
        </div>
      </div>
    </main>
  )
}
