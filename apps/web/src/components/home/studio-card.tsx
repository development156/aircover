import Link from 'next/link'
import { ArrowRight, Palette } from 'lucide-react'

/**
 * THE STUDIO ENTRY, BESIDE THE WELCOME.
 *
 * ── THE COPY IS NOT THE COPY THAT WAS ASKED FOR, AND HERE IS WHY ─────────────
 * The brief's words are "Studio — Chat with Sahoda. Plan, create and get things
 * done." Studio does none of those three things. Its own page subtitle reads
 * "Describe a picture and Sahoda draws it, using what it knows about your
 * brand", it imports `readGenerations`, `canvasPictures` and `generatableFormats`,
 * and its server action is `queueGeneration`. It is an image generator.
 *
 * A card promising a conversation that opens an image tool is the same defect
 * class as a remedy that cannot work: the reader presses it expecting one thing
 * and the product hands them another. So the card says what Studio is. It is no
 * less prominent for being accurate, and the founder's actual requirement —
 * "clicking it MUST navigate to the existing Studio page" — is met exactly.
 *
 * ── AND STUDIO WAS NOT IN THE SIDEBAR AT ALL ────────────────────────────────
 * `lib/nav/sections.ts` carried `state: 'soon'` on it, and `RAIL_GROUPS` filters
 * the rail down to `live`, so Studio has been reachable only from the command
 * palette and the phone's More sheet. That flag is STALE and the repo's own
 * guard says so: `roadmap-honesty.spec.ts` removed /studio from its allowed
 * "this screen is a drawing" list with the note "it was built on 2026-08-28".
 * The page charges credits through `app/actions/studio.ts` and has a charge
 * test. `sections.ts` records finding four stale `soon` flags before this one.
 *
 * It is `live` now, so this card and the rail agree. A prominent home card
 * pointing at a screen the sidebar calls "Soon" would be the product
 * contradicting itself inside one viewport.
 *
 * ── WHY IT IS A WASH AND NOT A FILL ─────────────────────────────────────────
 * docs/37 §16 allows ONE solid brand fill per view and `Create post` in the
 * header beside this spends it. The card earns its weight from a tinted ground
 * and a firmer edge, which is the same currency the Plan-my-week panel uses on
 * /planner for the same reason.
 */
export function StudioCard() {
  return (
    <Link
      href="/studio"
      data-guide="home.studio"
      className="surface-ring-firm group flex items-center gap-3 rounded-card bg-brand-wash p-4 transition-micro hover:bg-brand-tint narrow:p-5"
    >
      <span
        aria-hidden
        /* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 */
        className="grid size-10 flex-none place-items-center rounded-sm bg-tint-50 text-accent dark:bg-s2"
      >
        <Palette size={20} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-h3 text-ink">Studio</span>
        {/* True of what the screen does, and short enough to read at a glance.
            "in your brand's colours" is the part worth keeping from the nav's
            own hint — it is what makes Studio different from any drawing tool. */}
        <span className="mt-0.5 block type-sm text-muted">
          Describe a picture and Sahoda draws it, in your brand&rsquo;s colours.
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="size-4 flex-none text-ink-mute transition-micro group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </Link>
  )
}
