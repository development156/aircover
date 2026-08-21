import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    throw new Error('no supabase in this test')
  },
}))

import { offerFor } from './offer'
import { offerForAsset } from './offer-asset'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN OFFER MAY NEVER DAMAGE THE REFUSAL IT RIDES ON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Both of these run INSIDE the refusal arm of an attach action, after that
 * action has already composed a sentence and a per-channel objection list. If
 * either throws, the throw escapes to the action's own catch and replaces both
 * with "Could not add that file — try again". The writer loses the reason their
 * photo was refused because an extra feature failed.
 *
 * MEASURED, not imagined: adding the `offerForAsset` call turned an existing
 * test red — `assets.test.ts`, "the refusal names the channel rather than
 * failing anonymously" — because the offer reached for storage in a suite that
 * mocks none. That is exactly the production failure, found by a test written
 * for something else. This file states the rule directly so it cannot regress
 * quietly.
 *
 * The worst outcome either function may produce is "no offer", which is the
 * screen that existed before this lane.
 */

const ASSET = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  storage_path: 'ws/assets/a.jpg',
  kind: 'image' as const,
  mime: 'image/jpeg',
  bytes: 1000,
  width: 1080,
  height: 1920,
  alt: null,
  title: null,
  created_by: null,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
}

describe('offerForAsset is total', () => {
  test('returns instead of throwing when storage is unreachable', async () => {
    // `createServerSupabase` throws in this suite, which is the same shape as a
    // missing client, a network failure, or a bucket that refused the read.
    await expect(
      offerForAsset({
        asset: ASSET,
        channels: ['instagram'],
        formats: {},
        rejections: [
          { channel: 'instagram', violations: [{ code: 'MEDIA_ASPECT', message: 'x' }] },
        ],
      }),
    ).resolves.toBeNull()
  })

  test('returns null for a row whose own facts were never established', async () => {
    // A second sentence about a file the caller has already refused for exactly
    // this reason would be two explanations of one problem.
    await expect(
      offerForAsset({
        asset: { ...ASSET, width: null },
        channels: ['instagram'],
        formats: {},
        rejections: [],
      }),
    ).resolves.toBeNull()
  })
})

describe('offerFor is total', () => {
  test.each([
    ['empty bytes', new Uint8Array()],
    ['not an image', new Uint8Array([1, 2, 3, 4, 5])],
    ['a truncated jpeg header', new Uint8Array([0xff, 0xd8, 0xff])],
  ])('%s comes back as "no offer" rather than a throw', async (_label, bytes) => {
    const result = await offerFor({
      bytes,
      candidate: { mime: 'image/jpeg', bytes: bytes.byteLength, width: 1080, height: 1920 },
      channels: ['instagram'],
      formats: {},
      rejections: [],
      assetId: null,
      previewUrl: null,
    })
    expect(result.offered).toBe(false)
  })

  test('a channel list carrying rubbish does not throw', async () => {
    // Channels come off a `text[]` column. `decideAttach` already skips a channel
    // with no spec; this asserts the offer does not fall over on the same input.
    const result = await offerFor({
      bytes: new Uint8Array([1, 2, 3]),
      candidate: { mime: 'image/jpeg', bytes: 3, width: 10, height: 10 },
      // @ts-expect-error — deliberately outside the type, as a stored row can be.
      channels: ['instagram', 'myspace', null],
      formats: {},
      rejections: [],
      assetId: null,
      previewUrl: null,
    })
    expect(result.offered).toBe(false)
  })
})
