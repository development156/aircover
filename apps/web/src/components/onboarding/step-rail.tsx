import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

const STEPS = ['You', 'The door', 'One question', 'Reveal'] as const

export interface StepRailProps {
  /** 0-based index of the step currently in view. */
  activeIndex: number
}

// Progress rail for the four screens. Three of them ask the user something and
// the fourth answers; the rail is named after that shape rather than after the
// machinery ("Generate", "Resolve"), because what the user is doing on each
// screen is the only thing worth signposting.
export function StepRail({ activeIndex }: StepRailProps) {
  return (
    <nav
      aria-label="Brand Brain setup steps"
      data-guide="onboarding.steps"
      className="flex gap-2 overflow-x-auto wide:flex-col wide:gap-1.5 wide:overflow-visible"
    >
      {STEPS.map((label, index) => {
        const status = index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'upcoming'
        return (
          <div
            key={label}
            aria-current={status === 'current' ? 'step' : undefined}
            // A nav row, so it wears the rail's shape: 34px, 6px radius, and
            // the accent wash on the current step. Not a pill — a full-width
            // pill reads as a button you can press, and these are not pressable.
            className={cn(
              'flex h-[34px] shrink-0 items-center gap-2.5 rounded-sm px-3 text-[13px] font-[550] transition-micro',
              status === 'current' && 'bg-brand-wash font-semibold text-accent',
              status === 'upcoming' && 'text-muted',
              // `--ok` is black now, so "done" reads as full-strength ink
              // rather than as a colour. The check glyph carries the meaning.
              status === 'done' && 'text-ink',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums',
                // Done is an inked disc, current is the orange one. Only one
                // step is ever current, so orange stays rationed to it.
                status === 'done' && 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]',
                status === 'current' && 'bg-primary text-primary-foreground',
                status === 'upcoming' && 'bg-s2 text-muted',
              )}
            >
              {status === 'done' ? <Check size={12} aria-hidden /> : index + 1}
            </span>
            {label}
          </div>
        )
      })}
    </nav>
  )
}
