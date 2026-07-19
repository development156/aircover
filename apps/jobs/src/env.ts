import type { PublishMode } from './publish/runPublishPost'

/**
 * How long past its TTL a HOLD must sit before the reaper releases it. The TTL is 10
 * minutes and the sweep runs every 5, so releasing exactly on expiry would reap a
 * slow-but-alive run mid-flight: its DEBIT then raises HOLD_ALREADY_SETTLED, and the
 * user is shown a failure for work that succeeded and was never charged.
 */
const DEFAULT_HOLD_SWEEP_GRACE_SECONDS = 600

export interface JobsEnv {
  /**
   * Which publish rail this process is on. Defaults to `fixture` deliberately: no
   * sanctioned opener for connection secrets exists yet (REQUESTS.md), so a missing
   * flag must never put the job on the live rail.
   */
  publishMode: PublishMode
  supabaseUrl: string
  serviceRoleKey: string
  databaseUrl: string
  holdSweepGraceSeconds: number
}

/**
 * Fail-fast env loader (mirrors mesh's and billing's): collect every missing key, then
 * throw once. The error names keys only — it never echoes a value, so a service-role key
 * or connection string cannot leak into logs.
 */
export function loadJobsEnv(source: NodeJS.ProcessEnv = process.env): JobsEnv {
  const missing: string[] = []
  const invalid: string[] = []

  const rawUrl = source.NEXT_PUBLIC_SUPABASE_URL ?? source.SUPABASE_URL ?? ''
  if (rawUrl.length === 0) missing.push('NEXT_PUBLIC_SUPABASE_URL')

  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (serviceRoleKey.length === 0) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  const databaseUrl = source.SUPABASE_DB_URL ?? source.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) missing.push('SUPABASE_DB_URL')

  let publishMode: PublishMode = 'fixture'
  const rawMode = source.SAHODA_PUBLISH_MODE
  if (rawMode !== undefined) {
    if (isPublishMode(rawMode)) publishMode = rawMode
    else invalid.push('SAHODA_PUBLISH_MODE')
  }

  const rawGrace = source.SAHODA_HOLD_SWEEP_GRACE_SECONDS
  let holdSweepGraceSeconds = DEFAULT_HOLD_SWEEP_GRACE_SECONDS
  if (rawGrace !== undefined) {
    const parsed = Number(rawGrace)
    // A negative grace would reap holds that have not even expired yet.
    if (!Number.isFinite(parsed) || parsed < 0) invalid.push('SAHODA_HOLD_SWEEP_GRACE_SECONDS')
    else holdSweepGraceSeconds = parsed
  }

  if (missing.length > 0 || invalid.length > 0) {
    const parts = [
      missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      invalid.length > 0 ? `invalid ${invalid.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(`@sahoda/jobs: bad env — ${parts.join('; ')}`)
  }

  return {
    publishMode,
    supabaseUrl: toOrigin(rawUrl),
    serviceRoleKey,
    databaseUrl,
    holdSweepGraceSeconds,
  }
}

function isPublishMode(value: string): value is PublishMode {
  return value === 'live' || value === 'fixture'
}

/**
 * supabase-js needs the bare project origin. A URL pasted from the dashboard often
 * carries `/rest/v1/`, which makes every call 404 with PGRST125 — strip it here rather
 * than debugging it at the call site.
 */
function toOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}
