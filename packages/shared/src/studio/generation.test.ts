import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STAMP_OPTIONS,
  StampAnchorSchema,
  StampOptionsSchema,
  StampSizeStepSchema,
} from './generation'

/**
 * PINS `StampOptionsSchema`'s DEFAULTS TO TODAY'S BEHAVIOUR, EXACTLY.
 *
 * The whole point of the contract is that a request naming none of these three
 * fields draws the same picture the Studio has always drawn: on, bottom-right,
 * 14% of the shorter edge (`medium`). If a default here ever drifted, every
 * caller that predates the feature would silently draw a different picture,
 * which is the one thing this schema exists to prevent.
 */
describe("StampOptionsSchema: an absent field is exactly today's behaviour", () => {
  it('parses {} to the fully-populated default', () => {
    expect(StampOptionsSchema.parse({})).toEqual({
      enabled: true,
      anchor: 'bottom-right',
      sizeStep: 'medium',
    })
  })

  it('DEFAULT_STAMP_OPTIONS is exactly that same value, not a second hand-written copy', () => {
    expect(DEFAULT_STAMP_OPTIONS).toEqual(StampOptionsSchema.parse({}))
  })

  it('a partial object fills only the missing fields, never the ones given', () => {
    expect(StampOptionsSchema.parse({ enabled: false })).toEqual({
      enabled: false,
      anchor: 'bottom-right',
      sizeStep: 'medium',
    })
    expect(StampOptionsSchema.parse({ anchor: 'top-left' })).toEqual({
      enabled: true,
      anchor: 'top-left',
      sizeStep: 'medium',
    })
  })

  it('refuses an anchor outside the four named corners', () => {
    expect(StampAnchorSchema.safeParse('centre').success).toBe(false)
  })

  it('refuses a size step outside the three named steps', () => {
    expect(StampSizeStepSchema.safeParse('huge').success).toBe(false)
  })

  it('accepts every one of the four anchors and three size steps', () => {
    for (const anchor of ['bottom-right', 'bottom-left', 'top-right', 'top-left']) {
      expect(StampAnchorSchema.safeParse(anchor).success, anchor).toBe(true)
    }
    for (const sizeStep of ['small', 'medium', 'large']) {
      expect(StampSizeStepSchema.safeParse(sizeStep).success, sizeStep).toBe(true)
    }
  })
})
