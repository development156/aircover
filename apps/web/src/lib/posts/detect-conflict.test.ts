import { describe, expect, test } from 'vitest'

import { detectConflict, isNewer } from './detect-conflict'

// Same instant, four ways PostgREST/Postgres can render a timestamptz.
const UTC_Z = '2026-07-19T10:00:00Z'
const UTC_OFFSET = '2026-07-19T10:00:00+00:00'
const UTC_MILLIS = '2026-07-19T10:00:00.000Z'
const IST_OFFSET = '2026-07-19T15:30:00+05:30'

const LATER = '2026-07-19T10:00:01Z'
const EARLIER = '2026-07-19T09:59:59Z'

describe('detectConflict', () => {
  test('reports no conflict when the loaded and server timestamps are identical', () => {
    expect(detectConflict(UTC_Z, UTC_Z)).toEqual({ conflict: false })
  })

  test('reports a conflict when the server row is strictly newer than the one we loaded', () => {
    const result = detectConflict(UTC_Z, LATER)
    expect(result.conflict).toBe(true)
  })

  test('reports no conflict when the server row is older than the one we loaded', () => {
    expect(detectConflict(UTC_Z, EARLIER)).toEqual({ conflict: false })
  })

  test('treats a Z timestamp and its +00:00 spelling as the same instant', () => {
    expect(detectConflict(UTC_Z, UTC_OFFSET)).toEqual({ conflict: false })
    expect(detectConflict(UTC_OFFSET, UTC_Z)).toEqual({ conflict: false })
  })

  test('treats a non-UTC offset as the same instant as its UTC equivalent', () => {
    expect(detectConflict(UTC_Z, IST_OFFSET)).toEqual({ conflict: false })
    expect(detectConflict(IST_OFFSET, UTC_Z)).toEqual({ conflict: false })
  })

  test('treats differing fractional-second precision as the same instant', () => {
    expect(detectConflict(UTC_Z, UTC_MILLIS)).toEqual({ conflict: false })
    expect(detectConflict(UTC_MILLIS, UTC_Z)).toEqual({ conflict: false })
  })

  test('reports no conflict when we never loaded a timestamp', () => {
    expect(detectConflict(null, LATER)).toEqual({ conflict: false })
  })

  test('reports no conflict when the server returned no timestamp', () => {
    expect(detectConflict(UTC_Z, null)).toEqual({ conflict: false })
  })

  test('reports no conflict when both timestamps are missing', () => {
    expect(detectConflict(null, null)).toEqual({ conflict: false })
  })

  test('reports no conflict rather than throwing on a malformed server timestamp', () => {
    expect(() => detectConflict(UTC_Z, 'not-a-timestamp')).not.toThrow()
    expect(detectConflict(UTC_Z, 'not-a-timestamp')).toEqual({ conflict: false })
  })

  test('reports no conflict rather than throwing on a malformed loaded timestamp', () => {
    expect(() => detectConflict('yesterday-ish', LATER)).not.toThrow()
    expect(detectConflict('yesterday-ish', LATER)).toEqual({ conflict: false })
  })

  test('treats an empty timestamp string as missing', () => {
    expect(detectConflict('', LATER)).toEqual({ conflict: false })
    expect(detectConflict(UTC_Z, '')).toEqual({ conflict: false })
  })

  test('treats a whitespace-only timestamp string as missing', () => {
    expect(detectConflict('   ', LATER)).toEqual({ conflict: false })
    expect(detectConflict(UTC_Z, '  \t ')).toEqual({ conflict: false })
  })

  // A zone-less string resolves in the HOST's timezone, so the same pair would
  // read as a conflict in Asia/Kolkata and as no conflict on a UTC server. This
  // module runs in both, so it refuses the input rather than guess a zone.
  test('refuses a timestamp with no zone rather than resolving it in the host timezone', () => {
    expect(detectConflict('2026-07-19T10:00:00', LATER)).toEqual({ conflict: false })
    expect(detectConflict(UTC_Z, '2026-07-19T23:00:00')).toEqual({ conflict: false })
    expect(isNewer('2026-07-19T23:00:00', UTC_Z)).toBe(false)
    expect(isNewer(UTC_Z, '2026-07-19T00:00:00')).toBe(false)
  })

  test('still accepts every zone spelling PostgREST can emit', () => {
    expect(isNewer('2026-07-19T10:00:01+00:00', UTC_Z)).toBe(true)
    expect(isNewer('2026-07-19 10:00:01+00', UTC_Z)).toBe(true)
    expect(isNewer('2026-07-19T15:30:01+0530', UTC_Z)).toBe(true)
  })

  test('does not return a shared object a caller could mutate into a conflict', () => {
    const first = detectConflict(UTC_Z, EARLIER) as { conflict: boolean }
    expect(() => {
      first.conflict = true
    }).toThrow()
    expect(detectConflict(UTC_Z, EARLIER)).toEqual({ conflict: false })
  })

  test('carries the server timestamp verbatim so the UI can offer a restore', () => {
    const result = detectConflict(UTC_Z, LATER)
    expect(result).toEqual({ conflict: true, message: expect.any(String), theirsUpdatedAt: LATER })
  })

  test('states the divergence in sentence-case copy', () => {
    const result = detectConflict(UTC_Z, LATER)
    if (!result.conflict) throw new Error('expected a conflict')
    expect(result.message).toMatch(/changed/i)
    expect(result.message).toMatch(/^[A-Z][a-z]/)
  })

  // Every timestamp this module sees is a POST-write one, so it cannot know
  // whether our write landed before or after the other. Saying we "saved over a
  // newer version" was a guess presented as fact — and it fired on re-renders
  // where `savePost` had not been called at all.
  test('claims neither that a save happened nor that anything was overwritten', () => {
    const result = detectConflict(UTC_Z, LATER)
    if (!result.conflict) throw new Error('expected a conflict')
    expect(result.message).not.toMatch(/saved|saving|overwrote|overwritten|over a newer|replaced/i)
  })

  // `posts` records `created_by` but nothing records who last UPDATED a row, so
  // authorship is unknowable here — and the same user in a second tab is the
  // commonest autosave collision. Naming a culprit would be inventing a fact.
  test('makes no claim about who made the other edit', () => {
    const result = detectConflict(UTC_Z, LATER)
    if (!result.conflict) throw new Error('expected a conflict')
    expect(result.message).not.toMatch(/someone|somebody|else|teammate|another user|they|their/i)
  })

  test('never leaks internals in the conflict message', () => {
    const result = detectConflict(UTC_Z, LATER)
    if (!result.conflict) throw new Error('expected a conflict')
    expect(result.message).not.toMatch(/updated_at|timestamptz|select |update |postgrest|supabase/i)
    // No timestamps, ids, row counts or stack frames — copy carries no machine data.
    expect(result.message).not.toMatch(/\d/)
    expect(result.message).not.toMatch(/\bat .+:\d+/)
  })

  // ACCEPTED LIMITATION, pinned so a future change is deliberate: Postgres renders
  // timestamptz with microsecond precision, JS Date truncates to milliseconds. Two
  // writes inside the same millisecond are indistinguishable to us and fall through
  // to last-write-wins with no toast.
  test('cannot distinguish writes that differ only below the millisecond', () => {
    expect(detectConflict('2026-07-19T10:00:00.123456Z', '2026-07-19T10:00:00.123999Z')).toEqual({
      conflict: false,
    })
  })
})

describe('isNewer', () => {
  test('is true only when the first instant is strictly after the second', () => {
    expect(isNewer(LATER, UTC_Z)).toBe(true)
    expect(isNewer(UTC_Z, LATER)).toBe(false)
  })

  test('is false for two spellings of the same instant', () => {
    expect(isNewer(UTC_Z, UTC_OFFSET)).toBe(false)
    expect(isNewer(IST_OFFSET, UTC_MILLIS)).toBe(false)
  })

  test('is false when either side is missing', () => {
    expect(isNewer(null, UTC_Z)).toBe(false)
    expect(isNewer(LATER, null)).toBe(false)
    expect(isNewer(null, null)).toBe(false)
  })

  test('is false rather than throwing when either side is unparseable', () => {
    expect(isNewer('nope', UTC_Z)).toBe(false)
    expect(isNewer(LATER, 'nope')).toBe(false)
  })
})
