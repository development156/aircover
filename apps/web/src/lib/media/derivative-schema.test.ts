import { describe, expect, test } from 'vitest'
import { AssetDerivativeSchema } from '@sahoda/shared'

/**
 * THE ROW HAS TO PARSE, AND IT IS PARSED AFTER THE BYTES ARE ALREADY IN STORAGE.
 *
 * ── WHY THIS IS THE MOST DANGEROUS PARSE IN THE LANE ────────────────────────
 * `mintCroppedAttachment` runs it AFTER uploading the derivative object and
 * inserting the `asset_derivatives` row. A failure there is not a clean refusal:
 * the file is in the bucket, the row is in the table, `post_media` is never
 * written, and the person is told the crop did not work. A silent partial
 * success — the exact class this lane exists to close.
 *
 * ── AND TYPECHECK CANNOT SEE IT ─────────────────────────────────────────────
 * `formatMapFor` returns `Record<string, string>`, which is assignable to
 * whatever the schema's key type is, so the compiler is happy either way. Zod 4
 * changed `z.record()` with an ENUM key to be EXHAUSTIVE — every key required —
 * and moved the old partial behaviour to `z.partialRecord()`. A post that is an
 * Instagram story and nothing else writes ONE key; the column's own default is
 * `{}`. If the schema demanded all four, both would fail.
 *
 * No pglite test reaches this: those insert through raw SQL and never take a row
 * back out through zod.
 */

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  asset_id: '33333333-3333-4333-8333-333333333333',
  storage_path: '22222222-2222-4222-8222-222222222222/derivatives/a/b.jpg',
  recipe: '0-240-1080-1440-jpg-8388608',
  channels: ['instagram'],
  crop_x: 0,
  crop_y: 240,
  crop_w: 1080,
  crop_h: 1440,
  focal_x: 0.5,
  focal_y: 0.42,
  mime: 'image/jpeg',
  bytes: 97_112,
  width: 1080,
  height: 1440,
  created_by: 'user_abc',
  created_at: '2026-08-21T00:00:00Z',
}

describe('AssetDerivativeSchema parses the rows this lane actually writes', () => {
  test.each([
    ['one channel with a format — the ordinary story case', { instagram: 'story' }],
    ["the column's own default, when no version stated an intent", {}],
    ['every channel at once', { instagram: 'story', x: 'text', gbp: 'image', linkedin: 'text' }],
  ])('%s', (_label, formats) => {
    const parsed = AssetDerivativeSchema.safeParse({ ...ROW, formats })
    expect(parsed.success).toBe(true)
  })

  test('a channel that is not a channel is refused', () => {
    // The map's keys come from the Constraint Engine, so a stored row naming
    // something else is a row nobody should act on.
    const parsed = AssetDerivativeSchema.safeParse({ ...ROW, formats: { myspace: 'text' } })
    expect(parsed.success).toBe(false)
  })

  test('the bigint byte count arrives as a NUMBER, as PostgREST sends it', () => {
    expect(AssetDerivativeSchema.safeParse({ ...ROW, formats: {}, bytes: 3_000_000 }).success).toBe(
      true,
    )
  })

  test('focal coordinates are real numbers, not integers', () => {
    // `real` in Postgres. `z.int()` here would refuse every focal point that is
    // not exactly 0 or 1 — which is every one a person actually chooses.
    expect(
      AssetDerivativeSchema.safeParse({ ...ROW, formats: {}, focal_x: 0.317, focal_y: 0.884 })
        .success,
    ).toBe(true)
  })
})
