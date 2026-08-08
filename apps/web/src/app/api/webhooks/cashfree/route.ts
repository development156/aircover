import {
  createApplyPlanGrant,
  createPgLedgerPort,
  createPgWebhookEventStore,
  createProcessPaymentEvent,
  loadBillingEnv,
  loadCashfreeWebhookEnv,
} from '@sahoda/billing/server-webhook'

import { createCashfreeWebhookHandler } from '@/lib/billing/cashfree-webhook'
import { reportServerError } from '@/lib/observability/report'

/**
 * POST /api/webhooks/cashfree — the Cashfree PG payment rail.
 *
 * Listed by EXACT path in middleware's public matcher, per the standing rule in that file: a
 * blanket `/api/webhooks(.*)` prefix is an unauthenticated hole waiting for a route.
 *
 * ── THE IMPORT RULE THIS FILE EXISTS TO OBEY ─────────────────────────────────
 * Every billing import here comes from `@sahoda/billing/server-webhook`, never from
 * `@sahoda/billing`. The main barrel re-exports the fixture provider, and the fixture's HMAC
 * secret is a source literal in a public repository — honouring a fixture signature on a
 * public endpoint would be free credits for anyone who can read GitHub. The subpath entry
 * excludes the fixture from the import graph entirely, so there is no second verifier to
 * call by accident. `cashfree-webhook.guard.test.ts` fails if the barrel appears here.
 *
 * The behaviour lives in `@/lib/billing/cashfree-webhook` so that `route.test.ts` can drive
 * real Requests through the real billing internals and assert on the `app.apply_ledger_entry`
 * rows produced. This file is only the env-and-pool wiring that a test cannot exercise.
 */
export const dynamic = 'force-dynamic'
/** `pg` and `node:crypto` — this cannot run on the Edge runtime. */
export const runtime = 'nodejs'

/**
 * Fixed copy; the unconfigured case must never look like a signature rejection.
 * A function, not a constant — a Response body can only be consumed once.
 */
const notConfigured = (): Response =>
  Response.json(
    { ok: false, error: 'not_configured' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  )

type Handler = (request: Request) => Promise<Response>

/**
 * Built once per server process, on the first request that needs it — never at module scope.
 *
 * `next build` loads every server module during "Collecting page data"; constructing a pg
 * Pool there would open sockets at build time and make an env-less build fail, which is the
 * exact failure `lib/env.ts` documents and works around the same way.
 */
let cached: Handler | null = null

function handler(): Handler | null {
  if (cached) return cached

  const cashfree = loadCashfreeWebhookEnv()
  if (!cashfree) return null

  // One Pool, two consumers: the ledger writes the GRANT, the event store writes the audit
  // row that dedups redeliveries. Sharing it keeps a webhook burst from opening two pools.
  const ledger = createPgLedgerPort({ connectionString: loadBillingEnv().databaseUrl })
  const pool = ledger.pool

  cached = createCashfreeWebhookHandler({
    secretKey: cashfree.secretKey,
    mode: cashfree.mode,
    process: createProcessPaymentEvent({
      store: createPgWebhookEventStore(pool),
      applyPlanGrant: createApplyPlanGrant(ledger),
      onError: (cause) => reportServerError(cause, { action: 'cashfreeWebhook' }),
    }),
    onNotice: (note) =>
      reportServerError(note.cause ?? new Error(note.message), {
        action: `cashfreeWebhook:${note.kind}`,
        workspaceId: note.workspaceId,
      }),
  })

  return cached
}

export async function POST(request: Request): Promise<Response> {
  let active: Handler | null
  try {
    active = handler()
  } catch (cause) {
    // A missing SUPABASE_DB_URL throws out of loadBillingEnv. That is a deployment fault, not
    // a bad delivery: answer 503 so Cashfree redelivers once it is fixed, and never 500 in a
    // way that reads as "this payment was rejected".
    reportServerError(cause, { action: 'cashfreeWebhook:boot' })
    return notConfigured()
  }

  if (!active) return notConfigured()
  return active(request)
}
