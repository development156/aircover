import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Pool } from 'pg'
import type { PublishPostPayload } from '@sahoda/shared'
import { openDbUnderTest, type DbUnderTest } from './helpers/db-under-test'
import { createPublishStore } from '../src/publish/store'

// Proves the store's column mapping against the REAL schema. A unit test with a fake
// client would happily accept a column that does not exist — this is the only thing that
// catches drift between post_publish_logs' DDL and the row this job writes.
/**
 * Ported off `describe.skipIf(!hasLedgerEnv)` on 2026-08-20.
 *
 * The skip meant this had NEVER executed — MEASURED: apps/jobs reported 264
 * passed / 16 SKIPPED, and vitest reports a suite that ran nothing exactly as it
 * reports one that passed. It now runs against a Postgres built from the REAL
 * migration files in process, and against the live database when
 * SAHODA_ALLOW_LIVE_TESTS=1.
 */
describe('publish store (live schema)', () => {
  let db: DbUnderTest
  let pool: Pool
  let store: ReturnType<typeof createPublishStore>
  let ws: string
  let postId: string
  let variantId: string
  const created: string[] = []

  const payload = (): PublishPostPayload => ({
    workspaceId: ws,
    postId,
    variantId,
    channel: 'x',
    scheduledAt: '2026-07-19T10:00:00.000Z',
  })

  beforeAll(async () => {
    db = await openDbUnderTest()
    pool = db.pool
    store = createPublishStore({ pool })
    await pool.query(
      `delete from workspaces
       where created_by = 'user_jobs_publish' and created_at < now() - interval '1 hour'`,
    )
  })

  afterAll(async () => {
    if (created.length > 0) {
      await pool.query('delete from workspaces where id = any($1::uuid[])', [created])
    }
    await db.close()
  })

  beforeEach(async () => {
    const w = await pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('jobs-pub-test', 'jpb-' || replace(gen_random_uuid()::text, '-', ''), 'user_jobs_publish')
       returning id`,
    )
    ws = w.rows[0]!.id
    created.push(ws)

    const p = await pool.query<{ id: string }>(
      `insert into posts (workspace_id, title, body, status, channels)
       values ($1, 'test post', 'body', 'scheduled', array['x']) returning id`,
      [ws],
    )
    postId = p.rows[0]!.id

    const v = await pool.query<{ id: string }>(
      `insert into post_variants (workspace_id, post_id, channel, body)
       values ($1, $2, 'x', 'Fresh samosas from 4pm today.') returning id`,
      [ws, postId],
    )
    variantId = v.rows[0]!.id
  })

  afterEach(async () => {
    if (ws) await pool.query('delete from workspaces where id = $1', [ws])
    ws = ''
  })

  it('loads the variant the payload points at', async () => {
    const variant = await store.loadVariant(payload())

    expect(variant).toMatchObject({ variantId, body: 'Fresh samosas from 4pm today.' })
    expect(variant!.media).toEqual([])
  })

  it('returns null when the variant does not exist', async () => {
    const variant = await store.loadVariant({
      ...payload(),
      variantId: '00000000-0000-4000-8000-000000000000',
    })

    expect(variant).toBeNull()
  })

  it('writes a succeeded log row with every column the job sets', async () => {
    await store.writeLog({
      workspaceId: ws,
      postId,
      variantId,
      connectionId: null,
      channel: 'x',
      attempt: 1,
      status: 'succeeded',
      mode: 'fixture',
      platformPostId: 'fixture-1',
      permalink: 'fixture://x/fixture-1',
      error: null,
      jobRunId: 'run_abc',
      publishedAt: '2026-07-19T10:00:05.000Z',
    })

    const r = await pool.query(
      'select status, mode, platform_post_id, permalink, attempt, job_run_id, error from post_publish_logs where post_id = $1',
      [postId],
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      status: 'succeeded',
      mode: 'fixture',
      platform_post_id: 'fixture-1',
      permalink: 'fixture://x/fixture-1',
      attempt: 1,
      job_run_id: 'run_abc',
      error: null,
    })
  })

  it('writes the typed error shape on a failed attempt', async () => {
    await store.writeLog({
      workspaceId: ws,
      postId,
      variantId,
      connectionId: null,
      channel: 'x',
      attempt: 2,
      status: 'failed',
      mode: 'live',
      platformPostId: null,
      permalink: null,
      error: { code: 'RATE_LIMITED', classification: 'transient', message: 'HTTP 429' },
      jobRunId: 'run_abc',
      publishedAt: null,
    })

    const r = await pool.query<{ error: { code: string; classification: string } }>(
      'select error from post_publish_logs where post_id = $1',
      [postId],
    )
    expect(r.rows[0]!.error).toMatchObject({ code: 'RATE_LIMITED', classification: 'transient' })
  })

  it('appends one row per attempt rather than updating (the table is append-only)', async () => {
    const base = {
      workspaceId: ws,
      postId,
      variantId,
      connectionId: null,
      channel: 'x' as const,
      status: 'failed' as const,
      mode: 'live' as const,
      platformPostId: null,
      permalink: null,
      error: { code: 'SERVER_ERROR', classification: 'transient' as const, message: 'HTTP 503' },
      jobRunId: 'run_abc',
      publishedAt: null,
    }
    await store.writeLog({ ...base, attempt: 1 })
    await store.writeLog({ ...base, attempt: 2 })

    const r = await pool.query<{ attempt: number }>(
      'select attempt from post_publish_logs where post_id = $1 order by attempt',
      [postId],
    )
    expect(r.rows.map((x) => x.attempt)).toEqual([1, 2])
  })

  it('marks the variant published with its platform identifiers', async () => {
    await store.markVariant({
      workspaceId: ws,
      variantId,
      publishStatus: 'published',
      platformPostId: 'x-999',
      permalink: 'https://x.com/i/status/999',
      lastError: null,
    })

    const r = await pool.query<{
      publish_status: string
      platform_post_id: string
      permalink: string
    }>('select publish_status, platform_post_id, permalink from post_variants where id = $1', [
      variantId,
    ])
    expect(r.rows[0]).toMatchObject({
      publish_status: 'published',
      platform_post_id: 'x-999',
      permalink: 'https://x.com/i/status/999',
    })
  })

  it('marks the variant failed with the error for the UI to read', async () => {
    await store.markVariant({
      workspaceId: ws,
      variantId,
      publishStatus: 'failed',
      lastError: { code: 'UNAUTHORIZED', classification: 'permanent', message: 'HTTP 401' },
    })

    const r = await pool.query<{ publish_status: string; last_error: { code: string } }>(
      'select publish_status, last_error from post_variants where id = $1',
      [variantId],
    )
    expect(r.rows[0]!.publish_status).toBe('failed')
    expect(r.rows[0]!.last_error).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('expires a connection so the UI can raise a reconnect CTA', async () => {
    const c = await pool.query<{ id: string }>(
      `insert into connections (workspace_id, platform, status, external_account)
       values ($1, 'x', 'active', '{"id":"x-account-1"}'::jsonb) returning id`,
      [ws],
    )
    const connectionId = c.rows[0]!.id

    await store.markConnection(connectionId, 'expired')

    const r = await pool.query<{ status: string }>('select status from connections where id = $1', [
      connectionId,
    ])
    expect(r.rows[0]!.status).toBe('expired')
  })

  it('loads a connection with its sealed secret left sealed', async () => {
    const c = await pool.query<{ id: string }>(
      `insert into connections (workspace_id, platform, status, external_account)
       values ($1, 'x', 'active', '{"id":"x-account-1"}'::jsonb) returning id`,
      [ws],
    )
    await pool.query(
      `insert into connection_secrets (connection_id, access_token_enc)
       values ($1, '{"iv":"a","tag":"b","data":"c"}'::jsonb)`,
      [c.rows[0]!.id],
    )

    const conn = await store.loadConnection(payload())

    expect(conn).toMatchObject({
      connectionId: c.rows[0]!.id,
      externalAccountId: 'x-account-1',
      status: 'active',
    })
    // Still sealed — the store never opens it.
    expect(conn!.sealedAccessToken).toMatchObject({ iv: 'a', tag: 'b', data: 'c' })
  })
})
