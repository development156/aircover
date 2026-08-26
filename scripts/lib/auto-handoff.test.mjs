import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

/**
 * THE STOP HOOK DOES NOT WRITE A SKELETON OVER A REAL HANDOFF.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `auto-handoff.mjs` opens its output with "Written by the Stop hook because
 * this session ended without /handoff". When that sentence is wrong, it is
 * wrong inside the one file whose entire job is to be the record — so the guard
 * that decides whether to write at all is the load-bearing part of the script,
 * not the templating below it.
 *
 * It had a hole. MEASURED 2026-08-26 on `claude/advisor-qvz5wn`: the session ran
 * /handoff, which wrote `advisor-2026-08-26.md`, and the hook then wrote
 * `claude-advisor-qvz5wn-advisor-2026-08-26.md` beside it claiming no handoff had
 * been written. The guard checked only its OWN filename, and the two conventions
 * disagree — `<role>-<date>` against `<who>-<role>-<date>`.
 *
 * ── WHAT IT PROVES, AND HOW ─────────────────────────────────────────────────
 * By RUNNING the script in a throwaway git repository with a real commit, under
 * each of the three states that matter, and looking at what is on disk after. Not
 * by reading the source: the bug was a missing filename, and a source scan for
 * "does it call existsSync" passes on the broken version.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * Whether the hook is WIRED to Stop in `.claude/settings.json`. This runs the
 * script directly. An unwired hook leaves this green and writes nothing, ever.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SCRIPT = join(ROOT, 'scripts/auto-handoff.mjs')
const HANDOFFS = 'docs/workflow/handoffs'

/** A throwaway repo with one commit on a branch, so the script has a base to diff. */
function repo(branch = 'claude/advisor-qvz5wn') {
  const dir = mkdtempSync(join(tmpdir(), 'auto-handoff-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 'T')
  writeFileSync(join(dir, 'seed.txt'), 'seed\n')
  git('add', '-A')
  git('commit', '-qm', 'seed')
  git('checkout', '-qb', branch)
  writeFileSync(join(dir, 'work.txt'), 'work\n')
  git('add', '-A')
  git('commit', '-qm', 'feat: something worth recording')
  // The script resolves its base as `git merge-base HEAD origin/wt-core`, so a repo
  // with no remote makes it exit 0 having done NOTHING. The first draft of this file
  // omitted this ref and every assertion below "passed" against an empty directory,
  // which is the harness error this repository keeps paying for: a test that runs the
  // wrong situation confidently.
  git('update-ref', 'refs/remotes/origin/wt-core', 'main')
  mkdirSync(join(dir, HANDOFFS), { recursive: true })
  return dir
}

function run(dir) {
  // Copy rather than run in place, so the test exercises the file as shipped.
  const local = join(dir, 'auto-handoff.mjs')
  copyFileSync(SCRIPT, local)
  execFileSync('node', [local], { cwd: dir, stdio: 'pipe' })
  return readdirSync(join(dir, HANDOFFS)).sort()
}

const REAL = '# Handoff — advisor — today\n\nA person wrote this.\n'

describe('the stop hook writes a skeleton only when there is no real handoff', () => {
  it('writes one when the session left nothing behind', () => {
    const dir = repo()
    const written = run(dir)
    expect(written.length, `expected exactly one skeleton, got ${written.join(', ')}`).toBe(1)
    expect(
      readFileOf(dir, written[0]),
      'a skeleton must announce itself as one, or it can be mistaken for a record',
    ).toContain('AUTOMATIC SKELETON')
  })

  it('writes NOTHING when /handoff already wrote `<role>-<date>.md`', () => {
    // The hole. /handoff's convention omits the owner; the hook's includes it, so
    // the hook used to look straight past a handoff sitting in the same directory.
    const dir = repo()
    const date = today()
    writeFileSync(join(dir, HANDOFFS, `advisor-${date}.md`), REAL)

    const written = run(dir)
    expect(
      written,
      'the hook wrote a skeleton beside a real handoff, and its first line says the ' +
        'session ended without one — which is false',
    ).toEqual([`advisor-${date}.md`])
  })

  it('writes NOTHING when a real handoff sits at its own filename either', () => {
    const dir = repo()
    const date = today()
    const own = `claude-advisor-qvz5wn-advisor-${date}.md`
    writeFileSync(join(dir, HANDOFFS, own), REAL)
    expect(run(dir)).toEqual([own])
  })

  it('DOES overwrite a previous skeleton, because that is not a person’s work', () => {
    const dir = repo()
    const date = today()
    const own = `claude-advisor-qvz5wn-advisor-${date}.md`
    writeFileSync(join(dir, HANDOFFS, own), '# stale\n\nAUTOMATIC SKELETON\n')

    expect(run(dir)).toEqual([own])
    expect(
      readFileOf(dir, own),
      'a stale skeleton must be refreshed, not preserved — it names the wrong commits',
    ).toContain('feat: something worth recording')
  })
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function readFileOf(dir, name) {
  return execFileSync('cat', [join(dir, HANDOFFS, name)], { encoding: 'utf8' })
}
