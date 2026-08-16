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
}: {
  label: string
  hint?: string
  control?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-[650] text-ink">{label}</p>
        {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
      </div>
      {control ? <div className="flex-none">{control}</div> : null}
    </div>
  )
}

/** A settings card — `.card` with a `.card__head` and a padded body. */
export function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-ring rounded-card bg-surface">
      <header className="flex min-h-[46px] items-center border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
      </header>
      <div className="px-4 py-1">{children}</div>
    </section>
  )
}
