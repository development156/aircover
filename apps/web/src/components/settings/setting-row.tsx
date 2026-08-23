import { cn } from '@/lib/utils'

/**
 * One setting: label, optional hint, and its control on the right
 * (reference's `row()` helper).
 *
 * The control slot is deliberately generic — most rows in this product have no
 * control at all, because the value is READ-ONLY here and owned by the page
 * that can actually change it. Rendering a disabled input to fill the slot
 * would imply an edit that is not coming.
 */
export function SettingRow({
  label,
  hint,
  control,
  children,
}: {
  label: string
  hint?: React.ReactNode
  control?: React.ReactNode
  /** Extra detail under the row — a disclosure, a status line, a progress read. */
  children?: React.ReactNode
}) {
  return (
    /**
     * `flex-wrap` and a `min-w-0` control slot, because the control slot holds
     * CUSTOMER DATA and `flex-none` sizes to it unconditionally.
     *
     * MEASURED at 390px on a seeded account: a 48-character sign-in address ran
     * the row 3px past the card and the whole page scrolled sideways. The QA
     * account's address is 29 characters, which is why four passes never saw it
     * — the same blind spot the no-workspace states sit in.
     *
     * This is run 20's guard note read in the other direction: `flex-none` is
     * the cure for a label that wraps, and applied to an item that can be any
     * length it stops the wrap by pushing the row off-screen instead. A value
     * that will not fit drops to its own line; a button, which is short and
     * fixed, never reaches that point and keeps its size.
     *
     * ── AND THE ROW STACKS ON A PHONE RATHER THAN SQUEEZING ──────────────────
     * MEASURED at 390 on a seeded account: the Name row put a 200px input and a
     * 60px Save beside the label, leaving the label column ~130px, and
     * "What this workspace is called in the switcher." set as FOUR lines beside
     * a one-line control. Nothing overflowed and every gap was on the 4pt scale
     * — the row had simply stopped being a row and become two columns of very
     * different heights.
     *
     * `flex-wrap` could not save it: wrap only fires when an item cannot fit,
     * and a text block always "fits" because it wraps first. So the row is told
     * to stack below `narrow` instead of being left to discover it.
     */
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft py-[13px] last:border-b-0 max-narrow:flex-col max-narrow:items-stretch max-narrow:gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="type-sm font-[650] text-ink">{label}</p>
        {hint ? <div className="mt-1 type-meta text-muted">{hint}</div> : null}
      </div>
      {control ? (
        <div className="min-w-0 max-w-full break-words max-narrow:self-start">{control}</div>
      ) : null}
      {children ? <div className="mt-2 w-full basis-full">{children}</div> : null}
    </div>
  )
}

/**
 * A settings card — `.card` with a `.card__head` and a padded body.
 *
 * ── ONE CARD GRAMMAR PER SCREEN ──────────────────────────────────────────────
 * `/settings` used to render two cards in two different languages: this one
 * (`surface-ring` + `bg-surface`, a titled head, hairline-separated rows) and
 * `YourDataPanel`'s own `border border-line bg-bg shadow-card` with an inline
 * `<h2>` and free-form prose. Two treatments on one screen read as two products,
 * and the second one also broke docs/37 §6 twice over — a border AND a shadow,
 * on a card that is resting.
 *
 * `hint` exists so a card can carry one lead line without inventing a second
 * heading level to hold it.
 */
export function SettingCard({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  /**
   * A <section> with no accessible name is not exposed as a region at all, so a
   * screen-reader user cannot jump between the cards on this page. The heading
   * is right there; it just has to be pointed at. Derived from the title rather
   * than from `useId`, because this renders on the server and a hook cannot.
   */
  const headingId = `setting-card-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`

  return (
    <section
      aria-labelledby={headingId}
      className={cn('surface-ring rounded-card bg-surface', className)}
    >
      <header className="flex min-h-[46px] flex-col justify-center gap-1 border-b border-line-soft px-4 py-3">
        <h2 id={headingId} className="type-h3">
          {title}
        </h2>
        {hint ? <p className="type-meta text-muted">{hint}</p> : null}
      </header>
      <div className="px-4 py-1">{children}</div>
    </section>
  )
}
