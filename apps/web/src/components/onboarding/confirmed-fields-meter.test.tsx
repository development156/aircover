import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SOURCE_MODEL, SOURCE_OWNER, type BrandFieldMetaMap } from '@sahoda/shared'

import { ConfirmedFieldsMeter } from './confirmed-fields-meter'
import { BRAIN_FIELDS, RING_DENOMINATOR } from '@/lib/brand/fields'

/**
 * THE NUMBER FOUR SCREENS HAVE TO AGREE ON.
 *
 * The reveal used to lead with "Fields filled 100%" while /home, /brain and
 * /brain/resolve all reported the same brain as 0 of 15 confirmed. Three agreed
 * and the one that disagreed was the first thing a new customer ever saw.
 *
 * These assert the CLAIM, not the wording: a percentage that counts how full
 * the payload is must not appear, and the count must come from the same
 * `brainRing` the other three screens read.
 */
function meta(confirmedPaths: readonly string[]): BrandFieldMetaMap {
  const out: BrandFieldMetaMap = {}
  for (const field of BRAIN_FIELDS) {
    const confirmed = confirmedPaths.includes(field.path)
    out[field.path] = {
      kind: field.metaKind,
      confirmed,
      source: confirmed ? SOURCE_OWNER : SOURCE_MODEL,
    }
  }
  return out
}

describe('the reveal reports confirmations, not fullness', () => {
  it('reads zero on a fresh resolve, which is what the other three screens say', () => {
    render(<ConfirmedFieldsMeter fieldMeta={undefined} />)
    expect(screen.getByText(`0 of ${RING_DENOMINATOR}`)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  /**
   * The defect itself, as an assertion. A resolve fills every leaf on the
   * payload, so the OLD meter read 100 on exactly this input while the card
   * beside it said the inputs were blank.
   */
  it('never shows 100% for a brain nobody has confirmed', () => {
    render(<ConfirmedFieldsMeter fieldMeta={undefined} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).not.toBe('100')
    expect(screen.queryByText(/Fields filled/i)).toBeNull()
    expect(screen.queryByText(/100%/)).toBeNull()
  })

  it('counts a confirmed field, and only a confirmed one', () => {
    const first = BRAIN_FIELDS[0]!
    render(<ConfirmedFieldsMeter fieldMeta={meta([first.path])} />)
    expect(screen.getByText(`1 of ${RING_DENOMINATOR}`)).toBeTruthy()
  })

  it('reaches the denominator only when every field is confirmed', () => {
    render(<ConfirmedFieldsMeter fieldMeta={meta(BRAIN_FIELDS.map((f) => f.path))} />)
    expect(screen.getByText(`${RING_DENOMINATOR} of ${RING_DENOMINATOR}`)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  it('says plainly that nothing came from the customer yet', () => {
    render(<ConfirmedFieldsMeter fieldMeta={undefined} />)
    expect(screen.getByText(/none of it came from you yet/i)).toBeTruthy()
  })
})
