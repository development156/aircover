import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { CertaintyMark } from './certainty-mark'

/**
 * CONFIRMED vs INFERRED must be legible without colour.
 *
 * This distinction is the one thing the reference design cannot express — it has
 * no concept of a field a human approved versus one a model guessed — so it has
 * to survive the port intact. The palette cannot carry it in hue (there is no
 * green/red pair), which means it has to live in fill weight, glyph and label.
 *
 * The fixture provenance below is a TEST FIXTURE for a visual check. It is never
 * rendered to a user and no brand data is written anywhere: the live app shows
 * an honest empty state for a workspace with no brain, and producing a real one
 * needs an AI resolve, which is forbidden in this pass.
 */

describe('confirmed vs inferred survives greyscale', () => {
  test('the two states differ by FILL and by GLYPH, not only by colour', () => {
    const confirmed = render(<CertaintyMark state="confirmed" />)
    const guessed = render(<CertaintyMark state="guessed" />)

    const a = confirmed.container.querySelector('[data-certainty]')
    const b = guessed.container.querySelector('[data-certainty]')

    // Fill weight: `.is-real` is a solid fill, `.is-proposed` is a dashed
    // outline. Different structural signatures, both from the Certainty System.
    expect(a?.className).toContain('is-real')
    expect(b?.className).toContain('is-proposed')

    // Glyph: one each, and they must not be the same icon.
    const ga = a?.querySelector('svg')?.getAttribute('class') ?? ''
    const gb = b?.querySelector('svg')?.getAttribute('class') ?? ''
    expect(ga).not.toBe('')
    expect(gb).not.toBe('')
    expect(ga).not.toBe(gb)

    // Label: always present as text, never as a title-only affordance.
    expect(a?.textContent).toContain('Confirmed')
    expect(b?.textContent).toContain('Guess')
  })

  test('writes the fragment for the greyscale check', () => {
    const rows = (['confirmed', 'guessed'] as const)
      .map((state) => {
        const { container } = render(<CertaintyMark state={state} />)
        return `<figure class="cell"><figcaption>${state}</figcaption>${container.innerHTML}</figure>`
      })
      .join('\n')

    const here = dirname(fileURLToPath(import.meta.url))
    const out = resolve(here, '../../../../..', '.ui-port-shots')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'certainty.fragment.html'), rows, 'utf8')
    expect(rows).toContain('is-real')
  })
})
