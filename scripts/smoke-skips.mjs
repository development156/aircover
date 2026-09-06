#!/usr/bin/env node
/**
 * Refuse a smoke run that skipped tests it had the keys to run.
 *
 * ── THE DEFECT THIS CLOSES (docs/51, Q-17) ────────────────────────────────────
 * Eleven `@smoke` specs call `test.skip(adminClient() === null)`, which is the
 * right thing to do on a laptop with no service-role key. On CI the key is set,
 * so those skips should never fire — but if the key is malformed, mis-scoped or
 * silently dropped, Playwright prints them as "skipped" and exits 0, the gate
 * reports green, and the concurrent-edit, format-reaches-the-row and templates
 * guards simply never ran. A suite that ran nothing reports as passing.
 *
 * Reads Playwright's JSON report. With SUPABASE_SERVICE_ROLE_KEY set, any
 * skipped test fails the run and is named. Without it, the skipped count is
 * printed so a laptop run says what it did not do.
 *
 *   node scripts/smoke-skips.mjs apps/web/playwright-report/results.json
 */
import { readFileSync } from 'node:fs'

/** Walk Playwright's nested suites and collect every test's outcome. */
export function collectOutcomes(report) {
  const out = []
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = test.status ?? test.results?.at(-1)?.status ?? 'unknown'
        out.push({ title: [...path, spec.title].join(' › '), status })
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title])
  }
  for (const suite of report.suites ?? []) walk(suite, [suite.title])
  return out
}

/**
 * Pure: the verdict for a report under a given environment. `ok` is whether the
 * run may be called green; `lines` is what to print.
 */
export function judge(report, env = process.env) {
  const outcomes = collectOutcomes(report)
  const skipped = outcomes.filter((t) => t.status === 'skipped')
  const keyed = Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
  const lines = [
    `smoke: ${outcomes.length} tests, ${skipped.length} skipped, service key ${keyed ? 'set' : 'ABSENT'}`,
  ]
  // MEASURED 2026-09-06, run 34008428577: a spec failed to LOAD, Playwright
  // wrote a report with zero tests, and the first draft of this guard printed
  // "0 tests, 0 skipped" and passed. A suite that ran nothing is not a pass.
  if (outcomes.length === 0) {
    lines.push('REFUSED: the report holds no tests. A suite that ran nothing cannot be green.')
    return { ok: false, lines }
  }
  if (skipped.length === 0) return { ok: true, lines }
  for (const t of skipped) lines.push(`  skipped: ${t.title}`)
  if (!keyed) {
    lines.push(
      '  (expected on a laptop without SUPABASE_SERVICE_ROLE_KEY; these guards did not run)',
    )
    return { ok: true, lines }
  }
  lines.push(
    `REFUSED: ${skipped.length} @smoke test(s) skipped although SUPABASE_SERVICE_ROLE_KEY is set. ` +
      'A skip here means a guard that should have run did not; a green gate over it would be a lie.',
  )
  return { ok: false, lines }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/smoke-skips.mjs <playwright results.json>')
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(
      `REFUSED: could not read ${file}: ${error instanceof Error ? error.message : error}`,
    )
    console.error('No report means the suite did not finish; that is not a pass.')
    process.exit(2)
  }
  const verdict = judge(report)
  for (const line of verdict.lines) console.log(line)
  process.exit(verdict.ok ? 0 : 1)
}
