'use client'

import { useState } from 'react'

import { COMPETITOR_KIND_LABELS, type CompetitorKind } from '@/lib/radar/types'

import { hostOf, initialOf } from '../refs'
import type { Rival } from '../store'
import type { StepProps } from './types'

const KINDS = Object.keys(COMPETITOR_KIND_LABELS) as CompetitorKind[]

/**
 * The optional rivals step. Entirely optional and the copy says so, which is
 * why the rail here carries a "Skip for now" beside the primary action rather
 * than a disabled Continue.
 *
 * ── WHY IT ASKS FOR THREE THINGS AND NOT A NAME ──────────────────────────────
 * It used to take one free-text line and the card under it read "Competitor ·
 * tracked for positioning". Nothing tracked it: the list went to localStorage
 * and the form posted to the resolve carries only model, regime, locale,
 * doorText, refusal and name.
 *
 * It is sent now, to `addCompetitor`, which is the same server action the Radar
 * watch list uses. That action needs exactly what this screen now asks for — a
 * name you will recognise, a public address to read, and which of the three
 * kinds of page it is — so the fields are Radar's requirements rather than a
 * shape invented here. Ask for less and the write is refused; ask for something
 * else and it is refused differently.
 */
export function RivalsStep({ data, patch }: StepProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<CompetitorKind>('website')
  const [error, setError] = useState<string | null>(null)

  function add(): void {
    const cleanName = name.trim()
    const cleanUrl = url.trim()
    // The two sentences are different on purpose: "you gave no name" and "you
    // gave no address" are different mistakes with different fixes.
    if (!cleanName) {
      setError('Give this business a name you will recognise.')
      return
    }
    if (!cleanUrl) {
      setError('Paste their public address, so Sahoda knows where to read them.')
      return
    }
    if (data.competitors.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      setError('That one is already on the list.')
      return
    }
    patch({ competitors: [...data.competitors, { name: cleanName, url: cleanUrl, kind }] })
    setName('')
    setUrl('')
    setKind('website')
    setError(null)
  }

  function remove(target: Rival): void {
    patch({ competitors: data.competitors.filter((c) => c !== target) })
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
        <p className="label" style={{ margin: '0 0 11px' }}>
          What do you call them?
        </p>
        <div className="field">
          <input
            className="inp"
            id="f-comp"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunrise Bakery"
            aria-label="Competitor name"
            autoComplete="off"
          />
        </div>

        <p className="label" style={{ margin: '18px 0 11px' }}>
          What kind of page is it?
        </p>
        <div className="chips has-on" role="group" aria-label="Kind of page">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? 'on' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {COMPETITOR_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <p className="label" style={{ margin: '18px 0 11px' }}>
          Their public address
        </p>
        <div className="field">
          <input
            className="inp"
            id="f-comp-url"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Stopped here as well as prevented: the stage advances on Enter,
              // and adding a competitor must not also leave the screen.
              e.preventDefault()
              e.stopPropagation()
              add()
            }}
            placeholder="https://sunrisebakery.in"
            aria-label="Competitor public address"
            autoComplete="off"
          />
        </div>
        <p className="micro" style={{ marginTop: 7, opacity: 0.72 }}>
          Press Enter to add them. Sahoda reads this page on its weekly scan.
        </p>
        {error ? (
          <p className="micro" style={{ marginTop: 7 }} role="alert">
            {error}
          </p>
        ) : null}

        <div className="reflist" id="complist">
          {data.competitors.map((c) => {
            const host = hostOf(c.url || c.name)
            return (
              <div className="refcard" key={`${c.name}|${c.url}`}>
                <span className="refcard__fav">{initialOf(host)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="refcard__t">{c.name}</div>
                  <div className="refcard__d">
                    {/* A resumed session can hold a name saved before this
                        screen asked for an address. Saying it plainly beats
                        dropping the row or pretending it can be watched. */}
                    {c.url
                      ? `${COMPETITOR_KIND_LABELS[c.kind]} · ${host}`
                      : 'No address yet, so this one cannot be watched. Add it again with one.'}
                  </div>
                </div>
                <button
                  type="button"
                  className="chip"
                  onClick={() => remove(c)}
                  aria-label={`Remove ${c.name}`}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
