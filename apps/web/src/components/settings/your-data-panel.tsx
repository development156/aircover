'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'

import { exportWorkspaceData } from '@/app/actions/export-workspace'
import { Button } from '@/components/ui/button'

/**
 * "Your data" — the DPDP surface: take a copy, and ask for deletion.
 *
 * ## Why deletion is a paragraph and not a button
 *
 * Deleting a workspace cannot be done from this app. MEASURED from `pg_policies`
 * on 2026-08-19: of the 30 tables carrying a `workspace_id`, **15 have no DELETE
 * policy for members** — and they include the ones holding the most personal
 * data: `brand_memory` (the whole Brand Brain), `inbox_threads` and
 * `inbox_messages` (customer conversations), and `leads` (names, emails, phone
 * numbers from site forms). `apps/web` has no service-role client, deliberately,
 * so there is no route around that.
 *
 * A button would therefore delete about half of it and report success. Under
 * CLAUDE.md's own rule a control that cannot do what it says is a dead end, and
 * this is the worst kind: the failure is invisible, the customer believes their
 * data is gone, and it is not.
 *
 * So it renders as a `<div>`, never a `<button disabled>`, and it names the real
 * route — a request Sahoda fulfils — rather than implying a self-serve one that
 * does not exist. What it takes to make it a button is written down in
 * `docs/31_Your_Data.md`.
 */

type Panel =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; filename: string; omitted: number }

export function YourDataPanel() {
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const [busy, startBusy] = useTransition()

  function download() {
    startBusy(async () => {
      const result = await exportWorkspaceData()
      if (!result.ok) {
        setPanel({ kind: 'error', message: result.message })
        return
      }

      const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)

      setPanel({ kind: 'done', filename: result.filename, omitted: result.omitted })
    })
  }

  return (
    <section
      aria-labelledby="your-data"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
    >
      <h2 id="your-data" className="text-[15px] font-bold">
        Your data
      </h2>

      <p className="mt-1 text-[13px] text-muted">
        Take a copy of everything in this workspace, or ask for it to be deleted.
      </p>

      <div className="mt-4 space-y-1.5">
        <h3 className="text-[13.5px] font-semibold">Download a copy</h3>
        <p className="text-[13px] text-muted">
          One JSON file: your posts and their per-channel wording, your Brand Brain, your
          conversations and enquiries, every credit movement, and how your posts performed. The file
          also lists anything it could not include, and why — so you can tell an empty section from
          a missing one.
        </p>
        <Button onClick={download} disabled={busy} className="mt-2">
          <Download size={15} strokeWidth={2} aria-hidden />
          {busy ? 'Preparing…' : 'Download my data'}
        </Button>

        {panel.kind === 'done' ? (
          <p role="status" className="text-[12.5px] text-muted">
            Saved <span className="font-medium">{panel.filename}</span>.{' '}
            {panel.omitted > 0 ? (
              <>
                <span className="tabular-nums">{panel.omitted}</span>{' '}
                {panel.omitted === 1 ? 'thing is' : 'things are'} listed in the file as not
                included, with the reason.
              </>
            ) : (
              'Nothing was left out.'
            )}
          </p>
        ) : null}

        {panel.kind === 'error' ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {panel.message}
          </p>
        ) : null}
      </div>

      {/* A div, never a disabled button — see the note above. There is no control
          here to be greyed out, because there is no self-serve deletion to grey. */}
      <div className="mt-5 space-y-1.5 border-t border-line pt-4">
        <h3 className="text-[13.5px] font-semibold">Delete everything</h3>
        <p className="text-[13px] text-muted">
          Email <span className="font-medium">support@sahodalabs.com</span> from the address you
          signed up with and ask for this workspace to be deleted. It is done by hand today, not
          self-serve.
        </p>
        <p className="text-[13px] text-muted">
          Your posts, pictures, Brand Brain, conversations, enquiries and linked accounts are
          removed. Your credit and payment record is kept — it is what proves what you paid and what
          you were charged, so it is not ours to erase.
        </p>
      </div>
    </section>
  )
}
