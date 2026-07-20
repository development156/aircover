/**
 * Server-side triage for paid-action failures.
 *
 * Every paid entry point (brand resolve, variants, rewrite, plan-week, site
 * generate) funnels its failures through two seams: the `withCredits` typed
 * error, and the action's own outer catch. Both previously discarded the cause
 * entirely, which made a misconfigured deployment indistinguishable from a
 * transient blip — in the UI *and* in the server logs.
 *
 * This module fixes both without weakening the leak-prevention rule in
 * `charge-failure.ts` (raw messages never reach the client):
 *  - `reportPaidActionFailure` logs the cause server-side, where Vercel
 *    function logs are the only audience.
 *  - `isDeploymentConfigCause` recognises the two env loaders' fail-fast
 *    errors so the action can return fixed, authored copy for a failure that
 *    retrying can never fix. The env loaders name variables only — never
 *    values — so matching on their messages is safe.
 */

/**
 * Anchored to the exact prefixes of `loadMeshConfig` / `loadBillingEnv`
 * fail-fast errors. Anchoring matters: provider or model text that merely
 * mentions an env var name must not be classified as our own config error.
 */
const CONFIG_MESSAGE_PATTERNS: readonly RegExp[] = [
  /^@sahoda\/mesh: missing required env/,
  /^@sahoda\/billing: missing required env/,
]

/**
 * Honest copy for a deployment-config failure. True on every path that can
 * raise one: the billing loader throws before any HOLD exists, and a mesh
 * loader throw inside the callback releases the hold. Callers must still guard
 * with their `delivered` flag so this can never replace the unconfirmed-charge
 * warning.
 */
export const DEPLOYMENT_CONFIG_MESSAGE =
  'This deployment is not fully configured for AI actions yet — nothing ran and you were not charged.'

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const message = (cause as { message: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return ''
}

function codeOf(cause: unknown): string | null {
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    const code = (cause as { code: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

/** True when the cause is one of our own env loaders failing fast. */
export function isDeploymentConfigCause(cause: unknown): boolean {
  const message = messageOf(cause)
  return CONFIG_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Log a paid-action failure where an operator can see it. One line, prefixed
 * with the action scope so Vercel's function logs are grep-able. An
 * insufficient balance is the one expected rejection — a user condition, not
 * an operator fault — so it is deliberately not logged. Never throws: a
 * logging failure must not change the action's outcome.
 */
export function reportPaidActionFailure(scope: string, cause: unknown): void {
  try {
    const code = codeOf(cause)
    if (code === 'CREDIT_INSUFFICIENT') return
    const message = messageOf(cause) || 'unknown cause'
    console.error(
      code ? `[${scope}] failed (${code}): ${message}` : `[${scope}] failed: ${message}`,
    )
  } catch {
    // Deliberately swallowed — see doc comment.
  }
}
