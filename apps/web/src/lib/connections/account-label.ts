/**
 * Human label for a connection's `external_account` jsonb. The column shape is
 * provider-written (OAuth callback, server-side) and only `->> 'id'` is
 * contractually pinned (the unique index reads it) — everything else is
 * best-effort, so this reads defensively and never throws on a shape surprise.
 */
export function accountLabel(externalAccount: unknown): string {
  if (typeof externalAccount !== 'object' || externalAccount === null) {
    return 'Connected account'
  }
  const record = externalAccount as Record<string, unknown>
  for (const key of ['name', 'username', 'handle', 'id'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return 'Connected account'
}
