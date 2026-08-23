'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import { hostOf, initialOf, kindOf, REF_PENDING_NOTE } from '../refs'
import type { StepProps } from './types'

/** 05 — References. Optional; Continue is never gated here. */
export function ReferencesStep({ data, patch }: StepProps) {
  const [draft, setDraft] = useState('')

  function add(): void {
    const raw = draft.trim()
    if (!raw) return
    // Adding the same link twice would put two identical cards on screen and
    // count it twice. The signal id is the url, so the count already dedupes —
    // the list has to agree with it.
    if (data.refs.some((r) => r.url === raw)) {
      setDraft('')
      return
    }
    const host = hostOf(raw)
    patch({ refs: [...data.refs, { url: raw, host, kind: kindOf(host) }] })
    setDraft('')
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">References</p>
        <h2 className="display">Show us what &ldquo;good&rdquo; looks like.</h2>
        <p className="lead step__lead">
          Websites, Instagram accounts, Pinterest boards, competitors: anything you admire.
        </p>
      </div>
      <div className="rise">
        <div className="field">
          <input
            className="inp"
            id="f-ref"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Consumed here, so the global Enter handler does not ALSO
              // advance the step the moment a link is added.
              e.preventDefault()
              e.stopPropagation()
              add()
            }}
            placeholder="Paste a URL, press Enter"
            aria-label="Reference URL"
          />
        </div>
        <div className="reflist" id="reflist">
          {data.refs.map((ref) => (
            <div className="refcard" key={ref.url}>
              <span className="refcard__fav">{initialOf(ref.host)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="refcard__t">{ref.host}</div>
                {/* "queued for analysis" — nothing has looked at this yet, so
                    the card may not describe how it looks. */}
                <div className="refcard__d">
                  {ref.kind} · {REF_PENDING_NOTE}
                </div>
              </div>
              <button
                type="button"
                className="refcard__x"
                aria-label={`Remove ${ref.host}`}
                onClick={() => patch({ refs: data.refs.filter((r) => r.url !== ref.url) })}
              >
                <X size={14} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="field field--sm" style={{ marginTop: 26 }}>
          <input
            className="inp"
            id="f-refnote"
            value={data.refNote}
            onChange={(e) => patch({ refNote: e.target.value })}
            placeholder="What do you like about these?"
            aria-label="What you like about the references"
          />
        </div>
      </div>
    </>
  )
}
