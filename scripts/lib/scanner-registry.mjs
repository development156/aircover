import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Every guard in this repository that reads SOURCE, and what each one can see.
 *
 * ── THE DEFECT CLASS ─────────────────────────────────────────────────────────
 * A scanner inherits the blind spot of the code it was written against.
 *
 *   · the connections.status scanner drives readers through a MOCKED supabase-js
 *     builder. It found two bad call sites and certified the third — the cron,
 *     which reaches the same table through raw `pg`. Two of three, reported clean.
 *   · `lib/cron/wiring.test.ts` split the public-route list on commas and dropped
 *     any entry preceded by a comment, which left `/api/webhooks/cashfree` — a
 *     PUBLIC PAYMENT WEBHOOK — unchecked for as long as it existed.
 *   · the same file read `isPublicRoute` and not `config.matcher`, so a cron path
 *     could tick correctly and still be crashable by one header. MEASURED
 *     2026-08-22: removing `/api/cron/loop` from both matchers left five of its
 *     six assertions green.
 *   · this file's own sibling used `git grep` without `--untracked`, so it could
 *     not see the file being written beside it.
 *
 * The shape is always the same: the guard parses ONE access pattern, and the
 * pattern it cannot parse is reported as absent rather than as unknown.
 *
 * ── WHAT THIS REGISTRY DOES, AND WHAT IT DOES NOT ────────────────────────────
 * It cannot decide whether a given regex is correct — that is the halting
 * problem wearing a hat. What it CAN do is make the blind spot a declared thing
 * rather than a discovered one: every file that reads source must say, in its own
 * text, what it cannot see. A guard that certifies what it cannot parse is worse
 * than no guard, so the minimum bar is that it admits the limit out loud.
 *
 * The list of scanners is DERIVED by `git grep`, never hand-written, because a
 * hand-written list cannot see a scanner arrive in a later lane.
 */

/**
 * How a guard might reach the source tree. The WIDE net, used for `git grep`
 * only: it is a candidate list, not a verdict.
 */
const READS_SOURCE = /readFileSync|readdirSync|globSync|execFileSync|execSync/

/**
 * THE SAME NAMES, BUT SHAPED LIKE A CALL — AND THIS ONE DECIDES.
 *
 * `READS_SOURCE` is a bare identifier match over the whole file, comments
 * included, so a file is flagged for MENTIONING a reader in prose. That is not
 * theoretical: `apps/web/src/lib/brand/logo-facts.test.ts` was flagged on
 * 2026-09-01 for a doc comment whose entire purpose was to explain that it calls
 * none of them — "`scanner-registry.mjs` only flags a test file that calls
 * `readFileSync`, `readdirSync`, `globSync`, `execFileSync` or `execSync` — this
 * one calls none of them". Its author reasoned correctly and was flagged for
 * writing the reasoning down, and the gate went red for a lane that had not
 * touched the file. The comment was later reworded upstream, which cleared the
 * symptom and left the cause.
 *
 * The failure this must not have is the OPPOSITE one — a real scanner slipping
 * out of the register — so the narrowing is the smallest that separates prose
 * from code: an identifier followed by `(`. Every call has one; a sentence
 * listing names does not. MEASURED on 2026-09-01 across all 124 candidates: the
 * two nets disagree about ZERO files, so this changes no verdict today and
 * removes the false one waiting for the next person who explains the rule.
 *
 * WHAT IT CANNOT SEE, since this file is subject to its own rule: a reader bound
 * to another name before it is called — `const read = readFileSync; read(p)` —
 * has no call-shaped occurrence of the original identifier and is no longer
 * seen. The wide net did see that; this one does not. Nothing in the repository
 * does it today, and the exchange is deliberate: a scanner escaping the register
 * is the worse failure, but so is a rule that fires on people describing it,
 * because that is a rule someone deletes.
 */
const CALLS_A_SOURCE_READER = /\b(?:readFileSync|readdirSync|globSync|execFileSync|execSync)\s*\(/

/**
 * Whether a file's own text shows it actually REACHING the source tree.
 *
 * Exported so the distinction can be asserted on strings rather than only
 * observed through `findScanners`, which needs a real repository and can only
 * ever say how many files matched today.
 */
export function readsSource(source) {
  return CALLS_A_SOURCE_READER.test(source)
}

/**
 * The marker a scanner uses to declare its limit. Prose, deliberately — the
 * point is that a human wrote a sentence about what the guard misses, and a
 * structured tag would be filled in without thought.
 */
const DECLARES_LIMIT =
  /CANNOT SEE|cannot see|BLIND TO|blind to|blind spot|does not see|KNOWN LIMITATION|what it misses/

/** Which access patterns a file's own text shows it reaching for. */
export function accessPatternsSeen(source) {
  return {
    postgrestBuilder: /\.from\(['"`]|vi\.mock\(['"`]@\/lib\/supabase/.test(source),
    rawSql: /\bpg\b|new Client\(|\.query\(|select .* from /i.test(source),
    rpc: /\.rpc\(|create or replace function|SECURITY DEFINER/i.test(source),
    dynamicImport: /await import\(|require\(/.test(source),
    templateLiteral: /\$\{/.test(source),
    commentsStripped: /replace\(\/\\\/\\\/|\/\/\.\*\$\/|strip.*comment|comment.*strip/i.test(
      source,
    ),
  }
}

/** Derived, never listed. Tracked and untracked, so an uncommitted one counts. */
export function findScanners(repoRoot) {
  const files = execFileSync(
    'git',
    [
      'grep',
      '-l',
      '--untracked',
      '-E',
      READS_SOURCE.source,
      '--',
      '*.test.ts',
      '*.test.mjs',
      '*.test.tsx',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)

  return (
    files
      .map((file) => ({ file, source: readFileSync(resolve(repoRoot, file), 'utf8') }))
      // `git grep` matched the wide net, which cannot tell a call from a sentence
      // about one. The second pass has the file in hand and can.
      .filter(({ source }) => readsSource(source))
      .map(({ file, source }) => ({
        file,
        // Deliberately still the WHOLE source: a declared limit IS prose, written
        // in a comment, and that is the one thing here that belongs in one.
        declaresLimit: DECLARES_LIMIT.test(source),
        patterns: accessPatternsSeen(source),
        // A scanner that enumerates its own targets by glob/git survives a new
        // entry arriving; one that iterates a literal array does not. Call-shaped
        // for the same reason as above — naming `execSync` in a comment does not
        // make a scanner dynamic.
        enumeratesDynamically: /\b(?:readdirSync|globSync|execFileSync|execSync)\s*\(/.test(source),
      }))
  )
}
