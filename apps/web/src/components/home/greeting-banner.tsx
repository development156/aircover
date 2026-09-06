import { Sun } from 'lucide-react'

import { CreatePostButton } from '@/components/posts/create-post-button'

/**
 * The greeting. A PAGE HEADER, and as of 2026-08-23 not a band at all.
 *
 * ── WHAT WAS THERE, AND WHAT IT COST ─────────────────────────────────────────
 * A 1132x190 tinted strip carrying "Good evening", one line of state, a mascot
 * render and a button. MEASURED at 390 it was 20% of the viewport's height and
 * its art was `max-narrow:hidden`, so on the primary device — a mid-range
 * Android — a fifth of the first screen was a greeting with nothing in it.
 * That half was already fixed: below `narrow` the band, the wash and the
 * minimum height were dropped and the greeting became a plain header.
 *
 * The founder's question was about the other half: does the band earn its
 * height at 1440? It does not, and the comparison settles it — the reference's
 * equivalent is ONE LINE OF TYPE AND NO BAND. Its dashboard opens "Good
 * morning, DIVAS" on the page ground with a period selector opposite, and goes
 * straight into five stat cards. 190px of tinted surface holding two words was
 * the largest non-informative object on this product's most-visited screen.
 *
 * ── SO THE BAND IS GONE AT EVERY WIDTH, NOT RESTYLED ─────────────────────────
 * No `min-h`, no `surface-ring`, no `bg-surface`, no radial wash and no mascot.
 * What is left is exactly what the reference has: an h1, one line of real
 * state, and the page's one primary action opposite. ~130px comes back at
 * every width above `narrow`, and it goes to the four stat cards that now sit
 * where the band was — a viewport that held a greeting now holds four numbers.
 *
 * ── THE WASH WAS NOT THE ACCENT PROBLEM, AND REMOVING IT IS NOT THE FIX ──────
 * Recorded so nobody re-derives it: docs/40 §1.2 measured the two radial
 * gradients at 16% and 6% and found they composite BELOW the s>0.30 saturation
 * floor, contributing approximately zero measured accent pixels. The band was a
 * VISUAL DOMINANCE defect, not a budget one, and this change is aimed at the
 * first. The accent meter will barely move; the page height will.
 *
 * ── THE MASCOT IS NOT DELETED, IT IS UNPLACED ────────────────────────────────
 * `public/mascot/0.png` is still shipped and still used by onboarding and the
 * Guide. What went is the ONE placement where it sat behind a heading at 55%
 * opacity under a two-gradient mask, whose own note records that the asset is
 * cut off mid-plinth in the source PNG and that no container change can fix it.
 * A character with nothing to do is worse for a brand than a character absent.
 *
 * ── AND THE PRIMARY ACTION STILL STANDS DOWN ON A PHONE ──────────────────────
 * Unchanged, and the reason is unchanged: `Create post` here and the bottom
 * bar's FAB are the SAME ACTION TO THE SAME URL, and MEASURED at 390 the two of
 * them were 89% of every brand-hue pixel on the screen. The FAB wins — it is
 * permanent and in the thumb zone.
 */
export function GreetingBanner({
  greeting,
  name,
  state,
  tools,
}: {
  greeting: string
  /** Who is signed in. `null` when Clerk gave us nothing to print. */
  name: string | null
  /** One line of real state. Never a boast, never a number we cannot back. */
  state: string
  /** Secondary actions, rendered left of the primary. */
  tools?: React.ReactNode
}) {
  return (
    <section data-guide="home.greeting" className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {/* The mark. Decoration, and the ONLY decoration on this header — the
          reference sets a sun in a warm disc beside the greeting and it does the
          one job an icon can do here: it makes the top of the page a place
          rather than a line of text. `aria-hidden`, because "sun" is not part of
          what the heading says. */}
      <span
        aria-hidden
        /* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 */
        className="grid size-10 flex-none place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2 max-narrow:hidden"
      >
        <Sun size={20} strokeWidth={1.8} />
      </span>

      <div className="min-w-0">
        {/* ── THE GREETING IS THE SMALL LINE AND THE NAME IS THE HEADING ──────
            The reference stacks a muted "Good afternoon," over the person's name
            set large, and it is the better order: the greeting is the same four
            words for everyone and the name is the only part of the pair that
            says whose workspace this is.

            The <h1> follows the name for that reason. It stays an <h1> — this
            screen lost its only heading during an earlier port and was invisible
            to anyone navigating by headings — and it falls back to the greeting
            when Clerk gives us no name, so the heading is never empty. */}
        <p className="type-sm text-muted">{greeting},</p>
        <h1 className="type-display mt-0.5">{name ?? greeting}</h1>
        {/* NOT the reference's "Here's what's happening with your workspace
            today", which is the same sentence on every workspace on every day
            and therefore says nothing. This line is a real reading of the
            week — see `lib/home/greeting.ts` — and a rewrite that made it
            generic would be a sentence that is true in fewer cases, which this
            product treats as a defect rather than a style choice.

            NOT `text-accent` either. A whole sentence in orange is decoration
            wearing a state indicator's clothes. */}
        <p className="type-sm mt-1 text-muted">{state}</p>
      </div>
      <div className="ml-auto flex flex-none items-center gap-2">
        {tools}
        {/* See the header: the FAB is this same action, permanently, below 700. */}
        <span className="max-narrow:hidden">
          <CreatePostButton />
        </span>
      </div>
    </section>
  )
}
