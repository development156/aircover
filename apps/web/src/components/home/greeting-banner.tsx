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
 * ── THE PRIMARY ACTION LIVES HERE ────────────────────────────────────────────
 * The reference puts "+ Create" top-right of the banner, and this app had no
 * primary action on Home at all — a dashboard you can only read. One primary
 * per view (orange is rationed), so "Create post" is it; everything else on
 * this screen is secondary or a link.
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
      className="surface-ring relative flex min-h-[190px] items-center overflow-hidden rounded-lg bg-surface px-[22px] py-[18px] max-narrow:min-h-[150px] max-narrow:px-4"
    >
      {/* The wash. Palette-only, so a workspace with no art still gets a
          finished banner rather than a grey box. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 200% at 92% 45%, rgba(255,102,0,0.16), transparent 62%), radial-gradient(90% 160% at 70% 100%, rgba(255,102,0,0.06), transparent 70%)',
        }}
      />
      {/* The art sits on the wash and is masked out across the left half, so
          the text is legible over ANY image — no safe-zone rules for whoever
          makes the artwork to remember.

          CONTAIN, anchored right — NOT the reference's `cover`. The reference's
          asset is a DESIGNED banner at 2.25:1 (soft ground left, subject right),
          so covering a wide strip crops it sensibly. Ours is a product render of
          the character on transparency, and `cover` scaled it until the robot
          filled the middle of the banner and sat behind the greeting. Same
          intent — subject right, text left, art subordinate — reached with the
          setting the different source actually needs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[46%] bg-[url('/mascot/0.png')] bg-contain bg-[position:100%_58%] bg-no-repeat opacity-[0.55] max-narrow:hidden"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 42%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 42%)',
        }}
      />

      <div className="relative flex w-full flex-wrap items-center gap-3">
        <div className="min-w-0">
          {/* An <h1>, not a <p>. The banner replaced Home's PageTitle during the
              structure port and took the page's only heading with it, leaving
              the app's most-visited screen with no h1 at all — invisible to
              anyone navigating by headings. */}
          <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">{greeting}</h1>
          <p className="mt-[1px] text-[13px] font-[550] text-accent">{state}</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          {tools}
          <CreatePostButton />
        </div>
      </div>
    </section>
  )
}
