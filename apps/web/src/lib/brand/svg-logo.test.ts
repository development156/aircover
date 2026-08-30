import { describe, expect, it } from 'vitest'

import {
  looksLikeSvg,
  rasteriseSvgLogo,
  refuseUnsafeSvg,
  SVG_MAX_BYTES,
  SVG_RASTER_WIDTH,
} from './svg-logo'

/**
 * SVG logos, and the reason none of them is ever stored.
 *
 * ── THE DECISION THESE GUARD ────────────────────────────────────────────────
 * The founder's logo is an SVG and the file dialog would not let him pick one.
 * `lib/assets/kind.ts` had the reason, written long before this: "an SVG is a
 * script container that no channel accepts."
 *
 * The obvious fix is to sanitise, and it is the wrong one. A blacklist is
 * defeatable and a whitelist sanitiser for SVG is real software with a real CVE
 * history, which looks like protection while being subtly wrong. So the vector
 * is RASTERISED and thrown away: the entire class of defect leaves rather than
 * being filtered, and everything downstream receives a PNG it already handles.
 *
 * The most important assertion in this file is therefore the dullest one — that
 * what comes back is a PNG.
 */

const svg = (inner: string, attrs = 'width="64" height="64"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`

const bytesOf = (text: string) => new TextEncoder().encode(text)

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

describe('looksLikeSvg', () => {
  /** By CONTENT, never by file name — the same rule `sniffImage` follows. */
  it.each([
    ['a bare root', svg('')],
    ['an xml declaration first', `<?xml version="1.0"?>${svg('')}`],
    ['a doctype first', `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">${svg('')}`],
    ['a byte-order mark and whitespace first', `\ufeff\n  ${svg('')}`],
    // MEASURED BY REVIEW: every one of these returned false, and the first is
    // what Illustrator and Sketch put at the top of every export.
    ['a generator comment first', `<!-- Generator: Adobe Illustrator 27.0 -->${svg('')}`],
    ['several comments and a declaration', `<?xml version="1.0"?>\n<!--a--><!--b-->${svg('')}`],
    ['a lowercase doctype', `<!doctype svg PUBLIC "x">${svg('')}`],
    ['a doctype with an internal subset', `<!DOCTYPE svg [ <!ELEMENT x ANY> ]>${svg('')}`],
    ['long leading whitespace', `${' '.repeat(2000)}${svg('')}`],
    ['an uppercase root', '<SVG xmlns="http://www.w3.org/2000/svg"/>'],
  ])('recognises %s', (_name, text) => {
    expect(looksLikeSvg(bytesOf(text))).toBe(true)
  })

  /** UTF-16 is rare and legal; a UTF-8 decode of it matches nothing. */
  it('recognises a UTF-16 encoded vector', () => {
    const text = svg('')
    const buf = new Uint8Array(2 + text.length * 2)
    buf[0] = 0xff
    buf[1] = 0xfe
    for (let i = 0; i < text.length; i += 1) buf[2 + i * 2] = text.charCodeAt(i)
    expect(looksLikeSvg(buf)).toBe(true)
  })

  /** `<svg` inside a COMMENT is not a root element. */
  it('is not fooled by the string appearing in a comment', () => {
    expect(looksLikeSvg(bytesOf('<!-- <svg/> --><html></html>'))).toBe(false)
  })

  it('does not mistake a raster for a vector', () => {
    expect(looksLikeSvg(new Uint8Array([...PNG_SIGNATURE, 13, 10, 26, 10]))).toBe(false)
    expect(looksLikeSvg(new Uint8Array())).toBe(false)
    expect(looksLikeSvg(bytesOf('<html><body>hello</body></html>'))).toBe(false)
  })
})

describe('the pre-check', () => {
  /**
   * A second line of defence, and named as such in the module header. What makes
   * this safe is that the output is a bitmap, not that this list is complete.
   */
  it.each([
    ['a script element', svg('<script>fetch("/steal")</script>')],
    ['a spaced script tag', svg('< script >x</script>')],
    ['an uppercase SCRIPT', svg('<SCRIPT>x</SCRIPT>')],
    ['foreignObject, which carries arbitrary HTML', svg('<foreignObject><b>x</b></foreignObject>')],
    ['an entity declaration, for XXE and billion laughs', `<!DOCTYPE svg [<!ENTITY a "b">]>${svg('')}`],
    ['an external image reference', svg('<image href="https://elsewhere.test/x.png"/>')],
    ['an external use reference', svg('<use xlink:href="https://elsewhere.test/x.svg#a"/>')],
  ])('refuses %s', (_name, text) => {
    expect(refuseUnsafeSvg(text)).not.toBeNull()
  })

  /** And it must not refuse the ordinary things a real logo contains. */
  it.each([
    ['a path', svg('<path d="M0 0h64v64H0z" fill="navy"/>')],
    ['a local fragment reference', svg('<use href="#glyph"/>')],
    ['an inline data image', svg('<image href="data:image/png;base64,iVBOR"/>')],
    ['a gradient', svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/>')],
  ])('allows %s', (_name, text) => {
    expect(refuseUnsafeSvg(text)).toBeNull()
  })
})

describe('rasteriseSvgLogo', () => {
  /** THE POINT OF THE WHOLE FILE. What is stored is a raster, never the vector. */
  it('returns a PNG, not the SVG it was given', async () => {
    const result = await rasteriseSvgLogo(bytesOf(svg('<rect width="64" height="64" fill="blue"/>')))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect([...result.png.slice(0, 4)]).toEqual(PNG_SIGNATURE)
    expect(looksLikeSvg(result.png), 'no SVG may survive this function').toBe(false)
  })

  it('renders at the width a retina lockup and a model both want', async () => {
    const result = await rasteriseSvgLogo(bytesOf(svg('<rect width="64" height="64" fill="blue"/>')))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { default: sharp } = await import('sharp')
    expect((await sharp(Buffer.from(result.png)).metadata()).width).toBe(SVG_RASTER_WIDTH)
  })

  /**
   * A logo with no width or height, only a viewBox, is extremely common and is
   * the case a naive rasteriser returns 0x0 for.
   */
  it('handles a logo that states only a viewBox', async () => {
    const result = await rasteriseSvgLogo(
      bytesOf(svg('<circle cx="50" cy="50" r="40" fill="red"/>', 'viewBox="0 0 100 100"')),
    )
    expect(result.ok).toBe(true)
  })

  /** Transparency is the whole reason a logo is supplied as a file. */
  it('keeps the alpha channel rather than inventing a background', async () => {
    const result = await rasteriseSvgLogo(
      bytesOf(svg('<circle cx="32" cy="32" r="20" fill="black"/>')),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { default: sharp } = await import('sharp')
    expect((await sharp(Buffer.from(result.png)).metadata()).hasAlpha).toBe(true)
  })

  it('refuses a hostile vector before the renderer parses it', async () => {
    const result = await rasteriseSvgLogo(bytesOf(svg('<script>alert(1)</script>')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/script/i)
  })

  /**
   * ── THIS TEST USED TO PASS FOR THE WRONG REASON ───────────────────────────
   * It padded with NUL bytes, which make libxml throw, so it went green whether
   * or not the size cap ran — the review deleted `SVG_MAX_BYTES` entirely and
   * it stayed green. The padding is now VALID markup, so only the cap can
   * refuse it, and the message is asserted so a different refusal cannot pass.
   */
  it('refuses a file larger than a logo needs', async () => {
    const filler = `<rect width="1" height="1" fill="red"/>`
    const huge = bytesOf(svg(filler.repeat(Math.ceil(SVG_MAX_BYTES / filler.length) + 1)))
    expect(huge.byteLength).toBeGreaterThan(SVG_MAX_BYTES)

    const result = await rasteriseSvgLogo(huge)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message, 'it must be the SIZE cap that refused').toMatch(/larger than/i)
  })

  /**
   * ── RENDER TIME, WHICH NOTHING BOUNDED ────────────────────────────────────
   * MEASURED by an adversarial review against this repo's own sharp: filter
   * cost is roughly 7ms of CPU per byte of markup. Twenty stacked
   * `feTurbulence`/`feGaussianBlur` filters over a 3000x3000 canvas is 23
   * seconds in 3.4 KB — inside the old 2 MB cap, inside the 40M pixel cap, past
   * `refuseUnsafeSvg`, and inside a server action with no concurrency limit.
   * At the old cap that extrapolated to about four hours of CPU per upload.
   */
  it('refuses a filter bomb before the renderer sees it', async () => {
    const bomb = Array.from(
      { length: 20 },
      (_, i) =>
        `<filter id="f${i}"><feTurbulence baseFrequency="0.9" numOctaves="10"/><feGaussianBlur stdDeviation="100"/></filter><rect width="3000" height="3000" filter="url(#f${i})"/>`,
    ).join('')

    const result = await rasteriseSvgLogo(bytesOf(svg(bomb, 'width="3000" height="3000"')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/filter/i)
  })

  /** And a real logo's handful of filters is still fine. */
  it('allows the few filters a real logo uses', () => {
    const modest = Array.from({ length: 3 }, (_, i) => `<filter id="f${i}"/>`).join('')
    expect(refuseUnsafeSvg(svg(modest))).toBeNull()
  })

  /** Malformed input is a fact to report, never an exception to leak. */
  it('reports a vector it cannot read instead of throwing', async () => {
    const result = await rasteriseSvgLogo(bytesOf('<svg><this is not xml'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not read/i)
  })
})
