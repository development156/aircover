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

/**
 * Neutral counterpart for honest "this is not wired up yet" notes.
 *
 * `bg-s2`, NOT `bg-s1`. `--s1` is `var(--canvas)`, which is #ffffff in light mode
 * — the same value as `--surface` — so on a card this well had a fill identical to
 * the surface behind it and no visible edge at all. What the reader saw was 12px of
 * unexplained indent beside two flush sibling paragraphs, which reads as a
 * misalignment rather than a panel. `--surface-2` is the token documented for
 * "wells, subtle fills" and is distinct from the card in BOTH themes (#fafafa
 * light, #17171a dark), so the padding it already had now has something to be the
 * padding OF.
 */
export function InlineNote({ children, className }: InlineErrorProps) {
  return (
    <p className={cn('rounded-input bg-s2 px-3 py-2.5 text-[13px] text-muted', className)}>
      {children}
    </p>
  )
}
