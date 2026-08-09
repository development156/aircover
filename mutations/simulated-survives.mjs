/**
 * THE RULE: a simulated publish is labelled simulated, and never asked about.
 *
 * Same defect class as `ResolvedConnection.viaZernio`, one layer up and one day later.
 * `ClassifyInput.simulated` shipped OPTIONAL on 2026-08-09 and one of its two call sites
 * already omitted it. That omission was harmless only because `post-metrics.ts` skips
 * rows with no `platformPostId` and `variant-status.ts` erases a fixture's — so the
 * safety lived in a different module than the assumption, and nothing failed if either
 * moved.
 *
 * It is now required, so both omissions are compile errors; these mutants prove the
 * TESTS catch them too, because vitest transpiles without typechecking.
 *
 * The last mutant is the one that is NOT a type error: dropping `row.simulated` from the
 * target filter still compiles and still labels the screen correctly — it just sends a
 * real HTTP request about a post that never existed.
 *
 * ── ONE MUTANT IS DELIBERATELY ABSENT ────────────────────────────────────────
 * Dropping `simulated: target.simulated` at the POST-call site (`classify()`) SURVIVES,
 * and it was removed rather than left failing. It is unkillable by construction: the
 * target filter now excludes simulated rows, so no simulated target can reach that call
 * at all, and a field that cannot be observed cannot be asserted on. It is kept in the
 * code as the second of two independent guards and is enforced by the TYPE (required),
 * not by a test.
 *
 * That asymmetry is the honest reading and worth stating: if the target filter were ever
 * relaxed, the type would still force the field to be passed — which is exactly the
 * protection that was missing when this bug shipped.
 *
 *   node scripts/mutation-check.mjs mutations/simulated-survives.mjs
 */
export default {
  cwd: 'apps/web',
  command: 'pnpm vitest run src/lib/analytics/post-metrics.test.ts',
  mutants: [
    {
      name: 'the pre-call site drops simulated (the shipped omission, one layer up)',
      file: 'apps/web/src/lib/analytics/post-metrics.ts',
      find:
        '      // Without this a fixture arrives as a published row with a null id, which reads\n' +
        '      // as "the platform gave us nothing" rather than "we never asked the platform".\n' +
        '      simulated: row.simulated,\n',
      replace: '',
    },
    {
      name: 'a simulated post is sent to the real metrics endpoint',
      file: 'apps/web/src/lib/analytics/post-metrics.ts',
      find: "      if (row.status !== 'published' || !row.platformPostId || row.simulated) continue",
      replace: "      if (row.status !== 'published' || !row.platformPostId) continue",
    },
  ],
}
