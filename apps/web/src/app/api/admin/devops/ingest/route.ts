import { OpsIngestPayloadSchema } from '@sahoda/shared'

import { env } from '@/lib/env'
import { opsTokenConfigured, opsTokenMatches } from '@/lib/ops/ingest-auth'
import { fixedWindowAllow } from '@/lib/ops/rate-limit'
import { ingestOps } from '@/lib/ops/service-rpc'

/**
 * POST /api/admin/devops/ingest — the dashboard's only writer (doc 13 §9.6).
 *
 * Authenticated by `x-ops-token` alone: there is no user here. The route is
 * listed as an exact path in middleware's public matcher, which is why the token
 * check is the first thing that happens and why it is constant-time.
 *
 * Deliberately NOT reachable from a signed-in session. Even an ops owner's JWT
 * cannot call `public.ops_ingest` — it is granted to service_role only — so this
 * route is the sole path, and it can write board, changelog, QA and session rows
 * and nothing else.
 */
export const dynamic = 'force-dynamic'

const RPM_LIMIT = 60

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Which parts of the payload were wrong — names only, never values.
 *
 * Zod 4 reports a rejected unknown key with `code: 'unrecognized_keys'` and puts
 * the offending names in `issue.keys`, leaving `issue.path` pointing at the
 * CONTAINER. Reading only the path turns the most important rejection this route
 * makes — a payload smuggling a `credits` section — into a useless `(root)`.
 */
function issuePaths(issues: readonly { path: PropertyKey[]; code: string }[]): string[] {
  const named = issues.flatMap((issue) => {
    const base = issue.path.map(String).join('.')
    if (issue.code === 'unrecognized_keys') {
      const keys = (issue as unknown as { keys?: string[] }).keys ?? []
      return keys.map((key) => (base ? `${base}.${key}` : key))
    }
    return [base || '(root)']
  })
  return [...new Set(named)]
}

export async function POST(request: Request): Promise<Response> {
  const expected = env.DEVOPS_INGEST_TOKEN

  // Not configured is a different fact from not allowed, and the operator needs
  // to be able to tell them apart — "your sync is silently doing nothing"
  // otherwise looks identical to "your token is wrong".
  if (!opsTokenConfigured(expected)) {
    return json({ ok: false, error: 'ingest_not_configured' }, 503)
  }

  if (!opsTokenMatches(request.headers.get('x-ops-token'), expected)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const limit = await fixedWindowAllow('ops:ingest', RPM_LIMIT, 60)
  if (!limit.allowed) {
    return json({ ok: false, error: 'rate_limited', limit: RPM_LIMIT }, 429)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  // `.strict()` on the payload schema is what makes doc 13 §16's promise
  // structural: a request carrying a `credits` section is REJECTED here, not
  // stripped and quietly ignored. Issue PATHS are echoed so a broken state file
  // is debuggable; values never are.
  const parsed = OpsIngestPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return json(
      { ok: false, error: 'invalid_payload', paths: issuePaths(parsed.error.issues) },
      400,
    )
  }

  const outcome = await ingestOps(parsed.data)
  if (!outcome.ok) {
    // The hook that called this must never block work, so the failure is plain
    // and the detail stays in the server log.
    return json({ ok: false, error: 'ingest_unavailable' }, 502)
  }

  return json({ ...outcome.ack, rate_limit_measured: !limit.unmeasured }, 200)
}
