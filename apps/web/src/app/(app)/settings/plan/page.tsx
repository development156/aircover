import Link from 'next/link'

import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { buttonVariants } from '@/components/ui/button'
import { readBalance, type BalanceRead } from '@/lib/wallet/read'

export const metadata = { title: 'Plan & credits' }

/**
 * Plan & credits — ONE tab, where the reference has two.
 *
 * The reference separates "Billing" (invoices, plan) from "Credits" (balance,
 * costs). This product has no invoice store, so a Billing tab would be a plan
 * name and nothing else. Merging them is honest; two half-empty tabs are not.
 *
 * READ-ONLY, and deliberately so: this pass changes nothing in the ledger,
 * billing or credit accounting. The balance is READ, never restated — an
 * unreadable balance says so rather than showing a zero, which is the whole
 * point of the three-way split this read returns.
 */
/**
 * `readBalance` answers in THREE parts and this tab used to render two.
 *
 * `no-workspace` fell into the same arm as `unreadable`, so a brand-new account
 * was told "We could not read your balance just now" — a failure that had not
 * happened, attached to a remedy (reload) that cannot produce a wallet. The
 * union in lib/wallet/read.ts was introduced to end exactly that sentence on
 * /home and the credit chip; this consumer flattened it straight back.
 *
 * Each arm now carries its own remedy, and only one of them is a reload.
 */
const AVAILABLE_HINT: Record<BalanceRead['status'], string> = {
  ok: 'What you can spend right now.',
  'no-workspace': 'Credits belong to a workspace and you don’t have one yet.',
  unreadable: 'We could not read your balance just now — this is not a zero.',
}

export default async function SettingsPlanPage() {
  const balance = await readBalance()

  return (
    <SettingCard title="Credits">
      <SettingRow
        label="Available"
        hint={AVAILABLE_HINT[balance.status]}
        control={
          <span className="text-[15px] font-[650] text-ink tabular-nums">
            {balance.status === 'ok' ? balance.balance.available : '—'}
          </span>
        }
      />
      {balance.status === 'ok' && balance.balance.held > 0 ? (
        <SettingRow
          label="Held"
          hint="Reserved by actions in progress. Returned in full if they do not complete."
          control={
            <span className="text-[15px] font-[650] text-ink tabular-nums">
              {balance.balance.held}
            </span>
          }
        />
      ) : null}
      <SettingRow
        label="Activity and top-ups"
        hint="Every entry, what it was for, and what it cost."
        control={
          <Link href="/wallet" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Open wallet
          </Link>
        }
      />
    </SettingCard>
  )
}
