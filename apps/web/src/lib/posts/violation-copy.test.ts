import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

/**
 * One pixel narrower than Instagram's own floor allows, whatever that floor is.
 * The height clears `minW`/`minH` (320) comfortably, so the only rule this
 * fixture can trip is the aspect one.
 */
const ASPECT_FLOOR = CONSTRAINTS.instagram.imageDims?.aspectRange?.[0] ?? 0.75
const ASPECT_FIXTURE_HEIGHT = 1_600

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
  // Instagram is the only channel with `requiresMedia`, and this is the most
  // common refusal in the product: there is no text-only Instagram post.
  MEDIA_REQUIRED: variantViolation(
    CONSTRAINTS.instagram,
    { body: 'hi', mediaCount: 0 },
    'MEDIA_REQUIRED',
  ),
  // DERIVED from the spec, not written as a literal. This fixture used to be
  // 900x1200 with the note "3:4 is 0.75, below Instagram's 0.8 floor" — and
  // wt-zernio then moved that floor to exactly 0.75 on primary evidence, because
  // 0.8 was refusing ordinary upright phone crops Instagram accepts. 0.75 is no
  // longer below the floor, it IS the floor, so the fixture stopped producing
  // MEDIA_ASPECT and the whole file threw before one assertion ran. A fixture
  // that hardcodes the bound it tests against goes stale the moment that bound
  // moves; one taken FROM the bound cannot.
  MEDIA_ASPECT: mediaViolation(
    CONSTRAINTS.instagram,
    {
      mime: 'image/jpeg',
      bytes: 1_000,
      width: Math.floor(ASPECT_FLOOR * ASPECT_FIXTURE_HEIGHT) - 1,
      height: ASPECT_FIXTURE_HEIGHT,
    },
    'MEDIA_ASPECT',
  ),
}

function real(code: keyof typeof REAL_VIOLATIONS): ConstraintViolation {
  const found = REAL_VIOLATIONS[code]
  if (found === undefined) throw new Error(`no fixture for ${code}`)
  return found
}

/**
 * ── THE COMPLETENESS GUARD ────────────────────────────────────────────────────
 *
 * Every other test in this file is driven by `REAL_VIOLATIONS`, a record keyed
 * by the codes somebody remembered to list. Each entry is genuine engine output,
 * so every LISTED code is proved to render well — and nothing in that design can
 * notice a code nobody listed. It is a per-code allowlist testing a per-code
 * allowlist.
 *
 * MEASURED: the engine gained `MEDIA_REQUIRED` and `MEDIA_ASPECT`, the copy
 * layer never heard about either, and both degraded to "This does not meet the
 * channel rules." for months while all twenty tests here stayed green. The
 * module's own docstring promised that "engine drift fails that test loudly" —
 * true for a REWORDING, which the shape patterns catch, and false for an
 * ADDITION, which nothing was watching.
 *
 * So this reads the engine's SOURCE and extracts every `code:` literal it can
 * emit. Text rather than types, for the reason `scripts/design/design-lint.mjs`
 * gives for the same choice: the thing being checked IS a string literal, and a
 * regex that says so beats reconstructing it from an AST. A union type would not
 * help either — `ConstraintViolation.code` is a plain `string`, deliberately, so
 * that untrusted upstream input has somewhere to land.
 */
const ENGINE_SOURCE = readFileSync(
  fileURLToPath(
    new URL('../../../../../packages/shared/src/publishing/constraints.ts', import.meta.url),
  ),
  'utf8',
)

const ENGINE_CODES = [...ENGINE_SOURCE.matchAll(/\bcode:\s*'([A-Z_]+)'/g)]
  .map((m) => m[1])
  .filter((code): code is string => code !== undefined)

describe('the copy layer knows every code the engine can emit', () => {
  test('the engine source yields a plausible set of codes', () => {
    // If this ever reads zero, the file moved or the shape changed and the guard
    // below would pass by finding nothing — the failure mode this asserts away.
    expect(ENGINE_CODES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(ENGINE_CODES)).toContain('MAX_CHARS')
  })

  test('no engine code degrades to the generic message', () => {
    const unknown = [...new Set(ENGINE_CODES)].filter(
      (code) => describeViolation({ code, message: '' }).code === 'UNKNOWN',
    )
    expect(unknown, `these engine codes have no copy and fall back to generic text`).toEqual([])
  })
})

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

  test('offers a remove-keywords fix when there are too many keywords', () => {
    // ── RETARGETED WITH THE SENTENCE, NOT LOOSENED ──────────────────────────
    // Every string here said "hashtags" about a field that stopped holding any
    // (REQUESTS §34). The CODE is still `MAX_HASHTAGS` — it is a stored, matched
    // string across this table, the fix-it button and the publish logs, and
    // renaming it is a data change rather than a copy change. The `field` is
    // still `hashtags` for the same reason: it addresses `extras.hashtags`.
    //
    // What the reader sees is what moved, and it is still asserted exactly.
    const display = describeViolation(real('MAX_HASHTAGS'))

    expect(display.code).toBe('MAX_HASHTAGS')
    expect(display.field).toBe('hashtags')
    expect(display.message).toMatch(/keywords/i)
    expect(display.fixLabel).toMatch(/^remove.*keywords$/i)
    // And never the old word, which would be a claim about hashtags on a list
    // that has none.
    expect(display.message).not.toMatch(/hashtag/i)
    expect(display.fixLabel).not.toMatch(/hashtag/i)
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

  // Both of these assert DISTINCTNESS — that no two codes render the same
  // sentence. They were written as `toBe(6)`, which is the fixture count wearing
  // a distinctness test's name: adding a seventh code failed them for arithmetic
  // rather than for a collision, and a nine-code engine with two duplicate
  // sentences would still have read 9 and passed. Comparing the set against the
  // list says the thing the test is called.
  test('produces distinct copy for every known code', () => {
    const codes = Object.keys(REAL_VIOLATIONS)
    const messages = codes.map((c) => describeViolation(real(c)).message)
    expect(new Set(messages).size).toBe(codes.length)
  })

  test('produces distinct fallback copy for every known code', () => {
    // Fallbacks must stay distinguishable too, or a redacted list reads as one
    // repeated sentence and the user cannot tell the problems apart.
    const codes = Object.keys(REAL_VIOLATIONS)
    const messages = codes.map(
      (code) => describeViolation({ code, message: 'not engine copy' }).message,
    )
    expect(new Set(messages).size).toBe(codes.length)
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
    // Derived, not the literal 6 this used to assert. That number went stale the
    // moment two codes were added, so the test would have failed for a reason
    // that has nothing to do with counting.
    expect(summarizeViolations(many)).toBe(`${many.length} issues to fix`)
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
