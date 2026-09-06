import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'

import type { SetupLadder } from '@/lib/home/setup'
import { cn } from '@/lib/utils'

/**
 * The setup ladder, as one quiet row under the greeting.
 *
 * ── NOT A CARD ───────────────────────────────────────────────────────────────
 * The page already has eight ringed regions. This is a sentence with three
 * marks in it, on the page ground, so it reads as the greeting's second line
 * rather than as a ninth box. It renders nothing at all once the three doors
 * are done, which is the only state a finished workspace ever sees.
 *
 * ── ONE ACCENT, AND IT IS NOT A FILL ─────────────────────────────────────────
 * docs/37 §16: one solid brand fill per view, and Home's is `Create post`. The
 * next door is an ink link with an arrow; the done rungs are a tick and two
 * muted words. docs/37 §2.4: the tick is achromatic because "it worked" never
 * needs to shout.
 */
export function SetupStrip({ ladder }: { ladder: SetupLadder }) {
  if (ladder.remaining === 0) return null

  const done = ladder.steps.length - ladder.remaining

  return (
    <section
      aria-labelledby="home-setup-head"
      data-guide="home.setup"
      className="flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      <h2 id="home-setup-head" className="type-sm font-[550] text-ink">
        <span className="tabular-nums">{done}</span> of{' '}
        <span className="tabular-nums">{ladder.steps.length}</span> set up
      </h2>
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {ladder.steps.map((step) => (
          <li key={step.id} className="flex items-center gap-1.5 type-sm">
            {step.done ? (
              <>
                <span
                  aria-hidden
                  className="grid size-4 place-items-center rounded-pill bg-ok-bg text-ok"
                >
                  <Check size={11} strokeWidth={2.2} />
                </span>
                <span className="text-muted">{step.doneLabel}</span>
              </>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  'inline-flex items-center gap-1 rounded-sm transition-micro hover:text-accent max-narrow:min-h-[44px]',
                  step.id === ladder.next?.id ? 'font-[550] text-ink' : 'text-muted',
                )}
              >
                {step.label}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
