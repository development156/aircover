'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

import { measureNow } from '@/app/actions/measure'
import { Button } from '@/components/ui/button'
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
 */
export function MeasureNow({ lastLine }: { lastLine: string }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<MeasureNowState | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await measureNow())
          })
        }
      >
        <RefreshCw size={14} aria-hidden />
        Measure now
        <span className="sr-only"> (free)</span>
      </Button>
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
