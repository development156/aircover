#!/usr/bin/env node
/**
 * Writes `ops/state/board.json`'s card TEXT from the one source list (SL-062).
 *
 * `ops-cards.mjs` owns every title and detail. The board file owns everything
 * that MOVES — which column a card is in, whether it is blocked and why, its
 * commit sha, its sort. This script copies the first into the second and
 * touches nothing else, so running it can never lose live board state.
 *
 * Matching by INDEX, not by code, and only when the two lists are the same
 * length: the code is derived from array position on both sides, so if they
 * have drifted apart the safe move is to refuse rather than to guess a pairing
 * and silently rewrite the wrong card's title. That is the failure SL-060 was.
 *
 *   node scripts/ops-cards-write.mjs [--check]
 *
 * `--check` writes nothing and exits 1 if the board is out of date — for a
 * hook or CI. Without it, the board is rewritten in place.
 */

import { CARDS, cardDetail } from './lib/ops-cards.mjs'
import { readState, writeState } from './lib/ops-state.mjs'

const check = process.argv.includes('--check')
const board = readState('board')
const tasks = Array.isArray(board?.tasks) ? board.tasks : []

if (tasks.length !== CARDS.length) {
  console.error(
    `ops-cards-write: refusing to write — the board has ${tasks.length} cards and the source list ` +
      `has ${CARDS.length}. Append the missing cards to scripts/lib/ops-cards.mjs (never insert), ` +
      `then run this again.`,
  )
  process.exit(1)
}

const changed = []
const next = tasks.map((task, i) => {
  const card = CARDS[i]
  const title = card.title
  const detail = cardDetail(card)
  const roadmapCode = card.roadmap ?? null

  if (
    task.title !== title ||
    task.detail !== detail ||
    (task.roadmap_code ?? null) !== roadmapCode
  ) {
    changed.push(task.code)
  }
  return { ...task, title, detail, roadmap_code: roadmapCode }
})

if (changed.length === 0) {
  console.log('ops-cards-write: board already matches the source list.')
  process.exit(0)
}

if (check) {
  console.error(
    `ops-cards-write: ${changed.length} card(s) differ from the source list — ${changed.join(', ')}. ` +
      `Run \`node scripts/ops-cards-write.mjs\`.`,
  )
  process.exit(1)
}

writeState('board', { ...board, tasks: next })
console.log(`ops-cards-write: rewrote ${changed.length} card(s) — ${changed.join(', ')}`)
