import type { DesignPage } from './document'
import { imageIdOf, textOf } from './document'
import type { Paint } from './paint'
import type { SceneNode, SvgScene } from './svg'

/**
 * A TEMPLATE IS THE LAYOUT. A DESIGN IS THE WORDS. THIS PUTS THEM TOGETHER.
 *
 * ── WHY THE GEOMETRY IS FRACTIONS AND NOT PIXELS ────────────────────────────
 * Every position and size below is 0 to 1, a share of the canvas. One template
 * therefore works at every preset: the same layout is a square post, a tall
 * post and a story without a second copy per size, and adding a preset does not
 * mean revisiting every template.
 *
 * It also removes a whole class of bug. A pixel layout authored at 1080 wide
 * and rendered at 1600 puts everything in the left two thirds and nothing
 * complains, because a valid SVG is still produced. A fraction cannot express
 * that mistake.
 *
 * ── AND WHY NOTHING HERE WRAPS TEXT ─────────────────────────────────────────
 * `svg.ts` refuses to break a line, and this file must not undo that. Wrapping
 * needs font metrics, the browser and the server measure differently, and the
 * moment they disagree the preview stops being the export.
 *
 * So a text slot holds LINES the person typed, split on newline, and the
 * template says how many it will show and how tall each is. Anything past
 * `maxLines` is not silently dropped: `composeScene` returns null and the caller
 * says the words do not fit, which a person can act on. Truncating with an
 * ellipsis would hide the customer's own sentence from them.
 *
 * ── COLOURS ARE ROLES, RESOLVED BY THE CALLER ───────────────────────────────
 * A template names `accent`, never a value. The caller passes a palette of real
 * integer paints, resolved from the workspace's brand. That is what makes the
 * same template on-brand for every customer, and it keeps the OKLCH conversion
 * out of `@sahoda/shared` — see the header of `paint.ts` for why that matters.
 *
 * Pure: no I/O, no clock, no database.
 */

/** The colour roles a template may name. Deliberately few: a template picks a role, not a shade. */
export type PaletteRole = 'paper' | 'ink' | 'muted' | 'accent' | 'accentInk'

/** Real colours for those roles, resolved from the workspace brand by the caller. */
export type Palette = Record<PaletteRole, Paint>

/** A rectangle in canvas fractions. `w`/`h` are shares of the width and height. */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
}

/** A filled band. The only decoration a template gets; there are no borders and no shadows. */
export interface BandBlock {
  kind: 'band'
  frame: Frame
  fill: PaletteRole
  /** Corner rounding as a share of the canvas WIDTH, so it scales with the design. */
  radius?: number
}

/** Words from a slot. Size and line height are shares of the canvas HEIGHT. */
export interface TextBlock {
  kind: 'text'
  slot: string
  frame: Frame
  size: number
  lineHeight: number
  weight: number
  fill: PaletteRole
  align: 'start' | 'middle' | 'end'
  maxLines: number
}

/** A picture from a slot, cropped to fill its frame. */
export interface ImageBlock {
  kind: 'image'
  slot: string
  frame: Frame
}

export type TemplateBlock = BandBlock | TextBlock | ImageBlock

/** What the editor draws a box for. */
export interface TemplateSlot {
  key: string
  kind: 'text' | 'image'
  /** What the person sees above the box. Sentence case, no jargon. */
  label: string
}

export interface StudioTemplate {
  id: string
  label: string
  /** The canvas this template was drawn for. Others may still render it; this is the default. */
  presetId: string
  slots: readonly TemplateSlot[]
  blocks: readonly TemplateBlock[]
}

/** Bytes for each image slot, as data URIs the renderer will accept. */
export type SlotImages = Readonly<Record<string, string>>

/**
 * Why a design could not be composed. Each is a sentence the caller can show.
 *
 * ── A REFUSAL NAMES THE SLOT, BECAUSE A PERSON HAS TO FIND IT ───────────────
 * "This design will not fit" is true and useless on a carousel of eight pages.
 * Every reason carries the slot key so the screen can point at the right box.
 */
export type ComposeFailure =
  | { reason: 'too-many-lines'; slot: string; lines: number; maxLines: number }
  | { reason: 'missing-image'; slot: string }
  | { reason: 'unrenderable' }

export interface ComposeContext {
  width: number
  height: number
  palette: Palette
  images?: SlotImages
}

/** Fractions to pixels, rounded, so every number the renderer sees is a whole pixel. */
function px(fraction: number, extent: number): number {
  return Math.round(fraction * extent)
}

