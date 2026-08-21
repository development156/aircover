'use client'

import { AiLine } from '../ai-line'
import type { StepProps } from './types'

/** 01 — Brand basics. Name is required; the site is not, and says so. */
export function BasicsStep({ data, patch }: StepProps) {
  const name = data.name.trim()

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Brand basics</p>
        <h2 className="display">What&rsquo;s your brand called?</h2>
      </div>
      <div className="rise">
        <div className="field">
          <input
            className="inp"
            id="f-name"
            type="text"
            value={data.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Sahoda Labs"
            autoComplete="organization"
            aria-label="Brand name"
          />
        </div>
        <div className="field field--sm">
          <input
            className="inp"
            id="f-site"
            type="url"
            value={data.site}
            onChange={(e) => patch({ site: e.target.value })}
            placeholder="https://yourbrand.com  (optional)"
            autoComplete="url"
            aria-label="Website"
          />
        </div>
        {/* A restatement, not a claim. We know the name; we know nothing else. */}
        <AiLine show={name.length >= 2}>
          Nice. Let&rsquo;s understand what <em>{name}</em> means beyond the logo.
        </AiLine>
      </div>
    </>
  )
}
