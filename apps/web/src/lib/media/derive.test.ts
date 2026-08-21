import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { CONSTRAINTS, validateMedia } from '@sahoda/shared'

import { sniffImage } from '../posts/sniff-image'
import { CENTRE, planCrop } from './crop-geometry'
import { orientedSize, renderDerivative, suggestFocal } from './derive'
import { targetsFor } from './targets'

/** A plain photograph-ish JPEG of a given size. */
async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const out = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
  return new Uint8Array(out)
}

/** Flat grey with a loud noisy square, so "where is the subject" has an answer. */
async function withSubjectAt(
  width: number,
  height: number,
  left: number,
  top: number,
): Promise<Uint8Array> {
  const side = 160
  const noise = Buffer.alloc(side * side * 3)
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 97) % 256
  const patch = await sharp(noise, { raw: { width: side, height: side, channels: 3 } })
    .png()
    .toBuffer()
  const out = await sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .composite([{ input: patch, left, top }])
    .jpeg({ quality: 95 })
    .toBuffer()
  return new Uint8Array(out)
}

/**
 * A real GIF89a with `frames` image descriptors, written by hand.
 *
 * Sharp cannot produce one from a raw buffer — given a tall strip it writes a
 * single tall frame — so a fixture built with sharp contains one frame however
 * many were intended, and an `animated` check asserted against it proves nothing.
 * These are the actual bytes: 2×2 pixels, a two-colour global table, and one
 * Graphic Control Extension plus one Image Descriptor per frame.
 *
 * The pixel data is a minimal LZW stream at code size 2 — clear (4), four
 * literal zeroes, end (5) — packed LSB-first into three bytes.
 */
function animatedGif(frames: number): Uint8Array {
  const bytes: number[] = [
    // "GIF89a"
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    // Logical screen: 2x2, global colour table of 2 entries, no background.
    0x02, 0x00, 0x02, 0x00, 0xf0, 0x00, 0x00,
    // The two colours.
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
  ]
  for (let frame = 0; frame < frames; frame += 1) {
    // Graphic Control Extension: no disposal, 10/100s delay, no transparency.
    bytes.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00)
    // Image Descriptor at (0,0), 2x2, no local colour table.
    bytes.push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00)
    // LZW minimum code size, one sub-block of three bytes, terminator.
    bytes.push(0x02, 0x03, 0x04, 0x80, 0x02, 0x00)
  }
  // Trailer.
  bytes.push(0x3b)
  return new Uint8Array(bytes)
}

describe('the original is never modified', () => {
  test('the input buffer is byte-identical after a crop', async () => {
    // The claim the whole feature rests on, in the form a reader can check.
    const input = await jpeg(1080, 1920)
    const before = new Uint8Array(input)
    const rect = { x: 0, y: 240, width: 1080, height: 1440 }

    const result = await renderDerivative(input, rect, 'image/jpeg', 8 * 1024 * 1024)
    expect(result.ok).toBe(true)

    expect(input.byteLength).toBe(before.byteLength)
    expect(Buffer.compare(Buffer.from(input), Buffer.from(before))).toBe(0)
  })

  test('the derivative is a different object from the original', async () => {
    const input = await jpeg(1080, 1920)
    const result = await renderDerivative(
      input,
      { x: 0, y: 240, width: 1080, height: 1440 },
      'image/jpeg',
      8 * 1024 * 1024,
    )
    if (!result.ok) throw new Error('expected a derivative')
    expect(Buffer.compare(Buffer.from(result.derivative.bytes), Buffer.from(input))).not.toBe(0)
  })
})

