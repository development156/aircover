#!/usr/bin/env node
/**
 * THE LINT THAT REPLACES `exit 0`.
 *
 * ── WHAT WAS THERE ───────────────────────────────────────────────────────────
 * Every one of the nine workspace packages declared `"lint": "exit 0"`. The gate
 * runs `turbo run typecheck lint test`, so one of its three verbs could not fail
 * in any package, on any input, ever. Reporting that leg as a pass has been
 * reporting nothing at all.
 *
 * ── WHAT THIS ENFORCES, AND WHY THESE RULES ──────────────────────────────────
 * Not a general style linter. Four rules, each aimed at a way a suite in THIS
 * repo has been observed to report success while checking nothing:
 *
 *   test-only            a stray `.only` disables every other test in its file
 *                        and the runner still says "passed"
 *   assertionless-test   a file with `it()` blocks and no `expect()` at all
 *   uncollected-tests    a package whose vitest config cannot reach its own
 *                        test files, which `--passWithNoTests` turns into exit 0
 *   console-log          debug output shipped into production source
 *
 * ── WHY A RATCHET AND NOT A HARD FAIL ────────────────────────────────────────
 * Three sessions are working in parallel worktrees off this tree. A rule that
 * goes red on existing code turns every one of their gates red on files they
 * are mid-edit, and a linter that arrives by breaking other people's work gets
 * switched off. So each rule carries a BASELINE of what already violates it:
 * existing violations are reported and tolerated, a NEW one fails.
 *
 * The baseline can only tighten. `--update-baseline` refuses to record a count
 * higher than the one on disk, which is the property that makes a ratchet a
 * ratchet rather than a rug.
 *
 *   node scripts/lint.mjs <package-dir>          check
 *   node scripts/lint.mjs <package-dir> --update-baseline
 *   node scripts/lint.mjs <package-dir> --list   print every violation
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const BASELINE_DIR = join(REPO_ROOT, 'ops', 'lint-baselines')

// ── source walking ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', '.git'])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(full)
  }
  return out
}

const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs|js)$/.test(file)

/**
 * Comments stripped, ANCHORED TO LINE START.
 *
 * Load-bearing, and this repo has paid for it twice. An unanchored block strip
 * eats the `/**\/` inside the glob `'src/**''/*.test.ts'` — a syntactically
 * valid empty comment — and every correctly-configured package then reports as
 * broken. And a rule that reads comments flags the docstring explaining why the
 * rule exists, so the only way to stay green is to delete the reasoning.
 */
