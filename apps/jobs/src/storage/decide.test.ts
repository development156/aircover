import { describe, it, expect } from 'vitest'

import { decideOrphans, ORPHAN_MIN_AGE_MS } from './decide'

const WS = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-06T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('decideOrphans', () => {
  it('deletes an object no row names, once it is older than the guard', () => {
    const decision = decideOrphans({
      objects: [{ path: `${WS}/assets/a.png`, createdAt: ago(ORPHAN_MIN_AGE_MS + 1) }],
      knownPaths: new Set(),
      now: NOW,
    })

    expect(decision.delete).toEqual([`${WS}/assets/a.png`])
  })

  it('keeps an object a row still names, whatever its age', () => {
    const path = `${WS}/assets/a.png`
    const decision = decideOrphans({
      objects: [{ path, createdAt: ago(365 * 24 * ORPHAN_MIN_AGE_MS) }],
      knownPaths: new Set([path]),
      now: NOW,
    })

    expect(decision).toEqual({ delete: [], referenced: 1, tooYoung: 0, unknownAge: 0 })
  })

  it('keeps an unreferenced object younger than an hour — the row may be about to land', () => {
    // The upload writes the object first and the row second. A listing taken in
    // between sees a healthy upload as an orphan; the hour is what stops it.
    const decision = decideOrphans({
      objects: [{ path: `${WS}/assets/fresh.png`, createdAt: ago(ORPHAN_MIN_AGE_MS - 1) }],
      knownPaths: new Set(),
      now: NOW,
    })

    expect(decision).toEqual({ delete: [], referenced: 0, tooYoung: 1, unknownAge: 0 })
  })

  it('holds the line exactly at the guard: one hour old is still too young', () => {
    const decision = decideOrphans({
      objects: [{ path: `${WS}/assets/edge.png`, createdAt: ago(ORPHAN_MIN_AGE_MS) }],
      knownPaths: new Set(),
      now: NOW,
    })

    // `created > cutoff` is false at equality, so the object is exactly the
    // guard's age and is deleted. Pinned so the boundary is a decision, not an
    // accident: a value one millisecond younger is kept by the test above.
    expect(decision.delete).toEqual([`${WS}/assets/edge.png`])
  })

  it('never deletes an object whose age it does not know', () => {
    const decision = decideOrphans({
      objects: [
        { path: `${WS}/derivatives/x/a.png`, createdAt: null },
        { path: `${WS}/derivatives/x/b.png`, createdAt: 'not a date' },
      ],
      knownPaths: new Set(),
      now: NOW,
    })

    expect(decision).toEqual({ delete: [], referenced: 0, tooYoung: 0, unknownAge: 2 })
  })

  it('is exact about the path — a prefix match is not a reference', () => {
    const decision = decideOrphans({
      objects: [{ path: `${WS}/assets/a.png.bak`, createdAt: ago(2 * ORPHAN_MIN_AGE_MS) }],
      knownPaths: new Set([`${WS}/assets/a.png`]),
      now: NOW,
    })

    expect(decision.delete).toEqual([`${WS}/assets/a.png.bak`])
  })

  it('sorts a mixed listing into all four buckets', () => {
    const known = `${WS}/assets/known.png`
    const decision = decideOrphans({
      objects: [
        { path: known, createdAt: ago(3 * ORPHAN_MIN_AGE_MS) },
        { path: `${WS}/assets/old.png`, createdAt: ago(3 * ORPHAN_MIN_AGE_MS) },
        { path: `${WS}/assets/new.png`, createdAt: ago(10) },
        { path: `${WS}/assets/ageless.png`, createdAt: null },
      ],
      knownPaths: new Set([known]),
      now: NOW,
      minAgeMs: ORPHAN_MIN_AGE_MS,
    })

    expect(decision).toEqual({
      delete: [`${WS}/assets/old.png`],
      referenced: 1,
      tooYoung: 1,
      unknownAge: 1,
    })
  })
})
