import 'server-only'

import { Pool } from 'pg'

import type { Queryable } from './webhook-store'

/**
 * The ONE direct Postgres connection this app opens, and the transaction wrapper
 * around it.
 *
 * ── WHY A DIRECT CONNECTION EXISTS AT ALL ────────────────────────────────────
 * `lib/supabase/server.ts` states the rule: there is no service-role client in
 * apps/web, because RLS is the security boundary for everything a member touches.
 * Two writers are not members. The webhook receiver files inbound messages carrying
 * `platform_message_id` and `sent_at`, and the reply path files the outbound message
 * a platform has just ACKNOWLEDGED — both of them rows the `authenticated` INSERT
 * policy deliberately forbids, because that policy exists to stop a member
 * fabricating a message that claims to have reached a platform.
 *
 * A confirmed receipt is not a fabrication: the platform named the message, and the
 * id is the platform's own. NOTHING HERE WEAKENS THAT POLICY OR ITS CHECK. Needing
 * to edit either one would mean this path was wrong, not that the constraint was.
 *
 * ── WHY THIS FILE, AND NOT A SECOND POOL ─────────────────────────────────────
 * The pool used to be constructed inside `app/api/webhooks/zernio/route.ts`. A
 * second caller needing the same door would otherwise open a second pool against
 * the same database from the same process, and pooler connection budget is the
 * scarcest thing in this deployment. One module, one pool, two callers.
 *
 * Built lazily, never at module scope: `next build` loads every server module during
 * "Collecting page data", and constructing a Pool there opens sockets at build time
 * and makes an env-less build fail.
 */

/** One transaction. Commits on return, rolls back on throw, always releases. */
export type DirectTransaction = <T>(run: (db: Queryable) => Promise<T>) => Promise<T>

let pool: Pool | null = null

/**
 * The transaction runner, or `null` when this environment has no database URL.
 *
 * `null` rather than a throw, because both callers have an honest thing to do with
 * it: the receiver answers 503 so Zernio redelivers, and the reply path records
 * nothing and says so. A throw would turn a deployment fact into a 500.
 */
export function directTransaction(): DirectTransaction | null {
  const databaseUrl = process.env.SUPABASE_DB_URL ?? ''
  if (databaseUrl === '') return null

  pool ??= new Pool({ connectionString: databaseUrl, max: 4 })
  const active = pool

  return async <T>(run: (db: Queryable) => Promise<T>): Promise<T> => {
    const client = await active.connect()
    try {
      await client.query('begin')
      const result = await run({
        // `pg` types `query` as returning QueryResult<QueryResultRow>, whose `rows`
        // is not assignable to the caller's `R[]`. The cast is at the ADAPTER, where
        // the shape is asserted once, rather than widening `Queryable` to `any` and
        // losing the types at every call site.
        query: <R>(sql: string, params?: unknown[]) =>
          client.query(sql, params as unknown[]) as unknown as Promise<{ rows: R[] }>,
      })
      await client.query('commit')
      return result
    } catch (cause) {
      try {
        await client.query('rollback')
      } catch {
        // A rollback that itself fails must not mask the original error.
      }
      throw cause
    } finally {
      client.release()
    }
  }
}
