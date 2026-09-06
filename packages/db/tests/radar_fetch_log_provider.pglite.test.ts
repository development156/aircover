import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * `radar_fetch_log.provider` admits 'tinyfish' (20260906120000) and still
 * admits 'zyte' for the rows already written; anything else is refused by the
 * CHECK, which is the guard that keeps a typo from becoming a provider.
 *
 * Proven red by reverting the migration: the first case then fails with
 * `violates check constraint "radar_fetch_log_provider_check"`.
 */
let db: PGlite
let sourceId: string

beforeAll(async () => {
  db = await bootFullSchema()
  const competitor = await db.query<{ id: string }>(
    `insert into competitors (display_name) values ('probe') returning id`,
  )
  const source = await db.query<{ id: string }>(
    `insert into competitor_sources (competitor_id, kind, locator, cadence)
     values ($1::uuid, 'website', 'probe.example', 'weekly') returning id`,
    [competitor.rows[0]!.id],
  )
  sourceId = source.rows[0]!.id
}, 120_000)

afterAll(async () => {
  await db.close()
})

async function insertProvider(
  provider: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await db.query(
      `insert into radar_fetch_log (source_id, mode, provider, subscriber_count, cost_micros)
       values ($1::uuid, 'render', $2, 1, 0)`,
      [sourceId, provider],
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

describe('radar_fetch_log.provider after the TinyFish migration', () => {
  it("admits 'tinyfish', the rendered rung from 2026-09-06 on", async () => {
    expect(await insertProvider('tinyfish')).toEqual({ ok: true })
  })

  it("still admits 'zyte', because the rows already written are history", async () => {
    expect(await insertProvider('zyte')).toEqual({ ok: true })
  })

  it('refuses a name nothing writes, by the constraint and by its name', async () => {
    const out = await insertProvider('firecrawl')
    expect(out.ok).toBe(false)
    expect((out as { message: string }).message).toMatch(/radar_fetch_log_provider_check/)
  })
})
