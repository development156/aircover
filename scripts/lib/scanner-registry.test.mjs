import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { accessPatternsSeen, findScanners } from './scanner-registry.mjs'

/**
 * The guard on the guards.
 *
 * This repository has shipped the same defect four times: a scanner that
 * understands ONE access pattern, finds the call sites written in that pattern,
 * and certifies the ones written in another. The connections.status scanner
 * cleared the cron because the cron uses raw SQL. `wiring.test.ts` cleared a
 * public payment webhook because the entry had a comment above it.
 *
 * No test can decide whether a regex is right. What it can do is refuse to let a
 * NEW scanner arrive without saying, in its own text, what it cannot see —
 * because every one of those four would have been caught by a sentence.
 *
 * The existing 50 are grandfathered in `ops/lint-baselines/scanners.json`, which
 * can shrink and can never grow. Same ratchet the design lint uses, and for the
 * same reason: a rule that fails on day one is a rule someone deletes.
 *
 * ── WHAT THIS CANNOT SEE, since it is subject to its own rule ────────────────
 *  · whether a declared limit is TRUE, or complete, or still current;
 *  · a scanner that reaches source some way `READS_SOURCE` does not name —
 *    `fs/promises`, a bundler plugin, a shell helper it imports;
 *  · a scanner living outside *.test.ts / *.test.mjs / *.test.tsx, which is why
 *    `scripts/lint.mjs` and `scripts/design/design-lint.mjs` are audited by hand
 *    in docs/35 rather than here;
 *  · anything in a file git ignores.
 */

const REPO = resolve(import.meta.dirname, '../..')
const BASELINE = resolve(REPO, 'ops/lint-baselines/scanners.json')

const scanners = findScanners(REPO)
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

/* ── THE REMEDY THIS FILE PRESCRIBES HAS TO BE RUNNABLE ──────────────────────
   This block used to sit at the END of the file, below `describe(...)`, and was
   therefore unreachable: under vitest 4.1.10 calling `describe` outside the
   runner throws `Cannot read properties of undefined (reading 'config')` before
   top-level execution ever gets here. So the failure message told the reader to
   run `--update-baseline`, and that command crashed with a stack trace from
   @vitest/runner about a config it could not read — a remedy that cannot be
   executed, which is the same shape as no remedy at all.

   It runs BEFORE the suite is registered, and exits, so the file is a test under
   vitest and a CLI under node. */
if (process.argv.includes('--update-baseline')) {
  /* ── A COUNT CANNOT TELL A REGRESSION FROM A FILE THE REGISTER NEVER SAW ────
     The refusal here was `undeclared.length > baseline.undeclared.length`, and a
     total conflates two different events. MEASURED at integration on 2026-08-23:
     this baseline was recorded on a branch 137 commits behind wt-integrate2, so
     it had never seen 15 of the repository's scanners. All 15 are present on
     wt-integrate2 and NONE is present on wt-ops — the merge introduced no new
     undeclared scanner, it merely showed the register the rest of the repo. The
     total went 50 → 65 and the only available answer was "refusing to RAISE",
     which leaves the gate red for something no change caused and no command can
     fix.

     `scripts/design/design-lint.mjs` had already settled this, and its wording is
     borrowed on purpose: a BASELINED entry that got worse is always refused, and
     a file the register has never SEEN is refused too, unless `--absorb-new` is
     passed. It is still debt, so it is recorded deliberately, named on stdout,
     and visible as a JSON diff in git — never as a side effect of "the gate was
     red so I re-baselined".

     WHAT IT CANNOT SEE — this file is subject to its own rule: the baseline
     records only UNDECLARED files, so a scanner that once declared its blind
     spot and then LOST the declaration is indistinguishable here from one the
     register is meeting for the first time. Both arrive as "not in the baseline".
     That is why absorbing names every file rather than printing a count: the
     reviewer, not this script, is the one who can tell those apart. */
  const absorbNew = process.argv.includes('--absorb-new')
  const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
  const known = new Set(baseline.undeclared)
  const unseen = undeclared.filter((f) => !known.has(f))

  if (unseen.length > 0 && !absorbNew) {
    console.error(`  baseline NOT written — ${unseen.length} scanner(s) new to the register:`)
    for (const f of unseen) console.error(`  REFUSED  ${f} (need --absorb-new)`)
    process.exit(1)
  }
  for (const f of unseen) console.log(`  absorbing  ${f}`)
  writeFileSync(BASELINE, `${JSON.stringify({ undeclared }, null, 2)}\n`)
  console.log(`baseline: ${baseline.undeclared.length} → ${undeclared.length}`)
  process.exit(0)
}

describe('every scanner declares what it is blind to', () => {
  it('finds the scanners by git grep, not by a list — a new one cannot hide', () => {
    // If this ever drops to a handful, the enumeration broke and every
    // assertion below became vacuously true.
    expect(scanners.length).toBeGreaterThan(40)
  })

  it('no NEW scanner arrives without declaring its blind spot', () => {
    const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
    const added = undeclared.filter((f) => !baseline.undeclared.includes(f))

    expect(
      added,
      `These read source but never say what they cannot see. Add a sentence — ` +
        `"WHAT IT CANNOT SEE: …" — naming the access pattern the scan would miss ` +
        `(raw SQL, an RPC, a dynamic import, a commented entry, a template literal).`,
    ).toEqual([])
  })

  it('the baseline can only shrink', () => {
    const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
    expect(
      undeclared.length,
      `${baseline.undeclared.length - undeclared.length} scanner(s) gained a declaration — ` +
        `run \`node scripts/lib/scanner-registry.test.mjs --update-baseline\` to lock the gain in.`,
    ).toBeLessThanOrEqual(baseline.undeclared.length)
  })

  it('a stale baseline entry cannot sit there forever', () => {
    // A file listed in the baseline that no longer exists, or that now declares
    // its limit, is a lie the ratchet would carry indefinitely.
    const current = new Set(scanners.map((s) => s.file))
    const gone = baseline.undeclared.filter((f) => !current.has(f))
    expect(gone, 'baseline names files that are no longer scanners — remove them').toEqual([])
  })
})

describe('the pattern detector itself', () => {
  it('separates a PostgREST reader from a raw-SQL one', () => {
    // The exact distinction the connections.status scanner could not make.
    expect(
      accessPatternsSeen(`await db.from('connections').select('status')`).postgrestBuilder,
    ).toBe(true)
    const raw = accessPatternsSeen(`await client.query('select status from connections')`)
    expect(raw.rawSql).toBe(true)
    expect(raw.postgrestBuilder).toBe(false)
  })

  it('sees an RPC call, which neither of the above resembles', () => {
    expect(accessPatternsSeen(`await db.rpc('apply_ledger_entry', {})`).rpc).toBe(true)
  })

  it('sees a dynamic import, which no static table scan follows', () => {
    expect(accessPatternsSeen('const m = await import("./x")').dynamicImport).toBe(true)
  })

  it('reports nothing for source that reaches for none of them', () => {
    const p = accessPatternsSeen('export const A = 1')
    expect(Object.values(p).every((v) => v === false)).toBe(true)
  })
})
