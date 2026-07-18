import 'server-only'

import { clerkKeyWarning } from '@/lib/clerk-key-guard'
import { parseEnv } from '@/lib/env-schema'

// Fails fast at first server-side import. NEXT_PUBLIC_* values are inlined
// into client bundles at build time — client code must reference the literal
// process.env.NEXT_PUBLIC_… form, never this module.
export const env = parseEnv(process.env)

// Loud, non-fatal boot warning when the Clerk key's instance type mismatches the
// runtime (e.g. a pk_live key on localhost — its FAPI 400s on non-prod origins).
const clerkWarning = clerkKeyWarning({
  publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  nodeEnv: process.env.NODE_ENV,
})
if (clerkWarning) console.warn(`[env] ${clerkWarning}`)
