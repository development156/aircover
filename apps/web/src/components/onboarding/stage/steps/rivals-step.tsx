'use client'

import { useState } from 'react'

import { initialOf } from '../refs'
import type { StepProps } from './types'

/**
 * The optional rivals step. Entirely optional and the copy says so, which is
 * why the rail here carries a "Skip for now" beside the primary action rather
 * than a disabled Continue.
 */
export function RivalsStep({ data, patch }: StepProps) {
  const [draft, setDraft] = useState('')

  function add(): void {
    const v = draft.trim()
    if (!v) return
    if (data.competitors.includes(v)) {
      setDraft('')
      return
    }
    patch({ competitors: [...data.competitors, v] })
    setDraft('')
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Optional</p>
        <h2 className="display">Want Sahoda to understand your market too?</h2>
        <p className="lead step__lead">
          Entirely optional. It sharpens positioning, but your Brand Brain works without it.
        </p>
      </div>
      <div className="rise">
        <div className="field">
          <input
            className="inp"
            id="f-comp"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              e.stopPropagation()
              add()
            }}
            placeholder="Add a competitor, press Enter"
            aria-label="Competitor"
          />
        </div>
        <div className="reflist" id="complist">
          {data.competitors.map((c) => (
            <div className="refcard" key={c}>
              <span className="refcard__fav">{initialOf(c)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="refcard__t">{c}</div>
                <div className="refcard__d">Competitor · tracked for positioning</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
