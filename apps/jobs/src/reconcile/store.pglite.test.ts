import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createReconcileStore } from './store'
import type { ConnectionToCheck } from './sweep'

/**
 * The two statements that decide whether a dead account stays dead, executed.
 *
 * ── WHY THIS IS EXECUTED AND NOT REVIEWED ────────────────────────────────────
 * `applyAccountFacts` and `listConnectionsToCheck` are a pair, and the pairing is
 * the whole of the "permanent, non-retryable" rule: the first moves a flagged
 * connection to `expired`, the second only ever reads `active`. Neither is
 * meaningful alone, and a `case when` or a `where` that reads correctly can still
 * be wrong — the publish lease next door was exactly that for weeks.
 *
 * PGlite is Postgres compiled to WASM, in-process. Real `jsonb ||`, real
 * `coalesce`, real `case`. The DDL below is the columns these statements touch, so
 * drift from the real `connections` table is still the live suite's job.
 */

const DDL = `
  create table connections (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    platform text not null,
    status text not null default 'active',
    external_account jsonb not null default '{}'::jsonb,
    expires_at timestamptz,
    last_checked_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table zernio_profiles (
    workspace_id uuid primary key,
    profile_id text not null
  );
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null,
    workspace_id uuid not null,
    publish_status text not null default 'pending',
    publish_claimed_at timestamptz,
    platform_post_id text,
    permalink text
  );
  create table post_publish_logs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    variant_id uuid not null,
    connection_id uuid,
    channel text not null,
    attempt int not null,
    status text not null,
    mode text not null,
    platform_post_id text,
    permalink text,
    error jsonb,
    job_run_id text,
    published_at timestamptz,
    idempotency_key text,
    created_at timestamptz not null default now()
  );
  create function refuse_raise_permalink() returns trigger language plpgsql as $$
  begin
    if new.permalink = 'raise://' then raise exception 'TEST_REFUSED_UPDATE'; end if;
    return new;
  end $$;
  create trigger refuse_raise_permalink before update on post_variants
    for each row execute function refuse_raise_permalink();
`

const WS = '11111111-1111-4111-8111-111111111111'
const PROFILE = '0123456789abcdef01234567'
const ACCOUNT = 'aabbccddeeff001122334455'

function poolOver(db: PGlite): Pool {
  const query = async (text: string, params?: unknown[]) => {
    const r = await db.query(text, params as unknown[])
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
  }
  return { query, connect: async () => ({ query, release: () => {} }) } as unknown as Pool
}

const POST = '22222222-2222-4222-8222-222222222222'
const PROVIDER_ID = '0123456789abcdef01234567'

