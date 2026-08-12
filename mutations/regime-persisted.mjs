/**
 * THE RULE: the regime a customer indicated reaches the gate, and no stronger
 * claim than they made travels with it.
 *
 * Before this, `intakeFrom()` found no intake on any workspace that has ever
 * existed: onboarding classified model/regime/locale, folded them into a prose
 * sentence for the resolve prompt, and kept nothing. Every workspace resolved to
 * `consumer` / `default`, so the MANDATED tier was `regime-_floor` alone — a
 * clinic that picked "Health & care" was judged by the general advertising
 * floor, with the Refine screen still promising its red lines were enforced.
 *
 *   node scripts/mutation-check.mjs mutations/regime-persisted.mjs
 *
 * Two rules, and they fail in opposite directions, so both are mutated:
 *
 *   1. IT MUST ARRIVE — 1-4. The mapper, the write, the carry-forward and the
 *      call site. 4 is the reachability one: everything else can be perfect and
 *      the feature still be a function nobody calls.
 *   2. IT MUST NOT OVERSTATE — 5-7. `declared` licenses the gate to say "this
 *      comes with the trade you told us you are in". Saying that about a default
 *      is the product inventing a regulator, which is the failure doc 18 §8
 *      exists to prevent — worse than storing nothing at all.
 *
 * ── ONE MUTANT SPANS TWO PACKAGES ────────────────────────────────────────────
 * The read (`intakeFrom`) lives in `@sahoda/shared` and the write lives in
 * `apps/web`, so the command runs both suites; a mutant whose killing test was
 * never RUN is the harness erring in the reassuring direction.
 */
export default {
  cwd: '.',
  command:
    'pnpm --filter @sahoda/shared exec vitest run src/gate && ' +
    'pnpm --filter @sahoda/web exec vitest run --maxWorkers=4 ' +
    'src/lib/onboarding/to-stored-intake.test.ts ' +
    'src/app/actions/brand-intake.test.ts ' +
    'src/components/onboarding/intake-persisted.test.ts',
  mutants: [
    // ── 1. It must arrive ───────────────────────────────────────────────────
    {
      name: 'THE SHIPPED STATE — the mapper never returns an intake, so nothing is stored',
      file: 'apps/web/src/lib/onboarding/to-stored-intake.ts',
      find: '  const basis = BASIS[classification.regime.basis]\n  if (basis === undefined) return null',
      replace:
        '  const basis = BASIS[classification.regime.basis]\n  if (true as boolean) return null',
    },
    {
      name: 'the write drops the intake on the floor',
      file: 'apps/web/src/app/actions/brand-resolve.ts',
      find: '        ...(nextIntake.success ? { intake: nextIntake.data } : {}),',
      replace: '',
    },
    {
      name: 'the carry-forward is gone — one hand-edit returns a clinic to the floor pack',
      file: 'apps/web/src/app/actions/brand-resolve.ts',
      find: "    const carried = previous.status === 'ok' ? previous.intake : null",
      replace: '    const carried = null',
    },
    {
      name: 'REACHABILITY — Finish stops passing it, and the whole feature is dead code',
      file: 'apps/web/src/components/onboarding/onboarding-flow.tsx',
      find: "        storedIntakeFrom(intakeText, door?.text ?? '', overrides),",
      replace: '        null,',
    },

    // ── 2. It must not overstate ────────────────────────────────────────────
    {
      name: 'an ASSUMED default is persisted as though the customer had said it',
      file: 'apps/web/src/lib/onboarding/to-stored-intake.ts',
      find: "  chosen: 'declared',\n  matched: 'derived',",
      replace: "  chosen: 'declared',\n  matched: 'derived',\n  assumed: 'declared',",
    },
    {
      name: 'a regime read out of their sentence is reported as one they declared',
      file: 'apps/web/src/lib/onboarding/to-stored-intake.ts',
      find: "  matched: 'derived',",
      replace: "  matched: 'declared',",
    },
    {
      name: 'an intake with no basis is read as a declaration',
      file: 'packages/shared/src/gate/brain-rules.ts',
      find: "    basis: parsed.data.basis ?? 'derived',",
      replace: "    basis: 'declared',",
    },
  ],
}
