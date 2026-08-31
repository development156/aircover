import { describe, expect, test } from 'vitest'

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  canZoomIn,
  canZoomOut,
  describeZoom,
  fitted,
  isFitted,
  panBy,
  transformFor,
  zoomBy,
  type Viewport,
} from './viewport'

/**
 * LOOKING CLOSER, AND ALWAYS BEING ABLE TO GET BACK.
 *
 * The failure this module's tests exist to prevent is not a wrong number, it is
 * somebody zoomed into a corner of their own picture with no way out, or a frame
 * showing empty space where a photograph should be.
 */

describe('the fit', () => {
  test('starts at a hundred per cent, centred', () => {
    expect(fitted()).toEqual({ zoom: MIN_ZOOM, x: 0, y: 0 })
    expect(isFitted(fitted())).toBe(true)
  })

  test('a moved or zoomed view is not the fit', () => {
    expect(isFitted({ zoom: 200, x: 0, y: 0 })).toBe(false)
    expect(isFitted({ zoom: MIN_ZOOM, x: 0.1, y: 0 })).toBe(false)
  })
})

describe('zooming', () => {
  test('one step in is one step', () => {
    expect(zoomBy(fitted(), 1).zoom).toBe(MIN_ZOOM + ZOOM_STEP)
  })

  test('it cannot go below the fit or past the ceiling', () => {
    expect(zoomBy(fitted(), -5).zoom).toBe(MIN_ZOOM)
    expect(zoomBy({ zoom: MAX_ZOOM, x: 0, y: 0 }, 5).zoom).toBe(MAX_ZOOM)
  })

  /**
   * THE ONE THAT MATTERS FOR GETTING UN-LOST. At the fit the whole picture is
   * visible, so any offset points at nothing and would show a band of empty
   * frame beside the photograph. Zooming out to the fit is therefore a reliable
   * way back, which is what makes the zoom safe to use at all.
   */
  test('zooming back out to the fit also recentres', () => {
    const lost: Viewport = { zoom: 200, x: 0.2, y: -0.2 }
    expect(zoomBy(lost, -10)).toEqual(fitted())
  })

  /**
   * An offset that is legal at 400% is off the edge at 150%. Carrying it down
   * unchanged shows empty frame the person never asked for.
   */
  test('an offset legal when zoomed in is pulled back in when zooming out', () => {
    const far = panBy({ zoom: MAX_ZOOM, x: 0, y: 0 }, 1, 1)
    const closer = zoomBy(far, -1)
    expect(Math.abs(closer.x)).toBeLessThan(Math.abs(far.x))
  })

  test('the buttons know when they have nothing left to do', () => {
    expect(canZoomOut(fitted())).toBe(false)
    expect(canZoomIn(fitted())).toBe(true)
    expect(canZoomIn({ zoom: MAX_ZOOM, x: 0, y: 0 })).toBe(false)
  })
})

describe('panning', () => {
  /**
   * THE OTHER WAY TO LOSE A PICTURE. Past half the overhang the frame shows
   * nothing at all, which reads as the picture having disappeared rather than
   * having been moved.
   */
  test('the picture cannot be pushed off its own frame', () => {
    const view = panBy({ zoom: 200, x: 0, y: 0 }, 10, 10)
    // At 200% the picture is twice the frame, so the furthest legal offset is a
    // quarter of the frame in each direction.
    expect(view.x).toBeCloseTo(0.25)
    expect(view.y).toBeCloseTo(0.25)
  })

  test('and cannot be pushed off the other way either', () => {
    const view = panBy({ zoom: 200, x: 0, y: 0 }, -10, -10)
    expect(view.x).toBeCloseTo(-0.25)
    expect(view.y).toBeCloseTo(-0.25)
  })

  /**
   * At the fit everything is already visible, so there is nowhere to move TO.
   * Allowing it would slide the photograph out of its own frame for no gain.
   */
  test('nothing moves while the whole picture is visible', () => {
    expect(panBy(fitted(), 0.5, 0.5)).toEqual(fitted())
  })

  test('a small move inside the bounds is kept exactly', () => {
    const view = panBy({ zoom: 200, x: 0, y: 0 }, 0.1, -0.05)
    expect(view.x).toBeCloseTo(0.1)
    expect(view.y).toBeCloseTo(-0.05)
  })

  test('the further in you are, the further you may move', () => {
    const near = panBy({ zoom: 150, x: 0, y: 0 }, 10, 0)
    const far = panBy({ zoom: MAX_ZOOM, x: 0, y: 0 }, 10, 0)
    expect(far.x).toBeGreaterThan(near.x)
  })
})

describe('what the browser is told', () => {
  test('the fit asks for no scaling at all', () => {
    expect(transformFor(fitted())).toContain('scale(1)')
    expect(transformFor(fitted())).toContain('translate(0.0000%, 0.0000%)')
  })

  /**
   * Offsets are FRACTIONS of the frame, so the same view means the same thing on
   * a phone and on a desktop and a window resize does not throw a person's
   * position away.
   */
  test('offsets are percentages of the frame, not pixels', () => {
    expect(transformFor({ zoom: 200, x: 0.25, y: -0.25 })).toBe(
      'translate(25.0000%, -25.0000%) scale(2)',
    )
  })

  test('the label is what a person reads, and it resets from there', () => {
    expect(describeZoom(fitted())).toBe('100%')
    expect(describeZoom({ zoom: 250, x: 0, y: 0 })).toBe('250%')
  })
})