/**
 * The lines of a text slot, as the person typed them.
 *
 * A slot nobody filled contributes NOTHING rather than a blank line, so an
 * unused subheading does not push the layout around. A slot filled with spaces
 * is treated the same way: it looks empty on the screen, so it renders empty.
 */
function linesOf(page: DesignPage, slot: string): string[] {
  const text = textOf(page, slot)
  if (text === null) return []
  const lines = text.split('\n').map((line) => line.trimEnd())
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
  return lines.length === 1 && lines[0]!.trim() === '' ? [] : lines
}

/**
 * Turn a template and one page of a design into a scene the renderer can draw.
 *
 * Returns the scene, or the reason it could not be made. Never a partial scene:
 * a page missing its photograph must not export as a design with a hole in it,
 * because nothing downstream looks at what a picture contains.
 */
export function composeScene(
  template: StudioTemplate,
  page: DesignPage,
  ctx: ComposeContext,
): { ok: true; scene: SvgScene } | { ok: false; failure: ComposeFailure } {
  if (!Number.isInteger(ctx.width) || !Number.isInteger(ctx.height)) {
    return { ok: false, failure: { reason: 'unrenderable' } }
  }
  if (ctx.width <= 0 || ctx.height <= 0) {
    return { ok: false, failure: { reason: 'unrenderable' } }
  }

  const nodes: SceneNode[] = []

  for (const block of template.blocks) {
    if (block.kind === 'band') {
      nodes.push({
        kind: 'rect',
        x: px(block.frame.x, ctx.width),
        y: px(block.frame.y, ctx.height),
        width: px(block.frame.w, ctx.width),
        height: px(block.frame.h, ctx.height),
        fill: ctx.palette[block.fill],
        ...(block.radius === undefined ? {} : { rx: px(block.radius, ctx.width) }),
      })
      continue
    }

    if (block.kind === 'image') {
      const href = ctx.images?.[block.slot]
      if (href === undefined) {
        // The slot may legitimately be empty — a template can offer an optional
        // picture. It is only a failure when the DESIGN points at an asset and
        // the caller did not supply its bytes, because then a picture the person
        // chose would silently not appear.
        if (imageIdOf(page, block.slot) !== null) {
          return { ok: false, failure: { reason: 'missing-image', slot: block.slot } }
        }
        continue
      }
      nodes.push({
        kind: 'image',
        x: px(block.frame.x, ctx.width),
        y: px(block.frame.y, ctx.height),
        width: px(block.frame.w, ctx.width),
        height: px(block.frame.h, ctx.height),
        href,
      })
      continue
    }

    const lines = linesOf(page, block.slot)
    if (lines.length === 0) continue
    if (lines.length > block.maxLines) {
      return {
        ok: false,
        failure: {
          reason: 'too-many-lines',
          slot: block.slot,
          lines: lines.length,
          maxLines: block.maxLines,
        },
      }
    }

    const size = px(block.size, ctx.height)
    const step = px(block.lineHeight, ctx.height)
    // The block's frame is the BOX; the first baseline sits one font size down
    // from its top, which is where a line of type actually starts.
    const left = px(block.frame.x, ctx.width)
    const width = px(block.frame.w, ctx.width)
    // Rounded, not merely derived. `left + width / 2` lands on a half pixel
    // whenever the box is an odd number of pixels wide, and a half-pixel
    // baseline is what makes text read faintly soft against a crisp band. The
    // whole-pixel test caught this on its first run.
    const x =
      block.align === 'start'
        ? left
        : block.align === 'end'
          ? left + width
          : Math.round(left + width / 2)
    let baseline = px(block.frame.y, ctx.height) + size

    for (const line of lines) {
      nodes.push({
        kind: 'text',
        x,
        y: baseline,
        text: line,
        fontFamily: TEMPLATE_FONT,
        fontSize: size,
        fontWeight: block.weight,
        fill: ctx.palette[block.fill],
        anchor: block.align,
      })
      baseline += step
    }
  }

  return {
    ok: true,
    scene: { width: ctx.width, height: ctx.height, background: ctx.palette.paper, nodes },
  }
}

