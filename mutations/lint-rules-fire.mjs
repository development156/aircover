/**
 * EVERY LINT RULE, SHOWN TO GO RED.
 *
 * Nine packages shipped `"lint": "exit 0"`, so the gate's `lint` verb could not
 * fail on any input. Replacing it with a linter that reports `ok` is not an
 * improvement unless each rule has been watched to fire — a guard never shown
 * to fail is not a guard, and "lint passes" would go on meaning nothing.
 *
 * One mutant per rule: plant exactly the violation the rule bans, in a real
 * file, and require the package's `lint` script to exit non-zero. The last one
 * is the ratchet itself — a baseline that can be raised is not a ratchet, and
 * that failure mode is invisible until somebody in a hurry runs the escape
 * hatch.
 */
export default {
  cwd: '.',
  mutants: [
    {
      name: 'test-only: a stray .only that would skip the rest of its file',
      file: 'packages/shared/src/ledger/pricing.test.ts',
      find: "describe('pricing', () => {",
      replace: "describe.only('pricing', () => {",
      command: 'pnpm --filter @sahoda/shared run lint',
    },
    {
      name: 'assertionless-test: a test file with no expect() at all',
      file: 'packages/shared/src/db/channel-set.test.ts',
      // Renaming the assertion is what the rule actually looks for: a file whose
      // test blocks contain no `expect(`. Deleting the assertions instead would
      // change what the tests check as well, and the mutant must isolate ONE
      // thing.
      find: "import { describe, it, expect } from 'vitest'",
      replace:
        "import { describe, it, expect as assertThat } from 'vitest'\nconst expect = assertThat // MUTANT: no literal expect( call sites remain",
      command: 'pnpm --filter @sahoda/shared run lint',
    },
    {
      name: 'console-log: debug output in shipped source',
      file: 'packages/shared/src/ledger/pricing.ts',
      find: 'export const PricingConfigSchema = z.object({',
      replace: 'console.log("MUTANT")\nexport const PricingConfigSchema = z.object({',
      command: 'pnpm --filter @sahoda/shared run lint',
    },
    {
      name: 'uncollected-tests: an include that cannot reach the package’s own tests',
      file: 'packages/db/vitest.config.ts',
      find: '  test: {',
      replace:
        "  test: {\n    include: ['src/**/*.test.ts'], // MUTANT: db keeps its tests in tests/",
      command: 'pnpm --filter @sahoda/db run lint',
    },
    {
      name: 'the ratchet: --update-baseline accepting a RAISED count',
      file: 'packages/shared/src/ledger/pricing.ts',
      find: 'export const PricingConfigSchema = z.object({',
      replace: 'console.log("MUTANT")\nexport const PricingConfigSchema = z.object({',
      // Not `lint` but `lint --update-baseline`: the escape hatch must REFUSE.
      // If it ever records the new violation as acceptable, this exits 0 and the
      // mutant survives — which is precisely the difference between a ratchet
      // and a rug, and is not observable from a passing `lint` run.
      command: 'node scripts/lint.mjs packages/shared --update-baseline',
    },
  ],
}
