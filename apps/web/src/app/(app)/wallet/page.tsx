import { Receipt, Wallet } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { EmptyState } from '@/components/empty-state'
import { CardLabel } from '@/components/ui/card'
import { BalanceHero } from '@/components/wallet/balance-hero'
import { CreditActivity } from '@/components/wallet/credit-activity'
import { SkippedNote } from '@/components/wallet/ledger-table'
import { SpendCard } from '@/components/home/spend-card'
import { TopUpPanel } from '@/components/wallet/top-up-panel'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { holdReaperFromEnv, staleHoldNote } from '@/lib/wallet/balance'
import {
  HISTORY_LIMIT,
  countLedger,
  readBalance,
  readLedger,
  readOpenHolds,
} from '@/lib/wallet/read'
import { readSpend } from '@/lib/home/spend'
import { readBillingProfile } from '@/lib/billing/read'
import { detectedCountry, pickDisplayCountry } from '@/lib/billing/display-country'
import { getFxRates } from '@/lib/billing/fx-store'
import { displayCurrencyForCountry } from '@sahoda/shared'

export const metadata = { title: 'Wallet' }

/**
 * Wallet. Every number on this page comes from `credit_balances` / `credit_ledger`
 * under RLS — there is no spend cap, no usage forecast and no performance-credit
 * panel here, because nothing persists or produces those yet.
 */
export default async function WalletPage() {
  /**
   * ALL SIX IN ONE ROUND TRIP, including the two that feed the price
   * approximation.
   *
   * The tempting shape is to read the billing profile, then derive a country,
   * then fetch rates only if that country needs them — which would skip a fetch
   * for Indian customers. It is also a three-deep chain on a page that already
   * makes four reads, and `read-waterfall.test.ts` rejected it at 6 to 8
   * sequential reads.
   *
   * So the rates are fetched unconditionally and sometimes go unused. That costs
   * one cached Upstash GET beside four database reads already in flight, and it
   * buys back a serial round trip on the money screen. The waste is real and it
   * is the cheaper side of the trade.
   */
  const [balance, ledger, ledgerTotal, openHolds, profile, detected, fx, spend] = await Promise.all(
    [
      readBalance(),
      readLedger(),
      // The seventh read, in the same round trip for the reason the note above
      // gives. It fetches no rows — `head: true` — and answers the one question
      // the windowed list cannot: how many entries there actually are.
      countLedger(),
      readOpenHolds(),
      readBillingProfile(),
      detectedCountry(),
      getFxRates(),
      // In the SAME batch, never on its own line: `read-waterfall.test.ts`
      // counts sequential reads per route and exists because a lone `await`
      // costs a round trip nobody sees in review.
      readSpend(),
    ],
  )

  /**
   * The local-currency approximation on the top-up panel.
   *
   * Every input here is allowed to come back empty and none of them can fail the
   * page: the rupee price is the charge, and an approximation that cannot be
   * made is simply not shown. A profile that is unreadable contributes no
   * declared country, which falls through to the edge's guess, which may itself
   * be absent — and all three roads end at the rupee price alone.
   */
  const declaredCountry = profile.status === 'ok' ? (profile.data?.country_code ?? null) : null
  const currency = displayCurrencyForCountry(pickDisplayCountry(declaredCountry, detected))

  // A user with no workspace has no wallet — not a broken one. This is the
  // whole page, not a banner above the usual furniture: an empty ledger and a
  // top-up panel underneath would each repeat the same false claim, and
  // `startCheckout` refuses with "Create a workspace first." anyway, so the
  // button would be an affordance that cannot work.
  if (balance.status === 'no-workspace') {
    return (
      <div className="space-y-grid">
        <PageTitle>Wallet</PageTitle>
        <EmptyState
          icon={Wallet}
          title="Create a workspace to open your wallet"
          body="Credits belong to a workspace and you don't have one yet. Nothing failed and nothing was charged. There is simply no wallet to show."
          action={<CreateWorkspaceButton variant="primary" />}
          tip="Your free signup credits land the moment the workspace exists."
        />
      </div>
    )
  }

  // Read the clock once, on the server, and pass the result down: the components
  // stay pure and the note cannot drift between two renders.
  // Read here rather than inside the pure function, so the sentence stays a
  // function of its inputs and the environment is looked at exactly once.
  // SAHODA_HOLD_SWEEP_MODE is in turbo.json's @sahoda/web#build allowlist; absent
  // means 'off', which is what apps/jobs itself defaults to.
  const staleNote = staleHoldNote(
    openHolds,
    new Date(),
    holdReaperFromEnv(process.env.SAHODA_HOLD_SWEEP_MODE),
  )

  return (
    <div className="space-y-grid">
      <PageTitle>Wallet</PageTitle>

      {balance.status === 'ok' ? (
        <BalanceHero balance={balance.balance} staleNote={staleNote} />
      ) : (
        // Unreadable is not zero. Showing "0 credits" here would tell someone
        // with a full wallet that they cannot afford to work. It is not a
        // missing workspace either — that case returned above, so the reload
        // this offers is a remedy that can genuinely work.
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          Could not read your credit balance just now. Reload to try again. Nothing has been charged
          and your credits are unaffected.
        </div>
      )}

      <section data-guide="wallet.ledger" className="space-y-3">
        {ledger.entries.length === 0 ? (
          <>
            <CardLabel>Credit activity</CardLabel>
            <EmptyState
              icon={Receipt}
              title="No credit activity yet"
              body="Every grant, hold, charge and refund lands here with the action that caused it and what it cost to run."
              tip="A hold is credits reserved while an action runs. If the action fails, they come back and you are not charged."
            />
            {/* An all-malformed page is not an empty one, and must not read as one. */}
            <SkippedNote skipped={ledger.skipped} />
          </>
        ) : (
          <CreditActivity
            entries={ledger.entries}
            skipped={ledger.skipped}
            limit={HISTORY_LIMIT}
            total={ledgerTotal}
          />
        )}
      </section>

      {/* ── WHERE THE CREDITS WENT, BY ACTION ────────────────────────────────
          Moved here from /home by the founder's ruling that credits belong in
          the wallet. It rendered NOWHERE else in the product, so leaving it out
          of this page would have deleted the only view of what the money bought
          — and the ruling asked for it to move, not to go. It sits under the
          ledger because the ledger is the record and this is the summary of it;
          a summary above its own evidence reads as the headline figure, which
          on a money screen is the balance and nothing else. */}
      <SpendCard spend={spend} />

      <TopUpPanel currency={currency} fx={fx} />
    </div>
  )
}
