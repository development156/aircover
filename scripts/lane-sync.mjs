#!/usr/bin/env node
/**
 * lane-sync — the two moves every lane makes, with the conflict handling that
 * is safe to automate and a hard stop on the kind that is not.
 *
 *   node scripts/lane-sync.mjs pull     take wt-core into this lane  (/kickoff)
 *   node scripts/lane-sync.mjs push     put this lane into wt-core   (/handoff)
 *
 * ── WHY THIS DOES NOT "AUTO-RESOLVE CONFLICTS" ──────────────────────────────
 * On 2026-08-26 six lanes met in wt-core. Five carried a FORMATTING-ONLY fix to
 * scripts/auto-handoff.mjs. One carried a real one: the skeleton marker read as
 * a structural claim rather than a substring, because the substring version had
 * overwritten a 520-line handoff that happened to quote the marker in a table.
 *
 * All six conflicts looked identical to git. A rule that picks a side would have
 * taken the formatting fix five times and thrown the real fix away, and nothing
 * would have failed. That is the exact shape this repository keeps paying for.
 *
 * So this resolves ONLY what it can prove is mechanical, and stops otherwise:
 *
 *   1. Two lanes ADDED DIFFERENT handoff files      -> keep both
 *   2. The two sides differ ONLY by formatting      -> prettier decides, verified
 *   3. A generated artifact with a known regen cmd  -> regenerate, never pick
 *
 * Anything else prints both sides and exits 2. A person decides.
 */
import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const MODE = process.argv[2]
const CORE = 'wt-core'

const sh = (c, opts = {}) => {
  try {
    return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
  } catch (e) {
    if (opts.tolerant) return ''
    throw e
  }
}
/**
 * git WITHOUT a shell. Every call that interpolates a branch name or a path goes
 * through this: a branch or filename may legally contain shell metacharacters,
 * and an argument array cannot be made to mean anything else.
 */
