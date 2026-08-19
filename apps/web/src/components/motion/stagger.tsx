import { cn } from '@/lib/utils'

/**
 * How content arrives. One rhythm for the product (docs/26 §8.1).
 *
 * ── WHY A COMPONENT AND NOT A CLASS ──────────────────────────────────────────
 * The class alone would still need every call site to write `--i` by hand, and
 * a hand-written delay is the same failure mode as a hand-written font
 * shorthand: eleven screens, eleven rhythms. These set it for you.
 *
 * ── WHY THERE IS NO `duration` OR `delay` PROP ───────────────────────────────
 * Deliberately. The moment a caller can pass 320ms, the system has as many
 * timings as it has callers. If a screen genuinely needs a rhythm these cannot
 * express, that is a gap in docs/26 §8 — add it there first.
 *
 * ── THE CAP IS IN CSS ────────────────────────────────────────────────────────
 * `--i` is passed raw and clamped by `min(var(--i), var(--stagger-cap))` in
 * tokens.css, so a 40-row table does not take 1.6s to finish arriving and the
 * ceiling is written in exactly one place.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────
 * Handled entirely in tokens.css, which now zeroes `animation-delay` as well as
 * duration — without that, `fill: both` left staggered rows invisible for the
 * length of their delay and then snapped them in.
 *
 * These are server components. Nothing here needs the client.
 */

/** One element that arrives in sequence. `i` is its position in the group. */
export function StaggerItem({
  i,
  className,
  children,
}: {
  i: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('enter-step', className)} style={{ '--i': i } as React.CSSProperties}>
      {children}
    </div>
  )
}

/**
 * A group whose children arrive one after another.
 *
 * Each child is wrapped, so the wrapper becomes the flex/grid item and the
 * child fills it — `className` is the group's own layout classes, `itemClassName`
 * reaches each wrapper for cases where the item needs to stretch.
 */
export function Stagger({
  className,
  itemClassName,
  children,
}: {
  className?: string
  itemClassName?: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <div className={className}>
      {items.flat().map((child, i) => (
        <StaggerItem key={i} i={i} className={itemClassName}>
          {child}
        </StaggerItem>
      ))}
    </div>
  )
}

/** A single element that arrives, with no sequence. The plain entrance. */
export function Enter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('enter', className)}>{children}</div>
}
