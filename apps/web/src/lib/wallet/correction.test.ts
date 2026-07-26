import { describe, expect, test } from 'vitest'

import { correctionMeta } from './correction'

/**
 * A ledger correction is written as two ADJUST rows — one reversing the bad
 * entry, one re-issuing it correctly — that share a `meta.correction` id. The
 * pair is net-zero and every row is right, but read top-to-bottom the wallet
 * shows "-100 · Manual adjustment" above "+100 · Manual adjustment" with the
 * entry they fix somewhere further down. Three correct rows that together read
 * as an unexplained clawback.
 *
 * This reads the linkage, and only the linkage. `meta.reason` is engineer-
 * written prose and stays internal: it has never been through any contract, and
 * the wallet does not render text a user cannot verify.
 */

const REAL = {
  reversal: {
    reason:
      'Reverses seq 5374, a manual GRANT that the wallet rendered as a plan grant. No plan grant backed it.',
    correction: '2026-07-25-relabel-manual-grant',
    reverses_seq: 5374,
  },
  reissue: {
    reason: 'Manual top-up added by an engineer to complete a verification run. Not a plan grant.',
    correction: '2026-07-25-relabel-manual-grant',
    replaces_seq: 5374,
  },
} as const

describe('reading the correction linkage', () => {
  test('reads the id and the reversed entry from a real reversal row', () => {
    expect(correctionMeta({ meta: REAL.reversal })).toEqual({
      id: '2026-07-25-relabel-manual-grant',
      reversesSeq: 5374,
      replacesSeq: null,
    })
  })

  test('reads the id and the replaced entry from a real re-issue row', () => {
    expect(correctionMeta({ meta: REAL.reissue })).toEqual({
      id: '2026-07-25-relabel-manual-grant',
      reversesSeq: null,
      replacesSeq: 5374,
    })
  })

  test('gives both halves of a pair the same id, which is what groups them', () => {
    expect(correctionMeta({ meta: REAL.reversal })?.id).toBe(
      correctionMeta({ meta: REAL.reissue })?.id,
    )
  })
})

describe('rows that are not corrections', () => {
  test.each([
    ['no meta at all', null],
    ['meta without a correction id', { internal_note: 'do not render me' }],
    ['an empty correction id', { correction: '' }],
    ['a blank correction id', { correction: '   ' }],
    ['a non-string correction id', { correction: 12345 }],
    ['meta that is not an object', 'correction'],
    ['meta that is an array', [{ correction: 'x' }]],
  ])('%s is not a correction', (_label, meta) => {
    expect(correctionMeta({ meta: meta as never })).toBeNull()
  })
})

describe('a correction with unusable seq references', () => {
  test('still groups, because the id is what pairs the rows', () => {
    // Losing the reference costs the "what it corrects" line, not the grouping.
    // Dropping the whole group instead would put the confusing sequence back.
    expect(correctionMeta({ meta: { correction: 'c-1' } })).toEqual({
      id: 'c-1',
      reversesSeq: null,
      replacesSeq: null,
    })
  })

  test.each([
    ['a string seq', '5374'],
    ['a fractional seq', 5374.5],
    ['a negative seq', -1],
    ['zero', 0],
    ['infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('ignores %s rather than pointing at an entry that cannot exist', (_label, seq) => {
    const read = correctionMeta({ meta: { correction: 'c-1', reverses_seq: seq as never } })

    expect(read?.reversesSeq).toBeNull()
  })
})

describe('the id we group by', () => {
  test('is trimmed, so trailing whitespace does not split a pair', () => {
    expect(correctionMeta({ meta: { correction: ' c-1 ' } })?.id).toBe('c-1')
  })

  test('is capped, so an absurd id cannot become a grouping key of any length', () => {
    const absurd = 'c'.repeat(500)

    expect(correctionMeta({ meta: { correction: absurd } })).toBeNull()
  })
})
