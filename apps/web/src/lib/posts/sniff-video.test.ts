import { describe, it, expect } from 'vitest'

import { sniffVideo } from './sniff-video'
import { TINY_LANDSCAPE_MP4, TINY_MOV, TINY_PORTRAIT_MP4 } from './video-fixtures'

const bytesOf = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'))

describe('sniffVideo, against files ffmpeg actually made', () => {
  it.each([
    ['portrait MP4', TINY_PORTRAIT_MP4, 'video/mp4', 160, 256, 2],
    ['landscape MP4', TINY_LANDSCAPE_MP4, 'video/mp4', 256, 160, 1],
    // QuickTime is its own container and X accepts it beside MP4.
    ['QuickTime MOV', TINY_MOV, 'video/quicktime', 64, 64, 1],
  ])('reads %s', (_name, base64, mime, width, height, seconds) => {
    const r = sniffVideo(bytesOf(base64))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.video).toEqual({ mime, width, height, durationSeconds: seconds })
  })

  /**
   * ── THE DEFECT THIS SET WAS BUILT TO CATCH ────────────────────────────────
   * The first `tkhd` reader was four bytes short. It read the height field as the
   * width and read the height from OUTSIDE the box — landing on the next box's
   * length, which divided by 65536 came to 0, so every real MP4 was refused as
   * unreadable. Portrait and landscape fixtures are both here for that reason: a
   * square-only fixture would pass a reader that swapped the two.
   */
  it('does not confuse width with height', () => {
    const portrait = sniffVideo(bytesOf(TINY_PORTRAIT_MP4))
    const landscape = sniffVideo(bytesOf(TINY_LANDSCAPE_MP4))
    if (!portrait.ok || !landscape.ok) throw new Error('expected both to read')
    expect(portrait.video.height).toBeGreaterThan(portrait.video.width)
    expect(landscape.video.width).toBeGreaterThan(landscape.video.height)
  })

  it('refuses WebM by name rather than as "not a video"', () => {
    // A real container, deliberately unsupported: its duration lives in a
    // variable-length EBML tree and no channel here lists it. Saying "not a video
    // type" about a file that plainly is one would be a true sentence and a
    // useless one.
    const ebml = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const r = sniffVideo(ebml)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unknown_format')
    expect(r.message).toMatch(/MP4/)
  })

  it('refuses a JPEG, which is not its job to accept', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0, 0, 0, 0, 0, 0])
    expect(sniffVideo(jpeg).ok).toBe(false)
  })

  it('says "could not read" rather than "wrong type" for a truncated MP4', () => {
    // The distinction matters to the person: one is a file to replace, the other
    // is a file to re-save. Half a header is not evidence of the wrong format.
    const full = bytesOf(TINY_PORTRAIT_MP4)
    const r = sniffVideo(full.slice(0, 40))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('truncated')
    expect(r.message).toMatch(/re-save/i)
  })

  it('refuses an empty file without claiming anything about it', () => {
    const r = sniffVideo(new Uint8Array(0))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('truncated')
  })

  /**
   * A duration of zero is what an unfinalised or fragmented file reports. It is
   * not a zero-second video; it is an unknown — and rounding it to 0 would clear
   * every length limit there is, which is the whole reason this sniffer exists.
   */
  it('treats a zero duration as unreadable, not as a zero-second video', () => {
    const bytes = bytesOf(TINY_PORTRAIT_MP4)
    // Find `mvhd` and blank the v0 duration field (content + 16, four bytes).
    let at = -1
    for (let i = 0; i + 4 <= bytes.length; i += 1) {
      if (String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!) === 'mvhd') {
        at = i + 4
        break
      }
    }
    expect(at).toBeGreaterThan(0)
    const broken = new Uint8Array(bytes)
    broken.fill(0, at + 16, at + 20)

    const r = sniffVideo(broken)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('truncated')
  })

  it('does not loop forever on a box that declares no length', () => {
    // A zero-size box means "to end of file" and a size below its own header is
    // malformed; a walker that mishandles either spins. Asserted by completing.
    const bytes = bytesOf(TINY_PORTRAIT_MP4)
    const broken = new Uint8Array(bytes)
    broken.fill(0, 32, 36) // the moov box's length
    expect(() => sniffVideo(broken)).not.toThrow()
    const tiny = new Uint8Array([0, 0, 0, 2, ...Array.from('ftypisom', (c) => c.charCodeAt(0))])
    expect(() => sniffVideo(tiny)).not.toThrow()
  })
})
