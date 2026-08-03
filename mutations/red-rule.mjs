/**
 * THE RULE THAT OUTRANKS THE REST, as a re-runnable spec (SL-062 §5, SL-064).
 *
 * "Nothing red may be hidden by a collapse or a rollup." Six ways to break that
 * rule, each of which some test must notice. These were run by hand on
 * 2026-08-03 and every one was killed — this file exists so that claim can be
 * re-checked in one command rather than reconstructed from a transcript, and so
 * a future edit that quietly stops enforcing the rule is caught by the same
 * evidence that established it.
 *
 *   node scripts/mutation-check.mjs mutations/red-rule.mjs
 */
export default {
  cwd: 'apps/web',
  command:
    'pnpm vitest run src/lib/ops/rollup.test.ts src/lib/ops/board.test.ts ' +
    'src/components/admin/board-view.test.tsx src/components/admin/collapsible-region.test.tsx',
  mutants: [
    {
      name: 'a stage summary never reports red',
      file: 'apps/web/src/lib/ops/rollup.ts',
      find: 'hasRed: group.some(isRed),',
      replace: 'hasRed: false,',
    },
    {
      name: 'a blocked card does not count as red',
      file: 'apps/web/src/lib/ops/rollup.ts',
      find: "return card.blocked || card.qa === 'fail'",
      replace: "return card.qa === 'fail'",
    },
    {
      name: 'a failing card does not count as red',
      file: 'apps/web/src/lib/ops/rollup.ts',
      find: "return card.blocked || card.qa === 'fail'",
      replace: 'return card.blocked',
    },
    {
      name: 'a red stage says nothing on its face',
      file: 'apps/web/src/lib/ops/rollup.ts',
      find: 'redSummary: describeRed(blocked, failing),',
      replace: 'redSummary: null,',
    },
    {
      name: 'the Done cap forgets which cards are red',
      file: 'apps/web/src/lib/ops/board.ts',
      find: "const red = new Set(cards.filter((card) => card.blocked || card.qa === 'fail'))",
      replace: 'const red = new Set()',
    },
    {
      name: 'a collapsed region hides its red until opened',
      file: 'apps/web/src/components/admin/collapsible-region.tsx',
      find: '{red ? (',
      replace: '{red && open ? (',
    },
  ],
}
