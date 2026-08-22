import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * NO QUERY MAY FILTER `connections.status` BY A VALUE THE COLUMN CANNOT HOLD.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE, MEASURED ────────────────────────────────
 * `connections.status` is `check (status in ('active','expired','revoked','error'))`
 * — 20260718000005_connections.sql:9. Two queries in the Loop filtered on
 * `'connected'`:
 *
 *   apps/web/src/lib/loop/read.ts:160          the snapshot /loop renders from
 *   apps/web/src/app/actions/loop-cycle.ts:82  the gate the cycle runs through
 *
 * Neither can ever match a row. Production, read read-only on 2026-08-22, holds
 * 4 `expired` and 2 `active` and zero of anything else. So on every workspace:
 *
 *   · "Plan my week" was permanently DISABLED, under the sentence "Connect a
 *     channel first — Sahoda has nowhere to plan for." (controls.tsx:101,107)
 *   · the Autonomy Dial rendered "Connect a channel and its dial appears here"
 *     and could not be set (autonomy-dial.tsx:65-69)
 *   · the nightly cron's cycle failed with `failure_reason = 'NO_CHANNELS'`,
 *     which is written to `loop_cycles` and read back as a claim about the
 *     customer's account
 *
 * M2, the product's headline feature, was unusable for everybody.
 *
 * ── WHY NOTHING CAUGHT IT, AND WHY THIS TEST IS SHAPED LIKE THIS ─────────────
 * An INSERT of a bad status raises 23514 immediately. A WHERE clause on one does
 * not: it is a perfectly valid query that matches nothing, and "matched nothing"
 * is exactly what an empty account looks like. Type-checking cannot see it —
 * these are string literals in a query builder — and no fixture would either,
 * because a fixture seeding `status: 'connected'` would itself be refused by the
 * constraint, which is why every green test used `'active'` and none of them
 * went near this code.
 *
 * So the only thing that can catch it is a test that reads BOTH artifacts as
 * text: the CHECK from the migration, and every literal any query compares
 * against it. That is a design choice, not a coverage percentage — this file
 * imports nothing from either side.
 */

const REPO = join(import.meta.dirname, '../../../../..')
const MIGRATIONS = join(REPO, 'packages/db/supabase/migrations')

/** Directories whose queries are checked. Everything that talks to this table. */
const SOURCE_ROOTS = [
  'apps/web/src',
  'apps/jobs/src',
  'packages/publishing/src',
  'packages/billing/src',
]

/**
 * The vocabulary, parsed out of the migration rather than restated here.
 *
 * Restating it would recreate the very seam this file closes: a second copy of
 * the list, free to drift from the constraint that actually refuses rows.
 */
