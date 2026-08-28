import { hexOf, type Paint } from './paint'

/**
 * ONE SERIALISER, USED BY BOTH SIDES, SO THERE IS NO SECOND RENDERER TO DRIFT.
 *
 * `renderSvg` returns a string. The browser shows that exact string to preview a
 * design; `sharp(Buffer.from(svg))` turns that exact string into the PNG a
 * customer downloads. Not two implementations kept in agreement by a test, and
 * not a client approximation of a server truth: the same characters.
 *
 * That property is the reason this module refuses to do anything clever. It has
 * no layout engine, no text wrapping, no auto-fit and no measurement. Every
 * number it emits was computed by the caller and handed in. The moment this
 * function decides where a line breaks, the preview and the export are two
 * different programs again, because only one of them runs in a browser.
 *
 * ── WHAT THIS BUYS, SAID PLAINLY ────────────────────────────────────────────
 * A shop owner on a slow connection sees the design change as they type, with
 * no network round trip and no engine downloaded. Export costs a model call of
 * nothing: it is our own code, which is what /studio already promises.
 *
 * ── COLOURS ARE INTEGERS BEFORE THEY ARRIVE ─────────────────────────────────
 * See `paint.ts`. A brand colour handed in as `oklch(...)` rasterises to pure
 * black with no error, so this module cannot accept a colour string at all.
 *
 * ── AND NOTHING IS FETCHED WHILE RENDERING ──────────────────────────────────
 * An `<image>` may only carry a `data:` URI. A renderer that accepted an http
 * href would make every export a server-side request to an address the document
 * chose, which is a request-forgery hole wearing a picture frame. Storage bytes
 * must be read by the caller, which already has credentials and a signed-URL
 * path, and handed in as data. `renderSvg` returns null rather than dropping a
 * refused image quietly: a design that silently loses its photo is worse than
 * one that refuses to export.
 *
 * Pure: no I/O, no clock, no database, no network.
 */

/** A filled rectangle. `rx` rounds the corners. */
export interface RectNode {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill: Paint
  rx?: number
}

/**
 * One line of text at one position.
 *
 * ── ONE LINE, NEVER A PARAGRAPH, AND THAT IS LOAD-BEARING ───────────────────
 * There is no wrapping here and there must never be. `y` is the BASELINE, and
 * the caller places every line itself. If this module ever gained an auto-wrap
 * escape hatch, the browser preview and the server export would wrap with
 * different text metrics and quietly disagree about where the words go. The
 * entitlement to preview locally holds if and only if no renderer is ever asked
 * to break a line.
 */
export interface TextNode {
  kind: 'text'
  x: number
  /** The BASELINE, not the top of the glyphs. */
  y: number
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fill: Paint
  anchor?: 'start' | 'middle' | 'end'
}

/** A raster image. `href` must be a `data:` URI. */
export interface ImageNode {
  kind: 'image'
  x: number
  y: number
  width: number
  height: number
  href: string
}

export type SceneNode = RectNode | TextNode | ImageNode

export interface SvgScene {
  width: number
  height: number
  background: Paint
  nodes: readonly SceneNode[]
}

/** Only a data URI may be drawn. See the header. */
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

/**
 * XML-escape text before it becomes markup.
 *
 * The five predefined entities, applied to everything a person can type. A
 * headline containing `<` is a headline, not a tag, and a caption ending in an
 * unbalanced quote must not be able to close an attribute.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Trim a number to something an SVG attribute can carry without floating-point noise. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '')
}

function finite(...values: number[]): boolean {
  return values.every((value) => Number.isFinite(value))
}

function rectMarkup(node: RectNode): string | null {
  if (!finite(node.x, node.y, node.width, node.height)) return null
  if (node.width < 0 || node.height < 0) return null
  const radius = node.rx !== undefined && Number.isFinite(node.rx) ? ` rx="${num(node.rx)}"` : ''
  const opacity = node.fill.a < 1 ? ` fill-opacity="${num(node.fill.a)}"` : ''
  return `<rect x="${num(node.x)}" y="${num(node.y)}" width="${num(node.width)}" height="${num(node.height)}"${radius} fill="${hexOf(node.fill)}"${opacity}/>`
}

function textMarkup(node: TextNode): string | null {
  if (!finite(node.x, node.y, node.fontSize, node.fontWeight)) return null
  if (node.fontSize <= 0) return null
  const anchor = node.anchor === undefined ? '' : ` text-anchor="${node.anchor}"`
  const opacity = node.fill.a < 1 ? ` fill-opacity="${num(node.fill.a)}"` : ''
  return (
    `<text x="${num(node.x)}" y="${num(node.y)}"` +
    ` font-family="${escapeXml(node.fontFamily)}"` +
    ` font-size="${num(node.fontSize)}"` +
    ` font-weight="${num(node.fontWeight)}"` +
    `${anchor} fill="${hexOf(node.fill)}"${opacity}` +
    ` xml:space="preserve">${escapeXml(node.text)}</text>`
  )
}

function imageMarkup(node: ImageNode): string | null {
  if (!finite(node.x, node.y, node.width, node.height)) return null
  if (node.width < 0 || node.height < 0) return null
  if (typeof node.href !== 'string' || !DATA_URI.test(node.href)) return null
  return `<image x="${num(node.x)}" y="${num(node.y)}" width="${num(node.width)}" height="${num(node.height)}" href="${escapeXml(node.href)}" preserveAspectRatio="xMidYMid slice"/>`
}

/**
 * Serialise a scene, or return null if any part of it cannot be drawn honestly.
 *
 * ── WHY NULL RATHER THAN A BEST EFFORT ──────────────────────────────────────
 * Every refusal here is a node the caller believed was going to appear. Skipping
 * it produces a picture that renders, exports, uploads and publishes while
 * missing the customer's photo or their headline, and no check downstream is
 * looking at what the picture CONTAINS. One null at the point of failure is the
 * only place that mistake is still cheap.
 */
export function renderSvg(scene: SvgScene): string | null {
  if (!finite(scene.width, scene.height)) return null
  if (!Number.isInteger(scene.width) || !Number.isInteger(scene.height)) return null
  if (scene.width <= 0 || scene.height <= 0) return null

  const parts: string[] = []
  for (const node of scene.nodes) {
    const markup =
      node.kind === 'rect'
        ? rectMarkup(node)
        : node.kind === 'text'
          ? textMarkup(node)
          : node.kind === 'image'
            ? imageMarkup(node)
            : null
    if (markup === null) return null
    parts.push(markup)
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}"` +
    ` viewBox="0 0 ${scene.width} ${scene.height}">` +
    `<rect width="${scene.width}" height="${scene.height}" fill="${hexOf(scene.background)}"/>` +
    parts.join('') +
    `</svg>`
  )
}
