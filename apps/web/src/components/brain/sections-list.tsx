import type { Route } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { BRAIN_SECTIONS, type BrainSectionKey } from '@/lib/brand/fields'
import { sectionTally } from '@/lib/brand/brain-ring'
import { cn } from '@/lib/utils'
import type { Provenance } from '@/lib/brand/provenance'
import { SECTION_ICON, SECTION_ICON_TILE } from './section-icon'

/** Which tab owns each section. One place, so a row cannot link to the wrong one. */
const SECTION_TAB: Record<BrainSectionKey, Route> = {
  brand_persona: '/brain/identity',
  hook: '/brain/identity',
  customer_persona: '/brain/identity',
  voice: '/brain/voice',
  taboo: '/brain/voice',
  alignment: '/brain',
}

/**
 * THE FIVE PARTS OF A BRAND BRAIN, AS ONE SCANNABLE LIST.
 *
 * ── WHY THE BLURB IS GONE, AND WHAT REPLACED IT ─────────────────────────────
 * Each row carried `section.blurb` — a sentence explaining what "Voice" or
 * "Red lines" means — under its title, which made every row three lines tall
 * and the card ~460px for five links. Founder's ruling, 2026-09-03: replace
 * descriptions with short labels and let numbers, bars and icons carry the
 * information.
 *
 * The blurb is NOT deleted from the product. `fields.ts` still holds it and
 * `section-card.tsx` still renders it on the tab that owns each section, which
 * is where somebody is actually reading about that section rather than choosing
 * between five. This list's job is choosing.
 *
 * ── THE ROW IS ONE LINE, IN THE ORDER A PERSON READS IT ─────────────────────
 * icon, title, tally, bar, chevron. The tally is the answer to "how far along
 * is this", the bar is the same answer without reading, and the chevron says
 * the row goes somewhere.
 */
export function SectionsList({ provenance }: { provenance: Provenance }) {
  return (
    <section className="surface-ring-lift rounded-card bg-surface" aria-labelledby="brain-sections">
      <header className="flex min-h-[46px] items-center border-b border-line-soft px-4 py-3">
        <h2 id="brain-sections" className="text-[14px] font-semibold tracking-[-0.01em]">
          Sections
        </h2>
      </header>
      <ul>
        {BRAIN_SECTIONS.map((section) => {
          const tally = sectionTally(provenance, section.key)
          const pct = tally.total === 0 ? 0 : Math.round((tally.confirmed / tally.total) * 100)
          const Icon = SECTION_ICON[section.key]
          return (
            <li key={section.key}>
              <Link
                href={SECTION_TAB[section.key]}
                className="flex items-center gap-3 border-b border-line-soft px-4 py-3 transition-micro last:border-b-0 hover:bg-s2"
              >
                {/* `dark:bg-s2` is not decoration. apps/web/CLAUDE.md: in dark
                    `--t50` stays warm-light while `--acc` flips to Orange300 and
                    the pair measures ~1.7:1. The surface swap is the documented
                    fix, and the ring gives the swapped surface the edge the same
                    note says it needs — `--surface-2` separates at 1.04:1 on its
                    own, which is chrome rather than separation. */}
                <span aria-hidden className={cn(SECTION_ICON_TILE, 'size-8')}>
                  <Icon className="size-[15px]" strokeWidth={2} />
                </span>

                <span className="min-w-0 flex-1 truncate text-[13px] font-[650] text-ink">
                  {section.title}
                </span>

                <span className="shrink-0 text-[12px] text-muted tabular-nums">
                  {tally.confirmed}/{tally.total}
                </span>

                {/* Same split language as the lead card: solid is confirmed,
                    hatched is still a guess. Hatched rather than blank because
                    these fields DO have values — they are just nobody's answer
                    yet, and blank would read as empty. */}
                <span
                  className="surface-ring flex h-[6px] w-[88px] shrink-0 overflow-hidden rounded-pill max-narrow:hidden"
                  role="img"
                  aria-label={`${tally.confirmed} of ${tally.total} confirmed`}
                >
                  <span className="h-full bg-ink" style={{ width: `${pct}%` }} />
                  <span
                    className="h-full flex-1"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(-45deg, transparent 0 5px, var(--hatch) 5px 6px)',
                    }}
                  />
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
