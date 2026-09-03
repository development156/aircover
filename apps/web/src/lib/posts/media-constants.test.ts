import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

import { capMbForChannels } from '@/components/posts/media-accept'
import {
  CHANNEL_MEDIA_CAP_BYTES,
  MEDIA_UPLOAD_CAP_BYTES,
  MEDIA_UPLOAD_CAP_MB,
  PLATFORM_REQUEST_CAP_BYTES,
} from './media-constants'

/**
 * The upload ceiling, the framework's body limit and the platform's request
 * limit have to agree, and until 2026-09-02 they did not.
 *
 * `bodySizeLimit` was 12 MB, derived from Instagram's 8 MB plus multipart
 * overhead, and every check passed. Vercel rejects any function request body
 * over 4.5 MB with a 413 at the edge, before Next runs, so a 6 MB photo was
 * accepted by `next start` and refused on app.sahodalabs.com with a generic
 * error boundary. The copy promised 8. No local test could see it, because none
 * runs behind Vercel's edge; this one reads the config instead.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads `next.config.ts` as TEXT and matches the literal `bodySizeLimit`
 * value, so it is blind to a limit assembled at runtime — a variable, a
 * template literal, a value read from `process.env`, or the key set inside a
 * spread or a conditional. It is equally blind to the number Vercel actually
 * enforces: 4.5 MB is a published platform limit written down here as a
 * constant, not something this suite can measure, and if the platform changes
 * it nothing here goes red. And it says nothing about what the SERVER does with
 * a file once it has arrived; the per-channel ceilings are a separate constant
 * with separate call sites.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
/** apps/web/next.config.ts. This file lives at src/lib/posts. */
const NEXT_CONFIG = resolve(HERE, '../../../next.config.ts')

/**
 * Next parses `bodySizeLimit` with the `bytes` package, where `mb` is 1024².
 * The product cap is stated in decimal megabytes, which is what a file browser
 * shows, so the two are converted here rather than compared by their labels.
 */
function bodySizeLimitBytes(): number {
  const source = readFileSync(NEXT_CONFIG, 'utf8')
  const match = /bodySizeLimit:\s*'(\d+(?:\.\d+)?)(kb|mb)'/i.exec(source)
  if (match === null) {
    throw new Error('next.config.ts no longer states serverActions.bodySizeLimit')
  }
  const [, amount, unit] = match
  const factor = unit!.toLowerCase() === 'mb' ? 1024 * 1024 : 1024
  return Number(amount) * factor
}

/**
 * What a multipart envelope adds around the file: the boundary, the part
 * headers and the post id field. Measured envelopes are under 1 KB; 64 KB is
 * the allowance so the guard errs on the side of refusing a config that is
 * merely close.
 */
const MULTIPART_ALLOWANCE_BYTES = 64 * 1024

describe('the upload cap fits inside the request the platform will carry', () => {
  test('the framework body limit is at or under the platform request ceiling', () => {
    // Above this, Vercel answers 413 FUNCTION_PAYLOAD_TOO_LARGE before Next runs
    // and the honest "larger than N MB" sentence is never reached.
    expect(bodySizeLimitBytes()).toBeLessThanOrEqual(PLATFORM_REQUEST_CAP_BYTES)
  })

  test('a file at the cap, plus its multipart envelope, fits under the body limit', () => {
    expect(MEDIA_UPLOAD_CAP_BYTES + MULTIPART_ALLOWANCE_BYTES).toBeLessThanOrEqual(
      bodySizeLimitBytes(),
    )
  })

  test('the cap never exceeds what the most generous channel accepts', () => {
    // The platform floor can only lower the ceiling. Raising it above the
    // Constraint Engine would store files no channel can use.
    expect(MEDIA_UPLOAD_CAP_BYTES).toBeLessThanOrEqual(CHANNEL_MEDIA_CAP_BYTES)
  })

  test('the platform figure is the one Vercel documents', () => {
    // https://vercel.com/docs/functions/limitations: 4.5 MB request body.
    expect(PLATFORM_REQUEST_CAP_BYTES).toBe(4_500_000)
  })
})

describe('the number a customer reads is the number the server enforces', () => {
  test('the stated MB is the cap rounded DOWN, never up', () => {
    // "Up to 4 MB" must be true of a 4 MB file. Rounding 4.5 MB up to "5 MB"
    // would promise a file the server refuses.
    expect(MEDIA_UPLOAD_CAP_MB).toBe(Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000))
    expect(MEDIA_UPLOAD_CAP_MB * 1_000_000).toBeLessThanOrEqual(MEDIA_UPLOAD_CAP_BYTES)
  })

  test('no per-channel hint quotes more than the upload can carry', () => {
    // `capMbForChannels` used to quote Instagram's 8 for any post carrying it.
    // A writer told 8 exports a 6 MB file that the edge refuses.
    for (const channel of ChannelSchema.options) {
      expect(capMbForChannels([channel]), channel).toBeLessThanOrEqual(MEDIA_UPLOAD_CAP_MB)
    }
    expect(capMbForChannels([])).toBeLessThanOrEqual(MEDIA_UPLOAD_CAP_MB)
    expect(capMbForChannels(ChannelSchema.options)).toBeLessThanOrEqual(MEDIA_UPLOAD_CAP_MB)
  })
})
