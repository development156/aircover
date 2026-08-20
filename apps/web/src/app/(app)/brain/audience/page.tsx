import Link from 'next/link'
import { Ear, Ruler, UserRound } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { InertButton, InertChip, RoadmapBanner } from '@/components/roadmap/inert'
import { InertPanel, InertRow, NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'Audience' }

/**
 * THE AUDIENCE TWIN — a panel of made-up readers, and the one number it may never fake.
 *
 * ── WHY THIS IS NOT THE CUSTOMER PERSONA ─────────────────────────────────────
 * The Brand Brain already holds a customer persona, it is real, and it lives on
 * the Identity tab. This is a different thing: a panel of 25 or 100 generated
 * readers that each react to a specific draft before it goes out. One is a
 * brand fact; the other is a test harness. Merging them — the obvious move,
 * since both are "audience" — would put a working screen and an unbuilt one
 * behind the same word.
 *
 * ── THE SCORE IS THE MOST DANGEROUS FIGURE IN THIS PRODUCT ───────────────────
 * A Twin Score is a prediction about how the reader's own customers will react.
 * It is exactly the class of number the non-negotiables forbid inventing, and it
 * is the one a placeholder screen is most tempted to show, because a dial with a
 * needle at 78 makes a beautiful screenshot. So the dial here has its BANDS and
 * no needle and no number: the shape of the reading is a promise about Sahoda,
 * the reading itself would be a claim about the reader.
 *
 * ── AND THE BANDS CANNOT BE RED AND GREEN ────────────────────────────────────
 * FSD M4 specifies "<40 red / 40–70 amber / >70 green". docs/26 §1.6 says this
 * app has no red and no green, on purpose — severity is carried by fill weight,
 * glyph and word, so it survives greyscale and colour blindness. The three bands
 * are therefore drawn as three steps of one ladder, each labelled in words. The
 * spec's colour names are a description of severity, not an instruction to add
 * two hues to a palette that deliberately has one.
 */

const PANEL = [
  {
    icon: UserRound,
    name: 'Built from what is already known',
    note: 'Your research, your customer persona, and whatever the platforms report about who follows you. Not bought data, and never a real person’s profile.',
  },
  {
    icon: Ear,
    name: 'Each one reads the draft and reacts',
    note: 'Would this stop me? What would put me off? Answered one reader at a time, then added up.',
  },
  {
    icon: Ruler,
    name: 'Checked against what actually happened',
    note: 'Every month, predictions are compared with real results and the panel is re-weighted. The accuracy of that comparison is published — including when it is poor.',
  },
] as const

/** The three bands, as steps of one ladder. Words, not hues. See the note above. */
const BANDS = [
  { name: 'Weak', what: 'Most of the panel scrolls past. Worth rewriting before it goes out.' },
  { name: 'Mixed', what: 'Some stop, some do not. Usually the hook rather than the offer.' },
  { name: 'Strong', what: 'Most of the panel stops. Publish it.' },
] as const

export default function BrainAudiencePage() {
  return (
    <div className="space-y-grid">
      <RoadmapBanner what="The Audience Twin will read a draft as your customers would, before anyone else sees it." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <InertChip on>Panel</InertChip>
          <InertChip>Accuracy</InertChip>
        </div>
        <InertButton primary>Build my panel</InertButton>
      </div>

      <section aria-labelledby="twin-what" className="flex flex-col gap-3">
        <div>
          <h2 id="twin-what" className="type-h2">
            A panel that reads your drafts first
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Twenty-five readers on the smaller plans, a hundred on the larger ones. They are
            generated, they are not real people, and they are not a substitute for asking real
            customers &mdash; they are a way to catch the post that was never going to land, before
            you spend a slot on it.
          </p>
        </div>
        <div className="grid gap-2">
          {PANEL.map((row) => (
            <InertRow key={row.name} icon={row.icon} name={row.name} note={row.note} />
          ))}
        </div>
      </section>

      <section aria-labelledby="twin-reading" className="flex flex-col gap-3">
        <h2 id="twin-reading" className="type-h2">
          What comes back
        </h2>

        <div className="grid gap-3 wide:grid-cols-2">
          <InertPanel
            title="A reading, in three bands"
            what="Where the draft sits, and nothing more precise than that until the panel has been checked against your real results."
          >
            {/* THE LADDER, AND WHY IT IS NOT DIMMED.
                The first draft faded each row with opacity to imply weight. That
                drops ink below the 4.5:1 floor, which is the exact failure
                `ink-faint.test.ts` exists to stop — and dimming the WEAKEST band
                makes the most important warning the hardest to read. So the
                severity rides on a count of filled segments: one, two, three.
                It survives greyscale, it takes no colour, and every row's text
                stays at full contrast.

                This is a LEGEND, not a reading. It shows what the three bands
                are; none of them is marked as this workspace's. */}
            <ol className="grid gap-1.5">
              {BANDS.map((band, index) => (
                <li
                  key={band.name}
                  data-inert-control
                  className="is-proposed flex items-baseline gap-3 rounded-input px-3 py-2 select-none"
                >
                  <span aria-hidden className="flex shrink-0 items-baseline gap-[3px] pt-[6px]">
                    {[0, 1, 2].map((segment) => (
                      <span
                        key={segment}
                        className={
                          segment <= index
                            ? 'block h-[10px] w-[4px] rounded-[1px] bg-ink-mute'
                            : 'block h-[10px] w-[4px] rounded-[1px] bg-surface-3'
                        }
                      />
                    ))}
                  </span>
                  <span className="type-h3 w-[56px] shrink-0 text-ink">{band.name}</span>
                  <span className="type-sm min-w-0 text-muted">{band.what}</span>
                </li>
              ))}
            </ol>
            <p className="type-sm text-muted">
              A reading is a prediction, never a promise, and it will always be labelled as one.
            </p>
          </InertPanel>

          <InertPanel
            title="And the useful part"
            what="A band on its own tells you nothing you can act on. These do."
          >
            <ul className="type-body grid gap-1.5 text-muted">
              <li>&mdash; The two objections the panel raised most.</li>
              <li>&mdash; One suggested change, specific to this draft.</li>
              <li>&mdash; If you wrote more than one version, which one to send.</li>
            </ul>
            <p className="type-sm text-muted">
              A run costs <span className="num">{creditCost('twin_preflight')}</span> credits and
              covers up to three versions of the same post.
            </p>
          </InertPanel>
        </div>
      </section>

      <section aria-labelledby="twin-honesty" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="twin-honesty" className="type-h3">
          How you will know whether to trust it
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Once a month Sahoda compares what the panel predicted with what your posts actually did,
          and puts the difference on an accuracy page &mdash; including the months it was wrong. A
          prediction tool that never publishes its error rate is asking to be believed rather than
          checked.
        </p>
      </section>

      <NotRunningNote>
        There is no panel for your workspace and no draft has been read. That is why the bands above
        are empty rather than showing a score: a score is a claim about your customers, and nothing
        here has met one. Who you sell to, as a brand fact, is on{' '}
        <Link
          href="/brain/identity"
          className="font-[550] text-accent underline underline-offset-2"
        >
          Identity
        </Link>
        , and that is real today.
      </NotRunningNote>
    </div>
  )
}
