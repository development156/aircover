/**
 * THE RULE: `viaZernio` is decided by the row and must travel WITH the resolved
 * connection.
 *
 * It is the ONLY thing that selects the Zernio adapter (`adapters.ts:56`), and it is not
 * derivable downstream — x, gbp and linkedin exist in both shapes, so the channel cannot
 * answer it. On 2026-08-09 both `return` statements in `createConnectionResolver` built a
 * fresh three-field literal and neither copied it. The field was optional, so the
 * omission typechecked; `runPublishPost.ts` then read `undefined === true` as `false` and
 * every live Instagram publish died at NO_ADAPTER holding a valid connection.
 *
 * The field is now REQUIRED, so the first two mutants below are also compile errors —
 * but `vitest` transpiles without typechecking, so these prove the TESTS catch them too.
 * Belt and braces: the type stops it being written, the tests stop it shipping.
 *
 *   node scripts/mutation-check.mjs mutations/via-zernio-survives.mjs
 */
export default {
  cwd: 'apps/jobs',
  command: 'pnpm vitest run src/publish/',
  mutants: [
    {
      name: 'the original bug: the aggregator branch drops viaZernio entirely',
      file: 'apps/jobs/src/publish/tokens.ts',
      find:
        '        // The reason we are in THIS branch, carried forward rather than re-derived.\n' +
        '        // `adapters.ts` cannot work it out again: x, gbp and linkedin exist in both\n' +
        '        // shapes, so only the row knows, and this is the last point that still holds it.\n' +
        '        viaZernio: true,\n',
      replace: '',
    },
    {
      name: 'the vault branch drops viaZernio entirely',
      file: 'apps/jobs/src/publish/tokens.ts',
      find:
        '      // Stated, not omitted. Reaching here means the vault opened a secret of OURS, so\n' +
        '      // this is an OAuth grant and not a Zernio-fronted account — and saying so costs\n' +
        '      // nothing while leaving it out is what broke live publishing once already.\n' +
        '      viaZernio: false,\n',
      replace: '',
    },
    {
      name: 'the aggregator branch reports the wrong answer',
      file: 'apps/jobs/src/publish/tokens.ts',
      find:
        '        // shapes, so only the row knows, and this is the last point that still holds it.\n' +
        '        viaZernio: true,',
      replace:
        '        // shapes, so only the row knows, and this is the last point that still holds it.\n' +
        '        viaZernio: false,',
    },
    {
      name: 'the vault branch claims to be Zernio-fronted',
      file: 'apps/jobs/src/publish/tokens.ts',
      find:
        '      // nothing while leaving it out is what broke live publishing once already.\n' +
        '      viaZernio: false,',
      replace:
        '      // nothing while leaving it out is what broke live publishing once already.\n' +
        '      viaZernio: true,',
    },
  ],
}
