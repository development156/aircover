import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

const STEPS = ['Spark', 'Generate', 'Refine', 'Theme'] as const

export interface StepRailProps {
  /** 0-based index of the step currently in view. */
  activeIndex: number
}

// Left-hand progress rail for the 4-step "approve, don't author" flow
// (docs/superpowers spec). "Generate" is a sub-state of the Spark screen, not
// a separate route — the rail still calls it out as its own milestone.
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
