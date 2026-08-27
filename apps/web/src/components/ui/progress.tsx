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
      {/* ── A FILL NARROWER THAN IT IS TALL IS A DOT, NOT A BAR ────────────────
          MEASURED in Chromium at 1440 on the composer, where four meters sit on
          one screen: LinkedIn at 26 of 3,000 characters rendered the fill
          **7.5px wide** against its own 7px height, with a 4px radius. At that
          size the radius closes both ends into a circle and the fill stops
          reading as a bar at all: it is a small orange dot floating at the left
          edge of an empty track, which is what it was reported as.

          Instagram at 26 of 2,200 measured ~10px, Google Business at 52 of 1,500
          measured 30px, and X at 26 of 280 measured 81px — so the defect appears
          exactly where a channel's limit is generous, which is most of them.

          A floor of 14px, twice the height, is the narrowest fill that still
          reads as a rounded bar. It only applies once there is something to
          show: at zero the fill stays zero, because a stub on an untouched post
          would claim progress that has not happened. */}
      <div
        className="h-full rounded-[4px] bg-primary transition-panel"
        style={{ width: `${clamped}%`, minWidth: clamped > 0 ? 14 : 0 }}
      />
    </div>
  )
}
