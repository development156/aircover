/**
 * THE RULE: an unsent QA run is never deleted, never silently, and never at the
 * cost of wedging the queue shut instead (SL-084).
 *
 * Each mutant is a way the 140-run loss comes back. They are grouped by which
 * half of the fix they attack, because the two halves only work together —
 * removing the eviction without bounding the payload turns a queue that shreds
 * into a queue that permanently 400s, which is strictly worse.
 *
 *   node scripts/mutation-check.mjs mutations/qa-queue-durability.mjs
 */
export default {
  cwd: '.',
  command: 'pnpm vitest run',
  mutants: [
    // ── the eviction itself ──────────────────────────────────────────────────
    {
      name: 'the ring buffer is back — the oldest unsent run is dropped to make room',
      file: 'scripts/lib/ops-queue.mjs',
      find: '    items: [...queued, ...accepted],',
      replace: '    items: [...queued, ...arriving].slice(-ceiling),',
    },
    {
      name: 'the ceiling is one row loose, so the queue overflows what the schema allows',
      file: 'scripts/lib/ops-queue.mjs',
      find: '  const room = Math.max(0, ceiling - queued.length)',
      replace: '  const room = Math.max(0, ceiling - queued.length + 1)',
    },
    {
      name: 'the ceiling is one row tight, refusing work while a slot is still free',
      file: 'scripts/lib/ops-queue.mjs',
      find: '  const room = Math.max(0, ceiling - queued.length)',
      replace: '  const room = Math.max(0, ceiling - queued.length - 1)',
    },

    // ── the loudness, which is the whole of requirement 2 ────────────────────
    {
      name: 'the refusal decides it has nothing to say',
      file: 'scripts/lib/ops-queue.mjs',
      find: '  if (!refused) return null',
      replace: '  return null',
    },
    {
      name: 'the hook computes the warning and never prints it',
      file: 'scripts/ops-hook-bash.mjs',
      find: '  if (warning) console.error(warning)\n',
      replace: '',
    },
    {
      name: 'the hook reports a refused run as recorded',
      file: 'scripts/ops-hook-bash.mjs',
      find: '  const accepted = recordQaRuns(entries)\n  if (accepted > 0) {',
      replace: '  const accepted = recordQaRuns(entries)\n  if (true) {',
    },
    {
      name: 'a backlog left on disk is not mentioned',
      file: 'scripts/ops-sync.mjs',
      find: '  const waiting = ',
      replace: '  const waiting = []\n  const unusedWaiting = ',
    },

    // ── the wedge the eviction was hiding ───────────────────────────────────
    {
      name: 'the payload is unbounded again — 201 rows is a permanent 400 on everything',
      file: 'scripts/lib/ops-queue.mjs',
      find: '  return Array.isArray(items) ? items.slice(0, max) : []',
      replace: '  return Array.isArray(items) ? items : []',
    },

    // ── the drain, which is where an ack turns into a delete ────────────────
    {
      name: 'the ack wipes the whole outbox, the way clearPending used to',
      file: 'scripts/lib/ops-state.mjs',
      find: '  const fromBaseline = Math.min(count, baseline.length - drained)',
      replace: '  const fromBaseline = baseline.length - drained',
    },

    // ── where the drain is WRITTEN, which is a different failure ────────────
    //
    // Added 2026-08-31. Both of these were the shipped behaviour until then,
    // and neither loses a row: they put the queue's churn into a TRACKED file
    // that `.githooks/pre-commit` refuses by name, so the working tree carried
    // 2,121 deleted lines that could not be committed and would not go away.
    // A queue that is durable and unusable is still a defect.
    {
      name: 'the drain rewrites the tracked pending file again',
      file: 'scripts/lib/ops-state.mjs',
      find: '  writeOverlay(repoRoot, overlay)\n}\n\n/** Stable-enough id',
      replace:
        '  writeState(name, { ...readState(name), [ROWS[name]]: baseline.slice(nextDrained) })\n' +
        '  writeOverlay(repoRoot, overlay)\n}\n\n/** Stable-enough id',
    },
    {
      name: 'a QA run is appended to the tracked file again',
      file: 'scripts/lib/ops-state.mjs',
      find: '  if (!OVERLAY_APPENDS[name]) {',
      replace: '  if (true) {',
    },
    {
      name: 'the sync drops more than it sent',
      file: 'scripts/ops-sync.mjs',
      find: "  dropSent('qa', payload.qa.length)",
      replace: "  dropSent('qa', 100000)",
    },
  ],
}
