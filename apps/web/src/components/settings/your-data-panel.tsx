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
import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { eraseConfirmationMatches } from '@/lib/privacy/confirm'

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
 * ## Where a just-erased person is sent, and why it is not the home page
 *
 * `/onboarding`, not `/`. The person now belongs to NO workspace, and `/`
 * redirects to `/home`, whose shell renders every panel against a null workspace
 * — a state this repo already has on record as reading "could not read balance"
 * and looking like a fault. `/onboarding` is the one route that handles somebody
 * with no workspace deliberately: it offers to make one. An erased customer is
 * exactly a new account, so that is where they belong.
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
        <li key={line.table} className="flex justify-between gap-4 type-body">
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
  // The SAME comparison the server action and the database use. Written once,
  // or the button greys itself on a rule the server does not share.
  const nameMatches = ready !== null && eraseConfirmationMatches(typed, ready.workspaceName)

  return (
    <SettingCard
      title="Your data"
      hint="Take a copy of everything in this workspace, or delete all of it."
    >
      {/*
        ── WHY THIS IS TWO ROWS AND NOT TWO ESSAYS ────────────────────────────
        MEASURED at 1440 on a seeded account: this panel ran 500 of the page's
        913px and held 122 words, while the thing a person actually came to
        /settings for — the workspace name — was a 200px card above it. An
        export utility and a delete utility had taken the screen.

        docs/37 §16 rule 4: this screen is a LIST, so the list leads and every
        entry is a row of the same shape. Nothing here is deleted — the download
        manifest is the DPDP claim about completeness and it moves into a
        disclosure a keyboard can reach, not out of the product.
      */}
      <SettingRow
        label="Download a copy"
        hint="One zip file with everything this workspace holds. It opens with a page you can read."
        control={
          /*
            SECONDARY, and this is the whole point of the lane.
            <Button> defaults to `primary`, which is the solid brand fill, so
            this control carried it by omission rather than by decision.
            MEASURED with scripts/design/accent-spend.mjs and the DOM
            attribution probe at 1440 light: this one button was 6,308 of the
            screen's 11,149 accent-bearing pixels — 57% of a CONFIGURATION
            screen's entire accent budget, spent on a utility nobody opens
            /settings to run. docs/37 §2.3: "a screen that configures something
            spends approximately zero."
          */
          <Button
            variant="secondary"
            onClick={() => void run()}
            disabled={download.kind === 'working'}
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            {download.kind === 'working' ? 'Downloading…' : 'Download my data'}
          </Button>
        }
      >
        <details className="group">
          <summary className="w-fit cursor-pointer type-meta text-muted underline-offset-2 hover:text-ink hover:underline">
            What is in the file
          </summary>
          <p className="mt-1.5 type-meta text-muted">
            Your posts and their per-channel wording, your Brand Brain, your conversations and
            enquiries, every credit movement, your pictures and documents, and how your posts
            performed. It lists anything it could not include and why — so you can tell an empty
            section from a missing one.
          </p>
        </details>

        {download.kind === 'working' ? (
          <p role="status" className="mt-1.5 type-meta text-muted">
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
          <p role="status" className="mt-1.5 type-meta text-muted">
            Saved <span className="font-medium">{download.filename}</span>. Open{' '}
            <span className="font-medium">your-data.html</span> inside it first.
          </p>
        ) : null}

        {download.kind === 'error' ? (
          <p role="alert" className="mt-1.5 type-meta text-danger">
            {download.message}
          </p>
        ) : null}
      </SettingRow>

      <SettingRow
        label="Delete everything"
        hint="Your posts, pictures, Brand Brain, conversations, enquiries, websites and linked accounts go for good, and it cannot be undone. Your credit and payment record is kept — it is what proves what you paid and what you were charged, so it is not ours to erase."
        control={
          /*
            Also secondary, and the reasoning is hierarchy rather than the
            accent budget: `destructive` is solid INK (there is no red in this
            palette), so it costs nothing in orange and everything in weight. A
            solid black block is the loudest object a light screen can hold, and
            on a list of four settings it made "delete my business" the thing
            the eye lands on first.

            Nothing is weakened by moving it. This control does not delete
            anything — it opens a dialog that counts what you have from the
            database and then requires the workspace name typed back. That
            dialog's confirm button IS `destructive`, which is where the weight
            belongs: on the irreversible click, not on the one that opens a
            page you can read.
          */
          <Button variant="secondary" onClick={openErase}>
            Delete everything
          </Button>
        }
      />

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
            <Button onClick={() => window.location.assign('/onboarding')}>Done</Button>
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
          <p className="type-body text-muted">Counting what you have…</p>
        ) : null}

        {erase.kind === 'failed' ? (
          <p role="alert" className="type-body text-danger">
            {erase.message}
          </p>
        ) : null}

        {erase.kind === 'done' ? (
          <div className="space-y-2 type-body text-muted">
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
              <h4 className="type-body font-semibold text-ink">What is deleted</h4>
              {ready.removed.length > 0 ? (
                <LineList lines={ready.removed} />
              ) : (
                <p className="mt-1 type-body text-muted">
                  This workspace holds nothing yet, so there is nothing to delete.
                </p>
              )}
              <p className="mt-1.5 type-body text-muted">
                Your pictures and documents go too, from storage as well as from here.
              </p>
            </div>

            <div>
              <h4 className="type-body font-semibold text-ink">What is kept</h4>
              <LineList lines={ready.kept} />
              <p className="mt-1.5 type-body text-muted">
                Your credit and payment record. It is the account of what you paid and what you were
                charged, it can settle a disagreement in your favour as easily as ours, and Indian
                tax law requires it to be kept for years. It holds a reference to you — for most
                rows a sign-in code rather than your name.
              </p>
            </div>

            <div>
              <label htmlFor="erase-confirm" className="type-body font-semibold text-ink">
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
    </SettingCard>
  )
}
