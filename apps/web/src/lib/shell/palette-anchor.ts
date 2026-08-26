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

/**
 * HOW WIDE THE PANEL MUST BE FOR ITS FIELD TO MATCH THE SEARCH BAR.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * Centring the panel on the trigger (`panelShift`) put the two on the same axis
 * and left them different sizes, so the field still did not line up with the bar
 * that opens it. MEASURED at 1879x1007 with the panel anchored and the field
 * focused:
 *
 *     trigger pill   769 -> 1189   width 420
 *     focus ring     759 -> 1222   width 463
 *     delta          left -10, right +33, width +43
 *
 * Wider AND lopsided. The lopsidedness is the tell: the magnifier sat in flow at
 * the left of the row, pushing the input rightward, so the ring overhung the
 * trigger by 10px on one side and 33px on the other. Two shapes that are meant
 * to read as the same control cannot be off by different amounts at each end.
 *
 * ── WHY THE PANEL RESIZES RATHER THAN THE FIELD ─────────────────────────────
 * A 412px pill floating inside a 520px panel would align with the bar and look
 * like a mistake, because the list beneath it would be wider than the field
 * above. The panel is the thing that should equal the search bar: the palette
 * then reads as that bar opening downward, which is what it is.
 *
 * ── THE ARITHMETIC, STATED SO IT CAN BE CHECKED ─────────────────────────────
 * The field spans the panel minus its padding on both sides, and the focus ring
 * (tokens.css, unlayered) extends `ringOverhang` beyond the field on every side:
 *
 *     ring width = (panelWidth - 2*pad) + 2*ringOverhang
 *
 * Setting that equal to the trigger's width gives the return value below. With
 * `panelShift` already centring the panel on the trigger, equal widths and a
 * shared centre make the two boxes identical — which is the claim, and it is
 * asserted in `palette-anchor.test.ts` rather than left as a comment.
 */
export interface PanelWidthInput {
  /** The trigger's measured width, or null when there is no trigger on screen. */
  triggerWidth: number | null
  /** The panel's own horizontal padding around the field. */
  pad: number
  /** How far the global focus ring extends beyond the field. */
  ringOverhang: number
  /** The widest the panel may be, whatever the trigger does. */
  max: number
}

/**
 * The panel's width in pixels, or NULL to leave it to the stylesheet.
 *
 * Null rather than a default number: with no trigger to match (the phone, where
 * it is `max-narrow:hidden`) there is no width to derive, and inventing one
 * would override a responsive rule that is already correct with a constant that
 * is not.
 */
export function panelWidthFor({
  triggerWidth,
  pad,
  ringOverhang,
  max,
}: PanelWidthInput): number | null {
  if (triggerWidth === null || !Number.isFinite(triggerWidth) || triggerWidth <= 0) return null
  const wanted = triggerWidth + 2 * pad - 2 * ringOverhang
  // Never wider than the stylesheet's own cap. A very wide trigger would
  // otherwise grow the palette past the size it was designed and measured at.
  return Math.min(wanted, max)
}
