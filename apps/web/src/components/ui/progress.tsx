import { cn } from '@/lib/utils'

export interface ProgressProps {
  /** 0–100. */
  value: number
  className?: string
  label?: string
}

// shadcn/ui Progress, restyled per Design System §6: 7px bar, --s2 track,
// --p fill, 4px radius, width animates over --dur-2.
export function Progress({ value, className, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-[7px] w-full overflow-hidden rounded-[4px] bg-s2', className)}
    >
      <div
        className="h-full rounded-[4px] bg-primary transition-panel"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
