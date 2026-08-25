/**
 * WHERE THE COMMAND PALETTE SITS, RELATIVE TO THE FIELD THAT OPENS IT.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * The overlay is `fixed inset-0 flex justify-center`, so the panel centred on the
 * VIEWPORT. The trigger carries `mx-auto` inside the topbar, which starts to the
 * right of the rail, so it centres on the CONTENT COLUMN. Those are not the same
 * place and nothing made them agree.
 *
 * MEASURED 2026-08-25 at 1920x1080 against the shipped stylesheet, with the rail
 * expanded: the trigger's centre is x=1061 and the panel's is x=960. The panel
 * opened **101px to the left** of the control that opened it.
 *
 * Reported twice as "the search bar is still not fixed", and both times the
 * earlier passes had measured the panel's INTERNALS — its scrim, its fill, its
 * focus ring against its own corner — while never once comparing the panel to the
 * trigger. Every one of those measurements was correct and not one of them could
 * have seen this.
 *
 * ── WHY THE OFFSET CANNOT BE A CONSTANT ─────────────────────────────────────
 * The rail has three widths (56 / 62 / 240) and the reader can collapse it, so
 * the content column's centre moves at runtime and no static value tracks it. The
 * honest input is the trigger's own measured position.
 *
 * ── WHY IT IS CLAMPED ───────────────────────────────────────────────────────
 * A panel pushed toward a trigger near the edge of a narrow window would hang off
 * screen, and half a command palette is worse than an off-centre one. The clamp
 * keeps the whole panel inside the overlay's own padding, so the alignment is
 * honoured where there is room for it and abandoned where there is not.
 */

export interface PanelShiftInput {
  /**
   * The horizontal centre of the trigger, in viewport pixels, or null when there
   * is no trigger to align to.
   *
   * NULL IS A REAL CASE, not a defensive default: the trigger carries
   * `max-narrow:hidden`, so on a phone it is not rendered at all while ⌘K still
   * opens the palette. Aligning to a control that is not on screen is meaningless,
   * and the viewport centre is the right answer there.
   */
  triggerCenterX: number | null
  panelWidth: number
  viewportWidth: number
  /** The overlay's own padding, so the panel never touches the window edge. */
  pad: number
}

/**
 * How far to move the panel from the viewport centre, in pixels.
 *
 * Returns a SHIFT rather than a position because the panel is already centred by
 * flexbox; a transform leaves that layout intact and cannot feed back into the
 * measurement it was computed from.
 */
export function panelShift({
  triggerCenterX,
  panelWidth,
  viewportWidth,
  pad,
}: PanelShiftInput): number {
  if (triggerCenterX === null || !Number.isFinite(triggerCenterX)) return 0

  const viewportCenterX = viewportWidth / 2
  // A viewport too small to hold the panel and its padding. Letting `room` go
  // negative would invert the clamp and push the panel the WRONG way, which is
  // how a guard-less clamp turns a cosmetic offset into a panel off screen.
  const room = viewportCenterX - panelWidth / 2 - pad
  if (room <= 0) return 0

  const wanted = triggerCenterX - viewportCenterX
  return Math.max(-room, Math.min(room, wanted))
}
