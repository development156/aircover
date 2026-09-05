import { cn } from '@/lib/utils'

/**
 * THE WELL BEHIND A "PICK ONE OF FOUR" CONTROL, WRITTEN ONCE.
 *
 * /planner carries two of these one row apart — the view control (Day · Week ·
 * Month · List) and the filter tabs (All · Drafts · Scheduled · Needs approval)
 * — and until now they were drawn in two different grammars for the same
 * interaction. The view control wore the kit's `.sl-seg`: a padded well with
 * the chosen item LIFTED onto `--surface`. The tabs were four loose pills on
 * the page ground, told apart by a ring the other three did not have.
 *
 * One page, one job, two shapes. That is the whole "reads as separate UI blocks
 * rather than one product" complaint, and restyling either one alone cannot fix
 * it, because the defect is that there are two.
 *
 * ── THE MEASUREMENTS ARE ON THE LADDER, NOT INVENTED ─────────────────────────
 * The kit's well is 3px-padded. `p-1` is 4px and `gap-0.5` is 2px, which are the
 * nearest rungs — and `design-lint` refuses `p-[3px]` outright in every planner
 * file but the two that already carry a baseline for it. One pixel of padding
 * is not worth an exemption, and a value off the ladder in a NEW shared file is
 * how the ladder stops meaning anything.
 *
 * Radii follow docs/37 §5: the well is `rounded-md` (20px) and an item is
 * `rounded-sm` (12px), because "a nested surface's radius is the parent's minus
 * one step".
 */
export function Segmented({
  label,
  className,
  children,
}: {
  /** Names the group for assistive tech. Every one of these is a `<nav>`. */
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <nav
      aria-label={label}
      className={cn('inline-flex flex-wrap items-center gap-0.5 rounded-md bg-s2 p-1', className)}
    >
      {children}
    </nav>
  )
}

/**
 * One item's classes. Returned rather than rendered, because the two callers
 * put different things inside — an icon and a label, or a label and a live
 * count — and a component that took both as props would be a worse version of
 * `children`.
 *
 * The ACTIVE item is raised onto `--surface` with the resting card shadow, not
 * pushed into a darker fill. That inversion is the point of the control: the
 * chosen segment reads as lifted out of the group. `shadow-card` is
 * `0 1px 2px rgba(0,0,0,.03)` — docs/37 §6 calls it "deliberately almost
 * nothing", which is the right amount for a 28px chip.
 */
export function segmentedItem(active: boolean, className?: string): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-sm px-3 type-sm transition-micro',
    // 44px on a phone: the product's touch floor, and the reason this is a
    // min-height rather than a height — the desktop size must not grow.
    'max-narrow:min-h-11',
    active ? 'bg-surface font-[650] text-ink shadow-card' : 'text-muted hover:text-ink',
    className,
  )
}