function statusVocabulary(): string[] {
  const sql = readFileSync(join(MIGRATIONS, '20260718000005_connections.sql'), 'utf8')
  const table = sql.slice(sql.indexOf('create table connections'))
  const line = table.split('\n').find((l) => /^\s*status text/.test(l))
  if (line === undefined) throw new Error('no `status text` column found on connections')
  const members = line.match(/check\s*\(\s*status in \(([^)]*)\)/i)?.[1]
  if (members === undefined) throw new Error(`no CHECK on connections.status: ${line.trim()}`)
  return [...members.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

/** Every `.ts`/`.tsx` file under a root, recursively. */
function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(join(REPO, root))
  return out
}

/**
 * Every `.eq('status', '<literal>')` belonging to a `.from('connections')` chain.
 *
 * The bounding is what makes this a measurement rather than a grep: `.eq('status',
 * …)` appears on half a dozen other tables, and flagging those would make the test
 * noisy enough to be deleted.
 *
 * A chain ends at the NEXT `.from(`, not at a character count. The first draft
 * used a flat 900-character window and reported `loop/read.ts:172 filters status
 * = 'pending'` — which is the `memory_events` query three lines further down the
 * same `Promise.all`. A detector that over-reaches is a detector someone
 * eventually silences, so the window was fixed rather than the threshold tuned.
 */
interface StatusFilter {
  file: string
  line: number
  value: string
}

/**
 * Raw-SQL comparisons, which the builder scan cannot see.
 *
 * `apps/web/src/lib/cron/run-loop.ts` reaches the same table through a `pg` pool
 * with SQL in a template literal, and it carried the SAME wrong literal. The
 * first version of this file found the two PostgREST sites and reported clean
 * with the cron still broken — which is how a detector shaped like one half of
 * the codebase certifies the other half.
 */
function rawSqlStatusFilters(): StatusFilter[] {
  const found: StatusFilter[] = []
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8')
      // A `from connections` … `status = '<literal>'` inside one SQL string.
      for (const stmt of text.matchAll(/from\s+connections\b[\s\S]{0,400}?`/g)) {
        const start = stmt.index ?? 0
        for (const cmp of stmt[0].matchAll(/\bstatus\s*(?:=|in\s*\()\s*'([^']*)'/g)) {
          found.push({
            file: file.slice(REPO.length + 1),
            line: text.slice(0, start + (cmp.index ?? 0)).split('\n').length,
            value: cmp[1]!,
          })
        }
      }
    }
  }
  return found
}

function connectionStatusFilters(): StatusFilter[] {
  const found: StatusFilter[] = [...rawSqlStatusFilters()]
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8')
      for (const from of text.matchAll(/\.from\(\s*'connections'\s*\)/g)) {
        const start = from.index ?? 0
        const rest = text.slice(start + 1)
        const nextFrom = rest.indexOf('.from(')
        const chain = nextFrom === -1 ? rest : rest.slice(0, nextFrom)
        for (const eq of chain.matchAll(/\.eq\(\s*'status'\s*,\s*'([^']*)'\s*\)/g)) {
          found.push({
            file: file.slice(REPO.length + 1),
            line: text.slice(0, start + 1 + (eq.index ?? 0)).split('\n').length,
            value: eq[1]!,
          })
        }
        /*
         * AND the `.in('status', [...])` form, which this could not see.
         *
         * MEASURED at integration on 2026-08-22: two lanes fixed the same
         * defect, and the other one moved BOTH call sites — `lib/loop/read.ts`
         * and `app/actions/loop-cycle.ts` — from `.eq` to `.in`, because the
         * screen needs to tell a live channel from a lapsed one. This scanner
         * kept passing and covered NEITHER file any more: the vocabulary
         * assertion below had nothing left to assert about, and the
         * "finds the queries it is meant to be checking" test is the only
         * reason anybody noticed.
         *
         * Every member of the array is its own filter, so a single bad literal
         * among four good ones is still reported.
         */
        for (const inCall of chain.matchAll(/\.in\(\s*'status'\s*,\s*\[([^\]]*)\]\s*\)/g)) {
          for (const member of inCall[1]!.matchAll(/'([^']*)'/g)) {
            found.push({
              file: file.slice(REPO.length + 1),
              line: text.slice(0, start + 1 + (inCall.index ?? 0)).split('\n').length,
              value: member[1]!,
            })
          }
        }
      }
    }
  }
  return found
}

describe('connections.status — the migration and every query that filters on it', () => {
  const vocabulary = statusVocabulary()

  test('the vocabulary is read from the migration and is not empty', () => {
    // The detector must be shown to work before its verdict means anything: a
    // parser that silently returned [] would make every assertion below vacuous
    // and this file would report green forever.
    expect(vocabulary).toContain('active')
    expect(vocabulary).toContain('expired')
    expect(vocabulary.length).toBeGreaterThanOrEqual(4)
    // And the value that caused this: proof the constraint really excludes it,
    // rather than the test merely asserting the code no longer says it.
    expect(vocabulary).not.toContain('connected')
  })

  test('the scanner finds the queries it is meant to be checking', () => {
    const filters = connectionStatusFilters()

    // A scanner that found nothing would also pass the assertion below. Six
    // known call sites exist across the app; requiring several means a refactor
    // that moves them cannot quietly empty this test.
    expect(filters.length).toBeGreaterThanOrEqual(3)
    expect(filters.map((f) => f.file)).toContain('apps/web/src/lib/loop/read.ts')
    // And the raw-SQL half, which the first version of this scanner could not
    // see — the cron carried the same wrong literal and was reported clean.
    expect(filters.map((f) => f.file)).toContain('apps/web/src/lib/cron/run-loop.ts')
  })

  test('every filtered status is a value the column can actually hold', () => {
    const bad = connectionStatusFilters().filter((f) => !vocabulary.includes(f.value))

    expect(
      bad.map((f) => `${f.file}:${f.line} filters status = '${f.value}'`),
      `connections.status is check (status in (${vocabulary.map((v) => `'${v}'`).join(', ')})).\n` +
        `A filter on any other value is a valid query that can never match a row, and\n` +
        `"matched nothing" is indistinguishable from an account with no connections.\n` +
        `Unlike a bad INSERT, nothing raises.`,
    ).toEqual([])
  })
})
