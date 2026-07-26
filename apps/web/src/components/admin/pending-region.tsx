/**
 * A region of `/admin/dev` that is not built yet, labelled with the card that
 * builds it.
 *
 * This exists so the shell can ship before its contents without any part of it
 * implying data it does not have. An empty card with a heading reads as "no
 * data" — which would be a lie about a board that has 37 rows in it. Naming the
 * card makes the gap a schedule, not a failure, and the same board this panel
 * renders is where that card can be watched.
 */
export function PendingRegion({
  title,
  card,
  builds,
  className,
}: {
  title: string
  card: string
  builds: string
  className?: string
}) {
  return (
    <section
      aria-labelledby={`pending-${card}`}
      className={`rounded-card border border-dashed border-line bg-s1 p-5 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2">
        <h2 id={`pending-${card}`} className="text-[15px] font-bold tracking-[-0.01em]">
          {title}
        </h2>
        <span className="rounded-pill bg-s2 px-2 py-[2px] font-mono text-[11px] font-semibold text-muted tabular-nums">
          {card}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-muted">{builds}</p>
    </section>
  )
}
