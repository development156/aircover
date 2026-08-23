import Link from 'next/link'
import { Check } from 'lucide-react'

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
 * six visual languages — the founder's verdict, in the product's most-visited
 * screen. See `lib/home/started.ts` for the count.
 *
 * ── IT IS THE SAME TREATMENT /analytics USES, DELIBERATELY ───────────────────
 * Left-aligned, content-width prose, one solid brand fill, and no 44px marker
 * tile. `ReadinessLine` is the same shape on the other route. Two screens
 * inventing two answers to "how do we say there is nothing here" is the system
 * gap docs/27 §4 names, and the fix has to be one language rather than two good
 * ones.
 *
 * ── THE LIST IS STATUS, NOT A NAG ────────────────────────────────────────────
 * All three steps render whether or not they are done. A reader on day one does
 * not know what this product needs in order to work, and a list that hides the
 * finished items cannot tell them. `done` is drawn with a glyph and a label
 * rather than a colour, so it survives greyscale (docs/37 §9).
 *
 * ── AND THE STEPS ARE NOT LOCKED ─────────────────────────────────────────────
 * Every row is a live link regardless of the rows above it. Writing genuinely
 * works with no brain and no connection, so gating the third step behind the
 * first two would be a false claim about the product dressed up as guidance.
 * The PRIMARY is simply the first one not done.
 */
export function GetStarted({ now, steps }: { now: Date; steps: StartStep[] }) {
  const next = steps.find((step) => !step.done)

  return (
    <div className="space-y-8">
      {/* The greeting stays and the state line changes, exactly as `FirstRun`
          argues: the hour of the day is not a claim about their data, but
          "plan a week and it starts filling in" is advice for a workspace that
          has something to plan around. */}
      <header>
        <h1 className="type-h2">{greetingFor(now)}</h1>
        <p className="type-sm mt-1 text-muted">
          Nothing has happened in this workspace yet, which is exactly what a new one looks like.
        </p>
      </header>

      <section
        data-testid="home-get-started"
        aria-labelledby="home-get-started-head"
        className="surface-ring rounded-card bg-surface p-5"
      >
        <h2 id="home-get-started-head" className="type-h3 text-ink">
          Three things start it
        </h2>
        <p className="type-sm mt-1 max-w-[var(--measure-prose)] text-muted">
          Your week, your approvals queue and your numbers all fill in from these. You can do them
          in any order.
        </p>

        <ol className="mt-4 divide-y divide-line-soft border-t border-line-soft">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3 py-3">
              {/* Structural, not chromatic: a filled tick against an empty ring,
                  each with its own accessible name. */}
              <span
                aria-hidden
                className={
                  step.done
                    ? 'mt-1 grid size-[18px] shrink-0 place-items-center rounded-full bg-ink text-canvas'
                    : 'mt-1 size-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--line-firm)]'
                }
              >
                {step.done ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={step.href}
                  className="type-body rounded-sm font-[550] text-ink transition-micro hover:text-accent"
                >
                  {step.label}
                </Link>
                <span className="sr-only">{step.done ? ' — done' : ' — not done yet'}</span>
                <span className="type-meta block text-muted">{step.gets}</span>
              </span>
            </li>
          ))}
        </ol>

        {next ? (
          <div className="mt-4">
            {/* The page's one solid brand fill (docs/37 §16). */}
            <Link
              href={next.href}
              data-guide="home.get-started"
              className={buttonVariants({ variant: 'primary' })}
            >
              {next.label}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  )
}
