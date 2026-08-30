import { describe, expect, test } from 'vitest'

import { canvasPictures, downloadName, isShowable } from './canvas'
import type { GenerationCard } from './read'

/**
 * WHAT REACHES THE CANVAS, AND WHAT A SAVED FILE IS CALLED.
 *
 * Both are places where a small wrongness is expensive: a canvas showing a
 * picture that is not there tells somebody a generation succeeded when it
 * failed, and a folder of identically named files loses them work they paid for.
 */

const generation = (over: Partial<GenerationCard['generation']> = {}) =>
  ({
    id: 'g1',
    workspace_id: 'w1',
    status: 'ready',
    mode: 'on_brand',
    prompt_given: 'a plate of samosas',
    prompt_sent: 'a plate of samosas, warm light',
    format_id: 'square',
    brand_signals: [],
    ...over,
  }) as GenerationCard['generation']

const picture = (over: Partial<GenerationCard['pictures'][number]> = {}) => ({
  imageId: 'i1',
  idx: 0,
  assetId: 'a1',
  url: 'https://example.test/1.png',
  width: 1080,
  height: 1080,
  mime: 'image/png',
  ...over,
})

describe('what reaches the canvas', () => {
  test('a ready picture with a link does', () => {
    const out = canvasPictures([{ generation: generation(), pictures: [picture()] }])
    expect(out).toHaveLength(1)
    expect(out[0]!.prompt).toBe('a plate of samosas')
  })

  /**
   * THE ONE THAT MATTERS. A canvas is a claim that a picture EXISTS. Showing a
   * frame for a generation that failed, or one still running, would tell
   * somebody they got something they did not get, and they would go looking for
   * it in a library where it is not.
   */
  test('a generation that is not ready does not, whatever it carries', () => {
    for (const status of ['queued', 'running', 'failed', 'cancelled'] as const) {
      const out = canvasPictures([{ generation: generation({ status }), pictures: [picture()] }])
      expect(out, status).toHaveLength(0)
    }
  })

  /**
   * A picture whose link would not sign is a REAL picture with a broken preview,
   * and the list below says exactly that. The canvas cannot draw it, so it is
   * not offered here. The two answers do not contradict each other: one is about
   * existence, the other about what can be rendered this second.
   */
  test('a picture with no link does not, because a canvas cannot draw one', () => {
    const out = canvasPictures([{ generation: generation(), pictures: [picture({ url: null })] }])
    expect(out).toHaveLength(0)
  })

  test('order is the reader’s order, so position zero is the newest thing made', () => {
    const out = canvasPictures([
      { generation: generation({ id: 'new', prompt_given: 'newest' }), pictures: [picture()] },
      {
        generation: generation({ id: 'old', prompt_given: 'oldest' }),
        pictures: [picture({ imageId: 'i2' })],
      },
    ])
    expect(out.map((one) => one.prompt)).toEqual(['newest', 'oldest'])
  })

  test('every picture of a generation reaches the strip, not only the first', () => {
    const out = canvasPictures([
      {
        generation: generation(),
        pictures: [picture(), picture({ imageId: 'i2', idx: 1 })],
      },
    ])
    expect(out.map((one) => one.imageId)).toEqual(['i1', 'i2'])
  })

  test('isShowable narrows rather than asserting', () => {
    expect(isShowable(picture())).toBe(true)
    expect(isShowable(picture({ url: null }))).toBe(false)
  })
})

describe('what a saved file is called', () => {
  test('the words a person typed are in the name, so a folder of them is usable', () => {
    expect(
      downloadName({
        imageId: 'abcdef12-3456-7890-abcd-ef1234567890',
        prompt: 'Fresh Samosas!',
        mime: 'image/png',
      }),
    ).toBe('fresh-samosas-abcdef12.png')
  })

  /**
   * Two presses of the same prompt make two DIFFERENT pictures. Without
   * something unique the second silently replaces the first on disk.
   */
  test('two pictures from one prompt get different names', () => {
    const one = downloadName({
      imageId: 'aaaaaaaa-0000-0000-0000-000000000000',
      prompt: 'chai',
      mime: 'image/png',
    })
    const two = downloadName({
      imageId: 'bbbbbbbb-0000-0000-0000-000000000000',
      prompt: 'chai',
      mime: 'image/png',
    })
    expect(one).not.toBe(two)
  })

  /**
   * The extension comes from the mime PROVEN by sniffing the stored bytes. With
   * no proof the name carries no extension: an operating system can work out a
   * file it was handed unnamed and cannot recover from being told a JPEG is a
   * PNG.
   */
  test('an unproven type gets no extension rather than a guessed one', () => {
    const said = downloadName({
      imageId: 'aaaaaaaa-1111-1111-1111-111111111111',
      prompt: 'chai',
      mime: null,
    })
    expect(said).toBe('chai-aaaaaaaa')
    expect(said).not.toMatch(/\.(png|jpg|jpeg|webp|gif)$/)
  })

  test('an unknown mime also gets no extension', () => {
    expect(
      downloadName({
        imageId: 'aaaaaaaa-1111-1111-1111-111111111111',
        prompt: 'chai',
        mime: 'image/avif',
      }),
    ).toBe('chai-aaaaaaaa')
  })

  test('each proven type maps to the extension people expect', () => {
    const id = 'aaaaaaaa-1111-1111-1111-111111111111'
    expect(downloadName({ imageId: id, prompt: 'x', mime: 'image/jpeg' })).toMatch(/\.jpg$/)
    expect(downloadName({ imageId: id, prompt: 'x', mime: 'image/webp' })).toMatch(/\.webp$/)
    expect(downloadName({ imageId: id, prompt: 'x', mime: 'image/gif' })).toMatch(/\.gif$/)
  })

  test('a prompt of punctuation still produces a usable name', () => {
    expect(
      downloadName({
        imageId: 'aaaaaaaa-1111-1111-1111-111111111111',
        prompt: '!!! ??? ...',
        mime: 'image/png',
      }),
    ).toBe('picture-aaaaaaaa.png')
  })

  test('a very long prompt is cut without leaving a trailing dash', () => {
    const said = downloadName({
      imageId: 'aaaaaaaa-1111-1111-1111-111111111111',
      prompt: 'a very long description of a picture that keeps going and going and going forever',
      mime: 'image/png',
    })
    expect(said.length).toBeLessThanOrEqual(64)
    // No doubled dash, which is what a naive cut through a word boundary leaves.
    expect(said).not.toMatch(/--/)
    expect(said).toMatch(/-aaaaaaaa\.png$/)
  })

  test('the name is safe for a filesystem, with no slashes or spaces', () => {
    const said = downloadName({
      imageId: 'aaaaaaaa-1111-1111-1111-111111111111',
      prompt: 'a/b\\c d:e*f?g"h<i>j|k',
      mime: 'image/png',
    })
    expect(said).toMatch(/^[a-z0-9.-]+$/)
  })
})
