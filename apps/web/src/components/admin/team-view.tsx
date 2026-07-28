'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { OpsAdmin, OpsRole } from '@sahoda/shared'

import { inviteAdmin, revokeAdmin, setAdminRole } from '@/app/actions/ops-team'
import { cn } from '@/lib/utils'

/**
 * A4 · Team and roles (doc 13 §13).
 *
 * Only an owner sees the controls. Everyone else sees the table, because who
 * holds the console is not a secret from the people already on it.
 *
 * The last active owner's controls are absent, not disabled-with-a-tooltip: the
 * database refuses that change and drawing a live control for it would be a
 * button that does nothing.
 */

const ROLES: readonly OpsRole[] = ['owner', 'admin', 'viewer']

const ROLE_NOTE: Record<OpsRole, string> = {
  owner: 'Everything, including managing this list',
  admin: 'Everything except managing this list',
  viewer: 'Read only — never approves or grants',
}

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
})

export function TeamView({
  admins,
  me,
  isOwner,
}: {
  admins: readonly OpsAdmin[]
  me: string
  isOwner: boolean
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OpsRole>('admin')
  const [pending, startTransition] = useTransition()

  const activeOwners = admins.filter(
    (admin) => admin.status === 'active' && admin.role === 'owner',
  ).length

  function run(work: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await work()
      if (result.ok) toast.success(success)
      else toast.error(result.message ?? 'That change was not applied.')
    })
  }

  return (
    <div className="space-y-grid">
      {isOwner ? (
        <section className="rounded-card border border-line bg-bg p-5 shadow-card">
          <h2 className="text-[15px] font-bold">Add someone</h2>
          <p className="mt-1 mb-3 text-[13px] text-muted">
            They get a Clerk invitation and a seat. The seat is what lets them past /admin.
          </p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              run(() => inviteAdmin(email, role), `Invited ${email}`)
              setEmail('')
            }}
          >
            <div className="min-w-[16rem] flex-1">
              <label className="block text-[12px] font-semibold" htmlFor="new-admin">
                Email
              </label>
              <input
                id="new-admin"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-input border border-line bg-s1 px-3 py-2 text-[14px] focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold" htmlFor="new-role">
                Role
              </label>
              <select
                id="new-role"
                value={role}
                onChange={(event) => setRole(event.target.value as OpsRole)}
                className="rounded-input border border-line bg-s1 px-3 py-2 text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending || !email.includes('@')}
              className="rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
            >
              {pending ? 'Inviting…' : 'Send invitation'}
            </button>
          </form>
          <p className="mt-2 text-[12px] text-faint">{ROLE_NOTE[role]}</p>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-bg shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Everyone with access to the admin console</caption>
            <thead>
              <tr className="border-b border-line text-[12px] text-faint">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Who
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Added
                </th>
                {isOwner ? <th scope="col" className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const isSelf = admin.email.toLowerCase() === me.toLowerCase()
                const isLastOwner =
                  admin.role === 'owner' && admin.status === 'active' && activeOwners <= 1

                return (
                  <tr key={admin.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 align-top">
                      <span className="text-[13px] font-medium">{admin.email}</span>
                      {isSelf ? <span className="ml-1.5 text-[12px] text-muted">(you)</span> : null}
                      {/* An unlinked seat cannot sign in yet, and saying so beats
                          leaving someone to wonder why /admin 404s for them. */}
                      {admin.user_id === null && admin.status === 'active' ? (
                        <span className="ml-1.5 text-[12px] text-warn">not signed in yet</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {isOwner && !isLastOwner ? (
                        <>
                          <label className="sr-only" htmlFor={`role-${admin.id}`}>
                            Role for {admin.email}
                          </label>
                          <select
                            id={`role-${admin.id}`}
                            value={admin.role}
                            disabled={pending}
                            onChange={(event) =>
                              run(
                                () => setAdminRole(admin.id, event.target.value),
                                `${admin.email} is now ${event.target.value}`,
                              )
                            }
                            className="rounded-input border border-line bg-s1 px-2 py-1 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            {ROLES.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span className="text-[13px]">{admin.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          'rounded-pill px-2 py-[2px] text-[11px] font-semibold',
                          admin.status === 'active'
                            ? 'bg-ok-bg text-ok'
                            : 'bg-s2 text-faint line-through',
                        )}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-muted tabular-nums">
                      {WHEN.format(new Date(admin.created_at))}
                    </td>
                    {isOwner ? (
                      <td className="px-4 py-3 text-right align-top">
                        {admin.status === 'active' && !isLastOwner ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() => revokeAdmin(admin.id), `${admin.email} revoked`)
                            }
                            className="rounded-pill px-2.5 py-1 text-[12px] text-danger transition-micro hover:bg-danger-bg disabled:pointer-events-none disabled:opacity-45"
                          >
                            Revoke
                          </button>
                        ) : isLastOwner ? (
                          <span className="text-[12px] text-faint">last owner</span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!isOwner ? (
        <p className="text-[13px] text-muted">
          Only an owner can change this list. You can see who has access.
        </p>
      ) : null}
    </div>
  )
}
