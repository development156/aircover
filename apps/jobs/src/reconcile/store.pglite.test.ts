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
`

const WS = '11111111-1111-4111-8111-111111111111'
const PROFILE = '0123456789abcdef01234567'
const ACCOUNT = 'aabbccddeeff001122334455'

function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

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
})
