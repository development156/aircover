import type { StudioTemplate } from './template'

/**
 * THE STARTING POINTS SAHODA SHIPS.
 *
 * ── THREE, AND THE NUMBER IS A DECISION ─────────────────────────────────────
 * Three layouts that each do one job well beat twelve that blur into each
 * other. A shop owner picking between twelve near-identical cards is doing
 * design work, which is the job this feature exists to remove. When there is
 * evidence about which of these gets used, the fourth can be argued for.
 *
 * ── THESE ARE NOT THE ONLY TEMPLATES THERE WILL BE ──────────────────────────
 * Founder's ruling, 2026-08-28: CUSTOMERS save their own starting points now,
 * and Sahoda ships curated ones later. A customer's template is a design with
 * `is_template` ticked, so it carries a document and points at one of these
 * layouts. It does not carry a layout of its own, which is what stops a saved
 * template from freezing at the moment it was saved.
 *
 * ── EVERY NUMBER BELOW IS A SHARE OF THE CANVAS ─────────────────────────────
 * 0 to 1, never pixels, so one template is every preset. Sizes and line heights
 * are shares of the HEIGHT; widths and radii are shares of the WIDTH.
 *
 * ── AND EVERY COLOUR IS A ROLE ──────────────────────────────────────────────
 * `accent` is whatever this workspace's brand accent is. No template contains a
 * colour value, which is what makes all three on-brand for a customer nobody
 * has met.
 */

/**
 * A photograph with the words over a band at the bottom.
 *
 * The band exists to make the words legible. Text straight onto a photograph is
 * a coin toss against whatever the photograph happens to be behind it, and the
 * one thing this product cannot do is ship an illegible export. A solid band is
 * the version of that guarantee that needs no measurement of the image.
 */
const PHOTO_BOTTOM: StudioTemplate = {
  id: 'photo-bottom',
  label: 'Photo with a caption',
  presetId: 'portrait',
  slots: [
    { key: 'photo', kind: 'image', label: 'Your picture' },
    { key: 'headline', kind: 'text', label: 'The main line' },
    { key: 'detail', kind: 'text', label: 'The smaller line' },
  ],
  blocks: [
    { kind: 'image', slot: 'photo', frame: { x: 0, y: 0, w: 1, h: 1 } },
    { kind: 'band', frame: { x: 0, y: 0.62, w: 1, h: 0.38 }, fill: 'accent' },
    {
      kind: 'text',
      slot: 'headline',
      // h is 0.15, not 0.14. Two lines at 0.062/0.072 need 0.1476 once the
      // descenders are counted, and at 0.14 the caption sat on the line below.
      frame: { x: 0.08, y: 0.68, w: 0.84, h: 0.15 },
      size: 0.062,
      lineHeight: 0.072,
      weight: 700,
      fill: 'accentInk',
      align: 'start',
      maxLines: 2,
    },
    {
      kind: 'text',
      slot: 'detail',
      frame: { x: 0.08, y: 0.85, w: 0.84, h: 0.08 },
      size: 0.032,
      lineHeight: 0.04,
      weight: 400,
      fill: 'accentInk',
      align: 'start',
      maxLines: 2,
    },
  ],
}

/**
 * Words only, centred, on the brand colour.
 *
 * The one a shop owner reaches for when there is nothing to photograph: a price,
 * an opening time, a closure, a thank-you. It has no image slot at all, so it
 * cannot be half-finished.
 */
const STATEMENT: StudioTemplate = {
  id: 'statement',
  label: 'A line worth reading',
  presetId: 'square',
  slots: [
    { key: 'eyebrow', kind: 'text', label: 'The small line above' },
    { key: 'headline', kind: 'text', label: 'The big line' },
    { key: 'footnote', kind: 'text', label: 'The line underneath' },
  ],
  blocks: [
    { kind: 'band', frame: { x: 0, y: 0, w: 1, h: 1 }, fill: 'accent' },
    {
      kind: 'text',
      slot: 'eyebrow',
      frame: { x: 0.1, y: 0.24, w: 0.8, h: 0.06 },
      size: 0.034,
      lineHeight: 0.044,
      weight: 600,
      fill: 'accentInk',
      align: 'middle',
      maxLines: 1,
    },
    {
      kind: 'text',
      slot: 'headline',
      frame: { x: 0.1, y: 0.34, w: 0.8, h: 0.32 },
      size: 0.084,
      lineHeight: 0.098,
      weight: 700,
      fill: 'accentInk',
      align: 'middle',
      maxLines: 3,
    },
    {
      kind: 'text',
      slot: 'footnote',
      // 0.08, not 0.06: at two lines this overflowed, and no rendered example
      // showed it because the sample text was one line. The fit guard found it.
      frame: { x: 0.1, y: 0.72, w: 0.8, h: 0.08 },
      size: 0.03,
      lineHeight: 0.038,
      weight: 400,
      fill: 'accentInk',
      align: 'middle',
      maxLines: 2,
    },
  ],
}

/**
 * A quote, on paper, with the accent used once.
 *
 * ── THE ACCENT IS A RATION, NOT A BACKGROUND ────────────────────────────────
 * The design system's most load-bearing measurement is that the accent is
 * RATIONED (docs/37, the colour budget). This template spends it on one short
 * rule above the quote and nothing else, which is why it reads as quieter than
 * the other two rather than merely paler.
 */
const QUOTE: StudioTemplate = {
  id: 'quote',
  label: 'Something a customer said',
  presetId: 'square',
  slots: [
    { key: 'quote', kind: 'text', label: 'What they said' },
    { key: 'attribution', kind: 'text', label: 'Who said it' },
  ],
  blocks: [
    { kind: 'band', frame: { x: 0, y: 0, w: 1, h: 1 }, fill: 'paper' },
    // The whole accent budget for this layout, spent here.
    { kind: 'band', frame: { x: 0.1, y: 0.2, w: 0.14, h: 0.008 }, fill: 'accent', radius: 0.004 },
    {
      kind: 'text',
      slot: 'quote',
      frame: { x: 0.1, y: 0.28, w: 0.8, h: 0.4 },
      size: 0.056,
      lineHeight: 0.072,
      weight: 500,
      fill: 'ink',
      align: 'start',
      maxLines: 5,
    },
    {
      kind: 'text',
      slot: 'attribution',
      frame: { x: 0.1, y: 0.74, w: 0.8, h: 0.06 },
      size: 0.028,
      lineHeight: 0.036,
      weight: 400,
      fill: 'muted',
      align: 'start',
      maxLines: 1,
    },
  ],
}

export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [PHOTO_BOTTOM, STATEMENT, QUOTE]

/** The template with this id, or null. Null rather than a throw: the id arrives from a stored row. */
export function templateById(id: string): StudioTemplate | null {
  return STUDIO_TEMPLATES.find((template) => template.id === id) ?? null
}

/** The slot keys a template declares, for `blankDocument`. */
export function slotKeysOf(template: StudioTemplate): string[] {
  return template.slots.map((slot) => slot.key)
}

/** What the editor calls a slot. Falls back to the key so a stale block never renders a blank label. */
export function slotLabelOf(template: StudioTemplate, key: string): string {
  return template.slots.find((slot) => slot.key === key)?.label ?? key
}
