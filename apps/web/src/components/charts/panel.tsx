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
 * ── WHERE `Legend` AND `Direction` WERE, AND WHY THEY ARE NOT ────────────────
 * Two more primitives were written for this kit and then deleted rather than
 * shipped: a legend of coloured dots with counts and a right-aligned total
 * (Nixtio's shape), and a `Direction` component rendering a triangle glyph plus
 * a word so that up and down never rest on hue.
 *
 * NOTHING ON EITHER SCREEN NEEDED THEM. There is no chart here with two series
 * to distinguish — the hatch that separates simulated from measured carries its
 * own label by construction (`Bars`' `hatchLabel`), which is the one case a
 * legend would have served. And there is no prior-period reading anywhere on
 * /home or /analytics to difference against, so a direction component could
 * only ever have been handed one number and asked to imply a second.
 *
 * A primitive with a confident comment and no call site is the worst thing to
 * leave in this codebase: the next reader takes the comment as a description of
 * what ships. The RULE they existed to keep is unaffected and is kept the
 * simpler way — no hue-coded up/down was introduced, so there is nothing for a
 * glyph to rescue. Rebuild them from this note when a chart earns one.
 */
