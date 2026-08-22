import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ChangeCard } from './change-card'
import type { RadarChange } from '@/lib/radar/types'
import { ReadMark, SeenMark } from './marks'

/**
 * ONE RULING, TWO SITES.
 *
 * docs/26 §3.1b (2026-08-22): the fourth rung, `.is-simulated`, is for a
 * FIXTURE — output that never touched a platform. A figure Sahoda worked out
 * FROM readings it actually took is a weak claim, not a false one, and wears
 * `.is-proposed`. If inference and fixture share the hatch, nothing on any
 * screen tells a customer that a number never left the building.
 *
 * ── WHY THIS FILE EXISTS RATHER THAN ONE ASSERTION ──────────────────────────
 * Radar draws the same claim at two scales: a CHIP that names the state in words
 * (`marks.tsx`) and the PANEL the claim sits in, which echoes the class
 * (`change-card.tsx`). The panel echo had no test of any kind. That is exactly
 * the shape where one of a pair gets changed and the other does not, and the
 * screen then says two different things about the same reading — with a green
 * suite, because the one site that was covered is the one that was fixed.
 *
 * So both are asserted here, in one file, and the ruling is asserted against
 * the DOC as well: if §3.1b is ever reworded, this goes red rather than
 * silently guarding a rule nobody holds any more.
 */

const REPO = join(import.meta.dirname, '../../../../..')

const CHANGE: RadarChange = {
  id: 'chg_1',
  competitorId: 'cmp_1',
  competitorName: 'Rival Books',
  kind: 'copy',
  observedOn: '2026-08-22',
  evidence: [],
  observation: { summary: 'Their homepage headline changed.', figures: [] },
  // The reading is what makes this card carry the rung at all — a change with
  // nothing worth interpreting renders no panel and would make the second test
  // vacuous rather than failing.
  reading: { text: 'They are leaning on Sunday events.', brandBasis: null },
}

describe('the fourth rung means NOT REAL, and Radar readings are not fixtures', () => {
  test('the CHIP wears the unratified rung, never the fixture hatch', () => {
    render(<ReadMark />)
    const chip = screen.getByText('Our read')
    expect(chip.className).toContain('is-proposed')
    expect(chip.className).not.toContain('is-simulated')
  })

  test('the PANEL echoes the chip, and the two cannot disagree', () => {
    // The site with no coverage at all before this file.
    const { container } = render(<ChangeCard change={CHANGE} channels={['instagram']} />)
    const panel = container.querySelector('[data-radar-reading]')
    expect(panel, 'the reading panel did not render').not.toBeNull()
    expect(panel!.className).toContain('is-proposed')
    expect(panel!.className).not.toContain('is-simulated')

    // And they agree. Asserting each against a literal would still let them
    // drift to two DIFFERENT correct-looking rungs.
    const chip = screen.getByText('Our read')
    const rungOf = (el: Element) =>
      (el.className.match(/is-(real|committed|proposed|simulated)/) ?? [])[0]
    expect(rungOf(panel!)).toBe(rungOf(chip))
  })

  test('an OBSERVED fact still wears the solid rung, so the pair still separates', () => {
    // The other half of the ruling. A test that only checked "not is-simulated"
    // would pass with everything flattened onto one rung.
    render(<SeenMark />)
    expect(screen.getByText('Seen').className).toContain('is-real')
  })

  test('the ruling this file enforces is still the ruling in docs/26', () => {
    const doc = readFileSync(join(REPO, 'docs/26_Design_System_v4.md'), 'utf8')
    const section = doc.slice(doc.indexOf('### 3.1b'))
    expect(section, 'docs/26 §3.1b is missing').not.toBe('')
    // Whitespace-tolerant: the sentence WRAPS in the source markdown, and a
    // regex that pins the wrap would fail on a reflow rather than on a change
    // of rule — which is the failure that teaches nobody anything.
    expect(section.replace(/\s+/g, ' ')).toMatch(/is-simulated. is for a \*\*fixture\*\*/i)
    expect(section.replace(/\s+/g, ' ')).toMatch(/Radar joins them/i)
  })
})
