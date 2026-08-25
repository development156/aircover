'use client'

import { AtSign, Check, Globe, ShoppingBag } from 'lucide-react'
import type { ComponentType } from 'react'

import { SOURCES } from '../refs'
import type { StepProps } from './types'

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  'i-globe': Globe,
  'i-at': AtSign,
  'i-bag': ShoppingBag,
}

/**
 * 06 — Knowledge. Optional; Continue is never gated here.
 *
 * ── WHAT CHANGED, AND THE SENTENCE THAT WAS NOT TRUE ─────────────────────────
 * This screen used to say "It is recorded on your Brand Brain now and read when
 * that source is connected." The first half was false. A picked tile put its
 * key into `sources`, `sources` lived in localStorage, and the form posted to
 * the resolve carries model, regime, locale, doorText, refusal and name. Nothing
 * reached the Brand Brain, or any table at all.
 *
 * A picked tile now ASKS for the address, and the address is sent to
 * `addUrlDocument` — the knowledge library's own write path, which fetches the
 * page, stores it and indexes it. Nothing on that path costs a credit: parsing
 * is local, chunking is arithmetic, search is the database's index and no model
 * is called. `knowledge.ts` says so in its own header.
 *
 * ── THE ONE WORD THIS SCREEN STILL DOES NOT USE ──────────────────────────────
 * "Connected" stays out. Nothing here runs an OAuth handshake or issues a token;
 * an address is read. A picked tile says "Queued", which is true at the moment
 * it is pressed: it is read when you build the brain, not while you type.
 */
export function KnowledgeStep({ data, patch }: StepProps) {
  function toggle(key: string): void {
    const on = data.sources.includes(key)
    // Dropping the address with the tile: leaving it behind would send a page
    // for a source the person just switched off.
    const { [key]: _removed, ...rest } = data.sourceUrls
    patch({
      sources: on ? data.sources.filter((s) => s !== key) : [...data.sources, key],
      sourceUrls: on ? rest : data.sourceUrls,
    })
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Knowledge</p>
        <h2 className="display">What should your AI already know?</h2>
        <p className="lead step__lead">
          Point Sahoda at a page and it reads it when you build your Brand Brain. Reading a page
          costs nothing.
        </p>
      </div>
      <div className="rise">
        <div className="srcgrid" id="srcgrid" role="group" aria-label="Knowledge sources">
          {SOURCES.map((s) => {
            const on = data.sources.includes(s.key)
            const Icon = ICONS[s.icon] ?? Globe
            return (
              <button
                key={s.key}
                type="button"
                className={`src ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(s.key)}
              >
                <span className="src__ic">
                  <Icon size={24} strokeWidth={1.6} />
                </span>
                <div className="src__t">{s.key}</div>
                <div className="src__s">
                  {on ? (
                    <>
                      <Check size={12} strokeWidth={3} aria-hidden /> Queued
                    </>
                  ) : (
                    s.detail
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* One field per picked tile, in the grid's own order rather than the
            order they were pressed — a list that reorders itself under the
            cursor is a list people lose their place in. */}
        {SOURCES.filter((s) => data.sources.includes(s.key)).map((s) => (
          <div className="field" key={s.key} style={{ marginTop: 14 }}>
            <p className="label" style={{ margin: '0 0 9px' }}>
              {s.ask}
            </p>
            <input
              className="inp"
              id={`f-src-${s.key.replace(/\s+/g, '-').toLowerCase()}`}
              type="text"
              inputMode="url"
              value={data.sourceUrls[s.key] ?? ''}
              onChange={(e) =>
                patch({ sourceUrls: { ...data.sourceUrls, [s.key]: e.target.value } })
              }
              /* The stage advances on Enter, and this step is never gated, so a
                 person part-way through an address would be carried off it. */
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              placeholder={s.placeholder}
              aria-label={s.ask}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
    </>
  )
}
