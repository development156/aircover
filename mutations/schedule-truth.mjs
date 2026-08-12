/**
 * THE RULE: what the note says about a scheduled post is decided by
 * `post_variants.publish_status`, and never by `posts.status` plus a clock.
 *
 * The defect this was written against is not hypothetical and was not caught by
 * any test. `autoPublishTruth(status, scheduledAt, now)` read the post row and
 * the time and nothing else, so four production posts — `65dc1a34` at
 * `scheduled` with two published variants, and three demo posts at `approved`
 * with two published channels each — were told "this time has passed and nothing
 * was published … copy it across to post it", directly beneath their own channel
 * chips reading "published". An instruction to publish a post that was already
 * out.
 *
 * Every unit test passed throughout, because every one of them chose its own
 * inputs and none of them had any variants to choose. That is the same failure
 * mode `schedule-status.ts`'s own header already records about the previous
 * version of this gate ("it rendered for nobody while every unit test passed"),
 * which is why the rule is pinned by mutation and not by assertion count.
 *
 *   node scripts/mutation-check.mjs mutations/schedule-truth.mjs
 *
 * Mutant 1 is the one the fix is judged on — the shipped defect restored exactly.
 * 2–7 are the quieter reversals: the evidence is still read, but some part of it
 * stops counting. 8–10 are the WIRING, which is a separate rule: the three
 * surfaces all hold the rows already, and the note is only as honest as the
 * prop it is handed. The week-grid one (10) is not theoretical — the grid
 * forwarded `variantStates` to its overflow rows and not to its own day cells.
 */
export default {
  cwd: 'apps/web',
  command:
    'pnpm vitest run --maxWorkers=4 ' +
    'src/lib/posts/schedule-status.test.ts ' +
    'src/lib/posts/schedule-status-reachability.test.ts ' +
    'src/components/posts/auto-publish-note.test.tsx',
  mutants: [
    // ── The evidence is not read at all ─────────────────────────────────────
    {
      name: 'THE SHIPPED DEFECT — the variant rows are ignored and the clock decides',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: '  const evidence = evidenceOf(variants)',
      replace: '  const evidence = { live: 0, simulated: 0, outstanding: 1 }',
    },
    {
      name: 'a live publish stops lifting the past-due claim',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: '  if (evidence.live > 0) {',
      replace: '  if ((false as boolean) && evidence.live > 0) {',
    },

    // ── The evidence is read, but some of it stops counting ─────────────────
    {
      name: 'a fixture publish is counted as a real one',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: '      if (row.simulated) simulated += 1\n      else live += 1',
      replace: '      live += 1\n      void simulated',
    },
    {
      name: 'a simulated-only post falls back to "nothing was published"',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: "  if (evidence.simulated > 0) return 'simulated'",
      replace: '  void evidence.simulated',
    },
    {
      name: 'a partly-out post is reported as fully out',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: "    return evidence.outstanding > 0 || evidence.simulated > 0 ? 'partial' : 'none'",
      replace: "    return 'none'",
    },
    {
      name: 'an empty row list is read as proof that nothing published',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: "  if (evidence.outstanding === 0) return 'awaiting'",
      replace: '  void evidence.outstanding',
    },
    {
      name: 'a publish in flight right now counts as nothing published',
      file: 'apps/web/src/lib/posts/schedule-status.ts',
      find: "  'publishing',\n  'failed',",
      replace: "  'failed',",
    },

    // ── The rule survives; the rows never reach it ──────────────────────────
    {
      name: 'the posts list holds the rows and hands the note an empty set',
      file: 'apps/web/src/components/posts/post-card.tsx',
      find: '          variants={variantStates ?? []}',
      replace: '          variants={[]}',
    },
    {
      name: 'the planner row holds the rows and hands the note an empty set',
      file: 'apps/web/src/components/planner/planner-row.tsx',
      find: '        variants={variantStates ?? []}',
      replace: '        variants={[]}',
    },
    {
      name: 'the week grid feeds its overflow rows but not its own day cells',
      file: 'apps/web/src/components/planner/week-grid.tsx',
      find: '                  variants={variantStates?.get(post.id) ?? []}',
      replace: '                  variants={[]}',
    },
  ],
}
