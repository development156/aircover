/**
 * Refuse a commit that stages a credential THIS MACHINE ACTUALLY HOLDS.
 *
 * ── WHY THIS EXISTS ALONGSIDE THE HOOK'S OWN CHECK ───────────────────────────
 * `.githooks/pre-commit` guards exactly one path, `ops/state/qa.pending.json`,
 * because that is the file that leaked on 2026-08-31. It is a good guard for
 * that file and blind to every other one: a credential pasted into a scratch
 * script, a handoff, a test fixture or a log walks straight past it. That is the
 * sibling-shape defect this repository has been bitten by before — a fix that
 * closes one input while its siblings stay open.
 *
 * ── WHY IT MATCHES VALUES AND NOT SHAPES ─────────────────────────────────────
 * The obvious widening is to run the hook's `SECRET_SHAPES` alternation over
 * every staged file. That cannot ship here: this repository deliberately
 * contains dozens of credential-SHAPED fixtures — `sk_live_…1234`,
 * `postgres://postgres:MySecretPw@…`, a fake Slack token — several of which
 * exist precisely to prove the redaction scrubber works. A shape scan refuses
 * every honest commit to those files, and a guard that cries wolf is turned off.
 *
 * So this compares against the REAL values, read from `apps/web/.env*` at commit
 * time. A fixture never equals the live secret, so the false-positive rate is
 * structurally zero, and the true-positive rate is exactly what matters: the
 * thing that can actually be used against production is the thing refused.
 *
 * ── WHAT IT NEVER DOES ───────────────────────────────────────────────────────
 * It never prints a secret, not even the one it caught. It names the ENV
 * VARIABLE and the file. A refusal that echoes the value has moved the leak from
 * a commit into a terminal scrollback, a CI log and a screenshot.
 *
 * Exit 0 = nothing of ours is staged. Exit 1 = refuse the commit.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** Values this short are not secrets, they are words. */
const MIN_SECRET_LEN = 12

/**
 * Names that hold something public by design. `NEXT_PUBLIC_*` is shipped to the
 * browser, so committing it leaks nothing that a page view does not, and a URL
 * or a project ref appears in ordinary code and docs all the time.
 */
const NOT_SECRET =
  /^(NEXT_PUBLIC_|.*_URL$|.*_HOST$|NODE_ENV|.*_ENV$|.*_PORT$|SAHODA_E2E_ACK_TARGET$|.*_PROJECT_REF$)/

function readEnvValues(repoRoot) {
  /** @type {Map<string,string>} value -> the variable that holds it */
  const byValue = new Map()
  for (const rel of ['apps/web/.env', 'apps/web/.env.local']) {
    const file = path.join(repoRoot, rel)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const name = m[1]
      let value = m[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (value.length < MIN_SECRET_LEN) continue
      if (NOT_SECRET.test(name)) {
        // A connection URL is exempt as a NAME but its PASSWORD is not: that is
        // the exact value that leaked, and it is embedded in a variable whose
        // name ends in _URL. Pull the password out and guard it on its own.
        const pw = passwordOf(value)
        if (pw && pw.length >= MIN_SECRET_LEN) byValue.set(pw, `${name} (password)`)
        continue
      }
      byValue.set(value, name)
    }
  }
  return byValue
}

function passwordOf(urlish) {
  try {
    const u = new URL(urlish)
    return u.password ? decodeURIComponent(u.password) : null
  } catch {
    return null
  }
}

function stagedFiles(repoRoot) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

export function scanStaged(repoRoot) {
  const secrets = readEnvValues(repoRoot)
  if (secrets.size === 0) return []
  const hits = []
  for (const file of stagedFiles(repoRoot)) {
    let blob
    try {
      // The STAGED blob, not the working tree: what is checked must be what
      // would actually be committed.
      blob = execFileSync('git', ['show', `:${file}`], {
        cwd: repoRoot,
        maxBuffer: 1 << 28,
      })
    } catch {
      continue
    }
    if (blob.includes(0)) continue // binary
    const text = blob.toString('utf8')
    for (const [value, name] of secrets) {
      if (text.includes(value)) hits.push({ file, name })
    }
  }
  return hits
}

const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`

if (invokedDirectly) {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim()
  const hits = scanStaged(repoRoot)
  if (hits.length > 0) {
    const lines = ['Refusing the commit: a credential this machine actually holds is staged.', '']
    for (const h of hits) lines.push(`  ${h.file}  carries the value of  ${h.name}`)
    lines.push(
      '',
      '  This is not a shape that resembles a secret. It is byte-for-byte the',
      '  value in apps/web/.env, and this repository is PUBLIC.',
      '',
      '  Unstage it:  git restore --staged <file>',
      '  Then remove the value from the file before committing again.',
      '',
      '  If it has already been pushed, rotating the credential is the only fix.',
      '  Deleting the commit does not help: GitHub keeps unreachable objects and',
      '  anyone may already have cloned it.',
    )
    process.stderr.write(lines.join('\n') + '\n')
    process.exit(1)
  }
  process.exit(0)
}
