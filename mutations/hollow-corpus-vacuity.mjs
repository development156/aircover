/**
 * DOES EACH REPO-WIDE GUARD NOTICE WHEN ITS CORPUS GOES EMPTY?
 *
 * Every guard here walks a directory, collects offenders, and asserts the list
 * is `[]`. That assertion passes two ways: because nothing offends, or because
 * nothing was looked at. The second is the failure mode this repo has now been
 * bitten by six times, and reading the source cannot tell them apart — a guard
 * that LOOKS thorough and a guard that scans an empty set produce byte-identical
 * green output.
 *
 * So each mutant re-points one guard's corpus root at `ops/state`, a directory
 * that exists (so nothing throws — a throw would be red for the wrong reason)
 * and holds four .json files and not one .ts or .tsx. The walker runs, finds
 * nothing, and the emptiness assertion is handed exactly what it wants.
 *
 * KILLED = the guard asserted a lower bound on its corpus and noticed.
 * SURVIVED = the guard is vacuous: delete its subject tree and it still passes.
 */
export default {
  cwd: '.',
  mutants: [
    {
      name: 'breakpoints: corpus → a directory with no sources',
      file: 'apps/web/src/lib/design/breakpoints.test.ts',
      find: "const WEB_SRC = join(repoRoot(), 'apps/web/src')",
      replace: "const WEB_SRC = join(repoRoot(), 'ops/state')",
      command: 'pnpm --filter @sahoda/web exec vitest run src/lib/design/breakpoints.test.ts',
    },
    {
      name: 'eyebrow: corpus → a directory with no sources',
      file: 'apps/web/src/lib/design/eyebrow.test.ts',
      find: "const WEB_SRC = join(repoRoot(), 'apps/web/src')",
      replace: "const WEB_SRC = join(repoRoot(), 'ops/state')",
      command: 'pnpm --filter @sahoda/web exec vitest run src/lib/design/eyebrow.test.ts',
    },
    {
      name: 'ink-faint: corpus → a directory with no sources',
      file: 'apps/web/src/lib/design/ink-faint.test.ts',
      find: "const WEB_SRC = join(repoRoot(), 'apps/web/src')",
      replace: "const WEB_SRC = join(repoRoot(), 'ops/state')",
      command: 'pnpm --filter @sahoda/web exec vitest run src/lib/design/ink-faint.test.ts',
    },
    {
      name: 'phantom-denominator: corpus → a directory with no sources',
      file: 'apps/web/src/lib/design/phantom-denominator.test.ts',
      find: "const WEB_SRC = join(repoRoot(), 'apps/web/src')",
      replace: "const WEB_SRC = join(repoRoot(), 'ops/state')",
      command:
        'pnpm --filter @sahoda/web exec vitest run src/lib/design/phantom-denominator.test.ts',
    },
    {
      name: 'nav/reachable: route corpus → a directory with no routes',
      file: 'apps/web/src/lib/nav/reachable.test.ts',
      find: "const APP_DIR = join(repoRoot(), 'apps/web/src/app/(app)')",
      replace: "const APP_DIR = join(repoRoot(), 'ops/state')",
      command: 'pnpm --filter @sahoda/web exec vitest run src/lib/nav/reachable.test.ts',
    },
    {
      name: 'server-event-handler: page corpus → no pages',
      file: 'apps/web/src/components/server-event-handler.guard.test.ts',
      find: "const pages = globSync('app/**/{page,layout}.tsx', { cwd: SRC }).map((p) => join(SRC, p))",
      replace: 'const pages = []',
      command:
        'pnpm --filter @sahoda/web exec vitest run src/components/server-event-handler.guard.test.ts',
    },
    {
      name: 'test-collection: workspace walker returns nothing',
      file: 'apps/web/src/lib/repo/test-collection.test.ts',
      find: "  for (const group of ['packages', 'apps']) {",
      replace: "  for (const group of ['packages-that-do-not-exist']) {",
      command: 'pnpm --filter @sahoda/web exec vitest run src/lib/repo/test-collection.test.ts',
    },
    {
      name: 'source-bytes: source corpus → a directory with no sources',
      file: 'packages/sites/src/source-bytes.test.ts',
      find: "const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url))",
      replace: "const SRC_ROOT = fileURLToPath(new URL('../../../ops/state/', import.meta.url))",
      command: 'pnpm --filter @sahoda/sites exec vitest run src/source-bytes.test.ts',
    },
  ],
}
