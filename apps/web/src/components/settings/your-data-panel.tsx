'use client'

import { useCallback, useState, useTransition } from 'react'
import { Download } from 'lucide-react'

import {
  previewWorkspaceErasure,
  type ErasureLine,
  type ErasurePreviewState,
} from '@/app/actions/erasure-preview'
import { eraseWorkspaceData } from '@/app/actions/erase-workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

/**
 * "Your data" — the DPDP surface: take a copy, and delete everything.
 *
 * ## Deletion used to be a paragraph, and the paragraph was honest
 *
 * It asked the customer to send an email, because MEASURED from `pg_policies`,
 * 26 of the 47 workspace-owned tables have no DELETE policy for a member — among
 * them `brand_memory`, `inbox_threads`, `inbox_messages` and `leads`, which hold
 * the most personal data in the product. `apps/web` has no service-role client,
 * deliberately. So a button here would have deleted about half of it and
 * reported success: the worst kind of failure, because it is invisible and the
 * customer believes their data is gone.
 *
 * `public.erase_workspace` is what changed. It is one `SECURITY DEFINER`
 * transaction, so the button can now do what it says.
 *
 * `packages/db/tests/deletion_reach.pglite.test.ts` used to assert this section
 * rendered as a `<div>` and never as a button. Those assertions were RIGHT while
 * they were true and they pin an absence, so they were rewritten in the same
 * commit that made the button real — not deleted, and not worked around.
 *
 * ## Two steps, and the second one is typed
 *
 * The first click opens a dialog that states what goes and what stays FROM REAL
 * COUNTS, read out of the database at that moment. The second needs the
 * workspace's name typed back. Both are re-checked on the server, and the
 * database re-checks the name again after that: this is a callable endpoint
 * whatever the screen does.
 *
 * ## The download shows real bytes
 *
 * `fetch` + a stream reader, not a spinner. The archive can carry a customer's
 * whole photo library, so "Preparing…" with no number is a screen that looks
 * broken for a minute — and a fake progress bar would be worse, because it
 * would be lying about something the person is watching.
 */

type Download =
  | { kind: 'idle' }
  | { kind: 'working'; received: number; total: number | null }
  | { kind: 'done'; filename: string }
  | { kind: 'error'; message: string }

type Erase =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: Extract<ErasurePreviewState, { ok: true }> }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; rowsRemoved: number; filesRemoved: number }

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `filename="x.zip"` out of a Content-Disposition, or the fallback. */
function filenameFrom(header: string | null, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(header ?? '')
  return match?.[1] ?? fallback
}

function LineList({ lines }: { lines: ErasureLine[] }) {
  return (
    <ul className="mt-1.5 space-y-0.5">
      {lines.map((line) => (
        <li key={line.table} className="flex justify-between gap-4 text-[13px]">
          <span className="text-ink">{line.describes}</span>
          <span className="tabular-nums text-muted">{line.rows}</span>
        </li>
      ))}
    </ul>
  )
}

