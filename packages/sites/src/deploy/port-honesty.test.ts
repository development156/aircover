import { describe, it, expect } from 'vitest'
import type { z } from 'zod'
import { SiteDeployHistoryEntrySchema, SiteDeployStateSchema } from './port'
import { entry, failedState, state, FIXED_ISO, LOCAL_URL } from './port-fixtures'

/**
 * `checkHonesty` (`schema-guards.ts`) makes TWO promises that `port-strictness.test.ts` cannot
 * observe, because every fixture there violates exactly ONE rule and asserts with
 * `.toThrow(/url/)`. Those regexes match the rule's own MESSAGE TEXT, so they pass identically
 * whether the issue is attributed to the offending FIELD or to the object root, and identically
 * whether the helper reports every violated rule or stops after the first.
 *
 * Both promises are load-bearing for a caller:
 *
 *  - **attribution** -- `HonestyRule.path` exists "so a caller sees WHICH field made the record
 *    dishonest rather than a bare object-level failure". A UI that highlights the offending
 *    field has nothing to highlight if the issue lands at the root.
 *  - **completeness** -- "reports EVERY violated rule, not just the first". A caller told about
 *    one of three lies fixes it, re-submits, and is told about the next one; the round-trip
 *    count is the cost, and for a persistence boundary it is the difference between one honest
 *    report and three.
 *
 * So these tests read `safeParse().error.issues` directly. Both rule sets are covered:
 * `STATE_HONESTY_RULES` (four rules) and `ENTRY_HONESTY_RULES` (one), since a single helper
 * serves both and a fix applied to one call site is not a fix.
 */

/** Only the cross-field issues: a shape error would be a different defect with its own tests. */
const honestyIssuesOf = (result: z.ZodSafeParseResult<unknown>): z.core.$ZodIssue[] => {
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues.filter((issue) => issue.code === 'custom')
}

const pathsOf = (result: z.ZodSafeParseResult<unknown>): string[] =>
  honestyIssuesOf(result).map((issue) => issue.path.join('.'))

describe('checkHonesty attributes each violation to the FIELD that carries it', () => {
  const attributed: Array<[string, () => z.ZodSafeParseResult<unknown>, string]> = [
    [
      "a 'live' status with no url",
      () => SiteDeployStateSchema.safeParse(state({ url: null })),
      'url',
    ],
    [
      "a 'failed' status still carrying a url",
      () => SiteDeployStateSchema.safeParse(failedState({ url: LOCAL_URL })),
      'url',
    ],
    [
      "a fabricated deployedAt on a 'failed' deploy",
      () => SiteDeployStateSchema.safeParse(failedState({ deployedAt: FIXED_ISO })),
      'deployedAt',
    ],
    [
      "a 'live' status with no deployedAt",
      () => SiteDeployStateSchema.safeParse(state({ deployedAt: null })),
      'deployedAt',
    ],
    [
      "a 'failed' status with no error",
      () => SiteDeployStateSchema.safeParse(failedState({ error: null })),
      'error',
    ],
    [
      'a file:// url labelled preview: false',
      () => SiteDeployStateSchema.safeParse(state({ preview: false })),
      'preview',
    ],
  ]

  for (const [label, run, expectedPath] of attributed) {
    it(`reports ${label} against '${expectedPath}', not against the object root`, () => {
      const paths = pathsOf(run())

      expect(paths).toEqual([expectedPath])
      // The empty string is what `path.join('.')` yields for a root-level issue, so an
      // assertion that only checked `toContain` would pass on a stripped `path`.
      expect(paths).not.toContain('')
    })
  }

  it('attributes the history entry rule too, since one helper serves both rule sets', () => {
    const paths = pathsOf(SiteDeployHistoryEntrySchema.safeParse(entry({ preview: false })))

    expect(paths).toEqual(['preview'])
  })

  it('prefixes the entry rule with its position when the entry is nested in a state', () => {
    const paths = pathsOf(
      SiteDeployStateSchema.safeParse(state({ history: [entry(), entry({ preview: false })] })),
    )

    expect(paths).toEqual(['history.1.preview'])
  })
})

describe('checkHonesty reports EVERY violated rule, not just the first', () => {
  /**
   * `{status:'failed', url: <file url>, deployedAt: <iso>, error: null}` is dishonest three
   * ways at once: it carries an address for a deploy that failed, a went-live timestamp for a
   * deploy that never went live, and no explanation for the failure it claims. A helper that
   * stopped at the first violated rule would report only `url`.
   */
  const lyingThreeWays = state({
    status: 'failed',
    url: LOCAL_URL,
    deployedAt: FIXED_ISO,
    error: null,
  })

  it('reports all three violations of a state that is dishonest three ways', () => {
    const paths = pathsOf(SiteDeployStateSchema.safeParse(lyingThreeWays))

    expect(paths).toEqual(['url', 'deployedAt', 'error'])
    expect(paths).toHaveLength(3)
  })

  it('carries a distinct message per violation, so the report is actionable per field', () => {
    const messages = honestyIssuesOf(SiteDeployStateSchema.safeParse(lyingThreeWays)).map(
      (issue) => issue.message,
    )

    expect(new Set(messages).size).toBe(3)
    expect(messages[0]).toMatch(/url must be present/)
    expect(messages[1]).toMatch(/deployedAt must be present/)
    expect(messages[2]).toMatch(/error must be present/)
  })

  it('reports all FOUR rules when the preview lie is stacked on the other three', () => {
    // `preview: false` on a file:// url is the fourth rule, and it is independent of `status`.
    const paths = pathsOf(
      SiteDeployStateSchema.safeParse(
        state({
          status: 'pending',
          url: LOCAL_URL,
          deployedAt: FIXED_ISO,
          error: { code: 'X', message: 'y' },
          preview: false,
        }),
      ),
    )

    expect(paths).toEqual(['url', 'deployedAt', 'error', 'preview'])
  })

  it('reports two violations from two DIFFERENT history entries, not just the first', () => {
    const paths = pathsOf(
      SiteDeployStateSchema.safeParse(
        state({ history: [entry({ preview: false }), entry({ preview: false })] }),
      ),
    )

    expect(paths).toEqual(['history.0.preview', 'history.1.preview'])
  })
})