/**
 * The one family every template names.
 *
 * ── THIS IS A PROMISE THIS PACKAGE CANNOT KEEP ON ITS OWN ───────────────────
 * MEASURED: the rasteriser SUBSTITUTES a missing family without a word, and an
 * installed family and an invented one produced indistinguishable output. So
 * naming a font here does not make it the font: whoever renders must SHIP it,
 * on the server and in the browser both, or the two quietly disagree.
 *
 * The stack is deliberate. Noto covers Devanagari, Tamil, Telugu and Bengali,
 * which this product's customers write in, and `sans-serif` last means a machine
 * without it draws something legible rather than nothing.
 */
export const TEMPLATE_FONT = 'Noto Sans, Noto Sans Devanagari, sans-serif'

/**
 * HOW WIDE A CHARACTER IS, MEASURED RATHER THAN ASSUMED.
 *
 * The renderer never wraps and never measures, so something has to decide how
 * much a person may type before it runs off the canvas. That decision is here,
 * and the number under it was MEASURED in this repository by rendering strings
 * through the real rasteriser at 100px and reading the ink extent back:
 *
 *   "1 to 3 November"             bold    0.625 em/char
 *   "Fresh samosas"               bold    0.635
 *   "Closed"                      bold    0.610
 *   "ABCDEFGHIJKLMNOPQRSTUVWXYZ"  bold    0.753
 *   "abcdefghijklmnopqrstuvwxyz"  regular 0.562
 *   Devanagari, two words         bold    0.395
 *   "WWWWWWWWWW"                  bold    1.099
 *
 * 0.75 is the all-caps figure, and that is the bound deliberately: A SHOP OWNER
 * REALLY DOES TYPE "CLOSED TODAY", and a limit that only held for sentence case
 * would let exactly that overflow. Ten W's in a row is not a sentence anybody
 * writes, so budgeting for it would refuse ordinary lines to defend against one
 * nobody types.
 *
 * Devanagari measured NARROWER than Latin, so Indic script is not the case this
 * bound has to stretch for.
 *
 * ── WHAT THIS IS, AND WHICH WAY IT FAILS ────────────────────────────────────
 * It is an ESTIMATE, and its failure direction is chosen: it refuses a line that
 * would have fitted rather than exporting one that is cut off. A person told
 * "that is too long" can shorten it; a person whose price ran off the edge of a
 * published post cannot.
 */
export const CONSERVATIVE_EM_PER_CHAR = 0.75

/**
 * How many characters a text slot will hold, derived from the layout.
 *
 * ── DERIVED, NEVER DECLARED, AND THAT IS THE WHOLE POINT ────────────────────
 * The first version of this file let a template DECLARE `maxChars` beside its
 * geometry. All seven declarations were wrong — `statement` offered 80
 * characters for a box that holds about 38 — and no test could have caught it,
 * because the two numbers had no relationship to check.
 *
 * A budget computed from the frame cannot drift from the frame. Change the font
 * size and the limit moves with it.
 */
export function charBudgetFor(
  block: TextBlock,
  width: number,
  height: number,
): { perLine: number; total: number } {
  const sizePx = block.size * height
  const widthPx = block.frame.w * width
  const perLine = Math.max(1, Math.floor(widthPx / (sizePx * CONSERVATIVE_EM_PER_CHAR)))
  return { perLine, total: perLine * block.maxLines }
}

/**
 * Does a text block fit the box it declares?
 *
 * ── DESCENDERS ARE PART OF THE LINE ─────────────────────────────────────────
 * The last baseline is not the bottom of the text: the tail of a `g` hangs below
 * it, about 0.22 of the font size. Ignoring that is what let `photo-bottom`'s
 * caption sit on top of the line beneath it while every number in the template
 * still looked correct. Found by rendering the template and LOOKING at it, which
 * is the one check none of the other tests here can perform.
 */
export function textBlockFits(block: TextBlock): boolean {
  const DESCENDER = 0.22
  const used = block.size * (1 + DESCENDER) + (block.maxLines - 1) * block.lineHeight
  return used <= block.frame.h
}

/** The sentence for a refusal. Data in, sentence out, so the screen writes no copy of its own. */
export function describeComposeFailure(
  failure: ComposeFailure,
  slotLabel: (key: string) => string,
): string {
  if (failure.reason === 'missing-image') {
    return `The picture for ${slotLabel(failure.slot)} could not be loaded, so this design was not made.`
  }
  if (failure.reason === 'too-many-lines') {
    const room = failure.maxLines === 1 ? '1 line' : `${failure.maxLines} lines`
    return `${slotLabel(failure.slot)} has ${failure.lines} lines and there is room for ${room}. Shorten it, or take out a line break.`
  }
  return 'This design could not be drawn at that size.'
}
