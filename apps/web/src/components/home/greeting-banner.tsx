import { CreatePostButton } from '@/components/posts/create-post-button'

/**
 * The greeting banner (reference `.greet`).
 *
 * A STRIP BEHIND ONE LINE OF TEXT, not a hero card. 190px is the reference's
 * number and it is load-bearing in both directions: tall enough to give the
 * wash somewhere to live, short enough that the first real content still sits
 * above the fold. A taller "hero" pushes question 1 off the screen, which is
 * the whole point of the four-question order.
 *
 * The wash is built from the palette — two orange radial gradients at 16% and
 * 6% — so it needs no artwork to look finished. The mascot art is layered on
 * top when present, masked so text stays legible over any image.
 *
 * ── BUT NONE OF THAT IS TRUE BELOW 700px, AND IT SHIPPED THERE ANYWAY ────────
 * The argument above is an argument about a strip WITH ART IN IT. The art is
 * `max-narrow:hidden` — correctly, it is a wide render and there is no room —
 * so on a phone the reasoning evaporates and what is left is 150px of tinted
 * gradient behind two lines of text.
 *
 * MEASURED 2026-08-23 at 390x844: that band is **20% of the viewport's height**,
 * it is the first thing on the page, and it carries "Good afternoon". The
 * primary device this product is built for (docs/37 §0 — a mid-range Android)
 * spent a fifth of its first screen on a greeting, and the audits missed it
 * because both of them shot 1440.
 *
 * Below `narrow` the band, the wash and the minimum height are gone and the
 * greeting is a plain header. Above it the reference's design stands unchanged.
 *
 * ── AND THE PRIMARY ACTION STANDS DOWN ON A PHONE ────────────────────────────
 * `Create post` here and the bottom bar's FAB are the SAME ACTION TO THE SAME
 * URL (`/posts/new`), rendered as two solid brand fills ~600px apart. MEASURED
 * at 390: the two of them are **89% of every brand-hue pixel on the screen**,
 * and docs/37 §16 allows exactly one solid fill per view. The FAB wins — it is
 * permanent, it is in the thumb zone, and it is the shell's, so removing it
 * would be this lane reaching into another. The page's copy is what goes.
 *
 * ── THE MASCOT IS NOT CLIPPED BY THIS CONTAINER ──────────────────────────────
 * docs/27 §1 records "the mascot is clipped by its container … cut off mid-body
 * at the bottom edge". MEASURED: `public/mascot/0.png` is 2048x983, the art box
 * at 1440 is ~521x190, and `bg-contain` therefore scales the image to ~396x190
 * and renders ALL of it. The plinth is cut off **in the source asset** — the PNG
 * itself ends mid-cylinder. No container change can fix that, and a lane that
 * "fixed the container" would have shipped a CSS diff and re-photographed the
 * same robot.
 *
 * What is fixable without new artwork is that the hard horizontal cut reads as a
 * rendering fault. The mask already fades the art out to the LEFT so text stays
 * legible; it now fades to the BOTTOM as well, so the plinth dissolves into the
 * banner instead of terminating in a straight line. The asset is logged for
 * re-rendering; this is honest in the meantime because it stops claiming an edge
 * that is not a designed edge.
 */
export function GreetingBanner({
  greeting,
  state,
  tools,
}: {
  greeting: string
  /** One line of real state. Never a boast, never a number we cannot back. */
  state: string
  /** Secondary actions, rendered left of the primary. */
  tools?: React.ReactNode
}) {
  return (
    <section
      data-guide="home.greeting"
      className="relative flex items-center overflow-hidden rounded-lg px-[22px] py-[18px] narrow:surface-ring narrow:min-h-[190px] narrow:bg-surface max-narrow:px-0 max-narrow:py-0"
    >
      {/* The wash. Palette-only, so a workspace with no art still gets a
          finished banner rather than a grey box — and absent below `narrow`,
          where there is no art for it to sit behind. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 max-narrow:hidden"
        style={{
          background:
            'radial-gradient(130% 200% at 92% 45%, rgba(255,102,0,0.16), transparent 62%), radial-gradient(90% 160% at 70% 100%, rgba(255,102,0,0.06), transparent 70%)',
        }}
      />
      {/* CONTAIN, anchored right — NOT the reference's `cover`. The reference's
          asset is a DESIGNED banner at 2.25:1 (soft ground left, subject right),
          so covering a wide strip crops it sensibly. Ours is a product render of
          the character on transparency, and `cover` scaled it until the robot
          filled the middle of the banner and sat behind the greeting.

          The mask does two jobs: it clears the left half so text is legible over
          ANY image, and it fades the last 14% of the height so the source's own
          cut-off plinth does not end in a hard line. Two gradients in one
          `mask-image`, which intersect. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[46%] bg-[url('/mascot/0.png')] bg-contain bg-[position:100%_58%] bg-no-repeat opacity-[0.55] max-narrow:hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0%, black 42%), linear-gradient(to bottom, black 86%, transparent 100%)',
          maskComposite: 'intersect',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 42%), linear-gradient(to bottom, black 86%, transparent 100%)',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <div className="relative flex w-full flex-wrap items-center gap-3">
        <div className="min-w-0">
          {/* An <h1>, not a <p>. The banner replaced Home's PageTitle during the
              structure port and took the page's only heading with it, leaving
              the app's most-visited screen with no h1 at all — invisible to
              anyone navigating by headings. */}
          <h1 className="type-h2">{greeting}</h1>
          {/* NOT `text-accent`. A whole sentence in orange is decoration wearing
              a state indicator's clothes, and at 390 it wraps to two lines —
              docs/37 §2.3 spends the accent on the one thing the screen is for,
              which on this page is the queue below, not the weather report. */}
          <p className="type-sm mt-[2px] text-muted">{state}</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          {tools}
          {/* See the header: the FAB is this same action, permanently, below 700. */}
          <span className="max-narrow:hidden">
            <CreatePostButton />
          </span>
        </div>
      </div>
    </section>
  )
}
