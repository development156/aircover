#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { warn } from './lib/ops-env.mjs'
import { readState, writeState, clientId } from './lib/ops-state.mjs'
import { hasDbCredentials, select } from './lib/ops-rest.mjs'
import { taskCodesIn } from './lib/ops-classify.mjs'

/**
 * The verbs behind /task, /qa-log, /log-change and the /ship gate (doc 13 §9.5).
 *
 * These edit ops/state/*.json and sync. They exist as a script rather than as
 * prose in a command file so the board cannot drift on a typo: a slash command
 * that asks an agent to hand-edit JSON is a slash command that eventually writes
 * `in_progres`.
 *
 *   node scripts/ops-card.mjs task SL-11 start|review|done|block ["note"]
 *   node scripts/ops-card.mjs qa   SL-11 pass|fail|blocked "plain summary" [suite]
 *   node scripts/ops-card.mjs change "title" "plain summary" [kind]
 *   node scripts/ops-card.mjs ship-check
 *
 * Unlike the hooks, these DO exit non-zero on refusal. A hook must never block
 * work; a command the user typed must tell them it did not do what they asked.
 */

const [verb, ...rest] = process.argv.slice(2)

function die(message) {
  console.error(`ops: ${message}`)
  process.exit(1)
}

function normalise(code) {
  const [found] = taskCodesIn(code ?? '')
  return found ?? null
}

function sync() {
  try {
    execFileSync(process.execPath, [new URL('./ops-sync.mjs', import.meta.url).pathname], {
      stdio: 'inherit',
      timeout: 15000,
    })
  } catch {
    /* ops-sync reports its own failures and exits 0 */
  }
}

/** The latest recorded verdict for a card, or null when nothing is known. */
async function latestQaStatus(code) {
  if (!hasDbCredentials()) return null
  try {
    const rows = await select(
      'ops_qa_runs',
      `select=status,started_at&task_code=eq.${encodeURIComponent(code)}&order=started_at.desc&limit=1`,
    )
    return rows[0]?.status ?? null
  } catch {
    return null
  }
}

async function cmdTask() {
  const code = normalise(rest[0])
  const action = rest[1]
  const note = rest[2] ?? null
  if (!code) die('usage: task SL-11 start|review|done|block ["note"]')

  const board = readState('board')
  const task = (board.tasks ?? []).find((t) => t?.code === code)
  if (!task) {
    // Doc 13 §9.4: new work goes on the board BEFORE it is worked. Inventing the
    // card here would paper over exactly the process miss the rule exists for.
    die(`${code} is not on the board. Add the card first, then move it.`)
  }

  const COLUMN = { start: 'in_progress', review: 'review', done: 'done' }

  if (action === 'block') {
    if (!note) die('blocking needs a reason: task SL-11 block "why"')
    task.blocked = true
    task.blocked_reason = note
  } else if (COLUMN[action]) {
    if (action === 'done') {
      const qa = await latestQaStatus(code)
      if (qa === 'fail') {
        // Doc 13 §11: a task cannot sit in Done with its latest linked run red.
        die(`${code} has a failing QA run. Fix it or record a passing run first.`)
      }
      if (qa === null) {
        warn(`${code} has no QA run recorded — moving it to done on your word alone.`)
      }
    }
    task.board_column = COLUMN[action]
    task.blocked = false
    task.blocked_reason = null

    /**
     * A MOVE NOTE NO LONGER OVERWRITES THE CARD. Fixed 2026-08-01 (SL-063).
     *
     * This line used to read `if (note) task.detail = note`, which REPLACED the
     * card's entire detail with one sentence about the move. That is how
     * SL-013…018 came to be described as "Shell, sub-nav and rail item render;
     * typecheck+lint green" — a note from a move, standing where the card's
     * reasoning used to be. SL-060 recorded eleven cards "carrying stale or
     * empty details" and read it as seed drift; for at least six of them this
     * command is the mechanism, and it destroyed the text silently, with an
     * exit 0 and a cheerful arrow.
     *
     * `detail` is now owned by `scripts/lib/ops-cards.mjs` and written by
     * `ops-cards-write.mjs`, so clobbering it here would also be overwritten
     * back — the note would be lost twice over.
     *
     * The note is not silently dropped either; it is printed with the one line
     * saying where a durable note actually belongs. There is no per-move note
     * column, and inventing one out of a content field is what caused this.
     */
    if (note) {
      console.log(`ops: note — ${note}`)
      console.log(
        'ops: notes are not stored on the card. Use /log-change for anything a reader ' +
          'should see, or /qa-log to record what you verified.',
      )
    }
  } else {
    die(`unknown action "${action}". Use start, review, done or block.`)
  }

  writeState('board', board)
  console.log(`ops: ${code} → ${task.blocked ? 'blocked' : task.board_column}`)
  sync()
}

