/**
 * THE RULE: a live publish never returns a URL without having asked for the id.
 *
 * `platformPostUrl` and `platformPostId` are sibling fields on the same Zernio leg and
 * arrive independently. Until 2026-08-09 `waitForUrl` stopped the moment the URL was
 * present and the caller then read the id off that same snapshot — so a URL-first
 * response returned on the very first check with the id read as absent, and nothing
 * ever asked again. That produced a real, live post whose Performance panel said
 * "didn't return a post id" forever: `listUnresolvedPublishes` only chases publishes
 * that did NOT succeed, so no sweep could repair it.
 *
 * The fix is deliberately small — an absent id buys exactly ONE more read, still
 * bounded by the attempt budget, and the URL still terminates the loop. The three
 * mutants below are the three ways that balance breaks: losing the re-read entirely
 * (the original bug), making it unbounded, and paying for it on the happy path.
 *
 *   node scripts/mutation-check.mjs mutations/settle-loop-id.mjs
 */
export default {
  cwd: 'packages/publishing',
  command: 'pnpm vitest run src/adapters/zernio.test.ts',
  mutants: [
    {
      name: 'the original bug: the loop exits on the sibling URL field and never asks for the id',
      file: 'packages/publishing/src/adapters/zernio.ts',
      find:
        '      if (leg?.platformPostUrl) {\n' +
        '        if (platformIdOf(leg) !== null || rereadForId) return current\n' +
        '        rereadForId = true\n' +
        '      } else if (leg?.status === ' +
        "'failed'" +
        ') return current',
      replace:
        '      if (leg?.platformPostUrl) return current\n' +
        '      if (leg?.status === ' +
        "'failed'" +
        ') return current',
    },
    {
      name: 'the re-read is unbounded — it burns the whole attempt budget waiting for an id',
      file: 'packages/publishing/src/adapters/zernio.ts',
      find: '        if (platformIdOf(leg) !== null || rereadForId) return current',
      replace: '        if (platformIdOf(leg) !== null) return current',
    },
    {
      name: 'the happy path pays for the fix — it re-reads even when the id is already there',
      file: 'packages/publishing/src/adapters/zernio.ts',
      find: '        if (platformIdOf(leg) !== null || rereadForId) return current',
      replace: '        if (rereadForId) return current',
    },
  ],
}
