'use client'

import { useState, useTransition } from 'react'
import {
  MAX_AUTOPILOT_CANCEL_MINUTES,
  MAX_AUTOPILOT_DAILY_CAP,
  MIN_AUTOPILOT_CANCEL_MINUTES,
  MIN_AUTOPILOT_DAILY_CAP,
} from '@sahoda/shared'

import { setLoopSettings } from '@/app/actions/loop-dial'
import { Button } from '@/components/ui/button'

/**
 * THE TWO PROMISES AUTOPILOT MAKES, AS NUMBERS THE CUSTOMER CHOOSES.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `autopilot_daily_cap` and `autopilot_cancel_minutes` are `not null` with
 * defaults of 3 and 30, and until now NOTHING in the product wrote them. Every
 * workspace ran at those two figures and no screen said so, let alone offered
 * to change them. They are not settings in the ordinary sense: they are the two
 * things a person is promised when they hand over posting, and a promise nobody
 * can adjust is a promise made on their behalf.
 *
 * ── THE FIGURES ARE SHOWN, NOT LEFT BLANK ────────────────────────────────────
 * An empty field reads as "no limit", which would be the worst possible reading
 * of a control on autopilot. The current values arrive as props from the
 * snapshot, which reads the columns; a workspace with no settings row at all
 * shows the column defaults, because those are exactly what it will run at the
 * moment it has one.
 *
 * ── WHAT THE COPY MUST NOT CLAIM ─────────────────────────────────────────────
 * The tick runs every ten minutes. A window shorter than that closes BETWEEN
 * ticks, so the post goes out on the following one — later than the number
 * says, never earlier. That is the safe direction, and it is why the sentence
 * below says "at least" rather than promising a post goes the moment the window
 * shuts. Saying "your post goes out after 5 minutes" would be a claim the
 * schedule cannot keep.
 */

export interface AutopilotLimitsProps {
  dailyCap: number
  cancelMinutes: number
  /** Whether any channel is actually set to autopilot. Changes what is at stake, not what is shown. */
  armed: boolean
}

export function AutopilotLimits({ dailyCap, cancelMinutes, armed }: AutopilotLimitsProps) {
  const [cap, setCap] = useState(String(dailyCap))
  const [minutes, setMinutes] = useState(String(cancelMinutes))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = cap !== String(dailyCap) || minutes !== String(cancelMinutes)

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await setLoopSettings({
        autopilotDailyCap: cap,
        autopilotCancelMinutes: minutes,
      })
      if (!result.ok) {
        setError(result.message ?? 'Sahoda could not save that.')
        return
      }
      setSaved(true)
    })
  }

  return (
    <section aria-labelledby="autopilot-limits" className="flex flex-col gap-3">
      <div>
        <h2 id="autopilot-limits" className="type-h2">
          Autopilot limits
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          {armed
            ? 'These two hold for every channel you have set to send on its own.'
            : 'These two will hold if you ever set a channel to send on its own. Nothing is set to now.'}
        </p>
      </div>

      <div className="surface-ring grid gap-4 rounded-card bg-surface p-4 narrow:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="type-sm text-ink">Most posts a day</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_AUTOPILOT_DAILY_CAP}
            max={MAX_AUTOPILOT_DAILY_CAP}
            value={cap}
            disabled={pending}
            onChange={(e) => setCap(e.target.value)}
            className="num surface-ring w-full rounded-input bg-canvas px-3 py-2 type-body text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted"
          />
          <span className="type-sm text-muted">
            Counted in your own day, not ours. Zero means Sahoda sends nothing on its own.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="type-sm text-ink">Minutes to change your mind</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_AUTOPILOT_CANCEL_MINUTES}
            max={MAX_AUTOPILOT_CANCEL_MINUTES}
            value={minutes}
            disabled={pending}
            onChange={(e) => setMinutes(e.target.value)}
            className="num surface-ring w-full rounded-input bg-canvas px-3 py-2 type-body text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted"
          />
          <span className="type-sm text-muted">
            Sahoda waits at least this long before handing a post over, and shows it above the whole
            time.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save limits'}
        </Button>
        {saved && !dirty ? <p className="type-sm text-muted">Saved.</p> : null}
        {error ? (
          <p role="alert" className="type-sm text-muted">
            {error} Nothing changed, and nothing was charged.
          </p>
        ) : null}
      </div>
    </section>
  )
}
