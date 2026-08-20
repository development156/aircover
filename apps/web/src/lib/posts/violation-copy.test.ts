import { CONSTRAINTS, validateMedia, validateVariant } from '@sahoda/shared'
import type { ConstraintViolation } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { planThread, segmentLimitFor } from '@sahoda/publishing/format'

import { describeViolation, summarizeViolations } from './violation-copy'

/**
 * Payloads the editor must never render. Every one is SINGLE-LINE on purpose:
 * an earlier revision guarded with a keyword denylist and its leak tests only
 * passed because the fixture happened to contain newlines. Realistic Postgres
 * and runtime errors arrive on one line, so that is what these assert.
 */
const LEAKY_MESSAGES = [
  'duplicate key value violates unique constraint "post_variants_pkey"',
  'null value in column "workspace_id" of relation "post_variants" violates not-null constraint',
  'new row violates row-level security policy for table "posts"',
  'permission denied for table ledger_entries',
  'ERROR: could not serialize access due to concurrent update',
  'idempotency_key=post_variants:abc:1 already applied',
  'ERROR: duplicate key value violates unique constraint (SQLSTATE 23505)',
  'Failed for workspace 550e8400-e29b-41d4-a716-446655440000',
  'at applyLedgerEntry (/srv/app/packages/db/src/ledger.ts:42:17)',
  'select credits from ledger_entries where workspace_id = $1',
  // The multi-line case still matters, just no longer carries the whole suite.
  [
    'ERROR: duplicate key value violates unique constraint (SQLSTATE 23505)',
    'idempotency_key=post_variants:abc:1',
    '    at applyLedgerEntry (/srv/app/packages/db/src/ledger.ts:42:17)',
  ].join('\n'),
] as const

const LEAKED_FRAGMENTS = [
  'SQLSTATE',
  '23505',
  'post_variants',
  'idempotency_key',
  'ledger.ts',
  'ledger_entries',
  '/srv/app',
  'duplicate key',
  'row-level security',
  'permission denied',
  '550e8400',
  'workspace_id',
] as const

function expectNoLeak(rendered: string): void {
  for (const fragment of LEAKED_FRAGMENTS) {
    expect(rendered).not.toContain(fragment)
  }
}

/** Pull one real engine violation so the copy layer is tested against real inputs. */
function variantViolation(
  spec: (typeof CONSTRAINTS)[keyof typeof CONSTRAINTS],
  draft: Parameters<typeof validateVariant>[1],
  code: string,
): ConstraintViolation {
  const found = validateVariant(spec, draft).violations.find((v) => v.code === code)
  if (found === undefined) throw new Error(`fixture did not produce ${code}`)
  return found
}

function mediaViolation(
  spec: (typeof CONSTRAINTS)[keyof typeof CONSTRAINTS],
  media: Parameters<typeof validateMedia>[1],
  code: string,
): ConstraintViolation {
  const perChannel = validateMedia([spec], media)[0]
  if (perChannel === undefined) throw new Error('fixture produced no channel result')
  const found = perChannel.violations.find((v) => v.code === code)
  if (found === undefined) throw new Error(`fixture did not produce ${code}`)
  return found
}

