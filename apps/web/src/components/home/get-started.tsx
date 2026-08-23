import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { greetingFor } from '@/lib/home/greeting'
import type { StartStep } from '@/lib/home/started'

/**
 * Home for a workspace that exists and has nothing in it yet.
 *
 * ── SEVEN STATEMENTS BECOME ONE ──────────────────────────────────────────────
 * The dashboard is REPLACED here, not degraded, which is the choice `FirstRun`
 * and `/wallet` already made one state earlier for the same reason. MEASURED on
 * 2026-08-23, the dashboard on an empty workspace ran 1085px at 1440, 1795px at
 * 1024 and 2025px at 390 to say "you have not done anything yet" seven times in
 * six visual languages. This screen is 900 / 768 / 844 — one viewport at every
 * width. See `lib/home/started.ts` for the count and the predicate.
 *
 * ── IT IS THE SAME TREATMENT /analytics USES, DELIBERATELY ───────────────────
 * Left-aligned, content-width prose, one solid brand fill, no marker tile.
 * `ReadinessLine` is the same shape on the other route. Two screens inventing
 * two answers to "how do we say there is nothing here" is the system gap
 * docs/27 §4 names, and the fix has to be one language rather than two good ones.
 *
 * ── THE LEAD IS A STEP, NOT A COPY OF ONE ────────────────────────────────────
 * The first version put the three doors in a list and then a primary button
 * underneath, and the button read "Teach Sahoda your brand" — the same words as
 * the first row, 230px below it at 390. That is §16's "says the same thing in
 * more than one place" reproduced inside the component built to end it, and the
 * after-frames showed it before any test did.
 *
 * So the leading step IS the button. The other two are links under a rule. One
 * fill, three doors, every label written once.
 *
 * ── AND THERE ARE NO TICKS, BECAUSE THERE IS NOTHING TO TICK ─────────────────
 * `workspaceHasStarted` returns false only when EVERY signal is empty, and
 * `startSteps` derives `done` from those same signals — so on the only screen
 * that renders this, all three are always incomplete. A checklist whose boxes
 * can never be checked is furniture, and the first version shipped three of them.
 *
 * ── THE ORDER IS NOT A REQUIREMENT ───────────────────────────────────────────
 * Writing genuinely works with no brain and no connection; `ConnectionsCard` says
 * so and is right. The order is what unblocks the most, and every step is a live
 * link regardless of the ones above it — presenting it as a sequence with locks
 * would be a false claim about the product dressed up as guidance.
 */
export function GetStarted({ now, steps }: { now: Date; steps: StartStep[] }) {
  const [lead, ...rest] = steps
  if (!lead) return null

  return (
    <div className="space-y-8">
      {/* The greeting stays and the state line changes, exactly as `FirstRun`
          argues: the hour of the day is not a claim about their data, but
          "plan a week and it starts filling in" is advice for a workspace that
          has something to plan around. */}
      <header>
        <h1 className="type-h2">{greetingFor(now)}</h1>
        <p className="type-sm mt-1 max-w-[var(--measure-prose)] text-muted">
          Nothing has happened in this workspace yet, which is exactly what a new one looks like.
        </p>
      </header>

      <section
        data-testid="home-get-started"
        aria-labelledby="home-get-started-head"
        className="surface-ring rounded-card bg-surface p-5"
      >
        {/* Capped at the prose measure rather than left to the card. At 1440 the
            card is 1132px and every sentence in it is under 640 — letting the
            rule and the text run the full width is the same container-over-content
            failure docs/27 §3.4 names, and this component criticises it in its
            own header. */}
        <div className="max-w-[var(--measure-prose)]">
          <h2 id="home-get-started-head" className="type-h3 text-ink">
            Three things start it
          </h2>
          <p className="type-sm mt-1 text-muted">
            Your week, your approvals queue and your numbers all fill in from these. You can do them
            in any order.
          </p>

          <div className="mt-5">
            {/* The one solid brand fill on this view (docs/37 §16). */}
            <Link
              href={lead.href}
              data-guide="home.get-started"
              className={buttonVariants({ variant: 'primary' })}
            >
              {lead.label}
            </Link>
            <p className="type-meta mt-2 text-muted">{lead.gets}</p>
          </div>

          {rest.length > 0 ? (
            <ul className="mt-5 space-y-3 border-t border-line-soft pt-4">
              {rest.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className="type-body rounded-sm font-[550] text-ink transition-micro hover:text-accent"
                  >
                    {step.label}
                  </Link>
                  <p className="type-meta text-muted">{step.gets}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  )
}
