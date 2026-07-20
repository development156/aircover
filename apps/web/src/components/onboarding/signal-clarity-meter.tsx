import { Progress } from '@/components/ui/progress'

export interface SignalClarityMeterProps {
  percent: number
}

/**
 * Fills as Refine's editable fields go from blank to filled.
 *
 * Labelled "Fields filled", NOT "Signal clarity": it counts non-empty leaves on
 * the payload, and a successful resolve fills every one — so it reads ~100% on
 * every real brain. Calling that "clarity" put a 100% meter directly above the
 * Signal lock badge saying "Weak signal — inputs conflict", which is the model
 * honestly reporting it INFERRED those fields from almost no input. Two
 * different things; only the badge speaks to confidence.
 */
export function SignalClarityMeter({ percent }: SignalClarityMeterProps) {
  return (
    <div
      data-guide="onboarding.signal-clarity"
      className="rounded-card border border-line bg-bg p-4 shadow-card"
    >
      <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">
        <span>Fields filled</span>
        <span className="text-accent tabular-nums">{percent}%</span>
      </div>
      <Progress value={percent} label="Fields filled" />
    </div>
  )
}