function cmdQa() {
  const code = normalise(rest[0])
  const status = rest[1]
  const summary = rest[2]
  const suite = rest[3] ?? 'manual'

  if (!code || !['pass', 'fail', 'blocked'].includes(status) || !summary) {
    die('usage: qa SL-11 pass|fail|blocked "plain summary" [suite]')
  }
  if (summary.trim().length < 10) {
    die('the summary has to say something a non-technical owner can read.')
  }

  const qa = readState('qa')
  const now = new Date().toISOString()
  qa.runs = [
    ...(Array.isArray(qa.runs) ? qa.runs : []),
    {
      client_id: clientId('qa'),
      task_code: code,
      kind: 'manual',
      suite,
      status,
      summary_plain: summary,
      actor: 'claude',
      started_at: now,
      finished_at: now,
    },
  ]
  writeState('qa', qa)
  console.log(`ops: QA ${suite} ${status} on ${code}`)
  sync()
}

function cmdChange() {
  const [title, summary, kind = 'changed', codes = ''] = rest
  if (!title || !summary) die('usage: change "title" "plain summary" [kind] [SL-11,SL-12]')
  if (title.length > 80) die('the title has to fit in 80 characters.')
  if (summary.trim().length < 10) die('summary_plain must read as plain English, not a stub.')

  // Cheap guard on the rule the schema cannot express (doc 13 §8): no jargon,
  // no file paths. It catches the obvious slip, not every one.
  const JARGON =
    /\b(?:refactor|RLS|zod|RPC|middleware|schema|migration|idempotenc)\w*\b|\/\w+\.\w{2,4}\b/i
  if (JARGON.test(summary)) {
    die('summary_plain reads technical. Write what a non-technical owner would notice.')
  }

  const changelog = readState('changelog')
  changelog.entries = [
    ...(Array.isArray(changelog.entries) ? changelog.entries : []),
    {
      client_id: clientId('cl'),
      title,
      summary_plain: summary,
      kind,
      // Codes are passed explicitly rather than scraped from the prose: a
      // plain-English summary written for a non-technical owner should NOT
      // contain ticket numbers (doc 13 §8), so scraping it found nothing and
      // left every entry unlinked — which in turn made the /ship changelog
      // check vacuous.
      task_codes: taskCodesIn(`${codes} ${title}`),
      happened_at: new Date().toISOString(),
    },
  ]
  writeState('changelog', changelog)
  console.log(`ops: changelog entry queued (${kind}) — author is assigned server-side`)
  sync()
}

/** What has this branch shipped that main has not seen? */
function shippedCodes() {
  for (const base of ['origin/main', 'main']) {
    try {
      const log = execFileSync('git', ['log', `${base}..HEAD`, '--format=%s%n%b'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return taskCodesIn(log)
    } catch {
      continue
    }
  }
  return []
}

async function cmdShipCheck() {
  const codes = shippedCodes()
  if (codes.length === 0) {
    console.log('ops: no SL-### codes in the commits ahead of main — nothing to check.')
    return
  }

  const board = readState('board')
  const known = new Map((board.tasks ?? []).map((t) => [t?.code, t]))
  const changelog = readState('changelog')
  const queued = new Set((changelog.entries ?? []).flatMap((entry) => entry?.task_codes ?? []))

  const problems = []
  for (const code of codes) {
    const task = known.get(code)
    if (!task) {
      problems.push(`${code} is committed but has no card on the board.`)
      continue
    }
    if (task.board_column === 'todo') {
      problems.push(`${code} is committed but still sits in To Do.`)
    }
    const qa = await latestQaStatus(code)
    if (qa === 'fail') problems.push(`${code} has a failing QA run attached.`)
    if (qa === null) problems.push(`${code} has no QA run — nothing has verified it.`)
  }

  let recorded = new Set()
  if (hasDbCredentials()) {
    try {
      const rows = await select('ops_changelog', 'select=task_codes&order=seq.desc&limit=200')
      recorded = new Set(rows.flatMap((row) => row.task_codes ?? []))
    } catch {
      /* fall through — a missing read is not evidence of a missing entry */
    }
  }
  if (!codes.some((code) => queued.has(code) || recorded.has(code))) {
    problems.push('none of the shipped cards has a changelog entry.')
  }

  if (problems.length > 0) {
    console.error('ops: /ship refuses —')
    for (const problem of problems) console.error(`  · ${problem}`)
    process.exit(1)
  }
  console.log(`ops: ship-check passed for ${codes.join(', ')}`)
}

const VERBS = { task: cmdTask, qa: cmdQa, change: cmdChange, 'ship-check': cmdShipCheck }

const run = VERBS[verb]
if (!run) die(`unknown verb "${verb ?? ''}". Use task, qa, change or ship-check.`)

await Promise.resolve(run()).catch((error) => {
  die(error instanceof Error ? error.message : String(error))
})
