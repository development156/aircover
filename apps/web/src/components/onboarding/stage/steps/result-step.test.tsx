import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { ResultStep } from './result-step'
import { DEFAULT_DATA } from '../store'

/**
 * The summary card must never count work the product did not do.
 *
 * The knowledge step does not gate, so ticking "Website" and leaving the address
 * blank is a thing people do. `sendSources` skips those, correctly. The card
 * counted the TICKS, so three ticks and no addresses read as "3 sources" over a
 * library that had received nothing.
 *
 * `sources.test.ts` proves the rule. This proves the CARD USES IT, which is the
 * half that a passing mutation showed can be missing while everything is green.
 */

const props = {
  door: { kind: 'none' } as never,
  wasFree: true,
  fallbackMessage: null,
  afterBuildNote: null,
  saving: false,
  saveError: null,
  themeError: null,
  onEnter: vi.fn(),
  onReview: vi.fn(),
}

const withSources = (sources: string[], sourceUrls: Record<string, string>) => ({
  ...DEFAULT_DATA,
  name: 'TRAINX',
  category: 'Training',
  audience: 'people learning a trade',
  sources,
  sourceUrls,
})

describe('the summary card, on knowledge sources', () => {
  /** THE DEFECT. */
  it('counts none when tiles were ticked and no address was given', () => {
    render(<ResultStep {...props} data={withSources(['Website', 'Instagram', 'Catalog'], {})} />)

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/none yet/i)
    expect(text).not.toMatch(/3 knowledge sources/i)
    expect(text).not.toMatch(/3 sources/i)
  })

  it('counts only the ticks that carry an address', () => {
    render(
      <ResultStep
        {...props}
        data={withSources(['Website', 'Instagram'], { Website: 'https://trainx.in' })}
      />,
    )

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/1 source(?!s)/i)
    expect(text).not.toMatch(/2 sources/i)
  })

  it('counts them all when every tick carries an address', () => {
    render(
      <ResultStep
        {...props}
        data={withSources(['Website', 'Instagram'], {
          Website: 'https://trainx.in',
          Instagram: 'https://instagram.com/trainx',
        })}
      />,
    )

    expect(document.body.textContent ?? '').toMatch(/2 sources/i)
  })
})
