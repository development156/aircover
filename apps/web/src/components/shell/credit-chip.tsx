import Link from 'next/link'

import type { BalanceRead } from '@/lib/wallet/read'

// Credit chip per docs/08 §6: pill, 1.5px --p border, tabular number, click →
// wallet. The number is AVAILABLE credits (total − held) — the same figure the
// wallet hero shows. Rendering total here would tell the user they can spend
// credits that are already reserved by an in-flight action.
//
// It takes the same `BalanceRead` union /wallet does, so the two cannot tell one
// user two different stories. Three answers, three claims:
//
//   ok            the number. A real zero renders as 0 — that is knowledge.
//   no-workspace  no number at all. There is no wallet yet, so an em dash
//                 ("we could not read it") points at a fault that does not
//                 exist, and a 0 would invent a balance outright.
//   unreadable    an em dash. Deliberately NOT 0: "we could not read your
//                 balance" and "you have no credits" are different claims and
//                 only one is true — a funded user shown 0 stops working.

const NO_WALLET_TEXT = 'No wallet yet'

interface ChipContent {
  /** What the pill shows. */
  text: string
  /** Rendered in the muted suffix slot, or null when the text stands alone. */
  suffix: string | null
  label: string
}

function contentFor(balance: BalanceRead): ChipContent {
  if (balance.status === 'ok') {
    const credits = balance.balance.available.toLocaleString('en-IN')

    return { text: credits, suffix: 'credits', label: `${credits} credits available. Open wallet` }
  }

  if (balance.status === 'no-workspace') {
    return {
      text: NO_WALLET_TEXT,
      suffix: null,
      label: 'No wallet yet. Open wallet to create a workspace',
    }
  }

  return { text: '—', suffix: 'credits', label: 'Credit balance unavailable. Open wallet' }
}

export function CreditChip({ balance }: { balance: BalanceRead }) {
  const content = contentFor(balance)

  // `flex-none whitespace-nowrap` below for the same reason as the brain ring
  // beside it — see that component. This chip reads "100 credits" for a funded
  // workspace and never wrapped in testing, but its `no-workspace` state is the
  // three-word NO_WALLET_TEXT: the identical shape, in a state no account with a
  // workspace can display. Fixing only the pill that happened to reproduce would
  // have left its sibling walking through the same hole.
  return (
    <Link
      href="/wallet"
      data-guide="topbar.credits"
      aria-live="polite"
      aria-label={content.label}
      className="flex flex-none items-center gap-[7px] rounded-pill border-[1.5px] border-primary bg-bg px-[13px] py-1.5 font-semibold whitespace-nowrap transition-micro hover:bg-tint-50 active:scale-[.97] max-narrow:min-h-[44px] dark:hover:bg-s2"
    >
      {/* `.num` (tokens.css v3: mono + tabular-nums) only where there is a
          number to align — v3 puts mono in exactly three places and the topbar
          credit pill is one of them. "No wallet yet" is prose, so it stays sans. */}
      <span
        className={balance.status === 'ok' || balance.status === 'unreadable' ? 'num' : undefined}
      >
        {content.text}
      </span>
      {content.suffix !== null ? (
        <span className="text-[13px] font-medium text-muted">{content.suffix}</span>
      ) : null}
    </Link>
  )
}
