import { describe, it, expect } from 'vitest'
import type { AutonomyLevel, Channel } from '@sahoda/shared'

import { governingLevel } from './governing-level'

const dial = (entries: Array<[Channel, AutonomyLevel]>) => new Map(entries)

describe('governingLevel — the level that rules a multi-channel brief', () => {
  it("takes the LOWEST level of the brief's channels", () => {
    // Instagram is set to publish-after-approval and LinkedIn to suggest-only.
    // One brief is ONE post with ONE schedule, so scheduling it would act at L2
    // on a post that also carries a channel the customer wanted only suggested.
    expect(
      governingLevel(
        ['instagram', 'linkedin'],
        dial([
          ['instagram', 2],
          ['linkedin', 0],
        ]),
      ),
    ).toBe(0)
  })

  it('is not fooled by the order the channels arrive in', () => {
    // The reduce seeds at 2 and walks down; a version that seeded at the first
    // element would give a different answer for a reversed list.
    expect(
      governingLevel(
        ['linkedin', 'instagram'],
        dial([
          ['instagram', 2],
          ['linkedin', 0],
        ]),
      ),
    ).toBe(0)
    expect(
      governingLevel(
        ['instagram', 'linkedin'],
        dial([
          ['instagram', 0],
          ['linkedin', 2],
        ]),
      ),
    ).toBe(0)
  })

  it('defaults an unset channel to L1, not to the most permissive level', () => {
    // A channel with no dial row has never been configured. Treating it as L2
    // would schedule posts for a channel nobody made a decision about.
    expect(governingLevel(['x'], dial([]))).toBe(1)
    expect(governingLevel(['instagram', 'x'], dial([['instagram', 2]]))).toBe(1)
  })

  it('returns L2 only when every channel is L2', () => {
    expect(
      governingLevel(
        ['instagram', 'linkedin'],
        dial([
          ['instagram', 2],
          ['linkedin', 2],
        ]),
      ),
    ).toBe(2)
  })

  it('never returns 3 — there is no input that produces autopilot', () => {
    // The map's value type is AutonomyLevel (0 | 1 | 2), so a 3 cannot be put in
    // it, and the reduce seeds at 2 and only ever moves down. Checked across
    // every combination rather than argued.
    const channels: Channel[] = ['x', 'gbp', 'linkedin', 'instagram']
    const levels: AutonomyLevel[] = [0, 1, 2]
    for (const a of levels)
      for (const b of levels)
        for (const c of levels)
          for (const d of levels) {
            const got = governingLevel(
              channels,
              dial([
                ['x', a],
                ['gbp', b],
                ['linkedin', c],
                ['instagram', d],
              ]),
            )
            expect(got).toBe(Math.min(a, b, c, d))
            expect(got).toBeLessThan(3)
          }
  })

  it('falls back rather than crashing on a brief with no channels', () => {
    expect(governingLevel([], dial([]))).toBe(1)
  })
})
