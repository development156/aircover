import { InertToggle } from '@/components/roadmap/parts'

/**
 * THE AUTONOMY DIAL — four levels of how much Sahoda may do without asking.
 *
 * ── WHY A LADDER AND NOT A SLIDER ────────────────────────────────────────────
 * A slider is the obvious control for a "dial" and it is wrong here. A slider's
 * positions are interchangeable points on a continuum; these four are not. Each
 * one adds a specific permission AND carries a specific precondition — L3 needs
 * guardrails to pass, an account older than thirty days and a Growth plan (FSD
 * §0.2) — and a slider has nowhere to put a precondition. Read as a ladder, the
 * rung you are on and the price of the next rung are both legible at a glance.
 *
 * The rungs are numbered because the order is real: each level is a superset of
 * the one below it. That is a sequence, so the numbers encode something.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 * No "you are currently on L1". There is no autonomy setting stored anywhere in
 * this product — no column, no row, no default — so any level shown as selected
 * would be a claim about the reader's workspace with nothing behind it. The
 * ladder shows the four rungs and marks none of them, which is the honest shape
 * of a control that does not exist yet.
 *
 * No per-day caps, no credit budgets and no quiet-hour times either. Those are
 * numbers the reader will choose; printing a specimen would read as a setting
 * they already have.
 */

const LEVELS: ReadonlyArray<{ code: string; name: string; may: string; needs: string }> = [
  {
    code: 'L0',
    name: 'Suggest',
    may: 'Sahoda brings you ideas and briefs. It writes nothing.',
    needs: 'Nothing. This is the quietest setting.',
  },
  {
    code: 'L1',
    name: 'Draft',
    may: 'Sahoda writes full drafts and leaves them in your Planner.',
    needs: 'Nothing. Everything still waits for you to open it.',
  },
  {
    code: 'L2',
    name: 'Approve to publish',
    may: 'Sahoda schedules the week and publishes each post once you approve it.',
    needs:
      'Your approval, before the slot passes. Anything you leave expires rather than going out.',
  },
  {
    code: 'L3',
    name: 'Autopilot',
    may: 'Sahoda publishes without asking, inside the limits you set.',
    needs:
      'Every guardrail below passing, an account older than a month, and a plan that includes it.',
  },
]

/**
 * The guardrails. Named, never valued — see the note above on why there are no
 * specimen numbers here.
 */
const GUARDRAILS: readonly string[] = [
  'Your red lines — topics Sahoda will not write about',
  'A cap on how many posts a channel may take in a day',
  'Quiet hours, when nothing goes out',
  'A weekly credit budget the Loop may not exceed',
  'No repeat of the same post to the same channel',
  'A kill switch that cancels everything scheduled, at once',
]

export function AutonomyDial() {
  return (
    <section aria-labelledby="loop-dial" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-dial" className="type-h2">
          How much it does without asking
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          One setting per channel. You can have Sahoda draft for Instagram and publish for Google
          Business Profile — they do not have to move together.
        </p>
      </div>

      <ol className="grid gap-2">
        {LEVELS.map((level) => (
          <li
            key={level.code}
            data-inert-control
            className="is-proposed grid gap-x-4 gap-y-1 rounded-card p-4 narrow:grid-cols-[80px_1fr]"
          >
            <span className="type-eyebrow num self-start text-muted">{level.code}</span>
            <span className="min-w-0">
              <span className="type-h3 block text-ink">{level.name}</span>
              <span className="type-body mt-0.5 block text-muted">{level.may}</span>
              {/* The precondition is the half a slider cannot carry. */}
              <span className="type-sm mt-1.5 block text-muted">
                <span className="type-eyebrow mr-1.5 text-muted">Needs</span>
                {level.needs}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="loop-guardrails" className="is-proposed rounded-card p-4">
        <h3 id="loop-guardrails" className="type-h3 text-ink">
          What stops it, at every level
        </h3>
        <p className="type-sm mt-0.5 text-muted">
          These are checked before anything is published, including on autopilot. A post that fails
          one is parked with the reason on it, never dropped.
        </p>
        <ul className="mt-3 grid gap-2 narrow:grid-cols-2">
          {GUARDRAILS.map((rail) => (
            <li key={rail}>
              <InertToggle label={rail} />
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
