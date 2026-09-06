import { describe, expect, it } from 'vitest'
import { collectOutcomes, judge } from '../smoke-skips.mjs'

/** The shape Playwright's json reporter writes: suites → specs → tests. */
function report(statuses) {
  return {
    suites: [
      {
        title: 'composer.spec.ts',
        suites: [
          {
            title: 'the composer @smoke',
            specs: statuses.map((status, i) => ({
              title: `case ${i}`,
              tests: [{ status, results: [{ status }] }],
            })),
          },
        ],
      },
    ],
  }
}

describe('smoke-skips', () => {
  it('walks nested suites and reads every outcome', () => {
    const outcomes = collectOutcomes(report(['expected', 'skipped', 'expected']))
    expect(outcomes.map((o) => o.status)).toEqual(['expected', 'skipped', 'expected'])
    expect(outcomes[1].title).toBe('composer.spec.ts › the composer @smoke › case 1')
  })

  it('refuses a skip when the service key is set, and names the test', () => {
    const verdict = judge(report(['expected', 'skipped']), { SUPABASE_SERVICE_ROLE_KEY: 'k' })
    expect(verdict.ok).toBe(false)
    expect(verdict.lines.join('\n')).toMatch(/REFUSED: 1 @smoke test\(s\) skipped/)
    expect(verdict.lines.join('\n')).toMatch(
      /skipped: composer\.spec\.ts › the composer @smoke › case 1/,
    )
  })

  it('reports but allows a skip when the key is absent, because the skip is the honest laptop answer', () => {
    const verdict = judge(report(['expected', 'skipped']), {})
    expect(verdict.ok).toBe(true)
    expect(verdict.lines.join('\n')).toMatch(/service key ABSENT/)
    expect(verdict.lines.join('\n')).toMatch(/these guards did not run/)
  })

  it('refuses a report that holds no tests at all, key or no key', () => {
    // A spec that fails to load leaves a report with zero tests and an exit code
    // Playwright still sets — MEASURED on run 34008428577, where the first draft
    // of this guard printed "0 tests, 0 skipped" and let the job continue.
    for (const env of [{}, { SUPABASE_SERVICE_ROLE_KEY: 'k' }]) {
      const verdict = judge({ suites: [] }, env)
      expect(verdict.ok).toBe(false)
      expect(verdict.lines.join('\n')).toMatch(/REFUSED: the report holds no tests/)
    }
  })

  it('is green with the key set and nothing skipped', () => {
    const verdict = judge(report(['expected', 'expected']), { SUPABASE_SERVICE_ROLE_KEY: 'k' })
    expect(verdict.ok).toBe(true)
    expect(verdict.lines).toEqual(['smoke: 2 tests, 0 skipped, service key set'])
  })
})
