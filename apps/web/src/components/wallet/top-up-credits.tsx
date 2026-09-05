'use client'

import { useState, useTransition } from 'react'
import { Coins } from 'lucide-react'
import { TOP_UP, inrForCredits, refuseTopUpCredits } from '@sahoda/shared'

import { startTopUp } from '@/app/actions/wallet'
import { Card, CardLabel } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { TopUpState } from '@/lib/wallet/topup-state'
import { cn } from '@/lib/utils'
import { creditWord } from '@/lib/credit-words'

/**
 * BUY CREDITS. Not a plan — this panel sells nothing that renews.
 *
 * ── WHY THE PLANS LEFT THIS SCREEN ───────────────────────────────────────────
 * Three monthly plans used to sit here, a second copy of the picker on
 * Settings → Plans. Two places to buy the same subscription is two places to keep
 * in step, and the wallet is where somebody goes when they are SHORT, not when
 * they are choosing a plan. Founder's ruling, 2026-09-03.
 *
 * ── EVERY FIGURE IS ONE MULTIPLICATION FROM ONE RATE ─────────────────────────
 * `pricing.config.json` holds the rate and nothing here re-states it: the sizes,
 * the custom amount and the rupees each comes to are all `inrForCredits`. A price
 * written in this file would be a second price, and the second price is the one
 * that goes stale.
 *
 * ── THE BUTTON AND THE SERVER REFUSE THE SAME THINGS ─────────────────────────
 * `refuseTopUpCredits` is called here and again inside the action. This call is a
 * courtesy — it names the problem before a round trip. That one is the rule, and
 * it is the reason this one may be as friendly as it likes.
 */
const inr = (value: number): string => value.toLocaleString('en-IN')

/**
 * A figure and its word, grouped the way a reader in India expects.
 *
 * `credits(n)` from `@/lib/credit-words` pairs the two but formats the number with
 * a bare template, losing the 1,00,000 grouping this screen needs on every figure.
 * So the grouping is done here and the WORD still comes from `creditWord`, which is
 * the half that has ever been got wrong.
 */
const withWord = (value: number): string => `${inr(value)} ${creditWord(value)}`

/** The unit sentence, stated once so the sizes below do not each have to. */
const RATE_LINE = `${withWord(TOP_UP.credits_per_pack)} for ₹${inr(TOP_UP.inr_per_pack)}. The rate is the same whichever size you pick.`

export function TopUpCredits() {
  // `packs` is non-empty by schema, but the config is JSON and the type says index 0
  // could be undefined. The minimum is the honest fallback: it is the smallest thing
  // this product will sell, so it can never be an unsellable default.
  const [selected, setSelected] = useState<number>(TOP_UP.packs[0] ?? TOP_UP.min_credits)
  const [custom, setCustom] = useState<string>('')
  const [result, setResult] = useState<TopUpState | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * A typed amount wins over the chosen size, and an empty box gives it back.
   *
   * Deliberately not two mutually exclusive controls: somebody who types 7,000 and
   * then clears the box meant to go back to the size they had picked, not to be
   * left with nothing selected and a disabled button.
   */
  const typed = custom.trim() === '' ? null : Number(custom.replace(/[^0-9]/g, ''))
  const credits = typed === null || Number.isNaN(typed) ? selected : typed
  const refusal = refuseTopUpCredits(credits)

  // Never priced when the quantity is refused: `inrForCredits` is exact only for
  // sellable quantities, and a figure beside an error is a figure nobody can act on.
  const price = refusal ? null : inrForCredits(credits)

  const refusalText =
    refusal === 'below-minimum'
      ? `The smallest top-up is ${withWord(TOP_UP.min_credits)}.`
      : refusal === 'above-maximum'
        ? `The largest top-up is ${withWord(TOP_UP.max_credits)}. Buy it twice for more.`
        : refusal === 'not-a-step'
          ? `Credits come in steps of ${inr(TOP_UP.step_credits)}.`
          : refusal
            ? 'Type how many credits you want.'
            : null

  function buy() {
    if (refusal) return
    startTransition(async () => {
      setResult(await startTopUp(credits))
    })
  }

  return (
    <Card className="space-y-4" data-guide="wallet.topup">
      <div>
        <CardLabel>
          <Coins aria-hidden className="size-3.5" />
          Top up credits
        </CardLabel>
        <p className="type-sm mt-1 max-w-[62ch] text-muted">{RATE_LINE}</p>
      </div>

      <div className="grid gap-2 wide:grid-cols-3">
        {TOP_UP.packs.map((pack) => {
          const active = typed === null && pack === selected
          return (
            <button
              key={pack}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(pack)
                setCustom('')
                setResult(null)
              }}
              className={cn(
                'rounded-card p-4 text-left transition-micro',
                active
                  ? 'bg-tint-50 ring-1 ring-[var(--accent)]'
                  : 'surface-ring bg-surface hover:bg-s2',
              )}
            >
              <p className="type-h3 num text-ink">{withWord(pack)}</p>
              <p className="type-sm num mt-1 text-muted">₹{inr(inrForCredits(pack))}</p>
            </button>
          )
        })}
      </div>

      <div>
        <label htmlFor="topup-custom" className="type-sm text-muted">
          Or choose your own amount
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id="topup-custom"
            inputMode="numeric"
            value={custom}
            placeholder={inr(TOP_UP.min_credits)}
            onChange={(event) => {
              setCustom(event.target.value)
              setResult(null)
            }}
            className="h-control w-40 rounded-sm border-0 bg-surface-2 px-3 type-sm num text-ink placeholder:text-muted focus-visible:bg-surface"
          />
          <span className="type-sm text-muted">credits</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          {/* The figure a bank will show, and the quantity it buys. Both, always:
              one without the other is the half of the trade nobody checks. */}
          <p className="type-body num text-ink">
            {refusalText ?? `${withWord(credits)} · ₹${inr(price as number)}`}
          </p>
          <p className="type-sm mt-1 text-muted">
            Nothing is charged and no credits are added until a payment completes.
          </p>
        </div>
        <Button onClick={buy} disabled={Boolean(refusal)} loading={pending}>
          Buy credits
        </Button>
      </div>

      {result ? <TopUpResult result={result} /> : null}
    </Card>
  )
}

/**
 * What came back, said exactly.
 *
 * A sandbox session is NOT a purchase and is never dressed as one. The wording
 * names what happened — an order exists, no money moved — because "success" here
 * would be the fake this whole path was written to avoid.
 */
function TopUpResult({ result }: { result: TopUpState }) {
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-input bg-danger-bg px-3 py-2.5 type-sm text-danger">
        {result.message}
      </p>
    )
  }

  if (result.simulated) {
    return (
      <p className="rounded-input bg-subtle px-3 py-2.5 type-sm text-muted">
        A test order was opened for {withWord(result.credits)}. No money moved and no credits were
        added: card payments are still in {result.mode} mode.
      </p>
    )
  }

  return (
    <p className="rounded-input bg-subtle px-3 py-2.5 type-sm text-ink">
      Your order for {withWord(result.credits)} is ready.{' '}
      <a href={result.url} className="font-[550] text-accent underline underline-offset-2">
        Open the payment page
      </a>
      . The credits land as soon as the payment completes.
    </p>
  )
}
