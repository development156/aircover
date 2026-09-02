import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

/**
 * THE SECRET-SHAPE GUARD ON THE SCRATCH FILE, EXECUTED.
 *
 * `pre-commit-hook.test.mjs` proves the hook refuses `ops/state/qa.pending.json`
 * and that `ALLOW_QA_PENDING=1` lets it through. This file proves the hatch has
 * a floor: a staged copy of that file carrying a credential shape is refused
 * EVEN WITH the hatch set, because on 2026-08-31 a red unit run's assertion
 * diff put the production Postgres password into that file and it was
 * committed to a public repository.
 *
 * The shapes are the ones `scripts/lib/ops-classify.mjs` redacts on the way in.
 * The hook is the second wall for a row that reached the file some other way.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It executes the hook against ONE file by name, so it is blind to a secret
 * committed in any other file: the hook only reads this path, and so does this
 * test. It is blind to a credential that does not match one of the listed
 * shapes — a bare password with no scheme around it, a base64 blob, a key in a
 * dialect nobody has met yet — and it cannot tell a live credential from a
 * dummy, so a redacted or rotated value is refused exactly as a live one is.
 * It also cannot see a commit that never runs the hook: `--no-verify`, a
 * different `core.hooksPath`, or a push from a machine that never ran
 * `setup.sh`. The redaction in `ops-classify.mjs` is the wall that does not
 * depend on any of those.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const HOOK = resolve(ROOT, '.githooks/pre-commit')
const SCRATCH = 'ops/state/qa.pending.json'

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hooksecret-'))
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
  git(['add', '-A'])
  git(['commit', '-qm', 'initial'], { ALLOW_QA_PENDING: '1' })
  return { dir, git }
}

function refusal(git, env) {
  try {
    git(['commit', '-qm', 'stage the scratch file'], env)
    return null
  } catch (error) {
    return String(error.stderr ?? '')
  }
}

const SHAPES = [
  [
    'a URL with a password',
    'postgresql://postgres:Hunter2Rotated@db.example.supabase.co:5432/postgres',
  ],
  ['a Bearer token', 'Bearer abcdefghijklmnopqrstuvwxyz012345'],
  ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.abcdefghijklmnopqrstuvwxyz0123456789'],
  ['a vendor key', 'sk_live_0123456789abcdef'],
  ['a key= parameter', 'https://host.example/cb?api_key=ya29abcdefghijklmnop'],
]

describe('.githooks/pre-commit refuses a credential shape in the scratch file', () => {
  let repo

  beforeAll(() => {
    repo = scratchRepo()
  })

  it.each(SHAPES)('refuses %s even with ALLOW_QA_PENDING=1', (_label, secret) => {
    const { dir, git } = repo
    const row = JSON.stringify({
      runs: [{ details: `AssertionError: expected '${secret}' to be ''` }],
    })
    writeFileSync(join(dir, SCRATCH), row + '\n')
    git(['add', SCRATCH])

    const message = refusal(git, { ALLOW_QA_PENDING: '1' })

    expect(message, 'the commit went through with a secret staged').not.toBeNull()
    expect(message).toContain('credential')
    // The refusal must not echo the secret it found back into the terminal.
    expect(message).not.toContain(secret)
  })

  it('still honours the hatch for a clean shape change', () => {
    const { dir, git } = repo
    // An already-redacted line is exactly what a clean-up commit stages; the
    // marker in the password slot is not a credential.
    writeFileSync(
      join(dir, SCRATCH),
      '{"runs":[{"details":"error code=23505 from Postgres; expected postgresql://postgres:[REDACTED]@db.example.supabase.co:5432/postgres to be \'\'"}]}\n',
    )
    git(['add', SCRATCH])
    expect(() =>
      git(['commit', '-qm', 'clean shape change'], { ALLOW_QA_PENDING: '1' }),
    ).not.toThrow()
  })
})
