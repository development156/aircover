import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every env var apps/web reads at build or runtime must be declared in
 * turbo.json's `@sahoda/web#build` env list.
 *
 * Turborepo 2 runs `envMode: "strict"` by default, and nothing in this repo
 * overrides it. Strict means a task receives ONLY the vars it declares (plus
 * framework-inferred and system vars) — an undeclared var is not "missing from
 * the cache key", it is removed from the build's environment outright. Setting
 * it in the Vercel dashboard changes nothing; turbo strips it on the way in.
 *
 * Verified against turbo 2.10.5 with a dry run: an allowlisted var that is set
 * appears under `configured`, a NEXT_PUBLIC_* var appears under `inferred`, and
 * a set-but-undeclared var (SENTRY_ORG) appears under neither. It is simply gone.
 *
 * The failure is silent by construction, which is the whole reason for this test.
 * Code that reads such a var sees `undefined` and takes its not-configured path —
 * and the not-configured path is usually the quiet one, because it was written
 * for laptops and CI forks. SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN were
 * exactly this: next.config.ts disables source-map upload when they are absent
 * (`sourcemaps: { disable: ... }`, `silent: true`), so production stack traces
 * quietly stayed minified and no build ever complained.
 *
 * Sibling failure modes in the same class are guarded by wt-pub's
 * `lib/cron/wiring.test.ts` (vercel.json, route path, middleware allowlist).
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Walk up until the directory containing `packages/` — worktree-path agnostic. */
function repoRoot(): string {
  let dir = HERE
  for (let up = 0; up < 12; up += 1) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root from the test file')
}

const ROOT = repoRoot()
const WEB = join(ROOT, 'apps/web')

interface TurboConfig {
  tasks: Record<string, { env?: string[] } | undefined>
}

function allowlist(): string[] {
  const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8')) as TurboConfig
  const task = turbo.tasks['@sahoda/web#build']
  if (!task?.env) {
    throw new Error('turbo.json has no `@sahoda/web#build.env` list — the allowlist this guards')
  }
  return task.env
}

/**
 * Vars the PLATFORM sets, not us. Turbo passes its own system list through, and
 * declaring these would be wrong: they are not configuration we supply, and
 * pinning them into the cache key would bust the cache on every runtime change.
 */
const SYSTEM_ENV: ReadonlySet<string> = new Set([
  'NODE_ENV',
  // Set by Next.js itself to 'nodejs' | 'edge' so instrumentation.ts can branch.
  'NEXT_RUNTIME',
  'CI',
  'PORT',
  'TZ',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  // The STABLE per-branch alias, e.g. `app-git-my-branch-team.vercel.app`.
  // Platform-set like the two above, and read at REQUEST time by
  // `lib/zernio/return-url.ts` so a preview deployment tells Zernio to send the
  // customer back to the branch they were actually on rather than to production.
  'VERCEL_BRANCH_URL',
  'VERCEL_REGION',
  'VERCEL_GIT_COMMIT_SHA',
])

/**
 * Files that do NOT run inside `turbo run build`, so strict mode never touches
 * them: they get the full ambient environment from vitest, playwright or node.
 *
 * Kept as an explicit predicate rather than a path list because the rule is
 * about WHEN a file runs, and getting that wrong in the lax direction is how a
 * shipping file would slip through unguarded.
 */
function runsOutsideTheBuild(relPath: string): boolean {
  return (
    /\.test\.[cm]?[jt]sx?$/.test(relPath) ||
    relPath.startsWith('e2e/') ||
    relPath.startsWith('scripts/') ||
    relPath === 'playwright.config.ts' ||
    relPath === 'vitest.config.ts' ||
    relPath === 'vitest.setup.ts'
  )
}

const ENV_READ =
  /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.turbo') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** env var name -> the shipping files that read it. */
function envReadsInShippedCode(): Map<string, string[]> {
  const reads = new Map<string, string[]>()
  for (const file of sourceFiles(WEB)) {
    const rel = relative(WEB, file).split('\\').join('/')
    if (runsOutsideTheBuild(rel)) continue
    for (const match of readFileSync(file, 'utf8').matchAll(ENV_READ)) {
      const name = match[1] ?? match[2]
      if (name === undefined) continue
      reads.set(name, [...(reads.get(name) ?? []), rel])
    }
  }
  return reads
}

describe('turbo.json env allowlist covers what apps/web reads', () => {
  test('every env var read by shipping code is declared', () => {
    const declared = new Set(allowlist())
    const undeclared = [...envReadsInShippedCode()]
      // NEXT_PUBLIC_* is framework-inferred for Next.js — turbo adds it on its
      // own (confirmed: a NEXT_PUBLIC_ var shows up under `inferred`). Declaring
      // it would be redundant, so it must NOT be required here.
      .filter(([name]) => !name.startsWith('NEXT_PUBLIC_'))
      .filter(([name]) => !SYSTEM_ENV.has(name))
      .filter(([name]) => !declared.has(name))
      .map(([name, files]) => `${name} (read in ${[...new Set(files)].join(', ')})`)
      .sort()

    expect(
      undeclared,
      'Turborepo runs envMode: strict, so these are STRIPPED from the build no matter what ' +
        'is set in Vercel. Add each to turbo.json `@sahoda/web#build.env`, or — if the ' +
        'platform sets it rather than us — to SYSTEM_ENV here with a note.',
    ).toEqual([])
  })

  test('the allowlist has no duplicate entries', () => {
    const env = allowlist()
    const dupes = env.filter((name, i) => env.indexOf(name) !== i)

    expect(dupes, 'a duplicated entry means two edits collided in the same array').toEqual([])
  })

  test('the Sentry source-map trio is declared together or not at all', () => {
    // next.config.ts gates upload on ALL THREE being present, and supplying a
    // token without org/project fails deep in the upload step with a message
    // that reads like an auth problem. Half the trio is worse than none.
    const declared = new Set(allowlist())
    const trio = ['SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN']
    const present = trio.filter((name) => declared.has(name))

    expect(
      present.length === 0 || present.length === trio.length,
      `partial Sentry source-map config in turbo.json: ${present.join(', ')}`,
    ).toBe(true)
  })

  test('the scanner sees both process.env forms and ignores lookalikes', () => {
    // Guards the gate itself. A scanner that missed the bracket form would let
    // any var slip through by being read as process.env['NAME'].
    const sample = `
      process.env.ALPHA
      process.env['BRAVO']
      process.env["CHARLIE"]
      myEnv.DELTA
      processXenv.ECHO
    `
    const names = [...sample.matchAll(ENV_READ)].map((m) => m[1] ?? m[2])

    expect(names).toEqual(['ALPHA', 'BRAVO', 'CHARLIE'])
  })

  test('files that run outside the build are classified as such', () => {
    for (const rel of [
      'src/lib/foo.test.ts',
      'src/components/bar.test.tsx',
      'e2e/golden-path.spec.ts',
      'scripts/verify-sentry.mjs',
      'playwright.config.ts',
    ]) {
      expect(runsOutsideTheBuild(rel), rel).toBe(true)
    }
    for (const rel of ['next.config.ts', 'src/instrumentation.ts', 'src/lib/env.ts']) {
      expect(runsOutsideTheBuild(rel), rel).toBe(false)
    }
  })
})
