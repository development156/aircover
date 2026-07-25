import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { OpsIngestPayload } from '@sahoda/shared'

import { env } from '@/lib/env'

/**
 * The ONLY service-role surface in apps/web, and the reason it exists.
 *
 * `lib/supabase/server.ts` says it plainly: "No service-role client in
 * apps/web — RLS is the security boundary." That rule holds for everything a
 * signed-in user does. It cannot hold for two endpoints, because neither has a
 * user to act as: the ingest route authenticates a token, and the public beta
 * form authenticates a captcha. Doc 13 §5 is explicit that the form must insert
 * server-side with the service role and that there is no anon-insert RLS path.
 *
 * So the exception is confined to this file, and this file exports FUNCTIONS,
 * never a client. Nothing outside it can obtain a service-role handle and go
 * exploring — the escalation is bounded to the specific RPCs named below.
 *
 * That bound is what makes doc 13 §16's promise real rather than aspirational:
 * the ingest token cannot reach credits. `public.ops_ingest` touches five ops
 * tables and no ledger function, and there is no second export here through
 * which a caller could reach one. `service-rpc.test.ts` asserts both halves —
 * that this module names only the allowed RPCs, and that it exports no client.
 */

/** Named once so the test can assert the whole allowlist from the source. */
export const SERVICE_RPCS = ['ops_ingest'] as const

function serviceClient() {
  // Constructed per call, not at module scope: this file is imported by route
  // modules that Next may evaluate during a build with no env at all.
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type IngestOutcome =
  { ok: true; ack: Record<string, unknown> } | { ok: false; reason: 'unavailable' }

/**
 * Apply one sync payload. The RPC is a single transaction, so a partial board is
 * not a state this can produce.
 *
 * Errors are collapsed to `unavailable` on purpose: the caller is a hook script
 * that must never block work, and a Postgres message can name columns and
 * constraints. The detail goes to the server log, not into the response.
 */
export async function ingestOps(payload: OpsIngestPayload): Promise<IngestOutcome> {
  const client = serviceClient()
  if (!client) {
    console.error('[ops-ingest] no service-role key configured; nothing was written')
    return { ok: false, reason: 'unavailable' }
  }

  const { data, error } = await client.rpc('ops_ingest', { p_payload: payload })

  if (error) {
    console.error('[ops-ingest] rpc failed:', error.message)
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, ack: (data ?? {}) as Record<string, unknown> }
}