const REAL_VIOLATIONS: Record<string, ConstraintViolation> = {
  MAX_CHARS: variantViolation(CONSTRAINTS.x, { body: 'a'.repeat(300) }, 'MAX_CHARS'),
  MAX_HASHTAGS: variantViolation(
    CONSTRAINTS.instagram,
    { body: 'hi', hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`) },
    'MAX_HASHTAGS',
  ),
  MAX_MEDIA_COUNT: variantViolation(
    CONSTRAINTS.gbp,
    { body: 'hi', mediaCount: 3 },
    'MAX_MEDIA_COUNT',
  ),
  MEDIA_TYPE: mediaViolation(CONSTRAINTS.x, { mime: 'video/mp4', bytes: 1_000 }, 'MEDIA_TYPE'),
  MEDIA_SIZE: mediaViolation(
    CONSTRAINTS.x,
    { mime: 'image/png', bytes: 9 * 1024 * 1024 },
    'MEDIA_SIZE',
  ),
  MEDIA_DIMS: mediaViolation(
    CONSTRAINTS.x,
    { mime: 'image/png', bytes: 1_000, width: 2, height: 2 },
    'MEDIA_DIMS',
  ),
}

function real(code: keyof typeof REAL_VIOLATIONS): ConstraintViolation {
  const found = REAL_VIOLATIONS[code]
  if (found === undefined) throw new Error(`no fixture for ${code}`)
  return found
}

describe('describeViolation', () => {
  /**
   * Load-bearing canary. The module renders an engine message only when it
   * matches that code's expected shape, so if engine copy is reworded this test
   * fails instead of users silently dropping to generic text.
   */
  test('renders the real engine message verbatim for every known code', () => {
    for (const code of Object.keys(REAL_VIOLATIONS)) {
      const violation = real(code)
      const display = describeViolation(violation)
      expect(display.code).toBe(code)
      expect(display.message).toBe(violation.message)
      expect(display.field).toBe(violation.field)
    }
  })

  test('keeps the engine message for a too-long body and offers a trim fix', () => {
    const display = describeViolation(real('MAX_CHARS'))
    expect(display.code).toBe('MAX_CHARS')
    expect(display.field).toBe('body')
    expect(display.message).toMatch(/280 characters/i)
    expect(display.fixLabel).toMatch(/^trim/i)
  })

  test('offers a remove-hashtags fix when there are too many hashtags', () => {
    const display = describeViolation(real('MAX_HASHTAGS'))
    expect(display.field).toBe('hashtags')
    expect(display.message).toMatch(/hashtags/i)
    expect(display.fixLabel).toMatch(/^remove.*hashtags$/i)
  })

  test('offers a remove-media fix when there are too many attachments', () => {
    const display = describeViolation(real('MAX_MEDIA_COUNT'))
    expect(display.field).toBe('media')
    expect(display.fixLabel).toMatch(/^remove.*media$/i)
  })

  test('offers no automatic fix for media problems that need a different file', () => {
    for (const code of ['MEDIA_TYPE', 'MEDIA_SIZE', 'MEDIA_DIMS'] as const) {
      const display = describeViolation(real(code))
      expect(display.code).toBe(code)
      // Accepted limitation: the editor cannot transcode, compress or upscale in Alpha,
      // so there is no one-click fix. Changing this must be deliberate.
      expect(display.fixLabel).toBeUndefined()
    }
  })

  test('produces distinct copy for every known code', () => {
    const messages = Object.keys(REAL_VIOLATIONS).map((c) => describeViolation(real(c)).message)
    expect(messages).toHaveLength(6)
    expect(new Set(messages).size).toBe(6)
  })

  test('produces distinct fallback copy for every known code', () => {
    // Fallbacks must stay distinguishable too, or a redacted list reads as one
    // repeated sentence and the user cannot tell the problems apart.
    const messages = Object.keys(REAL_VIOLATIONS).map(
      (code) => describeViolation({ code, message: 'not engine copy' }).message,
    )
    expect(new Set(messages).size).toBe(6)
  })

  test('quotes no limit it cannot verify when it falls back', () => {
    // Inventing a number here would be a fabricated limit, worse than being vague.
    for (const code of Object.keys(REAL_VIOLATIONS)) {
      const display = describeViolation({ code, message: 'not engine copy' })
      expect(display.message).not.toMatch(/\d/)
    }
  })

  test('degrades an unrecognized code to generic copy instead of throwing', () => {
    const display = describeViolation({ code: 'SOMETHING_NEW', message: 'raw internal detail' })
    expect(display.code).toBe('UNKNOWN')
    expect(display.message).toMatch(/review it before publishing/i)
    expect(display.message).not.toMatch(/raw internal detail/i)
    expect(display.fixLabel).toBeUndefined()
  })

  test('never leaks internals for the unknown-code path', () => {
    for (const message of LEAKY_MESSAGES) {
      const display = describeViolation({
        code: 'PG_ERROR_23505',
        message,
        field: 'post_variants.body__raw',
      })
      expectNoLeak(JSON.stringify(display))
      expect(JSON.stringify(display)).not.toContain('PG_ERROR')
      expect(display.field).toBeUndefined()
    }
  })

  test('redacts a known code whose message has been contaminated with internals', () => {
    for (const message of LEAKY_MESSAGES) {
      const display = describeViolation({ code: 'MAX_CHARS', message, field: 'body' })
      expectNoLeak(JSON.stringify(display))
      expect(display.message).toBe('This post is longer than the channel allows.')
      expect(display.code).toBe('MAX_CHARS')
      expect(display.fixLabel).toMatch(/^trim/i)
    }
  })

  test('rejects an engine message with internals appended to it', () => {
    // Anchoring matters: a real prefix must not license the rest of the string.
    const display = describeViolation({
      code: 'MAX_CHARS',
      message: `${real('MAX_CHARS').message} duplicate key in post_variants`,
      field: 'body',
    })
    expectNoLeak(display.message)
    expect(display.message).toBe('This post is longer than the channel allows.')
  })

  test('falls back to safe copy when the message is blank', () => {
    const display = describeViolation({ code: 'MEDIA_SIZE', message: '   ', field: 'bytes' })
    expect(display.message).toMatch(/larger than/i)
    expect(display.field).toBe('bytes')
  })

  test('drops a field name the editor cannot anchor to', () => {
    const known = describeViolation({ code: 'MAX_CHARS', message: 'Too long.', field: 'body' })
    expect(known.field).toBe('body')
    const unknown = describeViolation({
      code: 'MAX_CHARS',
      message: 'Too long.',
      field: 'posts.body',
    })
    expect(unknown.field).toBeUndefined()
  })

  test('writes every fix label verb-first in sentence case', () => {
    const labels = Object.keys(REAL_VIOLATIONS)
      .map((c) => describeViolation(real(c)).fixLabel)
      .filter((label): label is string => label !== undefined)
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label).toMatch(/^(Trim|Remove|Shorten|Replace|Review)\b/)
      expect(label).not.toContain('.')
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase())
    }
  })

  test('does not mutate the violation it is given', () => {
    const violation: ConstraintViolation = { code: 'MAX_CHARS', message: '  x  ', field: 'body' }
    const before = structuredClone(violation)
    describeViolation(violation)
    expect(violation).toEqual(before)
  })
})

describe('summarizeViolations', () => {
  test('reports no issues for an empty list', () => {
    expect(summarizeViolations([])).toMatch(/^no issues$/i)
  })

  test('shows the single message when there is exactly one violation', () => {
    const only = real('MAX_CHARS')
    expect(summarizeViolations([only])).toBe(describeViolation(only).message)
  })

  test('counts the issues when there are several', () => {
    const many = Object.keys(REAL_VIOLATIONS).map((c) => real(c))
    expect(summarizeViolations(many)).toMatch(/^6 issues to fix$/i)
  })

  test('never leaks internals in the summary', () => {
    for (const message of LEAKY_MESSAGES) {
      expectNoLeak(summarizeViolations([{ code: 'PG_ERROR_23505', message }]))
      expectNoLeak(summarizeViolations([{ code: 'MAX_CHARS', message, field: 'body' }]))
      expectNoLeak(
        summarizeViolations([
          { code: 'MAX_CHARS', message },
          { code: 'X', message },
        ]),
      )
    }
  })
})

/**
 * ── THE THREAD REFUSALS, AGAINST `planThread`'S REAL OUTPUT ──────────────────
 * Not a hand-typed sentence. The message shapes in `violation-copy` are anchored
 * regexes, so one word out of place in `thread-plan.ts` silently downgrades a
 * precise refusal to "This does not meet the channel rules. Review it before
 * publishing." — which is exactly how MEDIA_REQUIRED and MEDIA_ASPECT were lost
 * for months. So these ASK the publish path for its own words and require them
 * through unchanged.
 */
describe('the thread refusals reach the screen as themselves', () => {
  const refusalFor = (body: string): { code: string; message: string } => {
    const result = planThread(CONSTRAINTS.x, body)
    if (result.ok) throw new Error('fixture did not produce a refusal')
    return result.refusal
  }

  test('an unbreakable link keeps its own sentence and its numbers', () => {
    const body = `Read this https://example.com/${'a'.repeat(400)}`
    const refusal = refusalFor(body)
    expect(refusal.code).toBe('THREAD_UNBREAKABLE')

    const display = describeViolation(refusal)
    expect(display.code).toBe('THREAD_UNBREAKABLE')
    expect(display.message).toBe(refusal.message)
    // 257, not 280 — the body carries a link, so every segment pays X's flat
    // 23-character weight. Asked of the engine rather than written down, because
    // a literal here would pin whichever number happened to be right that day.
    expect(display.message).toContain(String(segmentLimitFor(CONSTRAINTS.x, body)))
    // The proof it was not silently downgraded.
    expect(display.message).not.toContain('does not meet the channel rules')
  })

  test('an empty thread keeps its own sentence', () => {
    const refusal = refusalFor('   \n  ')
    expect(refusal.code).toBe('THREAD_EMPTY')
    const display = describeViolation(refusal)
    expect(display.message).toBe(refusal.message)
    expect(display.message).not.toContain('does not meet the channel rules')
  })

  test('a thread refusal offers no one-click fix, because there is none', () => {
    const display = describeViolation(refusalFor(`https://example.com/${'a'.repeat(400)}`))
    expect(display.fixLabel).toBeUndefined()
  })
})
