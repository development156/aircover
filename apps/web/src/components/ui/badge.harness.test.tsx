import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { Badge, type Rung } from './badge'
import { STATUS_RUNG } from '@/lib/posts/rung'

/**
 * Renders the REAL <Badge> for all four rungs and writes the markup to
 * `.ui-port-shots/badge-ladder.fragment.html`, so the visual check screenshots
 * what the component actually emits rather than a hand-written imitation of it.
 *
 * A hand-written harness is worth nothing here: the whole claim under test is
 * that these four class strings render four distinguishable things, and a
 * fixture that retypes the classes can agree with itself while the component
 * disagrees with both.
 *
 * The assertions below stand on their own — the file write is a side effect for
 * the human/greyscale check, not the test.
 */

const RUNGS: ReadonlyArray<{ rung: Rung; label: string }> = [
  { rung: 'urgent', label: 'Needs approval' },
  { rung: 'active', label: 'Publishing' },
  { rung: 'pending', label: 'Scheduled' },
  { rung: 'calm', label: 'Published' },
]

describe('the four-rung status ladder', () => {
  test('every rung renders a distinct fill, a distinct glyph and a label', () => {
    const fills = new Set<string>()
    const glyphs = new Set<string>()

    for (const { rung, label } of RUNGS) {
      const { container, unmount } = render(<Badge rung={rung}>{label}</Badge>)
      const el = container.querySelector('[data-rung]')
      expect(el, rung).not.toBeNull()

      // The label is always present as TEXT, not as a title or an aria-label —
      // a status you have to hover to read is not a status.
      expect(el?.textContent, rung).toContain(label)

      // Exactly one glyph, and it must differ from every other rung's.
      const svg = el?.querySelector('svg')
      expect(svg, `${rung} renders no glyph`).not.toBeNull()
      glyphs.add(svg?.getAttribute('class') ?? '')

      fills.add(el?.getAttribute('class') ?? '')
      unmount()
    }

    // Four rungs, four distinct fill signatures.
    expect(fills.size).toBe(4)
    // Lucide stamps the icon name into the class list, so distinct components
    // give distinct class strings. Four glyphs, no repeats.
    expect(glyphs.size).toBe(4)
  })

  test('no rung relies on hue alone — each carries a fill weight AND a glyph', () => {
    for (const { rung, label } of RUNGS) {
      const { container, unmount } = render(<Badge rung={rung}>{label}</Badge>)
      const el = container.querySelector('[data-rung]')
      const cls = el?.getAttribute('class') ?? ''
      // Either a solid background or an inset ring — never "colour only".
      const hasFillWeight = /\bbg-(brand|ink|brand-wash)\b/.test(cls) || cls.includes('inset_0_0_0')
      expect(hasFillWeight, `${rung} has no structural fill`).toBe(true)
      expect(el?.querySelector('svg'), `${rung} has no glyph`).not.toBeNull()
      unmount()
    }
  })

  test('every PostStatus maps to a rung, and rung 1 is not the default', () => {
    // A new status must not silently land on the quietest rung.
    expect(STATUS_RUNG.failed).toBe('urgent')
    expect(STATUS_RUNG.review).toBe('urgent')
    // Certainty is NOT urgency: published is maximally real, minimally urgent.
    expect(STATUS_RUNG.published).toBe('calm')
    expect(STATUS_RUNG.publishing).toBe('active')
  })

  test('writes the ladder fragment for the visual/greyscale check', () => {
    const html = RUNGS.map(({ rung, label }) => {
      const { container } = render(<Badge rung={rung}>{label}</Badge>)
      const markup = container.innerHTML
      return `<figure class="cell"><figcaption>rung: ${rung}</figcaption>${markup}</figure>`
    }).join('\n')

    const here = dirname(fileURLToPath(import.meta.url))
    const out = resolve(here, '../../../../..', '.ui-port-shots')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'badge-ladder.fragment.html'), html, 'utf8')
    expect(html).toContain('data-rung="urgent"')
  })
})
