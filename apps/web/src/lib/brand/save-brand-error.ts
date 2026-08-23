/**
 * Map a `resolve_brand_memory` RPC error to user-safe copy. The function raises
 * typed sentinels (AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_SOURCE ·
 * INVALID_PAYLOAD · NOT_A_MEMBER · FORBIDDEN_ROLE · VERSION_CONFLICT) inside a
 * PostgREST message; anything else — and every raw SQL string — collapses to a
 * generic line so no database internals reach the UI.
 */
const GENERIC = 'Could not save your Brand Brain. Try again.'

export function mapSaveBrandError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  const message = error?.message ?? ''

  if (message.includes('INVALID_PAYLOAD')) {
    // Size (32 KB) or the two open lists (40 entries max) — both user-fixable.
    return 'That Brand Brain is too long to save — trim the longest fields or list entries and try again.'
  }
  // Deliberately identical: a non-member must not learn whether the workspace exists.
  if (message.includes('NOT_A_MEMBER') || message.includes('INVALID_WORKSPACE')) {
    return "You don't have access to this workspace."
  }
  if (message.includes('FORBIDDEN_ROLE')) {
    return 'Your role cannot change the Brand Brain — ask an owner or editor.'
  }
  if (message.includes('VERSION_CONFLICT')) {
    return 'The Brand Brain changed while you were editing. Reload and try again.'
  }
  return GENERIC
}
