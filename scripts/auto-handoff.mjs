#!/usr/bin/env node
/**
 * Stop-hook: write a SKELETON handoff so an abandoned session still leaves a trace.
 *
 * Why this exists, measured 2026-08-25: three lanes had produced 73 commits
 * between them and only ONE had a handoff. 49 commits — including a [contract]
 * change to the plan catalog — had no written record of what was done or why,
 * because /handoff must be typed and nobody typed it.
 *
 * This never writes the WHY. Only a person or a session that ran /handoff can.
 * It writes the WHAT — branch, commits, files, shared surfaces — so the next
 * session is not starting from nothing. A skeleton is marked as one, loudly, so
 * it can never be mistaken for a real handoff.
 *
 * It NEVER fails the session: every path exits 0.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const sh = (c) => {
  try {
    return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/**
 * Is this file one of OUR skeletons, rather than something a person wrote?
 *
 * ── WHY THIS IS NOT `includes('AUTOMATIC SKELETON')` ────────────────────────
 * Because that reads a file the wrong way round, and it DESTROYED A REAL HANDOFF
 * on 2026-08-26. `divas-advisor-2026-08-26.md` was 520 lines a session had written,
 * and one line of it was a table row naming a mutation: "Drop the AUTOMATIC
 * SKELETON exemption". A substring search over the whole document found that,
 * concluded the document was a skeleton, and overwrote all 520 lines with 29.
 *
 * The irony is the point: a handoff that DOCUMENTS this mechanism is exactly the
 * handoff most likely to be eaten by it, so the more carefully somebody writes
 * about the hook, the more certainly they lose their work.
 *
 * ── WHAT IT CHECKS INSTEAD ──────────────────────────────────────────────────
 * The marker as the TEMPLATE EMITS IT: a blockquote line, at the start of a line,
 * in the file's opening block. Prose that mentions the words — in a table, in
 * backticks, in a sentence — cannot match, because prose does not begin a line
 * with `> **AUTOMATIC SKELETON.**`.
 *
 * A structural marker is a claim the file makes about ITSELF. A substring is a
 * claim about any text that happens to be inside it, including a quotation of
 * somebody else's.
 */
function isSkeleton(file) {
  const head = readFileSync(file, 'utf8').split('\n').slice(0, HEAD_LINES).join('\n')
  return /^> \*\*AUTOMATIC SKELETON\.\*\*/m.test(head)
}

/**
 * How far into a file the self-declaration must appear.
 *
 * The template puts it within the first ten lines. Twenty is slack for a title or
 * an owner note above it, and small enough that a mention buried in the body of a
 * long handoff can never reach it.
 */
const HEAD_LINES = 20

