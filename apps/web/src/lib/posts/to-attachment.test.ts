import type { PostMedia } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { toAttachment, unverifiableRows, validateAttachments } from './to-attachment'

const MB = 1024 * 1024

function makeRow(overrides: Partial<PostMedia> = {}): PostMedia {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    post_id: '33333333-3333-4333-8333-333333333333',
    storage_path: 'workspaces/22222222/posts/33333333/hero.jpg',
    mime: 'image/jpeg',
    bytes: 1 * MB,
    width: 1200,
    height: 630,
    alt: null,
    meta: { source: 'upload' },
    created_at: '2026-07-19T10:00:00.000Z',
    updated_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  }
}

describe('toAttachment', () => {
  test('converts a complete row into an attachment the engine can validate', () => {
    const result = toAttachment(makeRow())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachment).toEqual({
      mime: 'image/jpeg',
      bytes: 1 * MB,
      width: 1200,
      height: 630,
    })
  })

  test('passes dimensions through when the row has them', () => {
    const result = toAttachment(makeRow({ width: 640, height: 480 }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachment.width).toBe(640)
    expect(result.attachment.height).toBe(480)
  })

  test('leaves dimensions undefined when the row has none, so the engine skips the dims check', () => {
    const result = toAttachment(makeRow({ width: null, height: null }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachment.width).toBeUndefined()
    expect(result.attachment.height).toBeUndefined()

    // Engine contract: dims are only checked when BOTH are defined.
    const [gbp] = validateAttachments(['gbp'], [makeRow({ width: null, height: null })])
    expect(gbp?.violations.map((v) => v.code)).not.toContain('MEDIA_DIMS')
  })

  test('drops a half-known dimension pair rather than validating against a guess', () => {
    const result = toAttachment(makeRow({ width: 1200, height: null }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachment.width).toBeUndefined()
    expect(result.attachment.height).toBeUndefined()
  })

  test('refuses a row with no file type instead of reporting it as valid', () => {
    const result = toAttachment(makeRow({ mime: null }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing_mime')
    expect(result.message).toMatch(/file type/i)
    expect(result.message).not.toMatch(/\bvalid\b|\bok\b|\bpassed\b|\ball good\b/i)
  })

  test('refuses a row with no file size instead of reporting it as valid', () => {
    const result = toAttachment(makeRow({ bytes: null }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing_bytes')
    expect(result.message).toMatch(/file size/i)
    expect(result.message).not.toMatch(/\bvalid\b|\bok\b|\bpassed\b|\ball good\b/i)
  })

  test('reports the missing file type first when both type and size are unknown', () => {
    const result = toAttachment(makeRow({ mime: null, bytes: null }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing_mime')
  })

  test('accepts a zero-byte row as convertible and lets the engine judge it', () => {
    const result = toAttachment(makeRow({ bytes: 0 }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachment.bytes).toBe(0)
  })

  test('never leaks internals in the message shown to the user', () => {
    for (const row of [makeRow({ mime: null }), makeRow({ bytes: null }), makeRow({ bytes: -1 })]) {
      const result = toAttachment(row)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.message).not.toMatch(/storage_path|workspace_id|post_id|\bmime\b|null/i)
      expect(result.message).not.toMatch(/select|insert|from |[0-9a-f]{8}-[0-9a-f]{4}/i)
      expect(result.message).not.toContain(row.storage_path)
      expect(result.message).not.toContain(row.id)
    }
  })

  test('refuses a negative file size instead of letting it slide under every cap', () => {
    // `post_media.bytes` is a plain int with no CHECK, so a corrupt row can carry
    // a negative size. `-1 > 5 MB` is false, so an unguarded conversion would
    // report a file we know nothing about as passing every channel limit.
    const result = toAttachment(makeRow({ bytes: -1 }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid_bytes')
    expect(result.message).toMatch(/file size/i)
    expect(result.message).not.toMatch(/\bvalid\b|\bok\b|\bpassed\b|\ball good\b/i)

    const [x] = validateAttachments(['x'], [makeRow({ bytes: -1 })])
    expect(x?.violations).toEqual([])
    expect(x?.unverifiable).toHaveLength(1)
  })

  test('does not describe a negative size as merely missing', () => {
    const negative = toAttachment(makeRow({ bytes: -1 }))
    const absent = toAttachment(makeRow({ bytes: null }))
    expect(negative.ok).toBe(false)
    expect(absent.ok).toBe(false)
    if (negative.ok || absent.ok) return
    // A size that is present but nonsense is a different fact from no size at all.
    expect(negative.message).not.toBe(absent.message)
  })

  test('does not mutate the row it converts', () => {
    const row = makeRow()
    const snapshot = structuredClone(row)
    toAttachment(row)
    expect(row).toEqual(snapshot)
  })
})

describe('validateAttachments', () => {
  test('unions violations from every row into the channel they belong to', () => {
    const rows = [
      makeRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', mime: 'application/pdf' }),
      makeRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bytes: 7 * MB }),
    ]

    const results = validateAttachments(['x', 'instagram'], rows)
    const byChannel = new Map(results.map((r) => [r.channel, r.violations.map((v) => v.code)]))

    // x: rejects the pdf AND caps media at 5 MB, so both rows fail.
    expect(byChannel.get('x')).toEqual(expect.arrayContaining(['MEDIA_TYPE', 'MEDIA_SIZE']))
    // instagram: rejects the pdf but allows 8 MB, so only the pdf fails.
    expect(byChannel.get('instagram')).toEqual(['MEDIA_TYPE'])
  })

  test('returns one entry per requested channel in the order asked', () => {
    const results = validateAttachments(['instagram', 'x', 'gbp'], [makeRow()])
    expect(results.map((r) => r.channel)).toEqual(['instagram', 'x', 'gbp'])
  })

  test('reports no violations when there are no attachments at all', () => {
    const results = validateAttachments(['x', 'gbp'], [])
    expect(results.map((r) => r.channel)).toEqual(['x', 'gbp'])
    expect(results.flatMap((r) => r.violations)).toEqual([])
  })

  test('reports no violations when every attachment is within the channel limits', () => {
    const rows = [makeRow(), makeRow({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })]
    expect(validateAttachments(['x'], rows).flatMap((r) => r.violations)).toEqual([])
  })

  test('collapses the identical violation raised by two different rows into one', () => {
    const rows = [
      makeRow({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', bytes: 9 * MB }),
      makeRow({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', bytes: 10 * MB }),
    ]

    const [x] = validateAttachments(['x'], rows)
    // Accepted limitation: violations carry no row reference, so duplicates
    // would read as the same sentence twice in the UI.
    expect(x?.violations).toHaveLength(1)
    expect(x?.violations[0]?.code).toBe('MEDIA_SIZE')
  })

  test('asks each channel only once even if it is requested twice', () => {
    const results = validateAttachments(['x', 'x'], [makeRow({ mime: 'application/pdf' })])
    expect(results.map((r) => r.channel)).toEqual(['x'])
  })

  test('surfaces engine copy that is already user-facing', () => {
    const [x] = validateAttachments(['x'], [makeRow({ mime: 'application/pdf' })])
    expect(x?.violations[0]?.message).toMatch(/does not accept/i)
    expect(x?.violations[0]?.field).toBe('mime')
  })

  test('does not mutate the rows or the channel list it is given', () => {
    const rows = [makeRow({ mime: 'application/pdf' })]
    const channels: readonly ['x', 'gbp'] = ['x', 'gbp']
    const rowSnapshot = structuredClone(rows)
    validateAttachments(channels, rows)
    expect(rows).toEqual(rowSnapshot)
    expect(channels).toEqual(['x', 'gbp'])
  })
})

describe('unverifiableRows', () => {
  test('returns exactly the rows that cannot be checked', () => {
    const noMime = makeRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', mime: null })
    const noBytes = makeRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bytes: null })
    const fine = makeRow({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })

    expect(unverifiableRows([noMime, fine, noBytes]).map((r) => r.id)).toEqual([
      noMime.id,
      noBytes.id,
    ])
  })

  test('returns nothing when every row is checkable', () => {
    expect(unverifiableRows([makeRow(), makeRow()])).toEqual([])
  })

  test('never treats an unverifiable row as passing validation', () => {
    // A row with no file type would blow past every channel limit or none —
    // we cannot know. It MUST NOT be silently counted as clean.
    const unknown = makeRow({ mime: null })

    const results = validateAttachments(['x', 'gbp'], [unknown])

    // The engine is given nothing to judge, so it raises nothing...
    expect(results.flatMap((r) => r.violations)).toEqual([])
    // ...so the verdict itself must carry the unchecked row. A caller reading a
    // single channel entry must not be able to conclude "clean" from it alone.
    for (const verdict of results) {
      expect(verdict.unverifiable.map((r) => r.id)).toEqual([unknown.id])
    }
    expect(unverifiableRows([unknown])).toHaveLength(1)
  })

  test('reports nothing unverifiable when every row could be checked', () => {
    const results = validateAttachments(['x', 'gbp'], [makeRow({ bytes: 9 * 1024 * 1024 })])
    // A row that fails a limit was still checked — it is a violation, not an unknown.
    expect(results.flatMap((r) => r.unverifiable)).toEqual([])
    expect(results.flatMap((r) => r.violations.map((v) => v.code))).toContain('MEDIA_SIZE')
  })

  test('gives each channel verdict its own unverifiable array', () => {
    const [x, gbp] = validateAttachments(['x', 'gbp'], [makeRow({ mime: null })])
    expect(x?.unverifiable).not.toBe(gbp?.unverifiable)
    x?.unverifiable.pop()
    expect(gbp?.unverifiable).toHaveLength(1)
  })

  test('checks the verifiable rows even when an unverifiable row sits beside them', () => {
    const unknown = makeRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', mime: null })
    const tooBig = makeRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bytes: 9 * MB })

    const [x] = validateAttachments(['x'], [unknown, tooBig])
    expect(x?.violations.map((v) => v.code)).toEqual(['MEDIA_SIZE'])
    expect(unverifiableRows([unknown, tooBig]).map((r) => r.id)).toEqual([unknown.id])
  })

  test('does not mutate the row list it is given', () => {
    const rows = [makeRow({ mime: null }), makeRow()]
    const snapshot = structuredClone(rows)
    unverifiableRows(rows)
    expect(rows).toEqual(snapshot)
  })
})
