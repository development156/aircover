'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { OpsAdmin, OpsCreditRequest } from '@sahoda/shared'

import {
  createCreditRequest,
  denyCreditRequest,
  searchWorkspaces,
  verifyCreditOtp,
} from '@/app/actions/ops-credits'
import type { WorkspaceHit } from '@/lib/ops/credit-state'
import { cn } from '@/lib/utils'

/**
 * A3 · Credit allocation, maker-checker (doc 13 §6).
 *
 * Two halves that are never the same person's: raise a request, or confirm one
 * with the code that was emailed to you. The screen shows both because an admin
 * is usually one and occasionally the other, but the database refuses the
 * combination — the confirm box on your OWN request is deliberately absent
 * rather than present-and-doomed.
 *
 * Nothing here ever displays a code. The requester never sees it; only the
 * chosen approver's inbox does.
 */

const INPUT =
  'w-full rounded-input border border-line bg-s1 px-3 py-2 text-[14px] transition-micro focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const LABEL = 'block text-[12px] font-semibold text-ink'

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warn-bg text-warn',
  approved: 'bg-ok-bg text-ok',
  denied: 'bg-s2 text-muted',
  expired: 'bg-danger-bg text-danger',
}

function RequestForm({ admins, me }: { admins: readonly OpsAdmin[]; me: string }) {
  const [hits, setHits] = useState<WorkspaceHit[]>([])
  const [picked, setPicked] = useState<WorkspaceHit | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [pending, startTransition] = useTransition()

  // Only an active admin or owner may approve, and never the person asking.
  const approvers = admins.filter(
    (admin) =>
      admin.status === 'active' &&
      admin.role !== 'viewer' &&
      admin.email.toLowerCase() !== me.toLowerCase(),
  )

  function search(query: string) {
    setPicked(null)
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    startTransition(async () => setHits(await searchWorkspaces(query)))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!picked) return

    startTransition(async () => {
      const result = await createCreditRequest({
        workspaceId: picked.id,
        amount: Number(amount),
        reason,
        approverEmail: approver,
      })
      if (result.ok) {
        toast.success(`Code sent to ${result.approverEmail}. They approve it, not you.`)
        setPicked(null)
        setAmount('')
        setReason('')
        setHits([])
      } else {
        toast.error(result.message)
      }
    })
  }

  if (approvers.length === 0) {
    return (
      <section className="rounded-card border border-line bg-bg p-5 shadow-card">
        <h2 className="text-[15px] font-bold">Request credits</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          There is no second admin to approve a grant, so none can be made. Add another active admin
          on the Team screen first — one account cannot do both halves.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-card border border-line bg-bg p-5 shadow-card">
      <h2 className="text-[15px] font-bold">Request credits</h2>
      <p className="mt-1 mb-3 text-[13px] text-muted">
        A different admin confirms with a code we email them. You will not see that code.
      </p>

      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className={LABEL} htmlFor="ws-search">
            Workspace
          </label>
          <input
            id="ws-search"
            className={INPUT}
            placeholder="Search by name or slug"
            onChange={(event) => search(event.target.value)}
            autoComplete="off"
          />
          {picked ? (
            <p className="mt-1 text-[12px] text-muted tabular-nums">
              {picked.name} · {picked.available} credits now
            </p>
          ) : hits.length > 0 ? (
            <ul className="mt-1 divide-y divide-line rounded-input border border-line">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(hit)
                      setHits([])
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-[13px] transition-micro hover:bg-s2"
                  >
                    <span className="font-medium">{hit.name}</span>
                    <span className="text-[12px] text-muted">{hit.slug}</span>
                    <span className="ml-auto text-[12px] text-muted tabular-nums">
                      {hit.available}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-3 narrow:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="amount">
              Credits
            </label>
            <input
              id="amount"
              className={cn(INPUT, 'tabular-nums')}
              type="number"
              min={1}
              max={10000}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="approver">
              Who approves
            </label>
            <select
              id="approver"
              className={INPUT}
              value={approver}
              onChange={(event) => setApprover(event.target.value)}
            >
              <option value="">Choose an admin…</option>
              {approvers.map((admin) => (
                <option key={admin.id} value={admin.email}>
                  {admin.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="reason">
            Why
          </label>
          <input
            id="reason"
            className={INPUT}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Make-good for the failed publish on Tuesday"
            maxLength={500}
          />
        </div>

        <button
          type="submit"
          disabled={pending || !picked || !amount || !approver || reason.trim().length < 3}
          className="justify-self-start rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
        >
          {pending ? 'Sending…' : 'Send for approval'}
        </button>
      </form>
    </section>
  )
}

function ApprovalRow({ request, me }: { request: OpsCreditRequest; me: string }) {
  const [code, setCode] = useState('')
  const [pending, startTransition] = useTransition()

  const mine = request.requested_by.toLowerCase() === me.toLowerCase()
  const forMe = (request.approver_id ?? '').toLowerCase() === me.toLowerCase()

  function approve(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await verifyCreditOtp({ requestId: request.id, code })
      setCode('')
      if (result.ok) {
        toast.success(
          result.replayed
            ? 'Already approved — nothing was granted twice.'
            : `Granted ${result.amount} credits${
                result.balanceAfter === null ? '' : `. New balance ${result.balanceAfter}.`
              }`,
        )
      } else {
        toast.error(result.message)
      }
    })
  }

  function deny() {
    const why = window.prompt('Why are you denying this?')?.trim()
    if (!why) return
    startTransition(async () => {
      const result = await denyCreditRequest(request.id, why)
      if (result.ok) toast.success('Denied.')
      else toast.error(result.message)
    })
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold tabular-nums">{request.amount}</span>
        <span className="text-[13px] font-medium">{request.workspace_label}</span>
        <span
          className={cn(
            'rounded-pill px-2 py-[2px] text-[11px] font-semibold',
            STATUS_STYLE[request.status] ?? 'bg-s2 text-muted',
          )}
        >
          {request.status}
        </span>
        <span className="ml-auto text-[12px] text-muted tabular-nums">
          {WHEN.format(new Date(request.created_at))}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-muted">{request.reason}</p>
      <p className="mt-0.5 text-[12px] text-faint">
        Asked by {request.requested_by}
        {request.approver_id ? ` · for ${request.approver_id} to approve` : null}
        {request.attempts > 0
          ? ` · ${request.attempts} wrong ${request.attempts === 1 ? 'try' : 'tries'}`
          : null}
      </p>

      {request.status === 'denied' && request.denied_reason ? (
        <p className="mt-1 text-[12px] text-muted">Denied: {request.denied_reason}</p>
      ) : null}

      {request.status === 'pending' ? (
        forMe ? (
          <form onSubmit={approve} className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`code-${request.id}`}>
              Approval code for {request.workspace_label}
            </label>
            <input
              id={`code-${request.id}`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className={cn(
                INPUT,
                'w-[7.5rem] text-center font-mono tracking-[0.3em] tabular-nums',
              )}
            />
            <button
              type="submit"
              disabled={pending || code.trim().length !== 6}
              className="rounded-pill bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
            >
              {pending ? 'Checking…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={deny}
              disabled={pending}
              className="rounded-pill px-3 py-1.5 text-[12px] text-muted transition-micro hover:bg-s2 hover:text-ink"
            >
              Deny
            </button>
          </form>
        ) : (
          // No code box, because entering one here is guaranteed to be refused.
          <p className="mt-2 text-[12px] text-muted">
            {mine
              ? 'Waiting on your approver. You cannot approve your own request.'
              : `Waiting on ${request.approver_id ?? 'another admin'}.`}
          </p>
        )
      ) : null}
    </li>
  )
}

export function CreditsView({
  requests,
  admins,
  me,
}: {
  requests: readonly OpsCreditRequest[]
  admins: readonly OpsAdmin[]
  me: string
}) {
  const pending = requests.filter((request) => request.status === 'pending')
  const settled = requests.filter((request) => request.status !== 'pending')

  return (
    <div className="space-y-grid">
      <RequestForm admins={admins} me={me} />

      <section className="rounded-card border border-line bg-bg shadow-card">
        <h2 className="border-b border-line px-4 py-3 text-[15px] font-bold">
          Waiting for approval{' '}
          <span className="text-[13px] font-normal text-muted tabular-nums">
            ({pending.length})
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">
            Nothing is waiting. Requests appear here the moment someone raises one.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((request) => (
              <ApprovalRow key={request.id} request={request} me={me} />
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 ? (
        <section className="rounded-card border border-line bg-bg shadow-card">
          <h2 className="border-b border-line px-4 py-3 text-[15px] font-bold">Decided</h2>
          <ul className="divide-y divide-line">
            {settled.slice(0, 20).map((request) => (
              <ApprovalRow key={request.id} request={request} me={me} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
