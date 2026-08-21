'use client'

import {
  AtSign,
  Check,
  Database,
  FileText,
  Globe,
  LayoutGrid,
  ShoppingBag,
  Upload,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { SOURCES } from '../refs'
import type { StepProps } from './types'

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  'i-globe': Globe,
  'i-at': AtSign,
  'i-file': FileText,
  'i-bag': ShoppingBag,
  'i-grid': LayoutGrid,
  'i-db': Database,
  'i-up': Upload,
}

/**
 * 06 — Knowledge. Optional; Continue is never gated here.
 *
 * ── THE ONE WORD THIS SCREEN DOES NOT COPY ───────────────────────────────────
 * The source flips a selected tile's sub-label to "Connected". Nothing is
 * connected: no OAuth runs here, no token is issued, and for Notion, Drive and
 * Shopify no adapter exists at all. "Connected" is a claim about work that has
 * not been done — the exact thing this file's own header forbids, and what
 * CLAUDE.md means by "no mock-success in prod paths".
 *
 * So a selected tile reads "Queued", which is the same word the reference cards
 * already use for the same situation and is true of every tile: the choice is
 * recorded on the brand, and nothing has been read yet.
 *
 * The SIGNAL still counts, and that is not a contradiction. "My brand knowledge
 * lives in Notion" is a fact about this business that the user told us and that
 * we keep. It is a signal about the brand, not a receipt for a fetch.
 */
export function KnowledgeStep({ data, patch }: StepProps) {
  function toggle(key: string): void {
    patch({
      sources: data.sources.includes(key)
        ? data.sources.filter((s) => s !== key)
        : [...data.sources, key],
    })
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Knowledge</p>
        <h2 className="display">What should your AI already know?</h2>
        <p className="lead step__lead">
          Tell Sahoda where your brand knowledge lives. It is recorded on your Brand Brain now and
          read when that source is connected.
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
      </div>
    </>
  )
}