describe('the crop lands where the plan said, and the engine accepts it', () => {
  test('a 9:16 phone photo becomes a file instagram takes', async () => {
    const input = await jpeg(1080, 1920)

    // Refused today: 0.5625 is below the measured 0.75 floor.
    const beforeViolations = validateMedia([CONSTRAINTS.instagram], {
      mime: 'image/jpeg',
      bytes: input.byteLength,
      width: 1080,
      height: 1920,
    })[0]
    expect(beforeViolations?.violations.map((v) => v.code)).toContain('MEDIA_ASPECT')

    const plan = planCrop({ width: 1080, height: 1920 }, targetsFor(['instagram'], {}), CENTRE)
    if (!plan.ok) throw new Error('expected a plan')

    const result = await renderDerivative(input, plan.rect, 'image/jpeg', 8 * 1024 * 1024)
    if (!result.ok) throw new Error('expected a derivative')

    // The facts are read back out of the bytes, not taken from sharp.
    expect(result.derivative.width).toBe(1080)
    expect(result.derivative.height).toBe(1440)

    const after = validateMedia([CONSTRAINTS.instagram], {
      mime: result.derivative.mime,
      bytes: result.derivative.bytes.byteLength,
      width: result.derivative.width,
      height: result.derivative.height,
    })[0]
    expect(after?.violations ?? []).toEqual([])
  })

  test('the output container is what was asked for and is what was written', async () => {
    const input = await jpeg(1000, 1000)
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      const result = await renderDerivative(
        input,
        { x: 0, y: 0, width: 800, height: 800 },
        mime,
        8 * 1024 * 1024,
      )
      if (!result.ok) throw new Error(`expected a derivative for ${mime}`)
      // Sniffed from the bytes: the container claim is verified, not trusted.
      expect(result.derivative.mime).toBe(mime)
      expect(sniffImage(result.derivative.bytes).ok).toBe(true)
    }
  })
})

