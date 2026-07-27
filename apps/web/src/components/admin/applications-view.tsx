'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { OpsBetaApplication, OpsApplicationStatus } from '@sahoda/shared'

import {
  approveApplication,
  noteOnApplication,
  rejectApplication,
  revokeApplicationInvite,
} from '@/app/actions/ops-applications'
import { cn } from '@/lib/utils'

/**
 * A2 · The applications inbox (doc 13 §4).
 *
 * CSV export is deliberately NOT here — it is the first item on doc 13 §18's
 * cut line and the run was long. Every column it would carry is on screen.
 *
 * The controls a row shows depend on where it actually is. A `joined` applicant
 * has an account; offering Approve on that row would be a button that does
 * nothing, so it is not drawn.
 */

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

const STATUS_STYLE: Record<OpsApplicationStatus, string> = {
  new: 'bg-tint-100 text-accent dark:bg-s2',
  contacted: 'bg-s2 text-muted',
  invited: 'bg-warn-bg text-warn',
  joined: 'bg-ok-bg text-ok',
  rejected: 'bg-s2 text-faint',
}

const FILTERS: readonly (OpsApplicationStatus | 'all')[] = [
  'all',
  'new',
  'contacted',
  'invited',
  'joined',
  'rejected',
]

function Row({ application }: { application: OpsBetaApplication }) {
  const [pending, startTransition] = useTransition()

  function run(work: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await work()
      if (result.ok) toast.success(success)
      else toast.error(result.message ?? 'That change was not applied.')
    })
  }

  const canInvite = application.status === 'new' || application.status === 'contacted'
  const canRevoke = application.status === 'invited'
  const canReject = application.status !== 'joined' && application.status !== 'rejected'

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[14px] font-semibold">{application.business_name}</span>
        <span className="text-[13px] text-muted">{application.name}</span>
        <span
          className={cn(
            'rounded-pill px-2 py-[2px] text-[11px] font-semibold',
            STATUS_STYLE[application.status],
          )}
        >
          {application.status}
        </span>
        <span className="ml-auto text-[12px] text-muted tabular-nums">
          {WHEN.format(new Date(application.created_at))}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-muted">
        <a href={`mailto:${application.email}`} className="underline-offset-2 hover:underline">
          {application.email}
        </a>
        {' · '}
        <span className="tabular-nums">{application.phone}</span>
        {application.source_url ? (
          <>
            {' · from '}
            <span className="font-mono text-[12px]">{application.source_url}</span>
          </>
        ) : null}
      </p>

      {application.notes ? (
        <p className="mt-1 rounded-input bg-s1 px-2 py-1 text-[12px] text-muted">
          {application.notes}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canInvite ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => approveApplication(application.id, application.email),
                `Invitation sent to ${application.email}`,
              )
            }
            className="rounded-pill bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
          >
            {pending ? 'Working…' : 'Approve & invite'}
          </button>
        ) : null}

        {canRevoke ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => revokeApplicationInvite(application.id, application.clerk_invitation_id),
                'Invitation revoked',
              )
            }
            className="rounded-pill border-[1.5px] border-ink px-3 py-[3px] text-[12px] font-semibold transition-micro hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-45"
          >
            Revoke invitation
          </button>
        ) : null}

        {canReject ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const why = window.prompt('Why are you rejecting this? (optional)') ?? ''
              run(() => rejectApplication(application.id, why), 'Rejected')
            }}
            className="rounded-pill px-3 py-1 text-[12px] text-muted transition-micro hover:bg-s2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
          >
            Reject
          </button>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const note = window.prompt('Add a note')?.trim()
            if (note) run(() => noteOnApplication(application.id, note), 'Note added')
          }}
          className="rounded-pill px-3 py-1 text-[12px] text-muted transition-micro hover:bg-s2 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
        >
          Add note
        </button>
      </div>
    </li>
  )
}

export function ApplicationsView({
  applications,
}: {
  applications: readonly OpsBetaApplication[]
}) {
  const [filter, setFilter] = useState<OpsApplicationStatus | 'all'>('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return applications.filter((application) => {
      if (filter !== 'all' && application.status !== filter) return false
      if (!needle) return true
      return (
        application.email.toLowerCase().includes(needle) ||
        application.name.toLowerCase().includes(needle) ||
        application.business_name.toLowerCase().includes(needle)
      )
    })
  }, [applications, filter, query])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const application of applications) {
      map.set(application.status, (map.get(application.status) ?? 0) + 1)
    }
    return map
  }, [applications])

  if (applications.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-bg px-6 py-12 text-center shadow-card">
        <h2 className="text-[18px] leading-[26px] font-bold">No applications yet</h2>
        <p className="max-w-[42ch] text-muted">
          They appear here the moment someone submits the form.
        </p>
        <p className="mt-1 text-[13px] text-faint">
          Sahoda: drop the embed on the landing page and this fills up on its own.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={cn(
              'rounded-pill px-2.5 py-1 text-[12px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              filter === option ? 'bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:bg-s2',
            )}
          >
            {option === 'all' ? 'All' : option}
            <span className="ml-1 tabular-nums">
              {option === 'all' ? applications.length : (counts.get(option) ?? 0)}
            </span>
          </button>
        ))}

        <label className="sr-only" htmlFor="app-search">
          Search applications
        </label>
        <input
          id="app-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, business or email"
          className="ml-auto w-[15rem] rounded-input border border-line bg-s1 px-2.5 py-1 text-[13px] focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>

      <section className="rounded-card border border-line bg-bg shadow-card">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">
            Nothing matches those filters.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((application) => (
              <Row key={application.id} application={application} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
