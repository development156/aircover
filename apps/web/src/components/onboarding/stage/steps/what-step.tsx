'use client'

import { useEffect, useRef, useState } from 'react'

import { AiLine } from '../ai-line'
import { CATEGORIES } from '../refs'
import type { StepProps } from './types'

/**
 * Is this category something the person typed rather than a chip they pressed?
 *
 * `data.category` is a free string everywhere it is read, so the custom value
 * lives in the same field and needs no second one. That matters: the field is
 * persisted to localStorage and rehydrated by `store.ts`, and a second field
 * would have to be defaulted, parsed and kept in step with this one forever.
 */
function isCustom(category: string): boolean {
  return category !== '' && !(CATEGORIES as readonly string[]).includes(category)
}

/** 02 — Positioning. Either the sentence or the chip is enough to continue. */
export function WhatStep({ data, patch }: StepProps) {
  // "Other" is open when they are typing one, or when a typed one came back
  // from a resumed session.
  const [otherOpen, setOtherOpen] = useState(() => isCustom(data.category))
  const otherRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (otherOpen) otherRef.current?.focus()
  }, [otherOpen])

  function pick(value: string): void {
    if (value === 'Other') {
      // Toggling Other shut clears what was typed, the same way pressing a
      // selected chip clears it. Leaving the text behind would keep a category
      // the person just switched off.
      if (otherOpen) {
        setOtherOpen(false)
        patch({ category: '' })
        return
      }
      setOtherOpen(true)
      patch({ category: '' })
      return
    }
    setOtherOpen(false)
    // Clicking the selected chip clears it — the source's toggle, kept because
    // a picker with no way back is a picker people get stuck in.
    patch({ category: data.category === value ? '' : value })
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Positioning</p>
        <h2 className="display">What does your brand actually do?</h2>
      </div>
      <div className="rise">
        <textarea
          className="ta"
          id="f-what"
          value={data.what}
          onChange={(e) => patch({ what: e.target.value })}
          placeholder="Tell us like you're explaining it to a smart friend."
          aria-label="What your brand does"
        />
        <p className="label" style={{ margin: '22px 0 11px' }}>
          Closest fit
        </p>
        <div
          className={`chips ${data.category ? 'has-on' : ''}`}
          id="cat-chips"
          role="group"
          aria-label="Business type"
        >
          {CATEGORIES.map((c) => {
            const on = c === 'Other' ? otherOpen : data.category === c
            return (
              <button
                key={c}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                aria-expanded={c === 'Other' ? otherOpen : undefined}
                onClick={() => pick(c)}
              >
                {c}
              </button>
            )
          })}
        </div>
        {otherOpen ? (
          <div className="field" style={{ marginTop: 11 }}>
            <input
              ref={otherRef}
              className="inp"
              id="f-cat-other"
              type="text"
              value={isCustom(data.category) ? data.category : ''}
              onChange={(e) => patch({ category: e.target.value })}
              /**
               * Enter must not reach the rail. The stage advances on Enter, and
               * a person finishing a word they are still typing would be carried
               * off the screen mid-answer.
               */
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              placeholder="Say it in a few words, like wedding photography or dental clinic"
              aria-label="Your kind of business"
            />
            {/* Why the words matter, said plainly. `intakeTextOf` joins this
                field into the text the classifier reads, so a real trade name is
                evidence in the way the word "Other" cannot be. */}
            <p className="micro" style={{ marginTop: 7, opacity: 0.72 }}>
              Sahoda reads these words the same way it reads your sentence above.
            </p>
          </div>
        ) : null}
        {/* A statement of intent about what happens next, not a finding. */}
        <AiLine show={Boolean(data.category)}>
          Got it, <em>{data.category}</em>. I&rsquo;ll weight channels and formats that actually
          work for that.
        </AiLine>
      </div>
    </>
  )
}
