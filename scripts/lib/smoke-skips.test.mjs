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

  it('is green with the key set and nothing skipped', () => {
    const verdict = judge(report(['expected', 'expected']), { SUPABASE_SERVICE_ROLE_KEY: 'k' })
    expect(verdict.ok).toBe(true)
    expect(verdict.lines).toEqual(['smoke: 2 tests, 0 skipped, service key set'])
  })
})
