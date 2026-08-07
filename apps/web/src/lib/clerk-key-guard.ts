// Pure, unit-tested config guard. The boot module (./env.ts) calls this and
// emits the warning; keeping the logic side-effect-free keeps it testable.
//
// Clerk publishable keys are origin-locked by instance type: a `pk_live` key is
// bound to the production domain (e.g. a sahodalabs.com subdomain) and its FAPI
// rejects any other origin with a 400 ("HTTP Origin must be equal to or a
// subdomain of the requesting URL"). Run one on localhost or a *.vercel.app
// preview and sign-in silently breaks. A `pk_test` (development instance) key
// allows localhost. This guard flags the mismatch loudly at boot instead of
// leaving it to surface as an opaque 400 mid sign-in.

interface ClerkKeyGuardInput {
  publishableKey: string
  nodeEnv: string | undefined
}

/**
 * Returns a warning string when the Clerk publishable key's instance type does
 * not match the runtime, otherwise null. Never includes the key's value beyond
 * its recognizable `pk_live`/`pk_test` prefix.
 */
export function clerkKeyWarning({ publishableKey, nodeEnv }: ClerkKeyGuardInput): string | null {
  const isProduction = nodeEnv === 'production'

  if (publishableKey.startsWith('pk_live')) {
    if (isProduction) return null
    return (
      'Clerk: a LIVE publishable key (pk_live) is in use but NODE_ENV is not ' +
      "'production'. Live keys are locked to your production domain — their FAPI " +
      'rejects localhost and *.vercel.app preview origins with a 400, so sign-in ' +
      'will break. Use a Clerk development instance (pk_test) for local dev.'
    )
  }

  if (publishableKey.startsWith('pk_test')) {
    if (!isProduction) return null
    return (
      'Clerk: a TEST publishable key (pk_test) is in use in a production build. ' +
      "Sign-in will run against Clerk's development instance — use a pk_live key " +
      'in production.'
    )
  }

  // Unrecognized prefix: parseEnv already guarantees presence; don't false-alarm.
  return null
}
