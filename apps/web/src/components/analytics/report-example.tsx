import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

/**
 * WHAT YOU WILL SEE, SHOWN RATHER THAN DESCRIBED.
 *
 * ── THE STATE THIS REPLACES ──────────────────────────────────────────────────
 * The screen said "nothing can be measured yet" and then said a version of it
 * four more times in four more containers. Five apologies teach a reader that
 * the product is broken. They also teach nothing about what the product is FOR,
 * which is the thing somebody deciding whether to connect an account needs.
 *
 * So this draws the real report, greyed, with obviously made-up content, and one
 * line saying when the real one arrives and what has to happen first.
 *
 * ── AND THE ONE RULE IT CANNOT BREAK ─────────────────────────────────────────
 * This product may never show a number it did not measure. A sample report is
 * made entirely of numbers it did not measure, so the ONLY thing that makes this
 * legitimate is that nobody can mistake it for their own: the badge says
 * "Example", the sentence under the heading says these are not their figures,
 * the business in it is a fictional one, and the whole block is dimmed and
 * non-interactive. Take any one of those away and this becomes the exact defect
 * the rest of this lane exists to prevent.
 *
 * `aria-hidden` is deliberately NOT used. A screen-reader user needs to know the
 * shape of what is coming just as much, and hiding it would leave them with only
 * the apology. The label carries the warning instead.
 */
export function ReportExample({
  headline,
  detail,
  action,
}: {
  headline: string
  detail: string
  /**
   * Typed as the two routes this actually offers, not `string`.
   *
   * Next checks route literals, and a `string` here compiles at the call site
   * and fails at the link. Narrowing it is also the honest shape: the only
   * remedies this screen has are writing a post and connecting a channel, and
   * `null` is the third case, where no button would help at all.
   */
  action: { label: string; href: '/posts/new' | '/connections' } | null
}) {
  return (
    <div className="space-y-4">
      <section className="surface-ring rounded-card bg-surface p-5">
        <h2 className="type-h2 text-ink">{headline}</h2>
        <p className="mt-2 max-w-[62ch] type-sm text-muted">{detail}</p>
        {action ? (
          <div className="mt-4">
            {/* `buttonVariants` on the Link rather than `Button asChild`. Same
                pixels, and it does not put a Slot between the two, which is what
                the component test tripped over. `readiness-line.tsx` on this same
                page already does it this way. */}
            <Link href={action.href} className={buttonVariants({ variant: 'primary' })}>
              {action.label}
            </Link>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="report-example" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="report-example" className="type-h3 text-muted">
            Example of a weekly report
          </h3>
          {/* The badge is not decoration and it is not removable. It is the one
              element that keeps every figure below from being a claim. */}
          <span
            id="report-example-warning"
            className="rounded-pill bg-s2 px-2 py-0.5 type-chip text-muted"
          >
            Example, not your figures
          </span>
        </div>

        {/* `select-none` and `pointer-events-none`: nothing in here is a real
            post, so nothing in here may be clicked or copied out of context. */}
        {/* ── THE WARNING IS TIED TO THE FIGURES, NOT JUST NEAR THEM ────────
            An audit found the gap: somebody arriving inside this block by
            searching for a number, rather than by walking the headings, met
            three figures with the disclaimer above and behind them. A `group`
            with its own accessible name carries the warning wherever the reader
            enters, which is the only version of this that survives being
            skipped into. */}
        <div
          role="group"
          aria-label="Example report. These figures belong to a made-up business, not to you."
          aria-describedby="report-example-warning"
          className="pointer-events-none space-y-3 opacity-60 select-none"
          data-testid="report-example"
        >
          <div className="surface-ring rounded-card bg-surface p-5">
            <p className="max-w-[46ch] type-h2 text-body">
              Your Tuesday posts reach more people than your Friday ones.
            </p>
            <p className="mt-2 max-w-[62ch] type-sm text-muted">
              For a bakery that posts four times a week: 412 reached on average against 168, from
              six posts and five, measured across 21 days.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-grid max-wide:grid-cols-1">
            <ExampleTile
              label="Reach across these posts"
              value="1,240"
              note="Added up, so somebody who saw two posts is counted twice."
            />
            <ExampleTile
              label="Against your normal"
              value="Instagram: up 34%"
              note="Measured 7 days after each post went out, against the last 8 Instagram posts."
            />
            <ExampleTile
              label="Against your normal"
              value="LinkedIn: about the same"
              note="Measured 7 days after each post went out, against the last 5 LinkedIn posts."
            />
          </div>

          <div className="surface-ring rounded-card bg-surface p-5">
            <h4 className="type-h3 text-body">What Sahoda changed because of this</h4>
            <ul className="mt-3 space-y-2 type-sm text-muted">
              <li>Moved next week&rsquo;s posts to Tuesday and Thursday mornings.</li>
              <li>Wrote two more posts in the format that reached the most people.</li>
            </ul>
          </div>
        </div>

        <p className="type-meta text-muted">
          Every figure above belongs to a made-up bakery. Yours appear here once Sahoda has measured
          your own posts.
        </p>
      </section>
    </div>
  )
}

function ExampleTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="surface-ring rounded-card bg-surface p-5">
      <p className="type-meta text-muted">{label}</p>
      <p className="mt-1 type-h3 tabular-nums text-body">{value}</p>
      <p className="mt-1 type-meta text-muted">{note}</p>
    </div>
  )
}
