'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { resetWorkspace } from '@/app/actions/ops-reset'
import { RESET_CLEARS, RESET_KEEPS, resetConfirmationMatches } from '@/lib/ops/reset-scope'
import { Button } from '@/components/ui/button'

/**
 * Reset a workspace's content. Owner-only, and the most destructive control in
 * the console.
 *
 * THREE THINGS THIS DELIBERATELY DOES, none of them decoration:
 *
 *  · It lists what SURVIVES beside what dies. The useful half of a destructive
 *    confirmation is the part that tells you what you are not about to lose —
 *    without it, "reset" reads as "and my credits too?" and the operator either
 *    stalls or presses in hope.
 *  · Both lists are read from `lib/ops/reset-scope.ts`, the same module the RPC
 *    request is written from, so the copy cannot drift from the behaviour. A
 *    button that says "everything" over a function that spares the Brand Brain
 *    is worse than no button.
 *  · It asks for the workspace NAME, typed. Not a checkbox: a checkbox is one
 *    reflex away from a mistake, and the name is a thing you have to go and
 *    look at.
 *
 * The disabled button is a courtesy, not a control — `resetWorkspace` re-checks
 * the typed phrase server-side, because a `'use server'` export is callable
 * whatever this component renders.
 */
export function DangerZone({ isOwner }: { isOwner: boolean }) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [typed, setTyped] = useState('')
  const [pending, start] = useTransition()

  // Owners only. Absent rather than disabled: drawing a live control for
  // something the database will refuse is a button that does nothing.
  if (!isOwner) return null

  const armed = workspaceId.trim().length > 0 && resetConfirmationMatches(typed, workspaceName)

  function run() {
    start(async () => {
      const result = await resetWorkspace(workspaceId.trim(), workspaceName.trim(), typed)
      if (result.ok) {
        toast.success(
          `Reset ${workspaceName.trim()} — content cleared, credits and access untouched.`,
        )
        setWorkspaceId('')
        setWorkspaceName('')
        setTyped('')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <section className="rounded-card border border-danger bg-bg p-5 shadow-card">
      <h2 className="text-[15px] font-semibold text-danger">Reset a workspace</h2>
      <p className="mt-1 text-[13px] text-muted">
        Clears everything that workspace has made. It cannot be undone, and there is no export
        first.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="type-eyebrow text-danger">This deletes</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink">
            {RESET_CLEARS.map((entry) => (
              <li key={entry.table}>{entry.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="type-eyebrow text-muted">This keeps</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
            {RESET_KEEPS.map((entry) => (
              <li key={entry.table}>{entry.label}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <label className="text-[12.5px] text-muted" htmlFor="reset-ws-id">
          Workspace id
        </label>
        <input
          id="reset-ws-id"
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
          disabled={pending}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="rounded-input border border-line bg-s1 px-3 py-2 text-[13px] text-ink"
        />

        <label className="text-[12.5px] text-muted" htmlFor="reset-ws-name">
          Its name, to confirm
        </label>
        <input
          id="reset-ws-name"
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          disabled={pending}
          placeholder="Acme Chai"
          className="rounded-input border border-line bg-s1 px-3 py-2 text-[13px] text-ink"
        />

        <label className="text-[12.5px] text-muted" htmlFor="reset-typed">
          Type that name again
        </label>
        <input
          id="reset-typed"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={pending}
          className="rounded-input border border-line bg-s1 px-3 py-2 text-[13px] text-ink"
        />

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            loading={pending}
            disabled={!armed}
            onClick={run}
            className="bg-danger text-white"
          >
            Reset this workspace
          </Button>
          {!armed && !pending ? (
            <span className="text-[12.5px] text-muted">
              Enter the id, then type the name twice to arm this.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
