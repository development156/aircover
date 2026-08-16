import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ComingSoon } from './coming-soon'

/**
 * Renders the REAL <ComingSoon> and writes its markup for the visual check,
 * plus asserts the constraints that are the whole point of the screen.
 *
 * The prohibitions below are the load-bearing part. A coming-soon screen fails
 * by being TOO reassuring — a date, a progress bar, an email box — and each of
 * those is easy to add later in good faith. These tests make adding one a
 * failing build rather than a judgement call.
 */

const SAMPLE = {
  feature: 'Audience Twin',
  summary:
    'Build a working model of who you sell to, so every post is written for a real person rather than an average.',
  includes: [
    'Segments from your own customers',
    'What each segment responds to',
    'Objections to answer',
  ],
} as const

describe('the coming-soon screen', () => {
  test('names the feature, says what it will do, and lists what it includes', () => {
    const { getByRole, getByText } = render(<ComingSoon {...SAMPLE} />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Audience Twin')
    expect(getByText(/written for a real person/)).toBeTruthy()
    expect(getByText('Objections to answer')).toBeTruthy()
  })

  test('says plainly that it is not built — in words, not only in styling', () => {
    const { getByText } = render(<ComingSoon {...SAMPLE} />)
    expect(getByText('Not built yet')).toBeTruthy()
    expect(getByText(/Nothing on this screen is connected yet/)).toBeTruthy()
  })

  test('promises NO timeline — no dates, no "soon", no countdown, no percentage', () => {
    const { container } = render(<ComingSoon {...SAMPLE} />)
    const text = container.textContent ?? ''
    // "soon" is checked case-insensitively and as a whole word, so the component
    // name itself does not count and "Soon!" cannot sneak past.
    expect(/\bsoon\b/i.test(text), 'says "soon"').toBe(false)
    expect(/\b(20\d\d|Q[1-4]|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)).toBe(
      false,
    )
    expect(/\d+\s?%/.test(text), 'shows a percentage').toBe(false)
    expect(/\b(launch|launching|shipping|eta|coming)\b/i.test(text), 'implies a date').toBe(false)
    // No progress bar, meter, or anything that reports completion.
    expect(container.querySelector('progress, meter, [role="progressbar"]')).toBeNull()
  })

  test('captures nothing — no form, no input, no notify-me', () => {
    const { container } = render(<ComingSoon {...SAMPLE} />)
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  test('the not-built chip does not wear a check glyph', () => {
    // Rung 4's glyph is a CHECK, which reads as "done" — the opposite claim.
    // `hideGlyph` is why this screen can use the calm rung at all.
    const { container } = render(<ComingSoon {...SAMPLE} />)
    const chip = container.querySelector('[data-rung="calm"]')
    expect(chip, 'chip missing').not.toBeNull()
    expect(chip?.querySelector('svg'), 'chip renders a glyph').toBeNull()
  })

  test('writes the fragment for the visual check', () => {
    const { container } = render(<ComingSoon {...SAMPLE} />)
    const here = dirname(fileURLToPath(import.meta.url))
    const out = resolve(here, '../../../..', '.ui-port-shots')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'coming-soon.fragment.html'), container.innerHTML, 'utf8')
    expect(container.innerHTML).toContain('Not built yet')
  })
})