function stripComments(source) {
  return source.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

// ── the rules ────────────────────────────────────────────────────────────────

/**
 * Each rule returns `{ file, line, detail }[]`. A rule NEVER reads the baseline;
 * that comparison happens once, in one place, so a rule cannot quietly excuse
 * itself.
 */
const RULES = [
  {
    name: 'test-only',
    why:
      'A stray `.only` runs that one test and SILENTLY SKIPS every other test in the file. ' +
      'The runner reports a pass. Remove it before committing.',
    check(files) {
      const out = []
      for (const file of files) {
        if (!isTestFile(file)) continue
        const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
        lines.forEach((line, i) => {
          const m = /\b(describe|it|test)\.only\b/.exec(line)
          if (m) out.push({ file, line: i + 1, detail: `${m[1]}.only` })
        })
      }
      return out
    },
  },
  {
    name: 'assertionless-test',
    why:
      'This file declares tests and contains no `expect(` at all. It runs, reports green, ' +
      'and checks nothing. Give it an assertion or delete it.',
    check(files) {
      const out = []
      for (const file of files) {
        if (!isTestFile(file)) continue
        // `*.live.test.ts` is excluded from `turbo test` by every package's
        // vitest config and is run by hand against real providers, where the
        // output IS the artefact. Excluded here for the same reason, and named
        // so the exclusion is a decision rather than an oversight.
        if (/\.live\.test\./.test(file)) continue
        const code = stripComments(readFileSync(file, 'utf8'))
        const tests = (code.match(/\b(?:it|test)(?:\.\w+(?:\([^)]*\))?)*\s*\(/g) ?? []).length
        const expects = (code.match(/\bexpect(?:\.\w+)?\s*\(/g) ?? []).length
        if (tests > 0 && expects === 0) {
          out.push({ file, line: 1, detail: `${tests} test block(s), 0 expect()` })
        }
      }
      return out
    },
  },
  {
    name: 'console-log',
    why:
      'Debug output in shipped source. Tests and e2e specs may print — they are the artefact. ' +
      'Production code should not.',
    check(files) {
      const out = []
      for (const file of files) {
        if (isTestFile(file) || file.includes('/e2e/') || file.includes('/scripts/')) continue
        const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
        lines.forEach((line, i) => {
          if (/\bconsole\.log\s*\(/.test(line))
            out.push({ file, line: i + 1, detail: 'console.log' })
        })
      }
      return out
    },
  },
]

/**
 * A package-level rule, because the unit is the package and not a file.
 *
 * The root vitest config's `include` is `scripts/**` + '/*.test.mjs'. A workspace
 * package with no config of its own inherits it, matches nothing under its own
 * tree, and `--passWithNoTests` turns "collected zero files" into exit 0. Five
 * packages were found this way in two days — roughly two thousand tests, none
 * of them running, all of them reporting green.
 *
 * `test-collection.test.ts` already guards this, and only for tests under
 * `src/`. `packages/db` keeps 22 test files under `tests/` and `apps/jobs` keeps
 * 2 — twenty-four files that guard cannot see. This one counts both.
 */
function checkCollection(pkgDir) {
  const configs = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js']
  const testFiles = walk(pkgDir)
    .filter(isTestFile)
    .filter((f) => !f.includes('/e2e/'))
  if (testFiles.length === 0) return []

  const config = configs.map((n) => join(pkgDir, n)).find((f) => existsSync(f))
  if (config === undefined) {
    return [
      {
        file: join(pkgDir, 'package.json'),
        line: 1,
        detail:
          `${testFiles.length} test file(s) and no vitest config — this package inherits the ` +
          `root config (scripts/**/*.test.mjs), collects nothing, and passes`,
      },
    ]
  }
  const source = stripComments(readFileSync(config, 'utf8'))
  const includes = [...source.matchAll(/include\s*:\s*\[([^\]]*)\]/g)].map((m) => m[1] ?? '')
  // No explicit include means vitest's own default, which reaches everything.
  if (includes.length === 0) return []

  // Every test file must be matched by at least one include's leading directory.
  const roots = includes.flatMap((value) =>
    [...value.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1].split('/')[0]),
  )
  const unreachable = testFiles.filter((f) => {
    const rel = relative(pkgDir, f)
    return !roots.some((root) => rel.startsWith(`${root}/`) || root === '**')
  })
  return unreachable.map((file) => ({
    file,
    line: 1,
    detail: `no include in ${relative(pkgDir, config)} reaches this file — it is never collected`,
  }))
}

// ── baseline ─────────────────────────────────────────────────────────────────

function baselinePath(pkgName) {
  return join(BASELINE_DIR, `${pkgName.replace(/[/@]/g, '-').replace(/^-/, '')}.json`)
}

function readBaseline(pkgName) {
  const file = baselinePath(pkgName)
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8'))
}

// ── runner ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const target = args.find((a) => !a.startsWith('--')) ?? process.cwd()
  const pkgDir = resolve(target)
  const pkgJson = join(pkgDir, 'package.json')
  if (!existsSync(pkgJson)) {
    console.error(`lint: ${pkgDir} has no package.json`)
    return 2
  }
  const pkgName = JSON.parse(readFileSync(pkgJson, 'utf8')).name ?? relative(REPO_ROOT, pkgDir)

  const files = walk(pkgDir)
  const found = {}
  for (const rule of RULES) found[rule.name] = rule.check(files)
  found['uncollected-tests'] = checkCollection(pkgDir)

  const baseline = readBaseline(pkgName)

  if (flags.has('--update-baseline')) {
    // A baseline may be SEEDED once and may only ever tighten afterwards. The
    // distinction is the whole difference between a ratchet and a rug: without
    // it, every red run has a one-command escape that records the new violations
    // as acceptable, and the rule stops meaning anything the first time somebody
    // is in a hurry.
    const exists = existsSync(baselinePath(pkgName))
    const next = {}
    let refused = false
    for (const [name, hits] of Object.entries(found)) {
      if (!exists) {
        next[name] = hits.length
        continue
      }
      const was = baseline[name] ?? 0
      if (hits.length > was) {
        console.error(
          `lint: refusing to raise the ${name} baseline for ${pkgName} from ${was} to ${hits.length}. ` +
            'A baseline may only tighten — fix the new violations first.',
        )
        refused = true
        next[name] = was
        continue
      }
      next[name] = hits.length
    }
    if (refused) return 2
    writeFileSync(baselinePath(pkgName), JSON.stringify(next, null, 2) + '\n')
    console.log(
      `lint: baseline ${exists ? 'tightened' : 'seeded'} for ${pkgName} — ${JSON.stringify(next)}`,
    )
    return 0
  }

  let failed = false
  const lines = []
  for (const rule of [...RULES, { name: 'uncollected-tests', why: 'See checkCollection().' }]) {
    const hits = found[rule.name] ?? []
    const allowed = baseline[rule.name] ?? 0
    const over = hits.length - allowed
    if (flags.has('--list')) {
      for (const hit of hits) {
        lines.push(`  ${relative(REPO_ROOT, hit.file)}:${hit.line}  ${rule.name}: ${hit.detail}`)
      }
    }
    if (over > 0) {
      failed = true
      lines.push(
        `\n${rule.name}: ${hits.length} violation(s), baseline allows ${allowed} — ${over} NEW.`,
      )
      lines.push(`  ${rule.why}`)
      // Only the ones over the line need naming, but naming all of them is what
      // lets someone see which is new; the baseline is a count, not a list, so
      // it cannot say. A count keeps the file from churning on every rename.
      for (const hit of hits) {
        lines.push(`    ${relative(REPO_ROOT, hit.file)}:${hit.line}  ${hit.detail}`)
      }
    }
  }

  if (lines.length > 0) console.log(lines.join('\n'))
  if (failed) {
    console.error(
      `\nlint FAILED for ${pkgName}. Fix the new violations, or — only if they are genuinely ` +
        'acceptable — run `node scripts/lint.mjs <dir> --update-baseline`, which will refuse ' +
        'to raise a count.',
    )
    return 1
  }
  const summary = Object.entries(found)
    .map(([n, h]) => `${n}=${h.length}`)
    .join(' ')
  console.log(`lint ok: ${pkgName}  (${summary})`)
  return 0
}

process.exit(main())