describe('the byte ceiling', () => {
  test('steps quality down until the file is under the cap', async () => {
    const input = await withSubjectAt(2000, 2000, 100, 100)
    const cap = 20_000
    const result = await renderDerivative(
      input,
      { x: 0, y: 0, width: 2000, height: 2000 },
      'image/jpeg',
      cap,
    )
    if (!result.ok) throw new Error('expected a derivative')
    expect(result.derivative.bytes.byteLength).toBeLessThanOrEqual(cap)
    // It had to work for it — a pass at the top of the ladder would prove nothing.
    expect(result.derivative.quality).toBeLessThan(82)
  })

  test('refuses rather than storing a file the engine will reject', async () => {
    // A cap no encode can reach. The honest outcome is a refusal, never the
    // smallest attempt handed back as if it fitted.
    const input = await withSubjectAt(2000, 2000, 100, 100)
    const result = await renderDerivative(
      input,
      { x: 0, y: 0, width: 2000, height: 2000 },
      'image/jpeg',
      500,
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('still_too_large')
  })

  test('does not walk the ladder when the first encode already fits', async () => {
    const input = await jpeg(1000, 1000)
    const result = await renderDerivative(
      input,
      { x: 0, y: 0, width: 800, height: 800 },
      'image/jpeg',
      8 * 1024 * 1024,
    )
    if (!result.ok) throw new Error('expected a derivative')
    expect(result.derivative.quality).toBe(82)
  })
})

describe('orientedSize', () => {
  test('reports the dimensions a browser would show for an EXIF-rotated photo', async () => {
    // Orientation 6 is a quarter turn: the stored pixels are 1200x800 and every
    // renderer shows 800x1200. A crop planned from the stored numbers would cut a
    // landscape rectangle out of a portrait photograph.
    const rotated = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()

    const oriented = await orientedSize(new Uint8Array(rotated))
    expect(oriented).not.toBeNull()
    expect(oriented?.width).toBe(800)
    expect(oriented?.height).toBe(1200)

    // …and the sniffer, which reads the SOF header, does NOT know this. Asserted
    // so the gap is recorded in the suite rather than only in a comment.
    const sniffed = sniffImage(new Uint8Array(rotated))
    expect(sniffed.ok && sniffed.image.width).toBe(1200)
  })

  test('a still image is not animated', async () => {
    const still = await orientedSize(await jpeg(100, 100))
    expect(still?.animated).toBe(false)
  })

  test('a REAL two-frame gif is reported as animated', async () => {
    // The refusal for moving images is deliberate product behaviour — cropping a
    // gif would hand the customer back a still of something they uploaded because
    // it moves. An earlier version of this test built a ONE-frame gif and
    // asserted only that the read did not fail, which exercised nothing.
    //
    // Built byte by byte, because sharp will not WRITE one from a raw strip —
    // it flattens the frames into a single tall image — and a fixture that
    // silently contains one frame would let this assertion pass on a build where
    // `pages` was never read at all. That is what the first version of this test
    // did.
    const animated = animatedGif(2)
    const meta = await orientedSize(animated)
    expect(meta).not.toBeNull()
    expect(meta?.animated).toBe(true)
    // The visible size is ONE frame's, which is what a crop would be planned from.
    expect(meta?.width).toBe(2)
    expect(meta?.height).toBe(2)
  })

  test('a ONE-frame gif is not animated, so the refusal is about movement', async () => {
    // The control. Without it, an `animated` that simply returned true for every
    // gif would pass the test above and refuse a perfectly croppable still.
    const meta = await orientedSize(animatedGif(1))
    expect(meta?.animated).toBe(false)
  })

  test('returns null for bytes that are not an image', async () => {
    expect(await orientedSize(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

describe('suggestFocal', () => {
  // The crop that matters is 1200x2000 -> 1200x1600: exactly what a 9:16 phone
  // photo bound for an Instagram feed post gets. A same-aspect resize is not a
  // crop at all, so libvips has nothing to place and honestly returns the centre
  // — which is what an earlier version of these two tests was measuring.
  //
  // MEASURED: sharp reports `cropOffsetTop` as a NEGATIVE number (-400 for a
  // subject at the bottom of a 2000px photo), which is why the mapping takes its
  // absolute value rather than adding it.
  test('finds a subject near the TOP of a tall photo, not the centre', async () => {
    const input = await withSubjectAt(1200, 2000, 520, 60)
    const focal = await suggestFocal(
      input,
      { width: 1200, height: 2000 },
      { width: 1200, height: 1600 },
    )
    expect(focal.y).toBeLessThan(0.5)
  })

  test('finds a subject near the BOTTOM of a tall photo', async () => {
    // The head-off case, in the direction the founder actually complained about:
    // a centre crop of this photo cuts the subject; the suggestion does not.
    const input = await withSubjectAt(1200, 2000, 520, 1780)
    const focal = await suggestFocal(
      input,
      { width: 1200, height: 2000 },
      { width: 1200, height: 1600 },
    )
    expect(focal.y).toBeGreaterThan(0.5)
  })

  test('finds a subject on the LEFT of a wide photo', async () => {
    const input = await withSubjectAt(2000, 1200, 40, 520)
    const focal = await suggestFocal(
      input,
      { width: 2000, height: 1200 },
      { width: 1600, height: 1200 },
    )
    expect(focal.x).toBeLessThan(0.5)
  })

  test('always returns a point inside the image, never a guess outside it', async () => {
    const input = await withSubjectAt(1200, 800, 0, 0)
    const focal = await suggestFocal(
      input,
      { width: 1200, height: 800 },
      { width: 600, height: 800 },
    )
    expect(focal.x).toBeGreaterThanOrEqual(0)
    expect(focal.x).toBeLessThanOrEqual(1)
    expect(focal.y).toBeGreaterThanOrEqual(0)
    expect(focal.y).toBeLessThanOrEqual(1)
  })

  test('centres when there is nothing to crop', async () => {
    const input = await jpeg(500, 500)
    expect(
      await suggestFocal(input, { width: 500, height: 500 }, { width: 500, height: 500 }),
    ).toEqual(CENTRE)
  })

  test('centres rather than throwing when the bytes cannot be read', async () => {
    const focal = await suggestFocal(
      new Uint8Array([9, 9, 9]),
      { width: 10, height: 10 },
      { width: 5, height: 5 },
    )
    expect(focal).toEqual(CENTRE)
  })
})
