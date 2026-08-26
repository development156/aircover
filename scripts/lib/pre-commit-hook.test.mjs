import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

/**
 * THE SCRATCH-FILE GUARD, EXECUTED.
 *
 * ── WHY A TEST FOR A GIT HOOK ───────────────────────────────────────────────
 * A hook is the easiest guard in a repository to have and not have: it only
 * runs where somebody ran `git config core.hooksPath .githooks`, so a broken one
 * is silent everywhere it was never installed. This runs it in a throwaway
 * repository on every gate, so the refusal is checked whether or not anyone
 * installed it locally.
 *
 * ── WHAT IT PROVES ──────────────────────────────────────────────────────────
 * Not that the hook exists — a file existing is not a guard. That staging
 * `ops/state/qa.pending.json` makes `git commit` FAIL, that an ordinary commit
 * still succeeds, and that the documented escape hatch works. Each is run
 * against real git.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * It copies the hook into a throwaway repository and sets `core.hooksPath`
 * itself, so it says nothing about whether the hook is INSTALLED anywhere real.
 * A developer who never ran `git config core.hooksPath .githooks` is unguarded
 * and this stays green; `scripts/cloud-setup.sh` covers cloud sessions and
 * nothing covers a laptop that skipped it.
 *
 * It also cannot see any OTHER route into a commit. `git commit --no-verify`
 * bypasses the hook by design, a GitHub web edit never runs it, and a scratch
 * file committed on another branch and merged here arrives without passing
 * through it. The hook catches the habit it was written for — `git add -A` —
 * and not a determined bypass.
 *
 * And it names ONE path. A second scratch file would need its own line in the
 * hook; nothing here would notice its absence.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const HOOK = resolve(ROOT, '.githooks/pre-commit')
const SCRATCH = 'ops/state/qa.pending.json'

/** A repository with the hook installed and one committed file. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hookprobe-'))
  const git = (args, env = {}) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...env,
        GIT_AUTHOR_NAME: 'probe',
        GIT_AUTHOR_EMAIL: 'probe@example.com',
        GIT_COMMITTER_NAME: 'probe',
        GIT_COMMITTER_EMAIL: 'probe@example.com',
      },
    })

  git(['init', '-q'])
  mkdirSync(join(dir, '.githooks'))
  copyFileSync(HOOK, join(dir, '.githooks/pre-commit'))
  git(['config', 'core.hooksPath', '.githooks'])

  mkdirSync(join(dir, 'ops/state'), { recursive: true })
  writeFileSync(join(dir, SCRATCH), '{"runs":[]}\n')
  writeFileSync(join(dir, 'ordinary.txt'), 'first\n')
  // The scratch file is TRACKED, which is the whole reason .gitignore is the
  // wrong tool and this hook is the right one. Committed here with the hatch,
  // so the fixture proves the hatch works before anything else is asserted.
  git(['add', '-A'])
  git(['commit', '-qm', 'initial'], { ALLOW_QA_PENDING: '1' })
  return { dir, git }
}

describe('.githooks/pre-commit', () => {
  let repo

  beforeAll(() => {
    repo = scratchRepo()
  })

  it('is executable, or git silently ignores it', () => {
    // A hook without the bit set is not run and not reported. It would pass
    // every assertion below by never being invoked at all.
    expect(statSync(HOOK).mode & 0o111).toBeGreaterThan(0)
  })

  it('refuses a commit that stages the scratch file', () => {
    const { dir, git } = repo
    writeFileSync(join(dir, SCRATCH), '{"runs":[{"card":"SL-054"}]}\n')
    git(['add', SCRATCH])

    expect(() => git(['commit', '-qm', 'sweeps the scratch file'])).toThrow()

    // And the refusal SAYS what to do, because a guard that only says no is a
    // guard people learn to bypass rather than obey.
    let message = ''
    try {
      git(['commit', '-qm', 'again'])
    } catch (error) {
      message = String(error.stderr ?? '')
    }
    expect(message).toContain('git restore --staged')
    expect(message).toContain('ALLOW_QA_PENDING=1')
  })

  it('lets an ordinary commit through', () => {
    const { dir, git } = repo
    // The scratch file is still staged from the case above; unstage it exactly
    // as the refusal instructs, then commit something real.
    git(['restore', '--staged', SCRATCH])
    writeFileSync(join(dir, 'ordinary.txt'), 'second\n')
    git(['add', 'ordinary.txt'])
    expect(() => git(['commit', '-qm', 'real work'])).not.toThrow()
  })

  it('honours the escape hatch for a deliberate shape change', () => {
    const { git } = repo
    git(['add', SCRATCH])
    expect(() =>
      git(['commit', '-qm', 'deliberate shape change'], { ALLOW_QA_PENDING: '1' }),
    ).not.toThrow()
  })
})
