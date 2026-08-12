/**
 * THE RULE: nothing publishes without passing the refusal gate, and the gate
 * never resolves an unknown toward publish.
 *
 * Doc 18 §8 states the failure this exists to prevent: the Refine screen tells
 * people "Red lines — the Loop will refuse these" and, until this shipped, it
 * did not. Showing constraints you do not enforce is worse than having none,
 * because you have told a regulated business they are protected.
 *
 * A gate is only real if removing it BREAKS something. Eleven ways to remove
 * it, each of which some named test must notice.
 *
 *   node scripts/mutation-check.mjs mutations/publish-gate.mjs
 *
 * Mutant 1 is the one the gate is judged on — the call deleted outright from the
 * publish path. The rest are the quieter removals: the gate still runs, but its
 * answer stops being acted on, or an unknown starts reading as permission.
 *
 * ── TWO PACKAGES, ONE RULE, SO ONE COMMAND ──────────────────────────────────
 * The gate is split across `@sahoda/shared` (the rule set, the hard checks, the
 * verdict) and `apps/jobs` (the call site, the store, the classifier binding).
 * A spec that ran only the apps/jobs suite reported 7/9 on the first run, and
 * both survivors were verdict-layer mutants whose killing tests live in shared
 * and were never executed. A mutant that survives because its test was not RUN
 * is the harness erring in the reassuring direction, so the command spans both.
 *
 * Note when reading the summary table: the harness prints the FIRST vitest
 * summary it sees, which is shared's. A mutant in an apps/jobs file therefore
 * shows "53 passed" beside KILLED — the verdict comes from the chained
 * command's exit code, and the failures are in the second half of the output.
 */
export default {
  cwd: '.',
  command:
    'pnpm --filter @sahoda/shared exec vitest run src/gate && ' +
    'pnpm --filter @sahoda/jobs exec vitest run src/publish/runPublishPost.test.ts src/gate',
  mutants: [
    // ── The gate is gone ────────────────────────────────────────────────────
    {
      name: 'the gate is never called — publishing has no gate at all',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: "  if (verdict.decision !== 'pass') {",
      replace: '  if (false as boolean) {',
    },
    {
      name: 'the gate runs but a refusal is ignored and the post goes out',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: "    const code = verdict.decision === 'block' ? GATE_BLOCKED_CODE : GATE_HELD_CODE\n    return fail(code, gateMessage(verdict), null, gateDetail(verdict))",
      replace:
        "    const code = verdict.decision === 'block' ? GATE_BLOCKED_CODE : GATE_HELD_CODE\n    void code\n    void gateMessage(verdict)\n    void gateDetail(verdict)",
    },
    {
      name: 'the gate runs after the token is resolved, so a refused post still decrypts one',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: '    jobRunId: ctx.jobRunId,\n  })',
      replace: '    jobRunId: ctx.jobRunId,\n  })\n  await deps.resolveConnection(payload)',
    },

    // ── The gate runs, but stops seeing what is published ───────────────────
    {
      name: 'the gate checks the body only, so a red line in a hashtag goes out',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: '    text: publishedTextOf(formatForPlatform(spec, draft)),',
      replace: '    text: variant.body,',
    },

    // ── Ambiguity becomes permission ────────────────────────────────────────
    {
      name: 'a hold is treated as a pass — the gate only ever blocks on certainty',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: "  if (verdict.decision !== 'pass') {",
      replace: "  if (verdict.decision === 'block') {",
    },
    {
      name: 'an unreachable classifier passes instead of holding',
      file: 'packages/shared/src/gate/verdict.ts',
      find: "    if (classifier.state === 'skipped-no-rules') {",
      replace: "    if (classifier.state !== 'never') {",
    },
    {
      name: 'an unsure classifier finding is dropped rather than held',
      file: 'packages/shared/src/gate/verdict.ts',
      find: '  if (unsure.length > 0 || unknownIds.length > 0) {',
      replace: '  if (false as boolean) {',
    },
    {
      name: 'a model that names a rule nobody asked about is believed',
      file: 'packages/shared/src/gate/verdict.ts',
      find: '    if (rule) known.push({ finding, rule })\n    else unknownIds.push(finding.ruleId)',
      replace: '    if (rule) known.push({ finding, rule })',
    },

    // ── A hold is not one thing ─────────────────────────────────────────────
    {
      name: 'an unreachable check terminally fails every post scheduled in an outage',
      file: 'packages/shared/src/gate/verdict.ts',
      find: "  if (verdict.decision !== 'hold') return false\n  return verdict.checks.classifier === 'unavailable' || verdict.checks.classifier === 'timeout'",
      replace: '  return false',
    },
    {
      name: 'an unsure verdict is retried forever instead of waiting for a person',
      file: 'packages/shared/src/gate/verdict.ts',
      find: "  if (verdict.decision !== 'hold') return false\n  return verdict.checks.classifier === 'unavailable' || verdict.checks.classifier === 'timeout'",
      replace: "  return verdict.decision === 'hold'",
    },

    // ── The record ──────────────────────────────────────────────────────────
    {
      name: 'a pass whose audit row could not be written is published anyway',
      file: 'apps/jobs/src/gate/gate.ts',
      find: "      if (verdict.decision === 'pass') {\n        return unavailable('The check could not be recorded, so this was not sent.')\n      }",
      replace: '      /* swallowed */',
    },
  ],
}