const git = (args, opts = {}) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim()
  } catch (e) {
    if (opts.tolerant) return ''
    throw e
  }
}
const gitOk = (args) => {
  try {
    execFileSync('git', args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const say = (m) => console.log(m)
const die = (m, code = 2) => {
  console.error(`\n${m}`)
  process.exit(code)
}

// ── generated artifacts: never pick a side, regenerate against the merged tree
const REGENERATE = {
  'apps/web/scripts/perf/js-budget.json':
    'pnpm --filter @sahoda/web build && pnpm --filter @sahoda/web perf:budget:write',
  'packages/shared/src/tokens-inline.ts': 'node scripts/gen-tokens-inline.mjs',
}

/** Do the two sides differ only in whitespace/formatting? Prettier is the judge. */
function onlyFormatting(file) {
  try {
    const ours = git(['show', `:2:${file}`], { tolerant: true })
    const theirs = git(['show', `:3:${file}`], { tolerant: true })
    if (!ours || !theirs) return false
    const norm = (t) =>
      execFileSync('npx', ['prettier', '--stdin-filepath', file], {
        input: t,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
    return norm(ours) === norm(theirs)
  } catch {
    return false
  }
}

function resolveConflicts() {
  const conflicted = git(['diff', '--name-only', '--diff-filter=U'], { tolerant: true })
    .split('\n')
    .filter(Boolean)
  if (conflicted.length === 0) return { resolved: [], blocked: [] }

  const resolved = []
  const blocked = []

  for (const f of conflicted) {
    // 1 · handoffs: two lanes each wrote their own record. Both are the truth.
    if (f.startsWith('docs/workflow/handoffs/')) {
      const ours = git(['show', `:2:${f}`], { tolerant: true })
      const theirs = git(['show', `:3:${f}`], { tolerant: true })
      if (ours && theirs && ours !== theirs) {
        // same filename, two sessions. Keep both, in order, clearly separated.
        const merged = `${ours}\n\n---\n\n## Session (merged from the other side of ${CORE})\n\n${theirs}\n`
        writeFileSync(f, merged)
      } else {
        git(['checkout', '--theirs', '--', f], { tolerant: true })
      }
      git(['add', '--', f])
      resolved.push(`${f}  (kept both records)`)
      continue
    }

    // 2 · formatting only: no semantic difference exists to lose.
    if (onlyFormatting(f)) {
      git(['checkout', '--theirs', '--', f], { tolerant: true })
      try {
        execFileSync('npx', ['prettier', '--write', f], { stdio: 'ignore' })
      } catch {}
      git(['add', '--', f])
      resolved.push(`${f}  (identical after formatting)`)
      continue
    }

    // 3 · generated: the correct value is neither side's, it is the merged tree's.
    if (REGENERATE[f]) {
      resolved.push(`${f}  (REGENERATE after merge: ${REGENERATE[f]})`)
      git(['checkout', '--theirs', '--', f], { tolerant: true })
      git(['add', '--', f])
      continue
    }

    blocked.push(f)
  }
  return { resolved, blocked }
}

function reportBlocked(blocked) {
  console.error(`\n  STOPPED. ${blocked.length} conflict(s) a script must not decide:\n`)
  for (const f of blocked) console.error(`    ${f}`)
  console.error(`
  These are real differences in intent, not formatting. Read BOTH sides before
  you touch either:

    git diff --diff-filter=U -- <file>          # both sides, marked
    git log --oneline HEAD..origin/${CORE} -- <file>

  On 2026-08-26 five lanes had a formatting-only fix to one file and a sixth had
  a real one. They looked identical to git, and picking a side would have thrown
  the real fix away with nothing failing. Do not pick a side to make this go away.

  When you have resolved them:  git add -A && git commit
`)
  process.exit(2)
}

// ─────────────────────────────────────────────────────────────────────────────

const branch = git(['branch', '--show-current'], { tolerant: true })
if (!branch) die('  Detached HEAD. Check out your lane first.')
if (branch === CORE) die(`  You are ON ${CORE}. Run this from a lane, not from the trunk.`)

const dirty = git(['status', '--porcelain'], { tolerant: true }).split('\n').filter(Boolean)

say(`  lane      ${branch}`)
say(`  owner     ${git(['config', 'sahoda.owner'], { tolerant: true }) || '(undeclared)'}`)
say(`  declared  ${git(['config', 'sahoda.lane'], { tolerant: true }) || '(undeclared)'}`)

git(['fetch', 'origin', '--prune', '--quiet'], { tolerant: true })

if (MODE === 'pull') {
  if (dirty.length) {
    die(
      `  ${dirty.length} uncommitted file(s). Commit or stash first — a merge over a dirty\n` +
        `  tree is how work gets lost.\n\n` +
        dirty
          .slice(0, 10)
          .map((d) => `    ${d}`)
          .join('\n'),
    )
  }
  const behind = git(['rev-list', '--count', `HEAD..origin/${CORE}`], { tolerant: true })
  if (behind === '0') {
    say(`\n  Already level with origin/${CORE}. Nothing to pull.`)
    process.exit(0)
  }
  say(`\n  ${behind} commit(s) behind origin/${CORE}. Merging…`)
  try {
    execFileSync(
      'git',
      ['merge', '--no-ff', `origin/${CORE}`, '-m', `merge ${CORE} into ${branch}`],
      { stdio: 'ignore' },
    )
    say(`  CLEAN. Now at ${git(['rev-parse', '--short', 'HEAD'])}`)
  } catch {
    const { resolved, blocked } = resolveConflicts()
    for (const r of resolved) say(`  auto  ${r}`)
    if (blocked.length) reportBlocked(blocked)
    execFileSync('git', ['commit', '--no-edit'], { stdio: 'ignore' })
    say(`  Resolved mechanically. Now at ${git(['rev-parse', '--short', 'HEAD'])}`)
    const regen = resolved.filter((r) => r.includes('REGENERATE'))
    if (regen.length) {
      say(`\n  REGENERATE these before you gate — a merged tree's value is neither side's:`)
      for (const r of regen) say(`    ${r}`)
    }
  }
  process.exit(0)
}

if (MODE === 'push') {
  if (dirty.length) {
    die(
      `  ${dirty.length} uncommitted file(s). Commit them first.\n\n` +
        dirty
          .slice(0, 10)
          .map((d) => `    ${d}`)
          .join('\n') +
        `\n\n  A lane can hold its whole output uncommitted, and then a merge into ${CORE}\n` +
        `  succeeds having merged nothing. That has happened here.`,
    )
  }
  const ahead = git(['rev-list', '--count', `origin/${CORE}..HEAD`], { tolerant: true })
  if (ahead === '0') {
    say(`\n  Nothing to push — this lane adds no commits to ${CORE}.`)
    process.exit(0)
  }
  say(`\n  ${ahead} commit(s) to give ${CORE}.`)

  // Take wt-core FIRST. Never push a lane that has not seen the trunk.
  const behind = git(['rev-list', '--count', `HEAD..origin/${CORE}`], { tolerant: true })
  if (behind !== '0') {
    say(`  ${behind} behind — taking ${CORE} first.`)
    try {
      execFileSync(
        'git',
        ['merge', '--no-ff', `origin/${CORE}`, '-m', `merge ${CORE} before handing ${branch} over`],
        { stdio: 'ignore' },
      )
    } catch {
      const { resolved, blocked } = resolveConflicts()
      for (const r of resolved) say(`  auto  ${r}`)
      if (blocked.length) reportBlocked(blocked)
      execFileSync('git', ['commit', '--no-edit'], { stdio: 'ignore' })
    }
    say(`  merged. Now at ${git(['rev-parse', '--short', 'HEAD'])}`)
  }

  say(`\n  Pushing ${branch}…`)
  try {
    execFileSync('git', ['push', 'origin', `HEAD:${branch}`], { stdio: 'ignore' })
    say(`  pushed.`)
  } catch {
    die(
      `  push rejected — origin/${branch} moved. Another session is in this lane.\n  Do NOT force. Run: node scripts/lane-sync.mjs pull`,
    )
  }

  say(`\n  GATE BEFORE ${CORE} TAKES THIS. Not optional:`)
  say(`    pnpm turbo run typecheck lint test --force`)
  say(`    npx prettier --check .`)
  say(`  A leg under one second is a cache replay. Never pipe the gate.`)
  say(`\n  Then, only if green:`)
  say(`    git push origin HEAD:${CORE}`)
  say(`\n  Not done for you on purpose — ${CORE} is what reaches wt-web, and an ungated`)
  say(`  push into it makes every other lane's next pull red for a reason they did`)
  say(`  not cause.`)
  process.exit(0)
}

die(`  usage: node scripts/lane-sync.mjs pull|push`)
