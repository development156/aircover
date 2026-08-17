import Image from 'next/image'

/**
 * The frame around Clerk's own card.
 *
 * ── WHY THERE IS A FRAME AT ALL ──────────────────────────────────────────────
 * This was `<div class="grid min-h-dvh place-items-center">` and nothing else,
 * so the first screen anyone ever sees carried no mark, no name and no sentence
 * about what they were signing in to — a bare form on a white page. Every other
 * screen in the product is branded; this one was not.
 *
 * ── WHY IT IS COMPOSED AND NOT PORTED ────────────────────────────────────────
 * The reference package ships eleven page modules and NONE of them is an auth
 * screen, so there is nothing to copy. Same situation as /wallet and /sites: the
 * frame is built from the kit's own primitives — the supplied lockup, the 13px
 * body size, the muted secondary — at the density the rest of the app uses, so
 * it reads as the same product rather than as a login page someone bolted on.
 *
 * ── THE LOCKUP IS THE SUPPLIED ASSET, BOTH THEMES ────────────────────────────
 * `logo-dark.png` is the dark-ink mark for light backgrounds and `logo-white.png`
 * its inverse — the same pair the rail uses, swapped by the same `dark:` rule.
 * The alt text sits on ONE of them and the other is aria-hidden, or a screen
 * reader announces "Sahoda Sahoda".
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-page max-narrow:p-page-mobile">
      <main className="flex w-full max-w-[420px] flex-col items-center">
        <span className="mb-5 block h-[34px] w-[120px]">
          <Image
            src="/brand/logo-dark.png"
            alt="Sahoda"
            width={120}
            height={34}
            priority
            className="block h-[34px] w-[120px] dark:hidden"
          />
          <Image
            src="/brand/logo-white.png"
            alt=""
            aria-hidden
            width={120}
            height={34}
            className="hidden h-[34px] w-[120px] dark:block"
          />
        </span>

        {/* One line, and it is a statement about the product rather than a
            welcome. Nothing here claims anything about the person signing in. */}
        <p className="mb-6 text-center text-[13px] text-muted">
          The marketing team that runs itself, and asks before it spends.
        </p>

        {children}
      </main>
    </div>
  )
}
