import type { Route } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { BRAIN_SECTIONS, type BrainSectionKey } from '@/lib/brand/fields'
import { sectionTally } from '@/lib/brand/brain-ring'
import type { Provenance } from '@/lib/brand/provenance'

/**
 * The Overview's navigable section list (reference `.lrow`).
 *
 * Replaces a flat grid of five equal cards, which gave no reading order and no
 * way to see which part of the brand was least settled. Each row states its own
 * confirmed/total and links to the tab that owns it.
 *
 * The bar is CONFIRMED-over-total, not completeness. Same reason as the lead
 * card: a section can be entirely filled and entirely unchecked, and a bar that
 * showed 100% for that would be the most misleading thing on the page.
 */

/** Which tab owns each section. One place, so a row cannot link to the wrong one. */
const SECTION_TAB: Record<BrainSectionKey, Route> = {
  brand_persona: '/brain/identity',
  hook: '/brain/identity',
  customer_persona: '/brain/identity',
  voice: '/brain/voice',
  taboo: '/brain/voice',
  alignment: '/brain',
}

export function SectionsList({ provenance }: { provenance: Provenance }) {
  return (
    <section className="surface-ring rounded-card bg-surface" aria-labelledby="brain-sections">
      <header className="flex min-h-[46px] items-center border-b border-line-soft px-4 py-3">
        <h2 id="brain-sections" className="text-[14px] font-semibold tracking-[-0.01em]">
          Sections
        </h2>
      </header>

      <ul>
        {BRAIN_SECTIONS.map((section) => {
          const tally = sectionTally(provenance, section.key)
          const pct = tally.total === 0 ? 0 : Math.round((tally.confirmed / tally.total) * 100)

          return (
            <li key={section.key}>
              <Link
                href={SECTION_TAB[section.key]}
                className="flex items-center gap-3 border-b border-line-soft px-4 py-3 transition-micro last:border-b-0 hover:bg-s2"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13px] font-[650] text-ink">{section.title}</span>
                    <span className="text-[11px] text-muted tabular-nums">
                      {tally.confirmed}/{tally.total} confirmed
                    </span>
                  </span>
                  <span className="mt-1 block text-[12px] text-muted">{section.blurb}</span>
                  {/* Same split language as the lead card: solid is confirmed,
                      hatched is still a guess. */}
                  <span className="surface-ring mt-2 flex h-[6px] w-full max-w-[220px] overflow-hidden rounded-pill">
                    <span className="h-full bg-ink" style={{ width: `${pct}%` }} />
                    <span
                      className="h-full flex-1"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(-45deg, transparent 0 5px, var(--hatch) 5px 6px)',
                      }}
                    />
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
