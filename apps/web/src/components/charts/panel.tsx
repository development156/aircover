import { cn } from '@/lib/utils'

/**
 * The container a chart lives in, and the shape it takes before it has one.
 *
 * ── PADDING IS THE WHOLE ARGUMENT ────────────────────────────────────────────
 * docs/37 §4 puts card padding at 20-24 and the shared `Card` is at 16. The
 * single most repeated note in the founder's brief is that the reference reads
 * calm because its panels breathe, so these are `p-5` and their heads are a
 * real row rather than a label crammed against a border. Scoped to this lane's
 * two screens rather than moved into `Card`, which renders on forty.
 */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('surface-ring rounded-card bg-surface p-5', className)}>
      {children}
    </section>
  )
}

/**
 * A panel's head: what it is, and one thing you can do about it.
 *
 * The trailing slot is deliberately singular. docs/37 §16 allows one primary
 * action per view, and a card head with three links is how a screen ends up
 * with nine accent-coloured targets and no focal point — the fragmentation the
 * accent meter counts as `regions`.
 */
export function PanelHead({
  title,
  sub,
  trailing,
}: {
  title: React.ReactNode
  sub?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="type-h3 text-ink">{title}</h2>
        {sub ? <p className="mt-1 type-meta text-muted">{sub}</p> : null}
      </div>
      {trailing ? <div className="flex-none">{trailing}</div> : null}
    </header>
  )
}

/**
 * WHAT A CHART LOOKS LIKE BEFORE IT IS A CHART.
 *
 * ── THE BRIEF'S ACTUAL COMPLAINT ─────────────────────────────────────────────
 * "The sparse state should look designed, not like a failure." MEASURED on
 * `page-dash-before__populated__home__full__1440__light`: the Credits spent
 * panel is 1030x130 of empty card with one centred sentence in the middle of
 * it — a container three times wider than anything in it, which docs/40 §3.2
 * already named on /analytics as the reason that page read apologetic, and
 * which had simply moved house.
 *
 * ── SO IT DRAWS THE AXIS IT IS WAITING TO FILL ───────────────────────────────
 * A dotted baseline at the height a real chart's baseline would sit, the
 * window's own extent labelled at each end, and the sentence left-aligned above
 * it. Nothing is invented: there is no line, no bar and no number that was not
 * measured. What the reader gets is the SHAPE of the thing that is coming,
 * which is the difference between "not yet" and "broken" — and it is what the
 * empty slot in a stat card already does with `is-unmeasured`, at panel scale.
 *
 * The dots are `--line`, the quietest rung on the ladder. They are chrome and
 * they must never be mistaken for a plotted zero, which is why the baseline is
 * DOTTED and a measured zero in `Bars` is a solid stub.
 */
export function ChartSparse({
  children,
  from,
  to,
}: {
  /** One sentence. What is missing, and what would fill it. */
  children: React.ReactNode
  /** The window's own ends, when they are known. Real dates, never invented. */
  from?: string
  to?: string
}) {
  return (
    <div data-testid="chart-sparse" className="flex h-[168px] flex-col max-narrow:h-[132px]">
      <p className="max-w-[var(--measure-prose)] type-sm text-muted">{children}</p>
      <div className="flex flex-1 items-end">
        <div className="w-full">
          <div
            aria-hidden
            className="h-px w-full"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, var(--line) 0 4px, transparent 4px 8px)',
            }}
          />
          {from || to ? (
            <div aria-hidden className="mt-2 flex justify-between type-meta text-muted">
              <span>{from}</span>
              <span>{to}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The legend: coloured dots with counts, and the total at the far right.
 *
 * Nixtio's shape, and its `Total: 284` in the trailing corner is the part worth
 * taking — a legend that also answers "how many altogether" saves the reader
 * adding four numbers a chart already knows.
 *
 * `swatch` is a className, not a colour, so every caller spends a token and
 * `design-lint` rule 1 keeps holding. A `hatched` entry takes `is-simulated`
 * and therefore carries its own label by construction.
 */
export function Legend({
  items,
  total,
}: {
  items: readonly { label: string; count: number | null; swatch: string }[]
  total?: { label: string; value: number } | null
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 type-meta text-muted">
          <span aria-hidden className={cn('size-2 flex-none rounded-full', item.swatch)} />
          {item.label}
          {item.count !== null ? (
            <span className="num font-semibold text-ink">{item.count.toLocaleString('en-IN')}</span>
          ) : null}
        </li>
      ))}
      {total ? (
        <li className="ml-auto type-meta text-muted">
          {total.label}{' '}
          <span className="num font-semibold text-ink">{total.value.toLocaleString('en-IN')}</span>
        </li>
      ) : null}
    </ul>
  )
}
