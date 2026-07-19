/**
 * Splicing a `caption_rewrite` result back into the canonical body.
 *
 * The mesh task only ever sees the selected fragment (`input.selection ?? input.text`),
 * so reassembling the full body is the caller's job. Selection offsets arrive as
 * UTF-16 code-unit indices (that is what a textarea reports), but the Constraint
 * Engine counts code points — so a boundary is allowed to land between the two
 * halves of a surrogate pair. Slicing there would emit a lone surrogate and turn
 * an emoji into mojibake, which then also miscounts against `maxChars`.
 *
 * Policy, pinned by tests:
 *  - Bounds are clamped into the string and ordered so `start <= end`.
 *  - A non-empty selection touching a split code point expands outward, so the
 *    code point is replaced whole rather than halved.
 *  - A caret (empty selection) inside a split code point snaps back before it and
 *    stays empty — expanding a caret would silently delete the emoji on splice.
 */

const HIGH_SURROGATE_MIN = 0xd800
const HIGH_SURROGATE_MAX = 0xdbff
const LOW_SURROGATE_MIN = 0xdc00
const LOW_SURROGATE_MAX = 0xdfff

/**
 * A pair of UTF-16 offsets, as a textarea reports them. Deliberately NOT named
 * `Selection`: apps/web compiles with the DOM lib, so that name is a global
 * (`window.getSelection()`), and a component that imported both would silently
 * bind the wrong one.
 */
export interface SelectionRange {
  start: number
  end: number
}

/** Clamp an arbitrary caller-supplied offset into `[0, length]`. */
function clampIndex(index: number, length: number): number {
  if (Number.isNaN(index)) return 0
  return Math.min(Math.max(Math.trunc(index), 0), length)
}

/** True when slicing at `index` would cut a surrogate pair in half. */
function splitsCodePoint(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false
  const before = text.charCodeAt(index - 1)
  const at = text.charCodeAt(index)
  return (
    before >= HIGH_SURROGATE_MIN &&
    before <= HIGH_SURROGATE_MAX &&
    at >= LOW_SURROGATE_MIN &&
    at <= LOW_SURROGATE_MAX
  )
}

/**
 * Clamp to the string, order `start <= end`, and snap both bounds onto
 * code-point boundaries. Always returns a new object.
 */
export function normalizeSelection(text: string, sel: SelectionRange): SelectionRange {
  const length = text.length
  const a = clampIndex(sel.start, length)
  const b = clampIndex(sel.end, length)
  const start = Math.min(a, b)
  const end = Math.max(a, b)

  if (start === end) {
    const caret = splitsCodePoint(text, start) ? start - 1 : start
    return { start: caret, end: caret }
  }

  // `start` only ever moves down and `end` only ever moves up, so ordering holds.
  return {
    start: splitsCodePoint(text, start) ? start - 1 : start,
    end: splitsCodePoint(text, end) ? end + 1 : end,
  }
}

/** The fragment a rewrite task should be handed — never half a code point. */
export function selectedText(text: string, sel: SelectionRange): string {
  const { start, end } = normalizeSelection(text, sel)
  return text.slice(start, end)
}

/** Replace the selected range with `replacement`, returning the new body. */
export function spliceSelection(text: string, sel: SelectionRange, replacement: string): string {
  const { start, end } = normalizeSelection(text, sel)
  return text.slice(0, start) + replacement + text.slice(end)
}
