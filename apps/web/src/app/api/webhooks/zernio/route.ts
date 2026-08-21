import { Pool } from 'pg'

import { createZernioWebhookHandler } from '@/lib/zernio/webhook-handler'
import { reportServerError } from '@/lib/observability/report'

/**
 * POST /api/webhooks/zernio — the inbound half of the Zernio integration.
 *
 * Listed by EXACT path in middleware's public matcher, per the standing rule in
 * that file: a blanket `/api/webhooks(.*)` prefix is an unauthenticated hole
 * waiting for a route.
 *
 * The behaviour lives in `@/lib/zernio/webhook-handler` so that `route.test.ts` can
 * drive real `Request`s through the real ingest against a real Postgres and assert
 * on the rows produced. This file is only the env-and-pool wiring a test cannot
 * exercise. Same split, same reason, as the Cashfree receiver.
 *
 * ── WHY A `pg` POOL AND NOT THE SUPABASE CLIENT ──────────────────────────────
 * `lib/supabase/server.ts` states the rule: there is no service-role client in
 * apps/web, because RLS is the security boundary for everything a member touches.
 * A webhook is not a member. It writes rows — inbound messages carrying
 * `platform_message_id` and `sent_at` — that the `authenticated` INSERT policy
 * deliberately forbids, because that policy exists to stop a MEMBER fabricating a
 * message that claims to have reached a platform.
 *
 * The receiver is a different principal and gets a different door: a direct
 * Postgres connection, exactly as the Cashfree receiver already uses for the
 * ledger. NOTHING in this lane weakens that policy or its CHECK.
 */
export const dynamic = 'force-dynamic'
/** `pg` and `node:crypto`. This cannot run on the Edge runtime. */
export const runtime = 'nodejs'

const notConfigured = (): Response =>
  Response.json(
    { ok: false, error: 'not_configured' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  )

type Handler = (request: Request) => Promise<Response>

let cached: Handler | null = null

/**
 * Built once per server process, on the first request that needs it — never at
 * module scope.
 *
 * `next build` loads every server module during "Collecting page data"; constructing
 * a Pool there would open sockets at build time and make an env-less build fail.
 * The Cashfree route documents the same hazard and works around it the same way.
 */
function handler(): Handler | null {
  if (cached) return cached

  const secret = process.env.ZERNIO_WEBHOOK_SECRET ?? ''
  const databaseUrl = process.env.SUPABASE_DB_URL ?? ''
  if (secret === '' || databaseUrl === '') return null

  const pool = new Pool({ connectionString: databaseUrl, max: 4 })

  cached = createZernioWebhookHandler({
    secret,
    // ONE transaction per delivery. The rollback is load-bearing: it is what makes a
    // failed projection leave no half-written event for a retry to trip over.
    withTransaction: async (fn) => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await fn({
          query: (sql, params) => client.query(sql, params as unknown[]),
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
    },
    // Id, type and failure kind only. Never a payload — these bodies carry customer
    // DMs and reviewer names, and this repo already records the redaction path as a
    // DoS surface that runs on the crash path.
    onError: (cause, context) => reportServerError(cause, { action: 'zernioWebhook', ...context }),
  })

  return cached
}

export async function POST(request: Request): Promise<Response> {
  let active: Handler | null
  try {
    active = handler()
  } catch (cause) {
    // Construction threw — a malformed connection string, say. A deployment fault,
    // not a bad delivery: 503 so Zernio redelivers once it is fixed, and never a
    // 4xx that would blame the sender for our misconfiguration.
    reportServerError(cause, { action: 'zernioWebhook:boot' })
    return notConfigured()
  }

  if (!active) return notConfigured()
  return active(request)
}
