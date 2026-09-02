'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

const STEP_MS = 1800

export interface PendingLinesProps {
  /** Honest, ordered descriptions of what is actually happening. */
  lines: readonly string[]
  className?: string
}

/**
 * Pending copy for a model call (docs/08 §6: never a bare spinner).
 *
 * Walks the caller's lines once and STOPS on the last one. It deliberately does
 * not loop: re-cycling would imply repeated progress we have no signal for, and
 * the last line is the honest steady state ("still waiting on the model").
 */
export function PendingLines({ lines, className }: PendingLinesProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (lines.length <= 1) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1 < lines.length ? current + 1 : current))
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [lines])

  const line = lines[index] ?? lines[0] ?? ''

  return (
    <p
      aria-live="polite"
      className={cn('flex items-center gap-2 text-[13px] text-muted', className)}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 motion-safe:animate-pulse rounded-pill bg-accent"
      />
      {line}
    </p>
  )
}
