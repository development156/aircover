import { Receipt } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { EmptyState } from '@/components/empty-state'
import { CardLabel } from '@/components/ui/card'
import { BalanceHero } from '@/components/wallet/balance-hero'
import { LedgerTable, SkippedNote } from '@/components/wallet/ledger-table'
import { TopUpPanel } from '@/components/wallet/top-up-panel'
import { staleHoldNote } from '@/lib/wallet/balance'
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

  // Read the clock once, on the server, and pass the result down: the components
  // stay pure and the note cannot drift between two renders.
  const staleNote = staleHoldNote(openHolds, new Date())

  return (
    <div className="space-y-grid">
      <PageTitle>Wallet</PageTitle>

      {balance ? (
        <BalanceHero balance={balance} staleNote={staleNote} />
      ) : (
        // Unreadable is not zero. Showing "0 credits" here would tell someone
        // with a full wallet that they cannot afford to work.
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          Could not read your credit balance just now — reload to try again. Nothing has been
          charged and your credits are unaffected.
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
              tip="A hold is credits reserved while an action runs — if the action fails, they come back and you are not charged."
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
