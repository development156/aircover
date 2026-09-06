import Link from 'next/link'

import { brainRing } from '@/lib/brand/brain-ring'
import { stateOf, type Provenance } from '@/lib/brand/provenance'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * What the brain is, in numbers, and the single most useful thing to do next.
 *
 * The count is CONFIRMED over total, matching the topbar ring exactly — one
 * measure, stated the same way in both places. The prompt underneath is the same
 * question the ring shows on hover, because a user who came here BY the ring
 * should land on the thing it was pointing at.
 */
/**
 * The paragraph that explains what a re-resolve costs and what it destroys.
 * The button points at it with `aria-describedby`, so the id has to be stable.
 * BrainHeader renders once per page, so a constant is safe and `useId` is not
 * available here anyway: this is a server component.
 */
const NOTE_ID = 'brain-reresolve-note'

export function BrainHeader({ provenance, version }: { provenance: Provenance; version: number }) {
  const ring = brainRing(provenance)

  /**
   * Why a zero needs a sentence.
   *
   * Every brain saved before `field_meta` existed carries no per-field
   * provenance, so it opens at 0 of 15 — including one belonging to a user who
   * spent twenty minutes correcting cards during setup. Nothing recorded that
   * they did, so nothing can be counted now.
   *
   * The count is honest; the silence around it is not. Without a sentence, a
   * returning user reads "0 of 15" beside "editing is free" and concludes their
   * corrections were thrown away. That is the same false-diagnosis failure the
   * credit chip's three-way split exists to prevent, arriving through a number
   * instead of an em dash.
   *
   * The condition is just "nothing is confirmed", because a brand-new resolve and
   * a pre-release edited brain are indistinguishable — the old code recorded no
   * difference between them, so no test can tell them apart now. The copy is
   * therefore written to be true of both: it states the rule going forward and
   * never asserts that earlier edits happened.
   */
  const explainsZero = ring.confirmed === 0

  return (
    <section className="surface-ring-lift flex flex-col gap-4 rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-eyebrow text-muted">Confirmed fields</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="num text-[28px] leading-[32px] font-extrabold text-ink">
              {ring.confirmed}
            </span>
            <span className="num text-[15px] text-muted">of {ring.total}</span>
          </p>
        </div>
        {/* "Version 3", and nothing after it. The tail read "every edit writes
            a new one", which explains the versioning MODEL to somebody who is
            looking at a number. Founder's ruling, 2026-09-03: short labels. The
            fact it stated is not lost — the paid/free note below still says an
            edit writes one. */}
        <p className="text-[12.5px] text-muted">
          Version <span className="num">{version}</span>
        </p>
      </div>

      {ring.next ? (
        <div className="rounded-input border border-tint-300 bg-tint-50 px-3 py-2.5 dark:bg-s2">
          <p className="type-eyebrow text-accent">Worth answering next</p>
          <p className="mt-1 text-[13.5px] text-ink">{ring.next.question}</p>
          {/* The guess STAYS — it is the answer being offered and a real value
              from the brain — and "Editing it costs nothing" goes, because the
              note below already says editing is free and saying it twice on one
              card is the noise this pass exists to remove. */}
          <p className="mt-1 text-[12.5px] text-muted">
            {stateOf(provenance, ring.next.path) === 'intake'
              ? 'Sahoda reworded your answer for'
              : 'Sahoda guessed'}{' '}
            <span className="font-semibold">{ring.next.label}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-input border border-line bg-s2 px-3 py-2.5">
          <p className="text-[13.5px] text-ink">
            Every field is confirmed. Sahoda writes from your answers, not its guesses.
          </p>
        </div>
      )}

      {explainsZero ? (
        /* SHORTENED, NOT DROPPED. `page.test.tsx` pins this on `role="status"`
           matching /only started recording who wrote each field/, and the test's
           own header says why: a workspace whose owner corrected a dozen cards
           during setup opens at 0 of 15, and an unexplained zero beside "editing
           is free" reads as "your corrections were discarded". The brief asks
           for less copy; it does not ask for a zero that looks like lost work.
           Two sentences instead of three, same claim. */
        <p role="status" className="type-meta text-muted">
          Sahoda only started recording who wrote each field in this version, so setup corrections
          are not counted. Edit a field and it becomes yours.
        </p>
      ) : null}

      {/*
        THE RE-RESOLVE IS A CONTROL, NOT A WORD IN A SENTENCE.

        It was an inline link inside this paragraph, styled `text-accent` with an
        underline only on hover. At rest it was accent-coloured prose in a card
        whose eyebrow (`Worth answering next`) is ALSO accent-coloured, so the
        one thing on this panel that navigates away and spends money looked like
        emphasis. The founder read it as emphasis, which is the whole report.

        SECONDARY, not primary, and the distinction is load-bearing. docs/26
        §1.5 rations one primary to a view; more to the point, a re-resolve
        rewrites every field INCLUDING the confirmed ones, so it is the opposite
        of what a person reading this panel is trying to do. It should be
        unmistakably pressable and unmistakably not the recommended path.

        NO CREDIT FIGURE ON THE LABEL, deliberately. The list price is 50, but
        `isFirstResolve` reads `brand_memory` and takes the free path when it is
        empty, so the EFFECTIVE cost is not the list price — the same reason
        `onboarding-flow.tsx` passes `regenerateCost={isFree ? 'free' : cost}`
        rather than the constant. This component runs no such query, so a number
        here would be a figure nothing produced. The paragraph says `paid`, which
        is true in every case, and /onboarding puts the real amount in the
        button that actually spends it.
      */}

      {/* A link wearing the button's clothes. `<Button asChild>` is not the
          route for this: Button always renders a loading slot beside its
          children, so Radix's Slot receives two and throws (ui/button.tsx).
          `self-start` because the section is a flex column and an inline-flex
          child would otherwise stretch edge to edge and read as a banner.
          `aria-describedby` carries the price and the consequence to a screen
          reader, which the label alone cannot. */}
      <Link
        href="/onboarding"
        aria-describedby={NOTE_ID}
        className={cn(buttonVariants({ variant: 'secondary' }), 'self-start')}
      >
        Re-run resolve
      </Link>
      {/* SHORTENED, NOT DROPPED, and it is the note the button is described by.
          `page.test.tsx` pins /Editing a field here is free/ under the name "the
          free edit and the paid resolve are told apart in words, and in shape".
          This is a spend warning: the sentence is what tells somebody that the
          button beneath rewrites fields they already confirmed, and it is the
          only place a screen reader hears it. */}
      <p id={NOTE_ID} className="type-meta text-muted">
        Editing a field here is free. Re-running the resolve is paid, and rewrites every field
        including the ones you confirmed.
      </p>
    </section>
  )
}
