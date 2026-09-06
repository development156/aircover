import Link from 'next/link'

import { Unreadable } from '@/components/design-system/absence-row'
import type { BalanceRead } from '@/lib/wallet/read'
import { cn } from '@/lib/utils'
import { creditWord } from '@/lib/credit-words'

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
//   unreadable    the UNREADABLE MARK (docs/26 §4) — a broken rule, not a bare
//                 dash. Deliberately NOT 0: "we could not read your balance"
//                 and "you have no credits" are different claims and only one
//                 is true — a funded user shown 0 stops working. It is not a
//                 dash either, because a dash is also what "not yet measured"
//                 looked like, and those are different claims too. The mark is
//                 structural, so the two are told apart without reading.

const NO_WALLET_TEXT = 'No wallet yet'

interface ChipContent {
  /** What the pill shows. `null` renders the Unreadable mark instead. */
  text: string | null
  /** Rendered in the muted suffix slot, or null when the text stands alone. */
  suffix: string | null
  label: string
}

function contentFor(balance: BalanceRead): ChipContent {
  if (balance.status === 'ok') {
    const credits = balance.balance.available.toLocaleString('en-IN')

    const word = creditWord(balance.balance.available)

    return {
      text: credits,
      suffix: word,
      label: `${credits} ${word} available. Open wallet`,
    }
  }

  if (balance.status === 'no-workspace') {
    return {
      text: NO_WALLET_TEXT,
      suffix: null,
      label: 'No wallet yet. Open wallet to create a workspace',
    }
  }

  return { text: null, suffix: 'credits', label: 'Credit balance unavailable. Open wallet' }
}

export function CreditChip({ balance }: { balance: BalanceRead }) {
  const content = contentFor(balance)

  /**
   * ── TWO CONTROLS SAYING THE SAME THING, IN 390px ─────────────────────────────
   * MEASURED on a seeded account with no workspace: "Create workspace" painted to
   * x=212 while this pill starts at x=161 — 51px of the button covered, 11px at
   * 430px. Neither element is at fault on its own. `min-w-0` lets the switcher
   * slot shrink; the button inside is `shrink-0` and does not, so it spills past
   * its own wrapper and this pill, painted later, lands on top of it.
   *
   * That is the second half of a trap this repo already wrote down: the cure for
   * a wrapping label is `whitespace-nowrap` + `shrink-0`, and applied to a row
   * that is already full it converts the wrap into an overflow. Run 20 fixed the
   * wrap on this exact button; this is what the fix turned into.
   *
   * Run 13's rule — carry FEWER things, not smaller ones. On a phone with no
   * workspace, "No wallet yet" and "Create workspace" are the same sentence twice
   * and only one of them can be pressed to fix it. The brain ring already
   * disappears entirely in this state for the same reason (see topbar.test.tsx:
   * "a nudge here would point at a page that cannot work yet"); this is the
   * sibling that kept its place.
   *
   * NARROW ONLY. At ≥700px both fit with room to spare and the pill is a useful
   * standing reminder, so nothing is taken away where nothing was wrong.
   */
  const hideOnNarrow = balance.status === 'no-workspace'

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
      className={cn(
        'flex h-control flex-none items-center gap-[7px] rounded-pill border-[1.5px] border-primary bg-bg px-[13px] font-semibold whitespace-nowrap transition-micro hover:bg-tint-50 active:scale-[.97] max-narrow:h-11 dark:hover:bg-s2',
        hideOnNarrow && 'max-narrow:hidden',
      )}
    >
      {/* `.num` (tokens.css v3: mono + tabular-nums) only where there is a
          number to align — v3 puts mono in exactly three places and the topbar
          credit pill is one of them. "No wallet yet" is prose, so it stays sans. */}
      <span className={balance.status === 'ok' ? 'num' : undefined}>
        {/* The link already carries the accessible name, so this mark is
            aria-hidden via the Unreadable component's own markup. */}
        {content.text ?? <Unreadable what="Your credit balance" />}
      </span>
      {/* The word is for the eye at desktop widths only; the link's accessible
          name already says "N credits available". MEASURED 2026-09-05 (smoke,
          campaigns and composer-widths, then reproduced at 360/390 with a
          workspace and no brain): the trailing cluster overran the viewport by
          35px at 390 and 65px at 360, and this word was 50px of it. */}
      {content.suffix !== null ? (
        <span className="text-[13px] font-medium text-muted max-narrow:sr-only">
          {content.suffix}
        </span>
      ) : null}
    </Link>
  )
}