try {
  const root = sh('git rev-parse --show-toplevel')
  if (!root) process.exit(0)
  process.chdir(root)

  const branch = sh('git branch --show-current') || 'detached'
  // Everything not already on the trunk. That is this session's lane, whatever it is called.
  const base = sh('git merge-base HEAD origin/wt-core') || sh('git merge-base HEAD origin/wt-web')
  if (!base) process.exit(0)

  const commits = sh(`git log --oneline ${base}..HEAD`).split('\n').filter(Boolean)
  const files = sh(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean)
  const dirty = sh('git status --porcelain').split('\n').filter(Boolean)

  // Nothing happened. Do not write a file for a session that did nothing.
  if (commits.length === 0 && dirty.length === 0) process.exit(0)

  // ROLE comes from the branch — substring, not equality, because the harness
  // assigns names like `claude/lead-design-7m7ios` and an exact match on
  // `wt-design` resolves EVERY real branch to 'advisor'. Measured 2026-08-26.
  const role = /design/.test(branch)
    ? 'design'
    : /research/.test(branch)
      ? 'research'
      : /advisor/.test(branch)
        ? 'advisor'
        : 'lane'

  // OWNER is a different question and the branch cannot answer it. Two people
  // both running /lead-design get two branches that both say "design", and both
  // would write design-<date>.md over each other. So the owner is declared:
  //   env SAHODA_LANE_OWNER, or `git config sahoda.owner <name>`.
  // With neither, fall back to the branch slug, which is at least unique.
  const slug = branch
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  const owner = (process.env.SAHODA_LANE_OWNER || sh('git config sahoda.owner') || '').trim()
  const who = owner || slug

  const date = sh('date +%F') || new Date().toISOString().slice(0, 10)
  const path = `docs/workflow/handoffs/${who}-${role}-${date}.md`

  // A REAL handoff already exists for today. Never overwrite a human's work, and
  // never write a SECOND file alongside it saying the session ended without one.
  //
  // BOTH NAMES HAVE TO BE CHECKED, and missing the second one is not theoretical:
  // on 2026-08-26 this hook wrote `claude-advisor-qvz5wn-advisor-2026-08-26.md`
  // into a lane that HAD run /handoff, because /handoff writes `<role>-<date>.md`
  // and this looks for `<who>-<role>-<date>.md`. The skeleton then opened with
  // "this session ended without /handoff", which was false, in a file whose whole
  // purpose is to be the record. A guard that cannot see the thing it is guarding
  // against does not fail loudly — it fabricates.
  const candidates = [path, `docs/workflow/handoffs/${role}-${date}.md`]
  const realHandoffExists = candidates.some((p) => existsSync(p) && !isSkeleton(p))
  if (realHandoffExists) process.exit(0)

  // Shared surfaces: the things that break other lanes.
  const shared = files.filter(
    (f) =>
      f.startsWith('packages/shared/') ||
      f.includes('/migrations/') ||
      /pricing\.config|turbo\.json|vercel\.json|middleware\.ts|tokens\.css|\.gitignore/.test(f),
  )

  const contract = commits.filter((c) => /\[contract\]|BREAKING|migration/i.test(c))

  const ownerLine = owner
    ? `**Owner** ${owner}`
    : `> **OWNER UNKNOWN.** Nobody declared who runs this lane, so the filename\n> falls back to the branch slug. Set it once with \`git config sahoda.owner <name>\`\n> or the SAHODA_LANE_OWNER environment variable, and the record becomes\n> readable by a person instead of by a branch id.`

  const body = `# Handoff — ${role} — ${date}

${ownerLine}

> **AUTOMATIC SKELETON.** Written by the Stop hook because this session ended
> without \`/handoff\`. It records WHAT changed. It does not know WHY, and the
> why is the half that matters. Whoever owns this lane should replace it.

**Branch** \`${branch}\` at \`${sh('git rev-parse --short HEAD')}\`, ${commits.length} commit(s) beyond \`${sh(`git rev-parse --short ${base}`)}\`.
${dirty.length ? `\n> **${dirty.length} file(s) UNCOMMITTED** when the session ended. A lane can hold its whole output uncommitted, and \`git merge\` will then succeed having merged nothing.\n` : ''}
## Commits

${commits.length ? commits.map((c) => `- ${c}`).join('\n') : '_none_'}

## Shared surfaces touched

${shared.length ? shared.map((f) => `- \`${f}\``).join('\n') + '\n\n**These break other lanes.** A required field breaks constructors, not readers — say which.' : '_none detected_'}
${contract.length ? `\n## Contract or migration commits\n\n${contract.map((c) => `- ${c}`).join('\n')}\n\n**Whoever merges needs to know about these.**\n` : ''}
## Files changed (${files.length})

${files
  .slice(0, 60)
  .map((f) => `- \`${f}\``)
  .join('\n')}${files.length > 60 ? `\n- _…and ${files.length - 60} more_` : ''}

## NOT recorded by this skeleton

- What was **not** done, and why
- Every guard written, and **the mutation that proved it**
- Anything retracted, with the measurement
- Gate results, per leg, PASS / FAIL / **UNRUN**

Run \`/handoff\` to replace this with the real thing.
`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  console.error(
    `[auto-handoff] wrote skeleton ${path} (${commits.length} commits). Run /handoff to replace it.`,
  )
} catch {
  /* never fail a session */
}
process.exit(0)
