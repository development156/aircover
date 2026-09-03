import { describe, expect, test } from 'vitest'

import { UPLOADABLE_MIME_TYPES } from '@/lib/assets/kind'
import { MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'

import { UPLOAD_CAP_MB, describeUploadRefusal, uploadAccept } from './upload'

/**
 * WHAT THE SCREEN REFUSES BEFORE THE BYTES LEAVE THE DEVICE.
 *
 * This is a COURTESY, not a gate: the server sniffs the real bytes and refuses
 * on what it proves. So the interesting cases here are not the refusals, they
 * are the things this function must NOT refuse, because refusing a valid
 * picture on a browser's guess costs somebody a photograph they own with no way
 * to tell that their file was fine.
 */

describe('what may be tried', () => {
  test('every type the upload path can prove is accepted', () => {
    for (const mime of UPLOADABLE_MIME_TYPES) {
      expect(describeUploadRefusal({ type: mime, size: 1000 }), mime).toBeNull()
    }
  })

  /**
   * THE ONE THAT MATTERS. `File.type` is whatever the operating system
   * associated with the extension: it can be absent. A screen that refused a
   * blank type would reject a valid JPEG and tell the person their file was
   * wrong, when the file was fine and the guess was missing.
   */
  test('a file whose type the browser did not report goes through to the server', () => {
    expect(describeUploadRefusal({ type: '', size: 1000 })).toBeNull()
  })

  test('exactly the cap is allowed, because the bound is inclusive', () => {
    expect(describeUploadRefusal({ type: 'image/png', size: MEDIA_UPLOAD_CAP_BYTES })).toBeNull()
  })
})

describe('what is refused, and how', () => {
  test('an empty file says so rather than failing silently later', () => {
    expect(describeUploadRefusal({ type: 'image/png', size: 0 })).toMatch(/empty/i)
  })

  test('too large names the cap in the units the person sees', () => {
    const said = describeUploadRefusal({
      type: 'image/png',
      size: MEDIA_UPLOAD_CAP_BYTES + 1,
    })
    expect(said).toContain(`${UPLOAD_CAP_MB} MB`)
  })

  /**
   * A video and an unreadable picture are DIFFERENT mistakes with different
   * fixes. "Pick a photo rather than a video" and "a JPEG, a PNG or a WebP all
   * work" send somebody to two different places, and collapsing them would send
   * half of them to the wrong one.
   */
  test('the wrong kind of file and the wrong kind of picture are different sentences', () => {
    const video = describeUploadRefusal({ type: 'video/mp4', size: 1000 })
    const picture = describeUploadRefusal({ type: 'image/x-something', size: 1000 })
    expect(video).not.toBe(picture)
    expect(video).toMatch(/rather than a video/i)
    expect(picture).toMatch(/jpeg|png|webp/i)
  })

  /**
   * An SVG is a script container and no channel accepts one. It starts with
   * `image/`, so a prefix test would let it through, which is exactly the
   * mistake `kindForProvenMime` exists to name.
   */
  test('an SVG is refused, because a prefix test would have allowed it', () => {
    expect(describeUploadRefusal({ type: 'image/svg+xml', size: 1000 })).not.toBeNull()
  })

  test('every refusal names a fix rather than leaving somebody stuck', () => {
    const refusals = [
      describeUploadRefusal({ type: 'image/png', size: 0 }),
      describeUploadRefusal({ type: 'image/png', size: MEDIA_UPLOAD_CAP_BYTES + 1 }),
      describeUploadRefusal({ type: 'video/mp4', size: 10 }),
      describeUploadRefusal({ type: 'image/svg+xml', size: 10 }),
    ]
    for (const said of refusals) {
      expect(said, String(said)).toMatch(/pick|make it smaller|all work|add it again/i)
    }
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    const all = [
      describeUploadRefusal({ type: 'image/png', size: 0 }),
      describeUploadRefusal({ type: 'image/png', size: MEDIA_UPLOAD_CAP_BYTES + 1 }),
      describeUploadRefusal({ type: 'video/mp4', size: 10 }),
      describeUploadRefusal({ type: 'image/svg+xml', size: 10 }),
    ]
    for (const said of all) expect(said ?? '').not.toMatch(/[—–]/)
  })
})

describe('what the file picker offers', () => {
  /**
   * From the engine's own list, never a literal. A hand-typed accept string
   * drifts from what the server will take, and the failure is invisible: the
   * picker greys out a file the product accepts perfectly well.
   */
  test('is the proven list, so the picker cannot drift from the server', () => {
    const offered = uploadAccept().split(',')
    expect(offered).toEqual([...UPLOADABLE_MIME_TYPES])
    expect(offered.length).toBeGreaterThan(0)
  })
})
