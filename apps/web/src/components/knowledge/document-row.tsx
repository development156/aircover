'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Globe, MessageSquareWarning, Type } from 'lucide-react'

import { deleteKnowledgeDocument, reindexDocument } from '@/app/actions/knowledge'
import type { DeleteKnowledgeState } from '@/app/actions/knowledge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { KnowledgeDocument } from '@/lib/knowledge/store'
import { passagePhrase, sourceLabel, statusView } from '@/lib/knowledge/status-view'

/**
 * One document in the library.
 *
 * ── WHAT THE ROW IS BUILT AROUND ────────────────────────────────────────────
 * Where it came from, and whether Sahoda can actually use it. Not the file. The
 * coming-soon screen this replaces made the same argument for its table: a fact
 * with no source is indistinguishable from an invented fact that happens to be
 * right, so the origin is a column and not a detail.
 *
 * ── MOBILE FIRST ────────────────────────────────────────────────────────────
 * The layout is a single column that becomes a row at `wide`. At 390px the
 * title, the badge, the reason and the two actions each get their own line, and
 * every control clears the 44px touch floor.
 */

const SOURCE_ICON = { pdf: FileText, url: Globe, text: Type } as const

export function DocumentRow({ document }: { document: KnowledgeDocument }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<DeleteKnowledgeState | null>(null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)

  const view = statusView(document)
  const Icon = SOURCE_ICON[document.source_kind]
  const passages = passagePhrase(document)

  const onDelete = (acknowledge: boolean) => {
    startTransition(async () => {
      const result = await deleteKnowledgeDocument(document.id, acknowledge)
      if (result.needsAcknowledgement) {
        // REFUSED BY THE DATABASE, not by a check here. The count in this dialog
        // is a second read written for the sentence; the decision that matters
        // is made inside the transaction that does the delete.
        setConfirming(result)
        return
      }
      setConfirming(null)
      setNotice(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <li className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4 wide:flex-row wide:items-start">
      <span className="mt-px hidden size-8 shrink-0 place-items-center rounded-md bg-brand-wash text-accent wide:grid">
        <Icon size={16} strokeWidth={1.8} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 type-h3 break-words text-ink">{document.title}</h3>
          <Badge rung={view.rung}>{view.label}</Badge>
        </div>

        {/* WHERE IT CAME FROM — the point of the row. `break-all` because a URL
            with no spaces is the one string that will blow out a 390px column. */}
        <p className="mt-1 type-sm text-muted">
          <span className="font-[550]">{sourceLabel(document.source_kind)}</span>
          {document.source_kind === 'text' ? null : (
            <>
              {' · '}
              <span className="break-all">{document.source_ref}</span>
            </>
          )}
          {passages ? (
            <>
              {' · '}
              <span className="num">{passages}</span>
            </>
          ) : null}
        </p>

        {view.detail ? (
          <p className="mt-1.5 max-w-[62ch] type-sm text-muted">{view.detail}</p>
        ) : null}

        {/* ── THE OBSERVATION, AND ONLY WHEN THERE IS ONE ──────────────────
            Rendered for `> 0` and NOTHING for zero. A "no instructions found"
            line would be a safety claim, and `quarantine.ts` records the
            measurement that makes such a claim unsupportable: twelve published
            prompt-injection defences fell to a 2025 joint OpenAI / Anthropic /
            Google DeepMind team at over 90%. What this number IS is a count of
            spans the neutraliser actually rewrote — a fact about a
            transformation we performed, not a verdict on the document. */}
        {document.addressed_instructions > 0 ? (
          <p className="mt-2 flex items-start gap-2 rounded-input bg-s1 px-2.5 py-2 type-sm text-muted">
            <MessageSquareWarning
              size={14}
              strokeWidth={1.8}
              aria-hidden
              className="mt-px shrink-0 text-accent"
            />
            <span>
              This document contains text written as if to address an assistant —{' '}
              <span className="num">{document.addressed_instructions}</span>{' '}
              {document.addressed_instructions === 1 ? 'place' : 'places'}. Sahoda reads those as
              words on a page, the same as any other sentence in it, and never as instructions.
              Nothing it says can confirm anything about your brand on its own.
            </span>
          </p>
        ) : null}

        {notice ? (
          <p aria-live="polite" className="mt-2 type-sm text-ink">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {view.retryable ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await reindexDocument(document.id)
                setNotice(result.message)
                router.refresh()
              })
            }
          >
            Read it again
          </Button>
        ) : null}
        <Button variant="ghost" disabled={pending} onClick={() => onDelete(false)}>
          Delete
        </Button>
      </div>

      {/* ── DELETING MUST NOT SILENTLY DEGRADE A BRAND BUILT FROM IT ────────
          The dialog opens only because the database REFUSED the first attempt.
          So this is not a courtesy prompt that a caller could forget to show —
          the refusal is the thing that produced it. */}
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={`Delete “${document.title}”?`}
        description={confirming?.message}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button variant="primary" disabled={pending} onClick={() => onDelete(true)}>
              Delete anyway
            </Button>
          </div>
        }
      >
        <p className="type-body text-muted">
          Sahoda keeps what it already learned from this document. What goes is the document itself,
          so a field that came from it will no longer be able to show you the passage it came from.
        </p>
      </Modal>
    </li>
  )
}
