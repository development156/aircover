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
//
// ── IT FAILED AT BOTH ENDS OF THE RANGE, IN OPPOSITE WAYS ────────────────────
// MEASURED at 1440: `wide:flex-col` stacked the four rows and, because a flex
// column stretches its children, the current step became a 1032px brand-wash
// band carrying the two words "The door". The largest painted element on the
// screen held the least information on it — docs/27 §1's headline defect,
// reproduced on the first screen of onboarding.
//
// MEASURED at 390: the four rows sat in a horizontal `overflow-x-auto` with no
// fade, no partial glyph and no scrollbar, so step 4 — "Reveal", the payoff the
// whole flow is named after — was invisible on the primary device with nothing
// to say it existed.
//
// One change answers both. At wide the row is `w-fit`, so the wash hugs its own
// label instead of the container. At narrow only the CURRENT step keeps its
// word and the others shrink to their numbered disc, which fits four steps in
// 390px with room to spare and removes the scroller entirely.
//
// The labels of the shrunk steps go `sr-only`, never `hidden`: `display:none`
// takes a node out of the accessibility tree, which is how nine nav links once
// lost their names. A screen reader still hears all four, in order.
export function StepRail({ activeIndex }: StepRailProps) {
  return (
    <nav
      aria-label="Brand Brain setup steps"
      data-guide="onboarding.steps"
      className="flex flex-wrap items-center gap-2 wide:flex-col wide:items-start wide:gap-1.5"
    >
      {/* The count in words, for anyone who cannot see four discs at once. It is
          also the only place the TOTAL is stated, which a shrunk rail otherwise
          leaves to inference. */}
      <span className="sr-only">
        Step {activeIndex + 1} of {STEPS.length}: {STEPS[activeIndex]}
      </span>
      {STEPS.map((label, index) => {
        const status = index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'upcoming'
        return (
          <div
            key={label}
            aria-current={status === 'current' ? 'step' : undefined}
            // A nav row, so it wears the rail's shape: 34px, 6px radius, and
            // the accent wash on the current step. Not a pill — a full-width
            // pill reads as a button you can press, and these are not pressable.
            //
            // `w-fit` at wide is the load-bearing half of the fix above: without
            // it a flex column stretches every child to the container and the
            // wash spans the page.
            className={cn(
              'flex h-[34px] shrink-0 items-center gap-2.5 rounded-sm px-3 text-[13px] font-[550] transition-micro wide:w-fit',
              // On a phone a step that is not the current one is its number and
              // nothing else, so all four fit without a scroller.
              status !== 'current' && 'max-narrow:gap-0 max-narrow:px-1.5',
              status === 'current' && 'bg-brand-wash font-semibold text-accent',
              status === 'upcoming' && 'text-muted',
              // `--ok` is black now, so "done" reads as full-strength ink
              // rather than as a colour. The check glyph carries the meaning.
              status === 'done' && 'text-ink',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-pill text-[10px] font-semibold tabular-nums',
                // Done is an inked disc, current is the orange one. Only one
                // step is ever current, so orange stays rationed to it.
                status === 'done' && 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]',
                status === 'current' && 'bg-primary text-primary-foreground',
                status === 'upcoming' && 'bg-s2 text-muted',
              )}
            >
              {status === 'done' ? <Check size={12} aria-hidden /> : index + 1}
            </span>
            <span className={cn(status !== 'current' && 'max-narrow:sr-only')}>{label}</span>
          </div>
        )
      })}
    </nav>
  )
}
