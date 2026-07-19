import { Progress } from '@/components/ui/progress'

export interface SignalClarityMeterProps {
  percent: number
}

/** Fills as Refine's editable fields go from blank to confirmed/enriched. */
export function SignalClarityMeter({ percent }: SignalClarityMeterProps) {
  return (
    <div
      data-guide="onboarding.signal-clarity"
      className="rounded-card border border-line bg-bg p-4 shadow-card"
    >
      <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">
        <span>Signal clarity</span>
        <span className="text-accent tabular-nums">{percent}%</span>
      </div>
      <Progress value={percent} label="Signal clarity" />
    </div>
  )
}
