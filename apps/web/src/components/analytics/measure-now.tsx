'use client'

import { useState, useTransition } from 'react'

import { measureNow } from '@/app/actions/measure'
import type { MeasureNowState } from '@/lib/analytics/measure-state'

/**
 * "MEASURE NOW" — the nightly pass, on demand, for this workspace.
 *
 * The line beside the button is the last time Sahoda ASKED, rendered by the
 * server so the page can say it before anybody presses anything. The result
 * sentence replaces it for the rest of this render; the next paint (the action
 * revalidates the page) puts the fresh stamp back.
 *
 * `role="status"` on the outcome, so a screen reader hears the answer without
 * focus leaving the button. Every outcome is a sentence, including the
 * refusals: a cooldown says how long, a switched-off environment says so.
 *
 * ── A PLAIN <button>, ON PURPOSE ─────────────────────────────────────────────
 * This is the FIRST client island on /analytics and /report, and the build's
 * js-budget failed by 34 kB the moment it imported `ui/button` (radix Slot,
 * cva, clsx, tailwind-merge, a lucide icon). The classes below are the
 * secondary `sm` variant's, copied rather than imported, so the island costs
 * the component and the action reference and nothing else.
 */
export function MeasureNow({ lastLine }: { lastLine: string }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<MeasureNowState | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await measureNow())
          })
        }
        className="surface-ring-firm inline-flex h-7 shrink-0 items-center justify-center rounded-sm bg-surface px-2 type-meta leading-none font-[550] text-ink transition-micro hover:bg-s2 active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-45 max-narrow:min-h-[44px]"
      >
        {pending ? 'Measuring…' : 'Measure now'}
        <span className="sr-only"> (free)</span>
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`type-meta ${state && !state.ok ? 'text-danger' : 'text-muted'}`}
      >
        {state ? state.message : `${lastLine} · free`}
      </p>
    </div>
  )
}
