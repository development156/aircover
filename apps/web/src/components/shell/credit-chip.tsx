import Link from 'next/link'

// Credit chip per docs/08 §6: pill, 1.5px --p border, tabular number, click →
// wallet. The number is AVAILABLE credits (total − held) — the same figure the
// wallet hero shows. Rendering total here would tell the user they can spend
// credits that are already reserved by an in-flight action.
//
// `null` means the balance could not be read, and renders as an em dash. It is
// deliberately NOT rendered as 0: "you have no credits" and "we could not read
// your balance" are different claims, and only one of them is true.
export function CreditChip({ credits }: { credits: number | null }) {
  return (
    <Link
      href="/wallet"
      data-guide="topbar.credits"
      aria-live="polite"
      aria-label={
        credits === null
          ? 'Credit balance unavailable. Open wallet'
          : `${credits.toLocaleString('en-IN')} credits available. Open wallet`
      }
      className="flex items-center gap-[7px] rounded-pill border-[1.5px] border-primary bg-bg px-[13px] py-1.5 font-semibold transition-micro hover:bg-tint-50 active:scale-[.97] dark:hover:bg-s2"
    >
      <span className="tabular-nums">
        {credits === null ? '—' : credits.toLocaleString('en-IN')}
      </span>
      <span className="text-[13px] font-medium text-muted">credits</span>
    </Link>
  )
}
