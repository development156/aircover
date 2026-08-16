import Link from 'next/link'

import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { buttonVariants } from '@/components/ui/button'
import { readBalance } from '@/lib/wallet/read'

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
export default async function SettingsPlanPage() {
  const balance = await readBalance()

  return (
    <SettingCard title="Credits">
      <SettingRow
        label="Available"
        hint={
          balance.status === 'ok'
            ? 'What you can spend right now.'
            : 'We could not read your balance just now — this is not a zero.'
        }
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
