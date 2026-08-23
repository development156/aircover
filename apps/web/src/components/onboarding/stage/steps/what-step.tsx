'use client'

import { AiLine } from '../ai-line'
import { CATEGORIES } from '../refs'
import type { StepProps } from './types'

/** 02 — Positioning. Either the sentence or the chip is enough to continue. */
export function WhatStep({ data, patch }: StepProps) {
  function pick(value: string): void {
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
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${data.category === c ? 'on' : ''}`}
              aria-pressed={data.category === c}
              onClick={() => pick(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {/* A statement of intent about what happens next, not a finding. */}
        <AiLine show={Boolean(data.category)}>
          Got it, <em>{data.category}</em>. I&rsquo;ll weight channels and formats that actually
          work for that.
        </AiLine>
      </div>
    </>
  )
}
