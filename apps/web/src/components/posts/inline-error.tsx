import { cn } from '@/lib/utils'

export interface InlineErrorProps {
  children: React.ReactNode
  className?: string
}

/**
 * The one inline error banner shape (docs/08 §6). Callers supply copy that says
 * what happened → what we did → one action; this owns only the container.
 */
export function InlineError({ children, className }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Neutral counterpart for honest "this is not wired up yet" notes. */
export function InlineNote({ children, className }: InlineErrorProps) {
  return (
    <p className={cn('rounded-input bg-s1 px-3 py-2.5 text-[13px] text-muted', className)}>
      {children}
    </p>
  )
}
