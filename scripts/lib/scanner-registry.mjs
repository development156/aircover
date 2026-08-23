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

/** How a guard might reach the source tree. Any of these makes it a scanner. */
const READS_SOURCE = /readFileSync|readdirSync|globSync|execFileSync|execSync/

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

  return files.map((file) => {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    return {
      file,
      declaresLimit: DECLARES_LIMIT.test(source),
      patterns: accessPatternsSeen(source),
      // A scanner that enumerates its own targets by glob/git survives a new
      // entry arriving; one that iterates a literal array does not.
      enumeratesDynamically: /readdirSync|globSync|execFileSync|execSync/.test(source),
    }
  })
}
