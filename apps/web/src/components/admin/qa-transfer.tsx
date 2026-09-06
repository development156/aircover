'use client'

import { useState, useTransition } from 'react'

import { exportQaJson, importQaJson } from '@/app/actions/ops-qa-transfer'
import type { ImportSummary } from '@/lib/ops/qa-transfer'

/**
 * D4 · JSON export/import (doc 13 §11).
 *
 * "Conflicts and rejects listed in a result panel, never silently merged" — so
 * the panel is the point of this component, not the two buttons. It reports
 * three things people otherwise assume: how many of how many landed, which ones
 * were already there, and that the screenshots did NOT travel in the file.
 */

type Panel =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'imported'; summary: ImportSummary }
  | { kind: 'exported'; filename: string; truncated: boolean }

export function QaTransfer() {
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const [busy, startBusy] = useTransition()

  function download() {
    startBusy(async () => {
      const result = await exportQaJson()
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

      setPanel({ kind: 'exported', filename: result.filename, truncated: result.truncated })
    })
  }

  function upload(file: File) {
    startBusy(async () => {
      const text = await file.text()
      const result = await importQaJson(text)
      setPanel(
        result.ok
          ? { kind: 'imported', summary: result.summary }
          : { kind: 'error', message: result.message },
      )
    })
  }

  return (
    <section
      aria-labelledby="qa-transfer"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
    >
      <h2 id="qa-transfer" className="text-[15px] font-bold">
        Take the QA record with you
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Exports the 500 most recent runs as JSON. Screenshots are described in the file but stay in
        the bucket. An import restores the runs, not the images.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-primary-strong-foreground disabled:pointer-events-none disabled:opacity-45"
        >
          {busy ? 'Working…' : 'Export JSON'}
        </button>

        <label className="cursor-pointer rounded-pill border border-line px-4 py-2 text-[13px] font-semibold transition-micro hover:bg-s1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) upload(file)
            }}
          />
        </label>
      </div>

      {panel.kind !== 'none' ? (
        <div
          role="status"
          className="mt-3 rounded-card border border-line bg-s1 p-3 text-[13px]"
          data-testid="qa-transfer-panel"
        >
          {panel.kind === 'error' ? <p className="text-danger">{panel.message}</p> : null}

          {panel.kind === 'exported' ? (
            <>
              <p>
                Saved <span className="font-mono text-[12px]">{panel.filename}</span>.
              </p>
              {/* Truncation is stated where the person is, not only inside the
                  file they may never open. */}
              {panel.truncated ? (
                <p className="mt-1 text-warn">
                  There are more runs than one export holds. This file has the 500 most recent.
                </p>
              ) : null}
            </>
          ) : null}

          {panel.kind === 'imported' ? (
            <>
              <p>{panel.summary.headline}</p>
              {panel.summary.artifactNote ? (
                <p className="mt-1 text-muted">{panel.summary.artifactNote}</p>
              ) : null}
              {panel.summary.conflicts.length > 0 ? (
                <>
                  <p className="mt-2 font-semibold">Already recorded, so left alone:</p>
                  <ul className="mt-1 space-y-[2px]">
                    {panel.summary.conflicts.map((conflict) => (
                      <li key={conflict.id} className="font-mono text-[11px] text-muted">
                        {conflict.id} · {conflict.reason}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