describe('the reconcile store (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createReconcileStore>
  let connectionId: string

  const connection = (): ConnectionToCheck => ({
    connectionId,
    workspaceId: WS,
    profileId: PROFILE,
    accountId: ACCOUNT,
    platform: 'instagram',
  })

  const readRow = async (): Promise<{
    status: string
    expires_at: string | null
    last_checked_at: string | null
    external_account: Record<string, unknown>
  }> => {
    const r = await db.query<{
      status: string
      expires_at: string | null
      last_checked_at: string | null
      external_account: Record<string, unknown>
    }>(
      'select status, expires_at, last_checked_at, external_account from connections where id = $1',
      [connectionId],
    )
    return r.rows[0]!
  }

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    store = createReconcileStore({ pool: poolOver(db) })
    await db.query('insert into zernio_profiles (workspace_id, profile_id) values ($1, $2)', [
      WS,
      PROFILE,
    ])
    const r = await db.query<{ id: string }>(
      `insert into connections (workspace_id, platform, status, external_account)
       values ($1, 'instagram', 'active', jsonb_build_object('id', $2::text, 'profileId', $3::text, 'handle', 'chai_corner'))
       returning id`,
      [WS, ACCOUNT, PROFILE],
    )
    connectionId = r.rows[0]!.id
  })

  afterEach(async () => {
    await db.close()
  })

  describe('a dead account', () => {
    it('is flagged and taken out of active in the same statement', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: true,
        platformStatus: 'not listed under this profile',
        tokenExpiresAt: null,
      })

      const row = await readRow()
      expect(row.status).toBe('expired')
      expect(row.external_account.needsReconnection).toBe(true)
      expect(row.external_account.platformStatus).toBe('not listed under this profile')
    })

    it('is never asked about again — which is what makes it permanent', async () => {
      expect(await store.listConnectionsToCheck()).toHaveLength(1)

      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: true,
        platformStatus: 'revoked',
        tokenExpiresAt: null,
      })

      // No later pass re-polls it, and no later pass can flip it back: only a
      // reconnect writes `active`. The retry loop this closes is the one that would
      // otherwise ask Zernio about a revoked account every five minutes forever.
      expect(await store.listConnectionsToCheck()).toEqual([])
    })

    it('keeps the ids that make the row matchable at all', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: true,
        platformStatus: 'revoked',
        tokenExpiresAt: null,
      })

      // The merge, not a replace: these two are the tenant boundary, and a
      // connection that lost them is one nobody can match to an account.
      const row = await readRow()
      expect(row.external_account.id).toBe(ACCOUNT)
      expect(row.external_account.profileId).toBe(PROFILE)
      expect(row.external_account.handle).toBe('chai_corner')
    })

    it('leaves a healthy connection active', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: false,
        platformStatus: 'ok',
        tokenExpiresAt: '2026-10-07T00:00:00.000Z',
      })

      const row = await readRow()
      expect(row.status).toBe('active')
      expect(await store.listConnectionsToCheck()).toHaveLength(1)
    })
  })

  describe('the T-7 warning, which is only ever as good as this column', () => {
    it('writes the expiry apps/web derives the warning from', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: false,
        platformStatus: 'ok',
        tokenExpiresAt: '2026-10-07T00:00:00.000Z',
      })

      const row = await readRow()
      // `lib/connections/health.ts` reads `expires_at` and nothing else. Unwritten
      // here, `daysUntil` returns null and the T-7 banner can never fire.
      expect(new Date(row.expires_at!).toISOString()).toBe('2026-10-07T00:00:00.000Z')
    })

    it('does not blank a known expiry when a later read carries none', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: false,
        platformStatus: 'ok',
        tokenExpiresAt: '2026-10-07T00:00:00.000Z',
      })

      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: false,
        platformStatus: 'ok',
        tokenExpiresAt: null,
      })

      // A response that omitted the field is not news that the deadline moved.
      const row = await readRow()
      expect(new Date(row.expires_at!).toISOString()).toBe('2026-10-07T00:00:00.000Z')
    })

    it('stamps last_checked_at so the batch rotates instead of re-reading one row', async () => {
      await store.applyAccountFacts(connection(), {
        accountId: ACCOUNT,
        needsReconnection: false,
        platformStatus: 'ok',
        tokenExpiresAt: null,
      })

      expect((await readRow()).last_checked_at).not.toBeNull()
    })
  })

  describe('which connections are ours to ask about', () => {
    it('ignores a native OAuth row, which carries no profileId', async () => {
      await db.query(
        `insert into connections (workspace_id, platform, status, external_account)
         values ($1, 'x', 'active', jsonb_build_object('id', 'x-account-1'))`,
        [WS],
      )

      const rows = await store.listConnectionsToCheck()
      expect(rows.map((r) => r.platform)).toEqual(['instagram'])
    })

    it('takes every channel on the Zernio rail, not just instagram', async () => {
      await db.query(
        `insert into connections (workspace_id, platform, status, external_account)
         values ($1, 'linkedin', 'active', jsonb_build_object('id', 'li-1', 'profileId', $2::text))`,
        [WS, PROFILE],
      )

      const rows = await store.listConnectionsToCheck()
      expect(rows.map((r) => r.platform).sort()).toEqual(['instagram', 'linkedin'])
    })
  })

  describe('which publishes are still unresolved', () => {
    /** One variant plus one addressable log row, `ageSeconds` old. */
    const unresolved = async (ageSeconds: number, over: Record<string, unknown> = {}) => {
      const v = await db.query<{ id: string }>(
        `insert into post_variants (post_id, workspace_id, publish_status, permalink)
         values ($1, $2, $3, $4) returning id`,
        [POST, WS, over.publish_status ?? 'scheduled', over.permalink ?? null],
      )
      const variantId = v.rows[0]!.id
      await db.query(
        `insert into post_publish_logs
           (workspace_id, post_id, variant_id, channel, attempt, status, mode, platform_post_id,
            error, created_at)
         values ($1, $2, $3, 'instagram', 1, 'failed', 'live', $4,
                 '{"code":"STILL_PROCESSING"}', now() - make_interval(secs => $5::int))`,
        [WS, POST, variantId, PROVIDER_ID, ageSeconds],
      )
      return variantId
    }

    it('finds a variant whose newest addressable log is old enough to ask about', async () => {
      const variantId = await unresolved(300)

      const rows = await store.listUnresolvedPublishes()

      expect(rows).toEqual([
        {
          variantId,
          workspaceId: WS,
          postId: POST,
          channel: 'instagram',
          providerPostId: PROVIDER_ID,
        },
      ])
    })

    it('waits: an attempt younger than the resolve window is not asked about yet', async () => {
      await unresolved(30)

      expect(await store.listUnresolvedPublishes()).toEqual([])
    })

    it('judges by the NEWEST addressable log, not any old one', async () => {
      // An old STILL_PROCESSING row, then a fresh retry that is also still
      // processing. The newest says "just asked", so this pass leaves it alone.
      const variantId = await unresolved(3000)
      await db.query(
        `insert into post_publish_logs
           (workspace_id, post_id, variant_id, channel, attempt, status, mode, platform_post_id)
         values ($1, $2, $3, 'instagram', 2, 'failed', 'live', $4)`,
        [WS, POST, variantId, PROVIDER_ID],
      )

      expect(await store.listUnresolvedPublishes()).toEqual([])
    })

    it('leaves a settled variant alone', async () => {
      await unresolved(300, { publish_status: 'published', permalink: 'https://instagram.com/p/1' })

      expect(await store.listUnresolvedPublishes()).toEqual([])
    })

    it('settles the variant and appends the trail row as one transaction', async () => {
      const variantId = await unresolved(300)
      const [item] = await store.listUnresolvedPublishes()

      await store.applyResolution(item!, {
        kind: 'published',
        permalink: 'https://instagram.com/p/9',
        platformPostId: '17890',
      })

      const v = await db.query<{ publish_status: string; permalink: string }>(
        'select publish_status, permalink from post_variants where id = $1',
        [variantId],
      )
      expect(v.rows[0]).toEqual({
        publish_status: 'published',
        permalink: 'https://instagram.com/p/9',
      })
      const logs = await db.query<{ status: string; idempotency_key: string | null }>(
        'select status, idempotency_key from post_publish_logs where variant_id = $1 order by created_at',
        [variantId],
      )
      expect(logs.rows.map((r) => r.status)).toEqual(['failed', 'succeeded'])
      // No key on the trail row, so it cannot collide with a publisher's own.
      expect(logs.rows[1]!.idempotency_key).toBeNull()
      expect(await store.listUnresolvedPublishes()).toEqual([])
    })

    it('appends NO trail row when the variant mark fails', async () => {
      const variantId = await unresolved(300)
      const [item] = await store.listUnresolvedPublishes()

      await expect(
        store.applyResolution(item!, {
          kind: 'published',
          permalink: 'raise://',
          platformPostId: null,
        }),
      ).rejects.toThrow('TEST_REFUSED_UPDATE')

      const logs = await db.query<{ status: string }>(
        'select status from post_publish_logs where variant_id = $1',
        [variantId],
      )
      expect(logs.rows.map((r) => r.status)).toEqual(['failed'])
    })
  })
})
