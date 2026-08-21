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
      // TWO earlier attempts at this mutant SURVIVED, and both times the mutant
      // was wrong rather than the rule: aliasing `expect` at the import, and
      // then shadowing it with a stub, each left every call site reading the
      // literal `expect(` the rule counts. The rule is textual; a mutant that
      // keeps the text cannot trip it.
      //
      // So the mutation is on the excuse instead. `design-audit.spec.ts` really
      // does declare four test blocks and contain no assertion — it is a
      // screenshot tool — and it is green only because it is DECLARED. Withdraw
      // the declaration and the rule must find it.
      name: 'assertionless-test: an undeclared file with test blocks and no expect()',
      file: 'ops/lint-baselines/assertionless-exceptions.json',
      find: '  "apps/web/e2e/design-audit.spec.ts"',
      replace: '  "apps/web/e2e/design-audit-MUTANT.spec.ts"',
      command: 'pnpm --filter @sahoda/web run lint',
    },
    {
      // The exception list is only better than a count while its entries stay
      // true. Point one at a file full of assertions and the staleness check
      // must say so — otherwise the list quietly becomes permission for files
      // nobody has looked at since.
      name: 'stale-exception: an exception pointing at a file that does assert',
      file: 'ops/lint-baselines/assertionless-exceptions.json',
      find: '  "apps/web/e2e/design-audit.spec.ts"',
      replace: '  "apps/web/e2e/golden-path.spec.ts"',
      command: 'pnpm --filter @sahoda/web run lint',
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
