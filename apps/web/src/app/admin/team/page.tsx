import type { Metadata } from 'next'

import { TeamView } from '@/components/admin/team-view'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { readOpsAdmins } from '@/lib/ops/read'

export const metadata: Metadata = { title: 'Team' }

/** A4 · `/admin/team` — who holds the console (doc 13 §13). */
export default async function TeamPage() {
  const me = await requireOpsAdmin()
  const admins = await readOpsAdmins()

  if (admins.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Team</h1>
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          We couldn&apos;t read the team just now — this is our read failing, and nobody&apos;s
          access has changed. Reload to try again.
        </div>
        {admins.eventId ? (
          <p className="font-mono text-[11px] text-faint">Reference {admins.eventId}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <div>
        <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Team</h1>
        <p className="mt-1 text-[14px] text-muted">
          Everyone who can open /admin. Revoking takes effect on their next request.
        </p>
      </div>

      <TeamView admins={admins.data} me={me.email} isOwner={me.role === 'owner'} />
    </div>
  )
}
