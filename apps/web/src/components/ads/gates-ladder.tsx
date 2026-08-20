import { KeyRound, Scale, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * WHAT STANDS BETWEEN THIS SCREEN AND A REAL AD — the section's signature.
 *
 * ── WHY A ROADMAP SCREEN LEADS WITH ITS OBSTACLES ────────────────────────────
 * Every "coming soon" page in every product says the same nothing: a nice
 * illustration, a feature list, no reason to believe it. The one thing Sahoda
 * can put here that a competitor's placeholder cannot is the truth about why
 * this is not built, and the truth happens to be specific and checkable.
 *
 * Two of the three are not engineering at all. Meta and Google both review an
 * app's ads access AND each ad, those reviews take as long as they take, and
 * they can be refused for reasons that have nothing to do with this codebase.
 * Saying that out loud is more respectful of a small business owner's time than
 * a date nobody can keep — and it is the reason there is no date anywhere in
 * this section.
 *
 * ── AND IT IS NOT A PROGRESS BAR ─────────────────────────────────────────────
 * No percentages, no "2 of 3 complete", no ticks. A progress bar on an unbuilt
 * feature is a fake success state wearing a different costume, and a fraction
 * would be a figure with nothing behind it. Three things, named, in the order
 * they have to happen.
 */

const GATES: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: KeyRound,
    title: 'A different permission from you',
    body: 'Posting to your Instagram and running an ad from your ad account are two separate grants. Sahoda has the first one. The second needs a business account set up on the platform’s side, and it is yours to give — nothing here can arrange it for you.',
  },
  {
    icon: ShieldCheck,
    title: 'A review queue that is not ours',
    body: 'Meta and Google review both an app’s ads access and every individual ad. Those reviews take as long as they take and can be refused. That waiting is outside anyone’s control here, which is why this section carries no date.',
  },
  {
    icon: Scale,
    title: 'Money handled the way credits are',
    body: 'A budget is not a number on a row — it is a spend record that cannot be edited afterwards, a running total that stays right when two things spend at once, and a rule for a charge a platform reports three days late. Sahoda already has one system built to that standard. Ad spend gets the same, or it does not ship.',
  },
]

export function GatesLadder() {
  return (
    <section aria-labelledby="ads-gates" className="flex flex-col gap-3">
      <div>
        <h2 id="ads-gates" className="type-h2">
          What has to happen first
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Ads is the most-asked-for thing Sahoda does not do. Here is exactly what is in the way, so
          you can judge it for yourself rather than take a promise.
        </p>
      </div>

      {/* An ordered list, because the order is real: the permission comes before
          the review, and the review comes before a rupee can move. Numbering
          that encodes nothing would be decoration; this encodes a sequence. */}
      <ol className="grid gap-3 narrow:grid-cols-3">
        {GATES.map((gate, index) => (
          <li key={gate.title} className="surface-ring flex flex-col rounded-card bg-surface p-4">
            <span className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-brand-wash text-accent shadow-[inset_0_0_0_1px_var(--brand-lift)] dark:bg-s2">
                <gate.icon size={16} strokeWidth={1.8} aria-hidden />
              </span>
              <span className="type-eyebrow num text-muted">
                Step {index + 1}
                <span className="sr-only"> of 3</span>
              </span>
            </span>
            <h3 className="type-h3">{gate.title}</h3>
            <p className="type-sm mt-1 text-muted">{gate.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
