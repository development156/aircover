'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { AiLine } from '../ai-line'
import type { StepProps } from './types'

const MORE: { id: string; key: 'age' | 'loc' | 'role' | 'interests'; label: string }[] = [
  { id: 'f-age', key: 'age', label: 'Age range' },
  { id: 'f-loc', key: 'loc', label: 'Location' },
  { id: 'f-role', key: 'role', label: 'Role or title' },
  { id: 'f-int', key: 'interests', label: 'Interests' },
]

/**
 * 03 — Audience.
 *
 * Progressive disclosure: the four extra fields do not exist until the first
 * answer has earned them. On resume they are present from the start, because
 * the answer that earned them is already there.
 */
export function AudienceStep({ data, patch }: StepProps) {
  const audience = data.audience.trim()
  const earned =
    audience.length >= 3 || Boolean(data.age || data.loc || data.role || data.interests)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Audience</p>
        <h2 className="display">Who are you trying to reach?</h2>
      </div>
      <div className="rise">
        <div className="field">
          <input
            className="inp"
            id="f-aud"
            type="text"
            value={data.audience}
            onChange={(e) => patch({ audience: e.target.value })}
            placeholder="Describe your ideal customer"
            aria-label="Ideal customer"
          />
        </div>

        <div className={`more ${open ? 'open' : ''}`} id="more-aud" hidden={!earned}>
          <button
            type="button"
            className="more__t"
            id="more-aud-t"
            aria-expanded={open}
            aria-controls="more-aud-b"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden />
            Want to tell us more?
          </button>
          <div className="more__body" id="more-aud-b">
            <div className="more__inner">
              <div className="more__grid">
                {MORE.map((f) => (
                  <div className="field field--sm" key={f.id}>
                    <input
                      className="inp"
                      id={f.id}
                      /* Collapsed is 0fr rows + overflow hidden, not
                         display:none, so Tab reached four invisible fields
                         and focus left the screen. MEASURED 2026-09-07. */
                      tabIndex={open ? 0 : -1}
                      value={data[f.key]}
                      onChange={(e) => patch({ [f.key]: e.target.value })}
                      placeholder={f.label}
                      aria-label={f.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <AiLine show={audience.length >= 3}>
          Noted. Everything I write will be aimed at <em>{audience}</em>, not at everyone.
        </AiLine>
      </div>
    </>
  )
}
