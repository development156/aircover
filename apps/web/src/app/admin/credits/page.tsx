import type { Metadata } from 'next'

import { CreditsView } from '@/components/admin/credits-view'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { readCreditRequests, readOpsAdmins } from '@/lib/ops/read'

export const metadata: Metadata = { title: 'Credits' }

/**
 * A3 · `/admin/credits` (doc 13 §6).
 *
 * `requireOpsAdmin()` runs here as well as in middleware — the routing layer is
 * the coarse gate, this is the one that decides, and every action re-checks
 * again at the database.
 */
export default async function CreditsPage() {
  const me = await requireOpsAdmin()
  const [requests, admins] = await Promise.all([readCreditRequests(), readOpsAdmins()])

  // An unreadable list is said out loud rather than rendered as "no requests".
  // On this screen especially: an empty page would read as "nothing is waiting
  // for you", which is the opposite of what an unknown state means.
  if (requests.status !== 'ok' || admins.status !== 'ok') {
    const eventId =
      requests.status === 'unreadable' ? requests.eventId : (admins as { eventId?: string }).eventId

    return (
      <div className="space-y-grid">
        <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Credits</h1>
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          We couldn&apos;t read the credit requests just now. This is our read failing, not a
          change to anyone&apos;s balance. Nothing has been granted. Reload to try again.
        </div>
        {eventId ? <p className="font-mono text-[11px] text-faint">Reference {eventId}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <div>
        <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Credits</h1>
        <p className="mt-1 text-[14px] text-muted">
          Any admin can ask. A different admin&apos;s code confirms, so no single account can add
          credits on its own.
        </p>
      </div>

      <CreditsView requests={requests.data} admins={admins.data} me={me.email} />
    </div>
  )
}
