import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { OpsIngestPayloadSchema, OPS_QUEUE_CEILING, OPS_WIRE_BATCH_MAX } from '@sahoda/shared'
import { describe, expect, it } from 'vitest'

/**
 * The queued ops state must always be SENDABLE (SL-080).
 *
 * The ingest route parses the whole payload with `.strict()`, so one card over a
 * cap rejects all 83 — the board, the changelog and the QA record stop moving
 * together, for a reason no individual file looks guilty of.
 *
 * That is precisely how this went unnoticed. The sync had been posting to a host
 * that answers `DEPLOYMENT_NOT_FOUND`, so every failure was attributed to the
 * dead address. When the address was corrected the very first real sync failed
 * again, on a `detail` field that had been too long for days — a second defect
 * standing directly behind the first, invisible while nothing could reach a
 * server that would validate.
 *
 * And the 400 only echoes issue PATHS, truncated by the error line, so fixing it
 * from the response means one violation per round trip. This checks the whole
 * payload at once, on every run, before it is ever sent.
 *
 * Reaching out of apps/web to the repo root follows `card-copy.test.ts`, which
 * reads `scripts/lib/ops-cards.mjs` the same way and for the same reason: the
 * rule belongs to the state files, and this is where a test can run.
 */
const ROOT = resolve(import.meta.dirname, '../../../../..')
const state = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(ROOT, 'ops/state', `${name}.json`), 'utf8'))

describe('the queued ops state can actually be sent', () => {
  it('satisfies the ingest contract the deployed route enforces', () => {
    const board = state('board') as { tasks?: unknown[] }
    const roadmap = state('roadmap') as { items?: unknown[] }
    const changelog = state('changelog.pending') as { entries?: unknown[] }
    const qa = state('qa.pending') as { runs?: unknown[] }

    // Mirrors buildPayload() in scripts/ops-sync.mjs. `git` and `session` are
    // synthesised because they come from the environment, not from the files.
    //
    // The pending queues are SLICED here, exactly as pendingBatches() slices
    // them (SL-084). Before that change the sync sent each queue whole, so this
    // guard checked the whole file and was right to. It must not keep doing so:
    // the files are outboxes that legitimately hold more than one POST's worth
    // when the endpoint has been down, and failing the gate on a backlog would
    // punish the durability that replaced the eviction.
    const payload = {
      source: 'ops-sync',
      full: false,
      git: { branch: 'test', subject: 'contract check', sha: 'a'.repeat(40) },
      roadmap: roadmap.items ?? [],
      tasks: board.tasks ?? [],
      changelog: (changelog.entries ?? []).slice(0, OPS_WIRE_BATCH_MAX),
      qa: (qa.runs ?? []).slice(0, OPS_WIRE_BATCH_MAX),
      session: null,
    }

    const parsed = OpsIngestPayloadSchema.safeParse(payload)

    // Every offending path, not just the first — the whole point of the guard.
    const failures = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

    expect(failures).toEqual([])
  })

  /**
   * The batch guard above only proves the FIRST 200 rows are sendable, so
   * something still has to notice a queue that is quietly filling up. The
   * writer's ceiling is that something, and this is where the file is checked
   * against it.
   */
  it('holds no more unsent work than the writer will accept', () => {
    const changelog = state('changelog.pending') as { entries?: unknown[] }
    const qa = state('qa.pending') as { runs?: unknown[] }

    expect({
      changelog: (changelog.entries ?? []).length <= OPS_QUEUE_CEILING,
      qa: (qa.runs ?? []).length <= OPS_QUEUE_CEILING,
    }).toEqual({ changelog: true, qa: true })
  })

  /**
   * `scripts/` is plain Node with no build step and cannot import from
   * `@sahoda/shared`, so the wire limit is written down twice. Two copies of a
   * number that MUST agree is exactly the drift that let the writer's cap and
   * the wire's cap be the same 200 for different reasons — so the copies are
   * pinned to each other here, in a suite the gate actually runs.
   *
   * Reading a `.mjs` from a TS test follows `card-copy.test.ts`.
   */
  it('agrees with the copy of the wire limit that the sync script uses', () => {
    const source = readFileSync(resolve(ROOT, 'scripts/lib/ops-queue.mjs'), 'utf8')
    const declared = (name: string): number | null => {
      const match = new RegExp(`export const ${name} = (\\d+)`).exec(source)
      return match ? Number(match[1]) : null
    }

    expect({
      wire: declared('WIRE_BATCH_MAX'),
      ceiling: declared('QUEUE_CEILING'),
    }).toEqual({ wire: OPS_WIRE_BATCH_MAX, ceiling: OPS_QUEUE_CEILING })
  })
})
