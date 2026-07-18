import 'server-only'

import { parseEnv } from '@/lib/env-schema'

// Fails fast at first server-side import. NEXT_PUBLIC_* values are inlined
// into client bundles at build time — client code must reference the literal
// process.env.NEXT_PUBLIC_… form, never this module.
export const env = parseEnv(process.env)
