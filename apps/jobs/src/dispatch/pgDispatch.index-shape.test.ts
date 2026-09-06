import { describe, it, expect, vi } from 'vitest'
import { DISPATCHABLE_STATUSES } from '@sahoda/shared'

import { createDispatchStore, type PgQueryable } from './pgDispatch'

/**
 * The pickup query's TEXT, pinned to the predicate its index expects.
 *
 * ── WHY THE TEXT AND NOT THE ROWS ────────────────────────────────────────────
 * `posts_due_idx` is `(scheduled_at) where status in ('approved', 'scheduled')
 * and scheduled_at is not null`. A partial index is used only when the planner
 * can prove the query's WHERE implies that predicate, from the SQL text alone;
 * the rows a fake returns cannot tell you whether that proof succeeds. So this
 * asserts the three things the proof needs — the literal status list, the
 * not-null clause, and the order — and that the literal equals the shared
 * constant the migration was written from. If `DISPATCHABLE_STATUSES` ever
 * changes, this fails, and the failure says "the index predicate needs a
 * migration too", which is the right person's problem to be told about.
 *
 * Same idea as `schedule.test.ts`'s parity check in @sahoda/shared: one list,
 * every copy proven equal to it.
 */

function recordingPool() {
  const texts: string[] = []
  const pool: PgQueryable = {
    query: vi.fn(async (text: string) => {
      texts.push(text.replace(/\s+/g, ' ').toLowerCase())
      return { rows: [], rowCount: 0 }
    }),
  } as unknown as PgQueryable
  return { pool, texts }
}

/** The predicate exactly as `posts_due_idx` declares it. */
const INDEX_PREDICATE = "status in ('approved', 'scheduled') and scheduled_at is not null"

describe('the pickup query is shaped for posts_due_idx', () => {
  it("the shared gate is exactly the index's status list", () => {
    // The migration typed these two by hand. This is the only place that says so.
    expect([...DISPATCHABLE_STATUSES]).toEqual(['approved', 'scheduled'])
  })

  it('carries the partial-index predicate verbatim, as a literal', async () => {
    const { pool, texts } = recordingPool()

    await createDispatchStore({ pool }).listCandidates()

    const sql = texts[0]!
    expect(sql).toContain(`p.${INDEX_PREDICATE.replace('and ', 'and p.')}`)
    // A parameterised status list is the shape that CANNOT use the index.
    expect(sql).not.toMatch(/status = any\(\$/)
  })

  it('orders the due set by scheduled_at, which is the index column', async () => {
    const { pool, texts } = recordingPool()

    await createDispatchStore({ pool }).listCandidates()

    expect(texts[0]).toContain('order by p.scheduled_at, p.id limit $1')
  })

  it('reads each variant’s latest log by (variant_id, created_at desc)', async () => {
    const { pool, texts } = recordingPool()

    await createDispatchStore({ pool }).listCandidates()

    // Two laterals, both the shape `post_publish_logs_variant_created_idx` answers
    // with a single probe. Counted, so a third read of a different shape is noticed.
    const probes = texts[0]!.match(
      /where pl\.variant_id = v\.id[^)]*order by pl\.created_at desc limit 1/g,
    )
    expect(probes).toHaveLength(2)
  })
})
