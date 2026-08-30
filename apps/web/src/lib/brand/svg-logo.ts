import 'server-only'

/**
 * An SVG logo, turned into a PNG before anything else touches it.
 *
 * ── WHY NOT SIMPLY STORE THE SVG ────────────────────────────────────────────
 * `lib/assets/kind.ts` already had the position, written before this file
 * existed: "an SVG is a script container that no channel accepts". It is right.
 * An SVG can carry `<script>`, `onload=`, `<foreignObject>` with arbitrary HTML,
 * and external references. Storing one and handing out a link to it is handing
 * out a page.
 *
 * The obvious answer is to sanitise, and the obvious answer is the wrong one.
 * A blacklist of dangerous constructs is defeatable — entity encoding, mixed
 * case, CDATA sections, namespaced elements, `<set attributeName="onload">`,
 * `<animate>` writing an attribute at runtime — and the project's own security
 * checklist says it in one line: whitelist, never blacklist. A whitelist
 * sanitiser for SVG is a real piece of software with a real CVE history, and
 * getting it subtly wrong is worse than not having it, because it looks like
 * protection.
 *
 * So the SVG is RASTERISED and the original is discarded. Nothing that reaches
 * storage, a signed link, a browser or a model is ever an SVG. The entire class
 * of defect goes away rather than being filtered, and everything downstream —
 * `sniffImage`, `kindForProvenMime`, the Constraint Engine, the media library,
 * image generation — receives a PNG it already knows how to handle. `kind.ts`'s
 * objection is answered rather than worked around.
 *
 * The cost is vector fidelity, and for this use it is not a cost worth paying to
 * avoid: the mark renders at 20px in a topbar, and image models take rasters.
 *
 * ── THE PRE-CHECK IS DEFENCE IN DEPTH, AND NOT THE CONTROL ──────────────────
 * `refuseUnsafeSvg` below is a blacklist, with every weakness a blacklist has.
 * It is here because the RENDERER also parses this XML: librsvg has its own CVE
 * history and can be asked to resolve external references, so refusing the
 * obvious hostile shapes before handing bytes to it is worth the few lines. It
 * is NOT what makes this safe. What makes it safe is that the output is a
 * bitmap and the input is thrown away.
 */

/** A logo is a logo. Generous for hand-drawn vector art, and bounded. */
export const SVG_MAX_BYTES = 2_000_000

/** What the rasteriser produces. Wide enough for a retina lockup and for a model. */
export const SVG_RASTER_WIDTH = 1024

/**
 * Is this file an SVG at all?
 *
 * By CONTENT, never by file name, for the same reason `sniffImage` refuses to
 * consult one: the name is whatever the browser was told to say. XML may open
 * with a declaration, a doctype, a comment or a byte-order mark before the root
 * element, so the first non-space run is what is examined.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 1024))
    .replace(/^﻿/, '')
    .trimStart()

  return head.startsWith('<?xml') || head.startsWith('<!DOCTYPE svg') || head.startsWith('<svg')
}

/**
 * Hostile shapes, refused before the renderer is asked to parse them.
 *
 * Returns a reason, or null when nothing obvious is wrong. Read the header: this
 * is a second line, not the first one.
 */
export function refuseUnsafeSvg(text: string): string | null {
  if (/<!ENTITY/i.test(text)) {
    // Billion laughs, and XXE where the parser resolves external entities.
    return 'That SVG defines XML entities, which Sahoda does not open.'
  }
  if (/<\s*script/i.test(text) || /<\s*foreignObject/i.test(text)) {
    return 'That SVG contains a script, so Sahoda will not open it.'
  }
  // An external reference the renderer might fetch: a URL that is not a local
  // fragment and not inline data. `href` covers `xlink:href` by suffix.
  if (/\bhref\s*=\s*["'](?!#|data:image\/)/i.test(text)) {
    return 'That SVG points at a file somewhere else, so Sahoda will not open it.'
  }
  return null
}

/**
 * The SVG as a PNG, or a reason it could not be.
 *
 * `sharp` is imported where it is used rather than at module scope: it is a
 * native binary, and this path is reached only when somebody uploads a vector.
 */
export async function rasteriseSvgLogo(
  bytes: Uint8Array,
): Promise<{ ok: true; png: Uint8Array<ArrayBuffer> } | { ok: false; message: string }> {
  if (bytes.byteLength > SVG_MAX_BYTES) {
    return {
      ok: false,
      message: 'That SVG is larger than 2 MB, which is bigger than a logo needs.',
    }
  }

  const refusal = refuseUnsafeSvg(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
  if (refusal) return { ok: false, message: refusal }

  try {
    const { default: sharp } = await import('sharp')
    const png = await sharp(Buffer.from(bytes), {
      // A logo is not a gigapixel. The cap is what stops a viewBox that claims
      // to be enormous from becoming an allocation.
      limitInputPixels: 40_000_000,
    })
      .resize({ width: SVG_RASTER_WIDTH, fit: 'inside', withoutEnlargement: false })
      // Transparency is the whole point of a logo file, so the alpha channel
      // survives rather than being flattened onto an invented background.
      .png()
      .toBuffer()

    // Copied into a fresh, ArrayBuffer-backed view rather than wrapping the
    // Buffer: a Buffer's backing store types as `ArrayBufferLike`, which is not
    // a `BlobPart` and cannot be handed to `new File`.
    const out = new Uint8Array(png.byteLength)
    out.set(png)
    return { ok: true, png: out }
  } catch {
    // A malformed vector, or one the renderer refused. Either way there is
    // nothing to store, and the reader gets the fact rather than the exception.
    return { ok: false, message: 'Sahoda could not read that SVG. Try exporting it as a PNG.' }
  }
}
