/**
 * Billing is server-only: it reaches the service-role ledger function over a direct
 * Postgres connection and handles provider secrets. This guard makes an accidental
 * client-side import fail loudly instead of shipping a secret to the browser.
 */
export function assertServerOnly(): void {
  // Referenced via globalThis so this compiles without the DOM lib (billing is Node-only).
  if (typeof (globalThis as { window?: unknown }).window !== 'undefined') {
    throw new Error('@sahoda/billing is server-only and must never run in the browser')
  }
}

export interface BillingEnv {
  /** Direct Postgres URL for `app.apply_ledger_entry()` (not PostgREST-exposed). */
  databaseUrl: string
}

/**
 * Fail-fast env loader (mirrors mesh's config loader): collect every missing key,
 * then throw once. The error names the missing keys only — it never echoes a value,
 * so a connection string or secret can't leak into logs.
 */
export function loadBillingEnv(source: NodeJS.ProcessEnv = process.env): BillingEnv {
  assertServerOnly()

  const missing: string[] = []
  const databaseUrl = source.SUPABASE_DB_URL ?? source.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) missing.push('SUPABASE_DB_URL')

  if (missing.length > 0) {
    throw new Error(`@sahoda/billing: missing required env — ${missing.join(', ')}`)
  }

  return { databaseUrl }
}
