'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { OpsQaRun } from '@sahoda/shared'

import { finalizeQaRun, recordQaArtifact, saveQaDraft, signQaUpload } from '@/app/actions/ops-qa'
import { QaScreenshots, type QaThumb } from '@/components/admin/qa-screenshots'
import { checkFinalize, saveLabel, saveToneOf, type QaDraft } from '@/lib/ops/qa-draft'
import { putSignedUpload, uploadQaArtifact } from '@/lib/ops/qa-upload'
import { useQaAutosave } from '@/lib/ops/use-qa-autosave'
import { cn } from '@/lib/utils'

/**
 * D4 · Manual run composer (doc 13 §11).
 *
 * The orchestrator: it owns the draft, wires autosave, and handles paste at the
 * root so `⌘V` works wherever the cursor is. Everything it decides is decided
 * in a tested module — `checkFinalize`, `saveLabel`, `uploadQaArtifact` — so
 * this file is wiring rather than judgement.
 */

type Verdict = 'pass' | 'fail' | 'blocked'

const VERDICTS: { value: Verdict; label: string; tone: string }[] = [
  { value: 'pass', label: 'Pass', tone: 'data-[on=true]:bg-ok-bg data-[on=true]:text-ok' },
  { value: 'fail', label: 'Fail', tone: 'data-[on=true]:bg-danger-bg data-[on=true]:text-danger' },
  {
    value: 'blocked',
    label: 'Blocked',
    tone: 'data-[on=true]:bg-danger-bg data-[on=true]:text-danger',
  },
]

interface QaComposerProps {
  openDraft: OpsQaRun | null
  /** Signed thumbnails for whatever the open draft already carries. */
  restoredThumbs: readonly QaThumb[]
  taskCodes: readonly string[]
}

export function QaComposer({ openDraft, restoredThumbs, taskCodes }: QaComposerProps) {
  const [draft, setDraft] = useState<QaDraft>({
    runId: openDraft?.id ?? null,
    taskCode: openDraft?.task_code ?? null,
    summary: openDraft?.summary_plain ?? '',
    details: openDraft?.details ?? '',
  })
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [thumbs, setThumbs] = useState<readonly QaThumb[]>(restoredThumbs)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [sealing, startSealing] = useTransition()

  const autosave = useQaAutosave(draft, saveQaDraft, (runId) =>
    setDraft((current) => ({ ...current, runId })),
  )

  const patch = (next: Partial<QaDraft>) => setDraft((current) => ({ ...current, ...next }))

  async function attach(files: readonly File[]) {
    setAttachError(null)

    // A screenshot needs a run to belong to, and the debounce may not have
    // fired yet. Save now rather than dropping the file.
    const runId = draft.runId ?? (await autosave.flush())
    if (!runId) {
      setAttachError('We could not start this run, so the screenshot was not attached.')
      return
    }

    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
      const preview = URL.createObjectURL(file)
      setThumbs((current) => [
        ...current,
        { key, url: preview, caption: file.name, state: 'uploading' },
      ])

      const result = await uploadQaArtifact(runId, file, file, {
        sign: signQaUpload,
        put: putSignedUpload,
        record: recordQaArtifact,
      })

      setThumbs((current) =>
        current.map((thumb) =>
          thumb.key === key
            ? {
                ...thumb,
                state: result.ok ? 'stored' : 'failed',
                message: result.ok ? undefined : result.message,
              }
            : thumb,
        ),
      )
      if (!result.ok) setAttachError(result.message)
    }
  }

  function seal() {
    const check = checkFinalize(draft, verdict)
    if (!check.ok) {
      toast.error(check.message)
      return
    }

    startSealing(async () => {
      // Flush first: the last two seconds of typing are part of the record.
      await autosave.flush()

      const result = await finalizeQaRun({
        runId: draft.runId,
        status: verdict,
        summary: draft.summary,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`Run recorded as ${verdict}`)
      setDraft({ runId: null, taskCode: null, summary: '', details: '' })
      setVerdict(null)
      setThumbs([])
    })
  }

  const tone = saveToneOf(autosave.state)

  return (
    <section
      aria-labelledby="qa-composer"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files)
        if (files.length === 0) return
        event.preventDefault()
        void attach(files)
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="qa-composer" className="text-[15px] font-bold">
          Record a manual run
        </h2>
        <span
          aria-live="polite"
          className={cn(
            'text-[12px] tabular-nums',
            tone === 'ok' && 'text-ok',
            tone === 'busy' && 'text-muted',
            tone === 'warn' && 'text-warn',
          )}
        >
          {saveLabel(autosave.state)}
        </span>
      </div>

      <div className="grid gap-3 narrow:grid-cols-[minmax(0,12rem)_1fr]">
        <div>
          <label className="block text-[12px] font-semibold" htmlFor="qa-task">
            Task
          </label>
          <select
            id="qa-task"
            value={draft.taskCode ?? ''}
            onChange={(event) => patch({ taskCode: event.target.value || null })}
            className="mt-1 w-full rounded-input border border-line bg-s1 px-3 py-2 text-[14px] focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="">Not linked</option>
            {taskCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-semibold" htmlFor="qa-summary">
            What you checked
          </label>
          <input
            id="qa-summary"
            value={draft.summary}
            onChange={(event) => patch({ summary: event.target.value })}
            placeholder="Walked the credit flow end to end"
            className="mt-1 w-full rounded-input border border-line bg-s1 px-3 py-2 text-[14px] focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      <label className="mt-3 block text-[12px] font-semibold" htmlFor="qa-details">
        Notes
      </label>
      <textarea
        id="qa-details"
        value={draft.details}
        rows={7}
        onChange={(event) => patch({ details: event.target.value })}
        placeholder={'Steps, what you saw, anything that surprised you.\nMarkdown is fine.'}
        className="mt-1 w-full rounded-input border border-line bg-s1 px-3 py-2 font-mono text-[13px] leading-relaxed focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      <div className="mt-3">
        <QaScreenshots
          items={thumbs}
          blockedReason={null}
          error={attachError}
          onFiles={(files) => void attach(files)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Result</legend>
          {VERDICTS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-on={verdict === option.value}
              onClick={() => setVerdict(option.value)}
              className={cn(
                'rounded-pill border border-line px-3 py-1 text-[13px] font-semibold transition-micro',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                option.tone,
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          onClick={seal}
          disabled={sealing}
          className="rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
        >
          {sealing ? 'Recording…' : 'Record run'}
        </button>
      </div>

      <p className="mt-2 text-[12px] text-muted">
        A recorded run cannot be edited afterwards — it is the evidence someone reads later.
      </p>
    </section>
  )
}
