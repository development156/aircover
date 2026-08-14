/**
 * How much of a pending queue is kept, and how much goes out at a time (doc 13 §9.1).
 *
 * ── WHY THIS FILE EXISTS (SL-084) ───────────────────────────────────────────
 * `recordQaRuns` in ops-hook-bash.mjs used to end with `.slice(-200)`. Read as a
 * ring buffer that is a reasonable thing to write; read against what the queue is
 * FOR, it is a shredder. `qa.pending.json` is not a log of recent activity — it
 * is the outbox. Entries leave it only when the server has acknowledged them, so
 * every entry still in the file is by definition UNSENT.
 *
 * Pointed at a host that answered `DEPLOYMENT_NOT_FOUND` for a week, the drain
 * never ran, the queue sat at its 200 ceiling, and each new run silently deleted
 * the oldest unsent one. 140 QA runs were destroyed by the code whose job was to
 * preserve them, and nothing anywhere said so.
 *
 * ── THE TWO NUMBERS ARE DIFFERENT NUMBERS ───────────────────────────────────
 * The old 200 was doing two unrelated jobs at once, which is why fixing it by
 * raising it would not have worked either:
 *
 *   · WIRE_BATCH_MAX — how many rows one POST may carry. Owned by the server:
 *     `OpsIngestPayloadSchema.qa` is `.max(200)` and the route is `.strict()`,
 *     so 201 rows is a 400 for the WHOLE payload — board, roadmap and changelog
 *     with it. `ingestVerdict` correctly calls a 400 permanent, so simply
 *     removing the cap would have replaced a queue that shreds with a queue that
 *     wedges shut forever. This number may not be raised from here.
 *
 *   · QUEUE_CEILING — how much unsent work is kept on disk. Owned by us, and
 *     nothing about the wire or the database wants it to be 200.
 *
 * ── WHY THE CEILING IS 1000, AND WHY IT REFUSES RATHER THAN EVICTS ──────────
 * A queue at its ceiling means the drain is broken; a healthy queue is empty
 * seconds after anything enters it. So the ceiling is a backstop for a fault
 * that is already being announced elsewhere (ops-sync prints THE BOARD WAS NOT
 * UPDATED on every failed post), not the primary alarm.
 *
 * 1000 is seven times the 140 that were lost, and bounded by bytes rather than
 * ambition: a QA row carries `details` — the tail of a test run, up to 4000
 * characters — so 1000 rows is a few megabytes worst case for a file that is
 * committed to git AND rewritten by the repo's PostToolUse formatter after every
 * single tool call. 2000 was the first choice and is the wrong one for that
 * reason alone.
 *
 * At the ceiling the NEW run is refused and the refusal is loud. That direction
 * is deliberate: the queued rows are the irreplaceable record, while the run
 * being refused is still on screen in the scrollback of the session that just
 * produced it. Evicting the old to make room for the new is precisely the trade
 * that lost the 140.
 */

/** One POST's worth. Mirrors `OpsIngestPayloadSchema.qa`/`.changelog` in packages/shared. */
export const WIRE_BATCH_MAX = 200

/** How much unsent work `*.pending.json` will hold before it starts refusing. */
export const QUEUE_CEILING = 1000

/**
 * Append to a pending queue without ever dropping something already queued.
 *
 * @param {unknown} existing  whatever was on disk — a non-array reads as empty
 * @param {unknown[]} incoming  rows to add, oldest first
 * @param {number} ceiling
 * @returns {{items: unknown[], accepted: number, refused: number, atCeiling: boolean}}
 */
export function appendCapped(existing, incoming, ceiling = QUEUE_CEILING) {
  const queued = Array.isArray(existing) ? existing : []
  const arriving = Array.isArray(incoming) ? incoming : []

  const room = Math.max(0, ceiling - queued.length)
  const accepted = arriving.slice(0, room)

  return {
    items: [...queued, ...accepted],
    accepted: accepted.length,
    refused: arriving.length - accepted.length,
    atCeiling: arriving.length > accepted.length,
  }
}

/** The oldest rows, which is what a FIFO outbox sends first. */
export function takeBatch(items, max = WIRE_BATCH_MAX) {
  return Array.isArray(items) ? items.slice(0, max) : []
}

/**
 * What one sync sends, and what it will leave behind.
 *
 * Pure, and separate from ops-sync.mjs for the reason ops-ingest-verdict.mjs is:
 * the decision can then be pinned by a test that opens no socket. The script
 * around it does the I/O and nothing else.
 *
 * @returns {{changelog: unknown[], qa: unknown[], backlog: {changelog: number, qa: number}}}
 */
export function planSync({ changelog, qa }) {
  const changelogQueued = Array.isArray(changelog) ? changelog : []
  const qaQueued = Array.isArray(qa) ? qa : []

  const changelogBatch = takeBatch(changelogQueued)
  const qaBatch = takeBatch(qaQueued)

  return {
    changelog: changelogBatch,
    qa: qaBatch,
    backlog: {
      changelog: changelogQueued.length - changelogBatch.length,
      qa: qaQueued.length - qaBatch.length,
    },
  }
}

/**
 * The block printed when work is refused.
 *
 * Built here rather than inline at the call site so a test can assert that the
 * refusal is announced at all — a warning that no test names is a warning that
 * can be deleted without anything going red, and requirement 2 of this card is
 * entirely about not being silent.
 *
 * Returns null when nothing was refused, so "did this need to shout" is a
 * decision made in a pure function and not a condition spread across two files.
 *
 * @returns {string | null}
 */
export function ceilingWarning({ queue, refused, queued, ceiling = QUEUE_CEILING }) {
  if (!refused) return null

  return [
    `ops: ${refused} ${queue} ${refused === 1 ? 'entry was' : 'entries were'} REFUSED — the queue is full (${queued}/${ceiling}).`,
    `     Nothing queued was deleted to make room. What was refused is only in this scrollback.`,
    `     A full queue means the drain is broken: these rows leave ops/state ONLY when the`,
    `     dashboard acknowledges them, so the ingest endpoint has been unreachable or refusing`,
    `     for a long time. Run \`pnpm ops:sync\` and fix what it prints before doing anything else.`,
  ].join('\n')
}
