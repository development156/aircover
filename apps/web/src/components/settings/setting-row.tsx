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
     */
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-[650] text-ink">{label}</p>
        {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
      </div>
      {control ? <div className="min-w-0 max-w-full break-words">{control}</div> : null}
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
