import { Receipt, Wallet } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { EmptyState } from '@/components/empty-state'
import { CardLabel } from '@/components/ui/card'
import { BalanceHero } from '@/components/wallet/balance-hero'
import { LedgerTable, SkippedNote } from '@/components/wallet/ledger-table'
import { TopUpPanel } from '@/components/wallet/top-up-panel'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { holdReaperFromEnv, staleHoldNote } from '@/lib/wallet/balance'
import { HISTORY_LIMIT, readBalance, readLedger, readOpenHolds } from '@/lib/wallet/read'

export const metadata = { title: 'Wallet' }

/**
 * Wallet. Every number on this page comes from `credit_balances` / `credit_ledger`
 * under RLS — there is no spend cap, no usage forecast and no performance-credit
 * panel here, because nothing persists or produces those yet.
 */
export default async function WalletPage() {
  const [balance, ledger, openHolds] = await Promise.all([
    readBalance(),
    readLedger(),
    readOpenHolds(),
  ])

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
        <CardLabel>Credit activity</CardLabel>
        {ledger.entries.length === 0 ? (
          <>
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
          <LedgerTable entries={ledger.entries} skipped={ledger.skipped} limit={HISTORY_LIMIT} />
        )}
      </section>

      <TopUpPanel />
    </div>
  )
}
