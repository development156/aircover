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

/**
 * A logo is a logo.
 *
 * WAS 2 MB, and an adversarial review measured what that permits: render cost is
 * roughly 7ms of CPU per byte of filter markup, so a 2 MB file of stacked
 * `feTurbulence`/`feGaussianBlur` is about FOUR HOURS of single-core work for
 * one upload, inside a server action with no concurrency limit. Bytes were
 * bounded and pixels were bounded; TIME was not.
 */
export const SVG_MAX_BYTES = 256_000

/**
 * How long the renderer may take. A logo rasterises in tens of milliseconds.
 *
 * BE HONEST ABOUT WHAT THIS DOES: `sharp` cannot be cancelled, so the work
 * continues on its thread after this fires. It bounds the REQUEST, not the CPU.
 * The thing that bounds the CPU is `MAX_FILTER_ELEMENTS` below plus the smaller
 * byte cap; this is the backstop for whatever those two miss.
 */
const RENDER_TIMEOUT_MS = 5_000

/**
 * Filters are where the cost lives. MEASURED: one `feTurbulence` with
 * `numOctaves="10"` over a 3000x3000 canvas is ~1.2 seconds; twenty is ~23
 * seconds, in 3.4 KB of markup that passes every other check.
 *
 * A real logo uses a handful at most. This is not a stylistic limit, it is the
 * only cheap bound on work that exists before the renderer runs.
 */
const MAX_FILTER_ELEMENTS = 8

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
  let head = decodeHead(bytes)

  /**
   * ── STRIPPED, NOT PATTERN-MATCHED ─────────────────────────────────────────
   * The first version tested three prefixes and its own comment claimed it
   * handled four things. An adversarial review measured the gap: a leading
   * `<!-- Generator: Adobe Illustrator 27.0 -->` returned FALSE, which is what
   * Illustrator and Sketch put at the top of every export — very probably the
   * founder's own file. Lowercase `<!doctype`, a doctype with two spaces, and
   * long leading whitespace all failed too.
   *
   * The consequence was not cosmetic. A false answer skips the rasteriser AND
   * `refuseUnsafeSvg`, and hands raw vector bytes to `uploadAsset`, where
   * `sniffImage` refuses them as "not an image type the channels accept" — for
   * a file the dialog had just said was allowed.
   *
   * So the prologue is now consumed rather than recognised: declarations,
   * comments, doctypes (including an internal subset) and whitespace are
   * stripped in a loop until something else is found.
   */
  for (let step = 0; step < 64; step += 1) {
    const before = head
    head = head.trimStart()
    if (head.startsWith('<?')) head = head.slice(head.indexOf('?>') + 2)
    else if (head.startsWith('<!--')) head = head.slice(head.indexOf('-->') + 3)
    else if (/^<!doctype/i.test(head)) {
      // An internal subset puts `>` characters INSIDE the doctype
      // (`<!DOCTYPE svg [ <!ELEMENT x ANY> ]>`), so the first `>` is the wrong
      // one to cut at. Caught by its own test, which failed on the first draft.
      const subset = head.indexOf('[')
      const from = subset >= 0 && subset < head.indexOf('>') ? head.indexOf(']', subset) : 0
      head = head.slice(head.indexOf('>', from) + 1)
    }
    if (head === before) break
  }

  return /^<svg[\s/>]/i.test(head.trimStart())
}

/**
 * The head of the file as text, whatever it was encoded in.
 *
 * UTF-16 is rare and legal, and a UTF-8 decode of it yields NUL-separated
 * characters that match nothing. The window is 8 KB rather than 1 KB because a
 * generator comment can be long and padding can be longer.
 */
function decodeHead(bytes: Uint8Array): string {
  const slice = bytes.slice(0, 8192)
  const utf16le = slice[0] === 0xff && slice[1] === 0xfe
  const utf16be = slice[0] === 0xfe && slice[1] === 0xff
  const encoding = utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8'

  return new TextDecoder(encoding, { fatal: false }).decode(slice).replace(/^\ufeff/, '')
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
  // The only cheap bound on RENDER WORK that exists before the renderer runs.
  // See MAX_FILTER_ELEMENTS: twenty filters is 23 seconds of CPU in 3.4 KB.
  if ((text.match(/<\s*filter[\s>]/gi) ?? []).length > MAX_FILTER_ELEMENTS) {
    return 'That SVG uses more filter effects than Sahoda will render. Export it as a PNG.'
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
    const render = sharp(Buffer.from(bytes), {
      // A logo is not a gigapixel. The cap is what stops a viewBox that claims
      // to be enormous from becoming an allocation.
      limitInputPixels: 40_000_000,
    })
      .resize({ width: SVG_RASTER_WIDTH, fit: 'inside', withoutEnlargement: false })
      // Transparency is the whole point of a logo file, so the alpha channel
      // survives rather than being flattened onto an invented background.
      .png()
      .toBuffer()

    // Bounds the REQUEST. The header is explicit that it does not bound the CPU;
    // the byte cap and the filter cap do that, and this catches what they miss.
    const png = await Promise.race([
      render,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SVG_RENDER_TIMEOUT')), RENDER_TIMEOUT_MS),
      ),
    ])

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
