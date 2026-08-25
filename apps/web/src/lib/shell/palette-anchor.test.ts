import { describe, expect, test } from 'vitest'

import { panelShift } from './palette-anchor'

/**
 * THE PALETTE OPENS UNDER THE FIELD THAT OPENED IT.
 *
 * The numbers below are the REAL ones, measured at 1920x1080 against the shipped
 * stylesheet with the rail expanded: trigger centre 1061, panel 520 wide,
 * viewport centre 960, overlay padding 16. Before this function existed the panel
 * sat 101px to the left of its own trigger.
 */

const AT_1920 = { triggerCenterX: 1061, panelWidth: 520, viewportWidth: 1920, pad: 16 }

describe('the panel follows its trigger', () => {
  test('closes the measured 101px gap exactly', () => {
    expect(panelShift(AT_1920)).toBe(101)
  })

  test('and a trigger already centred needs no shift', () => {
    expect(panelShift({ ...AT_1920, triggerCenterX: 960 })).toBe(0)
  })

  test('a trigger left of centre pulls the panel left', () => {
    // Not just "non-zero": the SIGN is the whole point. A shift with the wrong
    // sign doubles the gap instead of closing it, and reads in a diff as a fix.
    expect(panelShift({ ...AT_1920, triggerCenterX: 700 })).toBe(-260)
  })
})

describe('but never off the screen', () => {
  test('a trigger near the right edge is followed only as far as there is room', () => {
    // room = 960 - 260 - 16 = 684. The panel's right edge lands exactly on the
    // overlay's padding rather than under the trigger.
    expect(panelShift({ ...AT_1920, triggerCenterX: 1900 })).toBe(684)
  })

  test('and near the left edge, symmetrically', () => {
    expect(panelShift({ ...AT_1920, triggerCenterX: 20 })).toBe(-684)
  })

  test('the whole panel stays inside the padding at the clamp', () => {
    const shift = panelShift({ ...AT_1920, triggerCenterX: 1900 })
    const right = AT_1920.viewportWidth / 2 + shift + AT_1920.panelWidth / 2
    expect(right).toBeLessThanOrEqual(AT_1920.viewportWidth - AT_1920.pad)
  })
})

describe('and it centres rather than guessing', () => {
  test('with no trigger on screen at all', () => {
    // The trigger is `max-narrow:hidden`, so on a phone ⌘K opens a palette with
    // nothing to align to. Aligning to an absent control is meaningless.
    expect(panelShift({ ...AT_1920, triggerCenterX: null })).toBe(0)
  })

  test('when the viewport cannot hold the panel and its padding', () => {
    // `room` would be negative here, and an unguarded clamp inverts: Math.max of
    // a negative room against a positive want returns the want, pushing the panel
    // further off screen than doing nothing. This is the one input where the
    // arithmetic fails toward a broken layout rather than a cosmetic one.
    expect(panelShift({ triggerCenterX: 300, panelWidth: 520, viewportWidth: 400, pad: 16 })).toBe(
      0,
    )
  })

  test('a trigger measured as NaN is treated as no trigger', () => {
    // `getBoundingClientRect` on a display:none element gives zeroes, and a caller
    // dividing to find a centre can hand us NaN. NaN survives Math.max/min and
    // would reach the DOM as `translateX(NaNpx)`, which the browser drops — so the
    // panel would silently stop being positioned at all.
    expect(panelShift({ ...AT_1920, triggerCenterX: Number.NaN })).toBe(0)
  })
})
