import Link from 'next/link'

import { brainRing } from '@/lib/brand/brain-ring'
import type { Provenance } from '@/lib/brand/provenance'
import { buttonVariants } from '@/components/ui/button'

/**
 * What the brain is, in numbers, and the single most useful thing to do next.
 *
 * The count is CONFIRMED over total, matching the topbar ring exactly — one
 * measure, stated the same way in both places. The prompt underneath is the same
 * question the ring shows on hover, because a user who came here BY the ring
 * should land on the thing it was pointing at.
 */
export function BrainHeader({
  provenance,
  version,
  historyComplete,
}: {
  provenance: Provenance
  version: number
  historyComplete: boolean
}) {
  const ring = brainRing(provenance)

  /**
   * Why a zero needs a sentence.
   *
   * Until this release `saveBrandMemory` stamped EVERY write `resolved`, Finish
   * included. So a user who spent twenty minutes correcting cards during setup
   * has a history containing no `manual` version, and provenance — correctly —
   * attributes nothing to them. Their brain opens at 0 of 15.
   *
   * The count is honest; the silence around it is not. Without a sentence, a
   * returning user reads "0 of 15" beside "editing is free" and concludes their
   * corrections were thrown away. That is the same false-diagnosis failure the
   * credit chip's three-way split exists to prevent, arriving through a number
   * instead of an em dash.
   *
   * The condition is just "nothing is confirmed", because a single `resolved`
   * version is what BOTH a brand-new resolve and a pre-release edited brain look
   * like — the old code recorded no difference between them, so no test on the
   * history can tell them apart now. The copy is therefore written to be true of
   * both: it states the rule going forward and never asserts that earlier edits
   * happened. Suppressed when the history is incomplete, where the page already
   * explains the zero for a different reason and two notices would contradict.
   */
  const explainsZero = ring.confirmed === 0 && historyComplete

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-bg p-5 shadow-card">
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
        <p className="text-[12.5px] text-muted">
          Version <span className="num">{version}</span> &middot; every edit writes a new one
        </p>
      </div>

      {ring.next ? (
        <div className="rounded-input border border-tint-300 bg-tint-50 px-3 py-2.5 dark:bg-s2">
          <p className="type-eyebrow text-accent">Worth answering next</p>
          <p className="mt-1 text-[13.5px] text-ink">{ring.next.question}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Sahoda guessed <span className="font-semibold">{ring.next.label}</span> for you. Editing
            it costs nothing.
          </p>
        </div>
      ) : (
        <div className="rounded-input border border-line bg-s2 px-3 py-2.5">
          <p className="text-[13.5px] text-ink">
            Every field is confirmed — Sahoda writes from your answers, not its guesses.
          </p>
        </div>
      )}

      {explainsZero ? (
        <p role="status" className="text-[12.5px] text-muted">
          Nothing is confirmed yet. Sahoda only started recording who wrote each field in this
          version of the app, so any corrections you made during setup are not counted here — edit a
          field below and it becomes yours.
        </p>
      ) : null}

      <p className="text-[12.5px] text-muted">
        Editing a field here is free and marks it confirmed.{' '}
        <Link
          href="/onboarding"
          className="font-semibold text-accent underline-offset-2 hover:underline"
        >
          Re-running the whole resolve
        </Link>{' '}
        is a separate, paid action that rewrites every field — including the ones you have already
        confirmed.
      </p>
    </section>
  )
}
