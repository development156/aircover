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
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-pill px-3 py-2 text-[13px] font-semibold transition-micro',
              status === 'current' && 'bg-tint-50 text-accent dark:bg-s2',
              status === 'upcoming' && 'text-faint',
              status === 'done' && 'text-ok',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-pill font-mono text-[10px] font-semibold',
                status === 'done' && 'bg-ok-bg text-ok',
                status === 'current' && 'bg-primary text-primary-foreground',
                status === 'upcoming' && 'bg-s2 text-faint',
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
