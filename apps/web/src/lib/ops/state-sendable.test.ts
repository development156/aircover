import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { OpsIngestPayloadSchema } from '@sahoda/shared'
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
    const payload = {
      source: 'ops-sync',
      full: false,
      git: { branch: 'test', subject: 'contract check', sha: 'a'.repeat(40) },
      roadmap: roadmap.items ?? [],
      tasks: board.tasks ?? [],
      changelog: changelog.entries ?? [],
      qa: qa.runs ?? [],
      session: null,
    }

    const parsed = OpsIngestPayloadSchema.safeParse(payload)

    // Every offending path, not just the first — the whole point of the guard.
    const failures = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

    expect(failures).toEqual([])
  })
})
