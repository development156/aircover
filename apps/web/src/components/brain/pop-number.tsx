'use client'

import { cn } from '@/lib/utils'

import { useJustChanged } from './use-just-changed'

/**
 * A count that lifts for a beat when it changes.
 *
 * NOT a count-up. docs/37 §12 reserves `--dur-count` for revealing one settled
 * value; a tally moving from 2 to 3 is a move between two states, and rolling
 * the digits would animate a number that has already settled. So the new
 * figure is shown at once and the glyph lifts 3px and lands, `--dur-base`.
 * The global reduced-motion block collapses the lift like everything else.
 */
export function PopNumber({ value, className }: { value: number; className?: string }) {
  const just = useJustChanged(value)
  return <span className={cn('num', just && 'num-pop', className)}>{value}</span>
}
