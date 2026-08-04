import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every workspace package with tests must actually collect them.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The root vitest config is legitimately scoped to `scripts/**\/*.test.mjs`. A
 * workspace package that ships no config of its own INHERITS that pattern, so
 * vitest collects zero files from its `src/` — and then exits 0, because
 * collecting nothing is not an error and the package's script passes
 * `--passWithNoTests`.
 *
 * The result is a package whose suite has never run, reporting green forever.
 * Five were found this way in two days:
 *
 *     packages/shared          7 files      32 tests
 *     packages/publishing      8 files     124 tests
 *     packages/mesh           13 files      80 tests
 *     packages/billing        18 files     247 tests
 *     packages/sites          52 files    1555 tests
 *
 * Roughly two thousand tests, none of them running, all of them passing once
 * collected. Nobody was relying on broken tests — they were relying on tests
 * that did not execute, which is worse, because it is invisible.
 *
 * A comment saying "remember to add a vitest config" would decay the first time
 * someone adds a package in a hurry. This fails the build instead.
 *
 * It lives in apps/web because the repo-wide guards already do (see
 * `lib/design/ink-faint.test.ts`) and because this one needs `node:fs` —
 * packages/shared is deliberately environment-free and carries no node types.
 */

/** Walk up until the directory containing `pnpm-workspace.yaml` — path-agnostic. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up < 12; up += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root')
}

const ROOT = repoRoot()

/** Every `packages/*` and `apps/*` directory that is a real workspace package. */
function workspacePackages(): { name: string; dir: string }[] {
  const out: { name: string; dir: string }[] = []
  for (const group of ['packages', 'apps']) {
    const base = join(ROOT, group)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      const dir = join(base, entry)
      if (!statSync(dir).isDirectory()) continue
      if (!existsSync(join(dir, 'package.json'))) continue
      out.push({ name: `${group}/${entry}`, dir })
    }
  }
  return out
}

/** Count `*.test.ts(x)` under a package's `src/`, ignoring node_modules. */
function testFilesUnderSrc(dir: string): number {
  const src = join(dir, 'src')
  if (!existsSync(src)) return 0
  let count = 0
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules') continue
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.test\.tsx?$/.test(entry)) count += 1
    }
  }
  walk(src)
  return count
}

const CONFIG_NAMES = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js']

/**
 * Whether a package's tests can be reached at all.
 *
 * The rule is about the CONFIG FILE'S EXISTENCE, not its contents, and the
 * distinction is the whole subtlety here:
 *
 *   · no config file    → vitest walks UP and adopts the root's
 *                         `scripts/**\/*.test.mjs`. Collects nothing. Stranded.
 *   · config, no include → vitest's own default include, which covers `src/`.
 *                          Fine. `apps/jobs` is exactly this — it sets only
 *                          timeouts — and its 11 files do run.
 *   · config with include → the package has stated its intent; if it names
 *                           `src/` we trust it, and if it does not, that is a
 *                           deliberate choice this guard should not override.
 *
 * An earlier version of this checked for `src/` inside the include and flagged
 * apps/jobs, whose tests demonstrably run. Testing for the wrong property is how
 * a guard starts costing more than it catches.
 */
function collectsSrc(dir: string): boolean {
  const config = CONFIG_NAMES.map((name) => join(dir, name)).find((file) => existsSync(file))
  if (config === undefined) return false

  // Comments are stripped first, because several of these configs explain
  // themselves by quoting the root's scripts-only include — and a matcher reading
  // the file as flat text finds that sentence before the real setting, reporting a
  // correctly-configured package as broken. (The --ink-faint guard greps comments
  // too, and trips on the same thing.)
  //
  // Both strips are ANCHORED TO LINE START, and that is load-bearing. An unanchored
  // block-comment strip eats the `/**/` sitting inside the glob
  // `'src/**''/*.test.ts'` — it is a syntactically valid empty comment — leaving
  // `'src*.test.ts'`, which then fails the `src/` test. Every correctly-configured
  // package in the repo reported as broken, for a reason entirely internal to this
  // function.
  const source = readFileSync(config, 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

  const includes = [...source.matchAll(/include\s*:\s*\[([^\]]*)\]/g)].map((m) => m[1] ?? '')
  // No explicit include ⇒ vitest's default, which reaches src/.
  if (includes.length === 0) return true
  // ANY include reaching src/ is enough: apps/web declares two projects, one for
  // .test.ts and one for .test.tsx.
  return includes.some((value) => value.includes('src/'))
}

describe('every package with tests collects them', () => {
  test('no package has tests under src/ that its config cannot reach', () => {
    const stranded = workspacePackages()
      .filter((pkg) => testFilesUnderSrc(pkg.dir) > 0)
      .filter((pkg) => !collectsSrc(pkg.dir))
      .map((pkg) => `${pkg.name} (${testFilesUnderSrc(pkg.dir)} test files)`)

    expect(
      stranded,
      'These packages have tests under src/ but no vitest config that collects them. ' +
        'They inherit the root config (scripts/**/*.test.mjs), collect nothing, and pass. ' +
        'Add a vitest.config.ts with include: ["src/**/*.test.ts"].',
    ).toEqual([])
  })

  test('the walker finds real packages, so the check above is not vacuously true', () => {
    // Without this, a broken walker would return an empty list and the assertion
    // above would pass forever while checking nothing.
    const packages = workspacePackages()
    expect(packages.length).toBeGreaterThanOrEqual(6)
    expect(packages.some((p) => testFilesUnderSrc(p.dir) > 0)).toBe(true)
  })
})
