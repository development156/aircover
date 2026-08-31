/**
 * LOOKING CLOSER AT A PICTURE BEFORE DECIDING TO USE IT.
 *
 * ── WHY THIS EARNS ITS PLACE ────────────────────────────────────────────────
 * The canvas exists so somebody can judge whether a picture is good enough to
 * publish. A story is 1080 by 1920 and lands in a column a few hundred pixels
 * wide, which is enough to see that a picture arrived and not enough to see that
 * a hand has six fingers or that a sign says something a model invented. The
 * decision this screen exists for cannot be made at that size.
 *
 * ── THE FIT IS A REAL POSITION, NOT ZERO ────────────────────────────────────
 * Zoom returns to 100 and pan to the origin together, and both are one press.
 * A viewer somebody has zoomed into and cannot get out of is worse than no zoom
 * at all, so the reset is always offered and always lands somewhere sensible.
 *
 * Pure: no I/O, no clock, no DOM.
 */

/** Percentages, because that is what the control shows and a person reads. */
export const MIN_ZOOM = 100
export const MAX_ZOOM = 400
export const ZOOM_STEP = 25

export type Viewport = {
  /** A percentage. 100 means the picture fits its frame. */
  zoom: number
  /** Offset in FRACTIONS of the frame, so it survives a resize. */
  x: number
  y: number
}

export function fitted(): Viewport {
  return { zoom: MIN_ZOOM, x: 0, y: 0 }
}

export const isFitted = (view: Viewport): boolean =>
  view.zoom === MIN_ZOOM && view.x === 0 && view.y === 0

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

/**
 * Zoom in or out by one step.
 *
 * ── PANNING IS UNDONE ON THE WAY BACK OUT ───────────────────────────────────
 * At 100% the whole picture fits, so any offset is pointing at nothing: the
 * picture would sit off-centre in its frame with a band of empty beside it.
 * Zooming out to the fit therefore returns to the origin, which is what makes
 * "zoom out until it fits" a reliable way to get un-lost.
 */
export function zoomBy(view: Viewport, steps: number): Viewport {
  const zoom = clamp(view.zoom + steps * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM)
  if (zoom === MIN_ZOOM) return fitted()
  // Re-clamped at the new zoom: an offset legal at 400% is off the edge at 150%,
  // and leaving it would show empty frame the person did not ask for.
  return clampPan({ ...view, zoom })
}

/**
 * Move the picture, keeping it over its frame.
 *
 * The furthest you may push it is half the OVERHANG: at 200% the picture is
 * twice the frame, so half of it is hidden, and half of that on either side is
 * exactly the edge. Past it the frame shows nothing, which reads as the picture
 * having disappeared.
 */
export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return clampPan({ ...view, x: view.x + dx, y: view.y + dy })
}

function clampPan(view: Viewport): Viewport {
  const scale = view.zoom / 100
  // Zero at the fit, so nothing can be moved while everything is visible.
  const limit = Math.max(0, (scale - 1) / 2 / scale)
  return { zoom: view.zoom, x: clamp(view.x, -limit, limit), y: clamp(view.y, -limit, limit) }
}

export const canZoomIn = (view: Viewport): boolean => view.zoom < MAX_ZOOM
export const canZoomOut = (view: Viewport): boolean => view.zoom > MIN_ZOOM

/**
 * The CSS transform for this view.
 *
 * Translation before scale, expressed against the FRAME rather than the picture,
 * which is why the offsets are fractions: the same view means the same thing on
 * a phone and on a desktop, and a window resize does not throw a person's
 * position away.
 */
export function transformFor(view: Viewport): string {
  const scale = view.zoom / 100
  return `translate(${(view.x * 100).toFixed(4)}%, ${(view.y * 100).toFixed(4)}%) scale(${scale})`
}

/** "100%", for the button that says where you are and resets when pressed. */
export const describeZoom = (view: Viewport): string => `${view.zoom}%`
