import type { Metadata } from 'next'

import { PageTitle } from '@/components/page-title'
import { ApplicationsView } from '@/components/admin/applications-view'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { readApplications } from '@/lib/ops/read'

export const metadata: Metadata = { title: 'Applications' }

/** A2 · `/admin/applications` — the beta inbox (doc 13 §4). */
export default async function ApplicationsPage() {
  await requireOpsAdmin()
  const applications = await readApplications()

  if (applications.status !== 'ok') {
    return (
      <div className="space-y-grid">
        {/* NO `sub` — the read failed, so there is no inbox to describe, and
            "approving sends a Clerk invitation" would name a control this
            branch does not render. */}
        <PageTitle>Applications</PageTitle>
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          We couldn&apos;t read the inbox just now. This is our read failing, not an empty inbox.
          Nobody&apos;s application has been lost. Reload to try again.
        </div>
        {applications.eventId ? (
          <p className="font-mono text-[11px] text-faint">Reference {applications.eventId}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <PageTitle sub="Approving sends a Clerk invitation. Signing up needs one, so this list is the only way in.">
        Applications
      </PageTitle>

      <ApplicationsView applications={applications.data} />
    </div>
  )
}
