import type { PublishMode } from './publish/mode'

/**
 * How long past its TTL a HOLD must sit before the reaper releases it. The TTL is 10
 * minutes and the sweep runs every 5, so releasing exactly on expiry would reap a
 * slow-but-alive run mid-flight: its DEBIT then raises HOLD_ALREADY_SETTLED, and the
 * user is shown a failure for work that succeeded and was never charged.
 */
const DEFAULT_HOLD_SWEEP_GRACE_SECONDS = 600

/**
 * How late a post may be and still be worth publishing. Past this, sending it would put
 * out content whose moment has gone — a 9am offer landing at 6pm — so the dispatcher
 * expires it instead. Sixty minutes is the owner's ruling.
 */
const DEFAULT_DISPATCH_GRACE_SECONDS = 3600

/**
 * What a scheduled sweep is allowed to do.
 *
 * - `off`    — do not even read candidates. The sweep is a no-op.
 * - `report` — read and decide, returning the decisions, mutating NOTHING.
 * - `on`     — execute those decisions.
 *
 * `report` exists so a sweep's decisions can be reviewed against real production rows
 * before anything writes. There is no default-on path: see `loadJobsEnv`.
 */
export type SweepMode = 'off' | 'report' | 'on'

/** The scheduled-publish dispatcher's mode. */
export type DispatchMode = SweepMode

/** The expired-hold reaper's mode. Same three states, same safe default. */
export type HoldSweepMode = SweepMode

export interface JobsEnv {
  /**
   * Which publish rail this process is on. Defaults to `fixture` deliberately: no
   * sanctioned opener for connection secrets exists yet (REQUESTS.md), so a missing
   * flag must never put the job on the live rail.
   */
  publishMode: PublishMode
  /**
   * Zernio API key, for the aggregator-fronted channels. Optional: absent means
   * instagram throws NO_ADAPTER like any other channel we cannot really publish.
   * It is NOT a boot failure — the other rails work without it.
   */
  zernioApiKey: string | undefined
  supabaseUrl: string
  serviceRoleKey: string
  databaseUrl: string
  holdSweepGraceSeconds: number
  /**
   * Defaults to `off`. Deploying the reaper must not, by itself, start moving credits —
   * the flag is the only thing that grants that.
   */
  holdSweepMode: HoldSweepMode
  /**
   * Defaults to `off`. Deploying the dispatcher must not, by itself, start changing post
   * rows — the flag is the only thing that grants that.
   */
  dispatchMode: DispatchMode
  dispatchGraceSeconds: number
  /**
   * The reconciliation pass that asks Zernio what it would have told us by
   * webhook. Defaults to `off` like every other sweep: deploying it must not, by
   * itself, start flipping connections to `expired`.
   */
  reconcileMode: SweepMode
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

  // Shape-checked but never required: a wrong key is worth catching at boot, a
  // missing one simply means the Zernio rail is not provisioned here.
  const zernioApiKey = source.ZERNIO_API_KEY || undefined
  if (zernioApiKey !== undefined && !/^sk_[0-9a-f]{64}$/.test(zernioApiKey)) {
    invalid.push('ZERNIO_API_KEY')
  }

  const dispatchMode = readMode(source, 'SAHODA_PUBLISH_DISPATCH_MODE', invalid)
  const holdSweepMode = readMode(source, 'SAHODA_HOLD_SWEEP_MODE', invalid)
  const reconcileMode = readMode(source, 'SAHODA_RECONCILE_MODE', invalid)

  const rawDispatchGrace = source.SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS
  let dispatchGraceSeconds = DEFAULT_DISPATCH_GRACE_SECONDS
  if (rawDispatchGrace !== undefined) {
    const parsed = Number(rawDispatchGrace)
    // A negative grace inverts the window: posts not yet due would fall past it and expire.
    if (!Number.isFinite(parsed) || parsed < 0)
      invalid.push('SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS')
    else dispatchGraceSeconds = parsed
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
    zernioApiKey,
    supabaseUrl: toOrigin(rawUrl),
    serviceRoleKey,
    databaseUrl,
    holdSweepGraceSeconds,
    holdSweepMode,
    dispatchMode,
    dispatchGraceSeconds,
    reconcileMode,
  }
}

function isPublishMode(value: string): value is PublishMode {
  return value === 'live' || value === 'fixture'
}

function isSweepMode(value: string): value is SweepMode {
  return value === 'off' || value === 'report' || value === 'on'
}

/**
 * Read one sweep-mode flag, defaulting to `off` when it is absent entirely.
 *
 * There is deliberately no `?? 'off'` fallback on a SET-but-unparseable value. "ON",
 * "true", "1" and "" are all plausible things to find in a dashboard env var, and each of
 * them means someone tried to say something. Absorbing them into the safe default would
 * hide an intent to let a sweep write just as readily as it would hide a typo, so a
 * present-but-invalid value refuses to start.
 *
 * The key is recorded in `invalid` rather than thrown on the spot: with two flags sharing
 * this reader, throwing here would hide the second bad value behind the first.
 */
function readMode(source: NodeJS.ProcessEnv, key: string, invalid: string[]): SweepMode {
  const raw = source[key]
  if (raw === undefined) return 'off'
  if (isSweepMode(raw)) return raw
  invalid.push(key)
  return 'off'
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
