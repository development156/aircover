'use client'

import { NUMBERED, type StepId } from './store'

/**
 * A hairline, not a bar. The count lives in type ("01 — 05") and the dot rides
 * the end of the line so progress has a POSITION, not just a length.
 *
 * The rivals step is past the last numbered question, so it holds at the last
 * number and 100% rather than inventing an "06 — 05".
 *
 * ── THE TOTAL IS DERIVED, BECAUSE IT WAS HARDCODED AND WENT STALE ────────────
 * It read `— 06` as a literal. Removing the References screen took `NUMBERED`
 * to five and the rail went on promising six, so the last screen would have
 * read "05 — 06" and a person would have been waiting for a question that no
 * longer exists. A count printed beside a list must come FROM the list.
 */
export function ProgressBar({ step }: { step: StepId }) {
  const index = NUMBERED.indexOf(step)
  const numbered = index >= 0
  if (!numbered && step !== 'comp') return null

  const value = numbered ? index + 1 : NUMBERED.length
  const pct = (value / NUMBERED.length) * 100

  return (
    <div className="prog" id="prog">
      <span className="prog__n tnum">
        <b id="pn">{String(value).padStart(2, '0')}</b> — {String(NUMBERED.length).padStart(2, '0')}
      </span>
      <div
        className="prog__track"
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={NUMBERED.length}
        aria-valuenow={value}
        id="pbar"
      >
        <div className="prog__fill" id="pfill" style={{ width: `${pct}%` }} />
        <div className="prog__dot" id="pdot" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}
