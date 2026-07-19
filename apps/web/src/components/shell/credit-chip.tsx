// Credit chip per docs/08 §6: pill, 1.5px --p border, tabular number, pulses
// once on change (animation lands with live balance), click → wallet.
// Live balance + wallet link arrive with the ledger read path.
export function CreditChip({ credits }: { credits: number | null }) {
  return (
    <div
      data-guide="topbar.credits"
      aria-live="polite"
      className="flex items-center gap-[7px] rounded-pill border-[1.5px] border-primary bg-bg px-[13px] py-1.5 font-semibold"
    >
      <span className="tabular-nums">
        {credits === null ? '—' : credits.toLocaleString('en-IN')}
      </span>
      <span className="text-[13px] font-medium text-muted">credits</span>
    </div>
  )
}
