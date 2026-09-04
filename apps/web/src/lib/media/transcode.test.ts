import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { orientedSize, renderDerivative } from './derive'
import { planAutoConvert } from './auto-convert'
import type { MediaTarget } from './targets'

/**
 * THE CONVERSION, WITH REAL BYTES THROUGH THE REAL ENCODER.
 *
 * `auto-convert.test.ts` proves the DECISION. This proves the ACT: that a rect
 * covering the whole oriented image turns `renderDerivative` into a pure change
 * of container — same picture, new format — and that the output is what it
 * claims to be.
 *
 * Nothing is mocked. sharp is a dependency of this app and the encoder that runs
 * in production is the one that runs here.
 */

const INSTAGRAM: MediaTarget = {
  channel: 'instagram',
  format: null,
  aspect: null,
  minW: null,
  minH: null,
  mimes: ['image/jpeg', 'image/png'],
  maxBytes: 8 * 1024 * 1024,
}

/** A real image, not a fixture blob, so the encoder has something to encode. */
async function makeImage(format: 'webp' | 'gif' | 'jpeg', size = 400): Promise<Uint8Array> {
  const base = sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
  const buffer =
    format === 'webp'
      ? await base.webp().toBuffer()
      : format === 'gif'
        ? await base.gif().toBuffer()
        : await base.jpeg().toBuffer()
  return new Uint8Array(buffer)
}

describe('a whole-image rect is a pure transcode', () => {
  it('turns a WebP into a JPEG Instagram will take, same pixels', async () => {
    const webp = await makeImage('webp')
    const oriented = await orientedSize(webp)
    expect(oriented).not.toBeNull()

    // The decision and the act, in the order the action runs them.
    const plan = planAutoConvert({
      originalMime: 'image/webp',
      targets: [INSTAGRAM],
      hasNonFormatObjection: false,
    })
    expect(plan).toEqual({ kind: 'transcode', mime: 'image/jpeg' })

    const rendered = await renderDerivative(
      webp,
      { x: 0, y: 0, width: oriented!.width, height: oriented!.height },
      'image/jpeg',
      8 * 1024 * 1024,
    )

    expect(rendered.ok).toBe(true)
    if (!rendered.ok) return

    // The container changed and the picture did not.
    expect(rendered.derivative.mime).toBe('image/jpeg')
    expect(rendered.derivative.width).toBe(oriented!.width)
    expect(rendered.derivative.height).toBe(oriented!.height)
    expect(rendered.derivative.bytes.byteLength).toBeGreaterThan(0)

    // And the output IS a JPEG — read back from the bytes, not from what the
    // encoder said. `renderDerivative` sniffs its own output for this reason.
    const meta = await sharp(Buffer.from(rendered.derivative.bytes)).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(oriented!.width)
  })

  it('sends a GIF to PNG and keeps it lossless', async () => {
    const gif = await makeImage('gif', 200)
    const oriented = await orientedSize(gif)

    const rendered = await renderDerivative(
      gif,
      { x: 0, y: 0, width: oriented!.width, height: oriented!.height },
      'image/png',
      8 * 1024 * 1024,
    )

    expect(rendered.ok).toBe(true)
    if (!rendered.ok) return
    const meta = await sharp(Buffer.from(rendered.derivative.bytes)).metadata()
    expect(meta.format).toBe('png')
  })

  it('a file already in the right container is never converted', async () => {
    // The decision half, against a real JPEG: no work is planned, so none is done.
    const jpeg = await makeImage('jpeg')
    expect(jpeg.byteLength).toBeGreaterThan(0)

    expect(
      planAutoConvert({
        originalMime: 'image/jpeg',
        targets: [INSTAGRAM],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'none' })
  })
})
