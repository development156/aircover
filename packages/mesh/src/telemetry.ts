import type { AiProviderLog } from '@sahoda/shared'
import type { FetchLike } from './providers/types'
import { assertServerOnly } from './config'

/**
 * An insertable ai_provider_logs row: the DB assigns `id` + `created_at`. Derived
 * from the frozen shared row schema so telemetry never drifts from the table.
 *
 * By construction this carries ONLY per-call metadata (task, tier, provider, model,
 * token counts, cost, latency, credits, status, error, trace). It has NO field for
 * prompt text, Brand-Brain context, or model output — decrypted payloads are never
 * logged (CLAUDE.md non-negotiable; ruling #2).
 */
export type ProviderLogRow = Omit<AiProviderLog, 'id' | 'created_at'>

export interface LogSink {
  write(row: ProviderLogRow): Promise<void>
}

/** A failed telemetry write. Carries the HTTP status only — never the service key. */
export class TelemetryWriteError extends Error {
  constructor(readonly status: number) {
    super(`ai_provider_logs write failed with HTTP ${status}`)
    this.name = 'TelemetryWriteError'
  }
}

export interface PostgrestLogSinkOptions {
  supabaseUrl: string
  /** Service-role key — server-only; never logged, never returned to a client. */
  serviceKey: string
  fetchImpl?: FetchLike
}

/**
 * A LogSink that inserts into ai_provider_logs via PostgREST with the service-role
 * key (the table is service-only). Server-only. Callers should treat a thrown
 * TelemetryWriteError as best-effort — a telemetry failure must never break the
 * user's model action (the runner swallows it).
 */
export function createPostgrestLogSink(opts: PostgrestLogSinkOptions): LogSink {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))

  return {
    async write(row: ProviderLogRow): Promise<void> {
      assertServerOnly()
      const res = await fetchImpl(`${opts.supabaseUrl}/rest/v1/ai_provider_logs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: opts.serviceKey,
          authorization: `Bearer ${opts.serviceKey}`,
          prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      })
      if (!res.ok) {
        throw new TelemetryWriteError(res.status)
      }
    },
  }
}
