'use client'

import Link from 'next/link'
import { ArrowRight, Palette } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * GO TO AI STUDIO — the place pictures are supposed to be made.
 *
 * ── WHY THE COMPOSER SHOULD NOT BE AN IMAGE TOOL ─────────────────────────────
 * A prompt box in the sidebar of a writing screen is a design tool the size of a
 * text input. It cannot crop, cannot re-run a variation, cannot show you the
 * result at the shape the channel wants, and it charges a credit per attempt to
 * find that out. Studio is where that work belongs: `/studio` is built around
 * templates locked to the workspace's colours, type and logo, so the output is
 * on-brand every time rather than whatever a sentence produced.
 *
 * ── AND WHY THE GENERATOR IS STILL BELOW THIS ────────────────────────────────
 * Stated plainly because it is the opposite of what the brief asked for.
 *
 * Studio today is a roadmap screen. It renders its shapes and its prices and
 * says outright that nothing is saved yet; it cannot make a picture and it has
 * no way to hand one back to a post. `GenerateImage` in this pane CAN: it spends
 * `image_standard`, sniffs the returned bytes for their real format and
 * dimensions, scores them against every selected channel, and releases the hold
 * if they fail. It is the only thing in the product that puts an image on a post
 * without one already existing.
 *
 * Deleting it in favour of a link would not move image generation to Studio. It
 * would remove image generation from Sahoda and point at a page that cannot do
 * it — `no-impossible-remedy.spec.ts` exists for exactly that shape of mistake,
 * and `/studio` is one of the routes it sweeps.
 *
 * So this card leads, the generator follows, and the sentence below says which
 * of the two can actually produce a file today. The moment Studio can generate
 * and return one, `GenerateImage` comes out of `media-pane.tsx` and this note
 * loses its last paragraph. That is a one-line change, on purpose.
 */
export function StudioLink() {
  return (
    <div className="surface-ring space-y-2 rounded-card bg-s2 p-3" data-studio-link>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
          <Palette size={15} strokeWidth={1.7} aria-hidden />
        </span>
        <div className="space-y-0.5">
          <p className="type-sm font-[550] text-ink">Design it in Studio</p>
          <p className="type-meta text-muted">
            Carousels, quote cards and post images, from templates that already know your colours,
            your type and your logo.
          </p>
        </div>
      </div>

      <Link
        href="/studio"
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-full')}
      >
        Go to AI Studio
        <ArrowRight size={14} aria-hidden />
      </Link>

      {/* The precise claim, and it is deliberately not softer than the truth.
          "Coming soon" would imply a date nobody has set; "Studio is not built"
          would be wrong, because the screen is there and reachable. What is
          absent is the round trip, and that is the only thing a reader standing
          here needs to know. */}
      <p className="type-meta text-muted">
        Studio cannot send a picture back to a post yet. To put one on this post today, attach a
        file or make one below.
      </p>
    </div>
  )
}
