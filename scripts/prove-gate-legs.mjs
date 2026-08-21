#!/usr/bin/env node
/**
 * BREAK EACH GATE LEG IN TURN AND CONFIRM THE GATE GOES RED.
 *
 * ── WHY THIS IS NOT OBVIOUS ──────────────────────────────────────────────────
 * The gate has five legs. Until 2026-08-20 one of them — `lint`, inside leg 1 —
 * could not fail in any package on any input, because every package declared
 * `"lint": "exit 0"`. Nobody noticed for months, and nobody would have, because
 * a leg that always passes and a leg that passes because the code is good
 * produce identical output.
 *
 * The only way to tell them apart is to break the thing each leg is supposed to
 * catch and watch that leg go red. This file does that, one leg at a time,
 * restoring after each.
 *
 * ── HOW EACH BREAK WAS CHOSEN ────────────────────────────────────────────────
 * Each is the SMALLEST defect the leg is supposed to be the one to catch, and
 * each is a different KIND, so no two legs could be passing for the same reason:
 *
 *   typecheck      a type error         (leg 1)
 *   lint           a `.only`            (leg 1, the half that could not fail)
 *   test           a wrong expectation  (leg 1)
 *   vitest-root    a wrong expectation in scripts/, which turbo does not reach
 *   turbo-smoke    a broken selector in a tagged spec
 *   prettier-check badly formatted source
 *   turbo-build    a compile error only the production build sees
 *
 * A leg is PROVEN only if it exits non-zero AND `.gate/verdict.json` names it as
 * `failedStage`. Exit code alone is not enough — the gate runner's own docstring
 * records a bug where `--only` produced `ok:false` with `allPassed:true`, so the
 * field that is read decides what the proof means.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')

/** `find` must appear EXACTLY once, or the break is not the break described. */
const BREAKS = [
  {
    leg: 'turbo-typecheck-lint-test',
    what: 'typecheck — a type error',
    file: 'packages/shared/src/ledger/pricing.ts',
    find: 'export const PRICING: PricingConfig = PricingConfigSchema.parse(rawPricing)',
    replace:
      'export const PRICING: PricingConfig = PricingConfigSchema.parse(rawPricing)\nconst _broken: number = "not a number"\nvoid _broken',
  },
  {
    leg: 'turbo-typecheck-lint-test',
    what: 'lint — a stray .only that would skip the rest of its file',
    file: 'packages/shared/src/ledger/pricing.test.ts',
    find: "describe('pricing', () => {",
    replace: "describe.only('pricing', () => {",
  },
  {
    leg: 'turbo-typecheck-lint-test',
    what: 'test — an expectation that is now wrong',
    file: 'packages/shared/src/ledger/pricing.test.ts',
    find: 'expect(PRICING.rollover_cap_x).toBe(2)',
    replace: 'expect(PRICING.rollover_cap_x).toBe(999)',
  },
  {
    leg: 'vitest-root',
    what: 'the scripts/ suite turbo cannot reach',
    file: 'scripts/lib/ops-queue.test.mjs',
    find: "import { describe, expect, it } from 'vitest'",
    replace: "import { describe, expect, it } from 'vitest'\nit('MUTANT', () => expect(1).toBe(2))",
  },
  {
    leg: 'turbo-smoke',
    what: 'a tagged Playwright spec whose selector no longer matches',
    file: 'apps/web/e2e/roadmap-honesty.spec.ts',
    find: "await page.goto('/",
    replace: "await page.goto('/a-route-that-does-not-exist-MUTANT/",
  },
  {
    leg: 'prettier-check',
    what: 'source that is not formatted',
    file: 'packages/shared/src/ledger/pricing.ts',
    find: 'export const PRICING: PricingConfig = PricingConfigSchema.parse(rawPricing)',
    replace: 'export   const    PRICING:PricingConfig=PricingConfigSchema.parse( rawPricing )',
  },
  {
    leg: 'turbo-build',
    what: 'a module the production build cannot resolve',
    file: 'apps/web/src/lib/slug.ts',
    // The whole declaration, not the bare word `export`. A substring match can
    // land inside a comment, where the injected import is inert and the build
    // stays green — a break that did not break anything, reported as a leg that
    // cannot fail.
    find: 'export function slugify(name: string): string {',
    replace:
      "import 'a-module-that-does-not-exist-MUTANT'\nexport function slugify(name: string): string {",
  },
]

function readGateVerdict() {
  const file = join(ROOT, '.gate', 'verdict.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

function runGate(leg) {
  try {
    execFileSync('pnpm', ['gate', `--only=${leg}`], { cwd: ROOT, stdio: 'ignore' })
    return 0
  } catch (error) {
    return error.status ?? 1
  }
}

const results = []
for (const [i, brk] of BREAKS.entries()) {
  const path = join(ROOT, brk.file)
  const original = readFileSync(path, 'utf8')
  const count = original.split(brk.find).length - 1
  if (count === 0 || (count > 1 && brk.once !== true)) {
    console.error(
      `prove-gate-legs: ${brk.what}: the target appears ${count} time(s) in ${brk.file}. ` +
        'A break that is not the break described proves nothing.',
    )
    process.exit(2)
  }

  process.stderr.write(`[${i + 1}/${BREAKS.length}] ${brk.leg} — ${brk.what} … `)
  writeFileSync(
    path,
    brk.once === true
      ? original.replace(brk.find, brk.replace)
      : original.split(brk.find).join(brk.replace),
  )
  let code, verdict
  try {
    code = runGate(brk.leg)
    verdict = readGateVerdict()
  } finally {
    // ALWAYS, even on a throw: a proof run that leaves the tree broken has cost
    // more than it demonstrated.
    writeFileSync(path, original)
  }
  const failedStage = verdict?.failedStage ?? null
  // Both conditions. Exit code alone would accept a leg that failed for an
  // unrelated reason, and the gate runner's own history includes a verdict that
  // said `allPassed: true` on a run that had not run everything.
  const proven = code !== 0 && failedStage === brk.leg
  process.stderr.write(
    `${proven ? 'RED (proven)' : `NOT PROVEN (exit ${code}, failed=${failedStage})`}\n`,
  )
  results.push({ ...brk, code, failedStage, proven })
}

console.log('\n── gate legs, each broken in turn ' + '─'.repeat(38))
for (const r of results) {
  console.log(
    `  ${r.proven ? 'RED      ' : 'NOT RED  '} ${r.leg.padEnd(28)} ${r.what}\n` +
      `            exit ${r.code}, verdict.failedStage = ${r.failedStage}`,
  )
}
const legs = [...new Set(results.map((r) => r.leg))]
const provenLegs = [...new Set(results.filter((r) => r.proven).map((r) => r.leg))]
console.log(
  `\n  ${provenLegs.length}/${legs.length} legs proven able to fail: ${provenLegs.join(', ')}`,
)
process.exit(results.every((r) => r.proven) ? 0 : 1)