export function YourDataPanel() {
  const [download, setDownload] = useState<Download>({ kind: 'idle' })
  const [erase, setErase] = useState<Erase>({ kind: 'closed' })
  const [typed, setTyped] = useState('')
  const [erasing, startErasing] = useTransition()

  const run = useCallback(async () => {
    setDownload({ kind: 'working', received: 0, total: null })
    try {
      const response = await fetch('/api/privacy/export')
      if (!response.ok || response.body === null) {
        // The route answers plain text on purpose, so this IS the sentence to
        // show rather than a status code the person can do nothing with.
        const text = await response.text().catch(() => '')
        setDownload({
          kind: 'error',
          message: text.trim() || 'We could not build that export, so nothing was downloaded.',
        })
        return
      }

      const length = Number(response.headers.get('content-length'))
      const total = Number.isFinite(length) && length > 0 ? length : null
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        setDownload({ kind: 'working', received, total })
      }

      const filename = filenameFrom(
        response.headers.get('content-disposition'),
        'sahoda-export.zip',
      )
      const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      setDownload({ kind: 'done', filename })
    } catch {
      setDownload({
        kind: 'error',
        message: 'The download stopped before it finished. Nothing was saved — try again.',
      })
    }
  }, [])

  const openErase = useCallback(() => {
    setTyped('')
    setErase({ kind: 'loading' })
    void previewWorkspaceErasure().then((preview) => {
      setErase(
        preview.ok ? { kind: 'ready', preview } : { kind: 'failed', message: preview.message },
      )
    })
  }, [])

  const confirmErase = useCallback(() => {
    startErasing(async () => {
      const result = await eraseWorkspaceData(typed)
      if (!result.ok) {
        setErase({ kind: 'failed', message: result.message })
        return
      }
      setErase({ kind: 'done', rowsRemoved: result.rowsRemoved, filesRemoved: result.filesRemoved })
    })
  }, [typed])

  const ready = erase.kind === 'ready' ? erase.preview : null
  const nameMatches =
    ready !== null && typed.trim().toLowerCase() === ready.workspaceName.trim().toLowerCase()

  return (
    <section
      aria-labelledby="your-data"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
    >
      <h2 id="your-data" className="text-[15px] font-bold">
        Your data
      </h2>

      <p className="mt-1 text-[13px] text-muted">
        Take a copy of everything in this workspace, or delete all of it.
      </p>

      <div className="mt-4 space-y-1.5">
        <h3 className="text-[13.5px] font-semibold">Download a copy</h3>
        <p className="text-[13px] text-muted">
          One zip file: your posts and their per-channel wording, your Brand Brain, your
          conversations and enquiries, every credit movement, your pictures and documents, and how
          your posts performed. It opens with a page you can read, and it lists anything it could
          not include and why — so you can tell an empty section from a missing one.
        </p>
        <Button onClick={() => void run()} disabled={download.kind === 'working'} className="mt-2">
          <Download size={15} strokeWidth={2} aria-hidden />
          {download.kind === 'working' ? 'Downloading…' : 'Download my data'}
        </Button>

        {download.kind === 'working' ? (
          <p role="status" className="text-[12.5px] text-muted">
            {/* Real bytes, from the stream. Never a bar that moves on a timer. */}
            <span className="tabular-nums">{formatBytes(download.received)}</span>
            {download.total === null ? (
              <> so far. Large libraries take a minute.</>
            ) : (
              <>
                {' '}
                of <span className="tabular-nums">{formatBytes(download.total)}</span>.
              </>
            )}
          </p>
        ) : null}

        {download.kind === 'done' ? (
          <p role="status" className="text-[12.5px] text-muted">
            Saved <span className="font-medium">{download.filename}</span>. Open{' '}
            <span className="font-medium">your-data.html</span> inside it first.
          </p>
        ) : null}

        {download.kind === 'error' ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {download.message}
          </p>
        ) : null}
      </div>

      <div className="mt-5 space-y-1.5 border-t border-line pt-4">
        <h3 className="text-[13.5px] font-semibold">Delete everything</h3>
        <p className="text-[13px] text-muted">
          Your posts, pictures, Brand Brain, conversations, enquiries, websites and linked accounts
          are deleted for good. Your credit and payment record is kept — it is what proves what you
          paid and what you were charged, so it is not ours to erase.
        </p>
        <p className="text-[13px] text-muted">
          Download a copy first if you want one. Deleting cannot be undone.
        </p>
        <Button variant="destructive" onClick={openErase} className="mt-2">
          Delete everything
        </Button>
      </div>

      <Modal
        open={erase.kind !== 'closed'}
        onClose={() => setErase({ kind: 'closed' })}
        title={erase.kind === 'done' ? 'Your workspace is deleted' : 'Delete everything?'}
        description={
          erase.kind === 'done'
            ? undefined
            : 'This cannot be undone. Read what goes and what stays.'
        }
        footer={
          erase.kind === 'done' ? (
            <Button onClick={() => window.location.assign('/')}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setErase({ kind: 'closed' })}>
                Keep my workspace
              </Button>
              <Button
                variant="destructive"
                disabled={!nameMatches || erasing}
                onClick={confirmErase}
              >
                {erasing ? 'Deleting…' : 'Delete everything for good'}
              </Button>
            </>
          )
        }
      >
        {erase.kind === 'loading' ? (
          <p className="text-[13px] text-muted">Counting what you have…</p>
        ) : null}

        {erase.kind === 'failed' ? (
          <p role="alert" className="text-[13px] text-danger">
            {erase.message}
          </p>
        ) : null}

        {erase.kind === 'done' ? (
          <div className="space-y-2 text-[13px] text-muted">
            <p>
              <span className="tabular-nums">{erase.rowsRemoved}</span> records and{' '}
              <span className="tabular-nums">{erase.filesRemoved}</span> files were deleted.
            </p>
            <p>
              Your credit and payment record is kept, and nothing in it can be reached from this app
              any more. Your sign-in account is separate — close that with your sign-in provider if
              you want it gone too.
            </p>
          </div>
        ) : null}

        {ready !== null ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-[13px] font-semibold text-ink">What is deleted</h4>
              {ready.removed.length > 0 ? (
                <LineList lines={ready.removed} />
              ) : (
                <p className="mt-1 text-[13px] text-muted">
                  This workspace holds nothing yet, so there is nothing to delete.
                </p>
              )}
              <p className="mt-1.5 text-[13px] text-muted">
                Your pictures and documents go too, from storage as well as from here.
              </p>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-ink">What is kept</h4>
              <LineList lines={ready.kept} />
              <p className="mt-1.5 text-[13px] text-muted">
                Your credit and payment record. It is the account of what you paid and what you were
                charged, it can settle a disagreement in your favour as easily as ours, and Indian
                tax law requires it to be kept for years. It holds a reference to you — for most
                rows a sign-in code rather than your name.
              </p>
            </div>

            <div>
              <label htmlFor="erase-confirm" className="text-[13px] font-semibold text-ink">
                Type <span className="font-mono">{ready.workspaceName}</span> to confirm
              </label>
              <Input
                id="erase-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                className="mt-1.5"
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
