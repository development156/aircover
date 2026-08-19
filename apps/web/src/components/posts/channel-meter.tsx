'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { ChannelMeter } from '@/lib/posts/counters'
import { describeViolation, presentViolation } from '@/lib/posts/violation-copy'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'

export interface ChannelMeterViewProps {
  meter: ChannelMeter
  /**
   * One-click fixes keyed by violation code. A `fixLabel` is rendered as a
   * button ONLY when a handler exists — an affordance we cannot honour (media
   * problems need a different file) is shown as plain text instead.
   */
  fixes?: Readonly<Partial<Record<string, () => void>>>
}

/** Live character meter + the engine's violations for one channel. */
export function ChannelMeterView({ meter, fixes }: ChannelMeterViewProps) {
  const percent = meter.maxChars > 0 ? (meter.charCount / meter.maxChars) * 100 : 0

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-muted">Characters</span>
        <span
          className={cn('text-[12.5px] font-semibold', meter.over ? 'text-danger' : 'text-muted')}
        >
          <span className="tabular-nums">{meter.charCount.toLocaleString('en-IN')}</span>
          {/* ── THE SEPARATOR WAS THE ONLY THING KEEPING THESE TWO NUMBERS APART ──
              MEASURED from a Playwright accessibility snapshot: with the slash
              `aria-hidden` and nothing in its place, X's meter read out as
              "Characters 55280" and LinkedIn's as "4413,000". Every digit was
              correct and the sentence was nonsense — the same class of defect as
              a regression that passed every numeric check and rendered "S Sah".
              The slash stays visual; a real word carries the reading. */}
          <span className="sr-only"> of </span>
          <span aria-hidden> / </span>
          <span className="tabular-nums">{meter.maxChars.toLocaleString('en-IN')}</span>
        </span>
      </div>

      <Progress value={percent} label={`${meter.charCount} of ${meter.maxChars} characters used`} />

      {meter.violations.length > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {meter.violations.map((violation) => {
            const display = describeViolation(violation)
            const fix = display.fixLabel !== undefined ? fixes?.[display.code] : undefined
            return (
              <li
                key={`${display.code}-${display.message}`}
                role="alert"
                className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
              >
                {/* Presented, not re-gated: the channel key becomes its display
                    label and 4-digit numbers get the same separators the counter
                    above already uses. See presentViolation. */}
                <p>{presentViolation(display.message, CHANNEL_LABELS)}</p>
                {display.fixLabel !== undefined ? (
                  fix !== undefined ? (
                    <button
                      type="button"
                      onClick={fix}
                      className="mt-1.5 rounded-pill border border-danger px-2.5 py-1 text-[12px] font-semibold transition-micro hover:bg-danger hover:text-white"
                    >
                      {display.fixLabel}
                    </button>
                  ) : (
                    <p className="mt-1 text-[12px] opacity-80">{display.fixLabel} to continue.</p>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
