import { cn } from '@/lib/utils'

/**
 * Loading shapes for route segments.
 *
 * ── WHY THESE EXIST ──────────────────────────────────────────────────────────
 * The app shipped with NO `loading.tsx` on any of its 22 route segments. In the
 * App Router that means no Suspense boundary, so a navigation blocks on the
 * server read with the PREVIOUS page still on screen and nothing to say a new one
 * is coming. MEASURED on a throttled connection: 4752ms to /posts, 5000ms to
 * /analytics, 4623ms to /wallet, with no skeleton, no spinner, no change of any
 * kind. On a phone that is indistinguishable from a dead tap.
 *
 * ── WHY SHAPES AND NOT A SPINNER ─────────────────────────────────────────────
 * docs/08 §6 rules out a bare spinner, and it is right: a spinner says "wait"
 * and nothing else, while a shape says what is coming. These deliberately mirror
 * the real furniture — a title of the same size, cards of the same height, a list
 * of the same row count — so the page does not visibly reflow when the data
 * lands. A generic grey block would swap one jolt for another.
 *
 * ── WHAT THEY MUST NEVER DO ──────────────────────────────────────────────────
 * Carry text. A skeleton with a number or a label in it is a claim about the
 * user's data made before the read returned, which is the one thing this port
 * may never invent. They are shapes only, and `aria-hidden` — the live region on
 * the wrapper is what a screen reader hears.
 */

/** One shimmering bar. `w`/`h` are Tailwind classes so callers control the shape. */
export function SkeletonBar({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn('block animate-pulse rounded-sm bg-s2', className)}
      // `bg-s2` (--surface-2), never `bg-s1`: --s1 is var(--canvas), which is the
      // same #ffffff as --surface in light mode, so a skeleton drawn in s1 on a
      // card is invisible. Learned the hard way in run 18.
    />
  )
}

/** A card-shaped placeholder: the ring and radius the real cards wear. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return <div className={cn('surface-ring rounded-card bg-surface p-4', className)}>{children}</div>
}

/**
 * The wrapper every `loading.tsx` returns.
 *
 * One polite live region for the whole screen, so a screen reader is told once
 * that the page is loading rather than hearing a dozen decorative shapes.
 */
export function SkeletonScreen({
  label = 'Loading',
  children,
}: {
  /** What is loading, in the user's words. Announced, never drawn. */
  label?: string
  children: React.ReactNode
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-grid">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** The page heading block: a 20px title and its 13px sub, at their real sizes. */
export function SkeletonPageTitle({ withSub = true }: { withSub?: boolean }) {
  return (
    <div className="space-y-2">
      <SkeletonBar className="h-5 w-[180px]" />
      {withSub ? <SkeletonBar className="h-[13px] w-[260px] opacity-70" /> : null}
    </div>
  )
}

/** `count` list rows at the height the real rows use. */
export function SkeletonRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className="flex items-center gap-3">
          <SkeletonBar className="h-4 w-[40%]" />
          <SkeletonBar className="ml-auto h-[18px] w-[64px] opacity-70" />
        </SkeletonCard>
      ))}
    </div>
  )
}
