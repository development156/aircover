import { z } from 'zod'

// Pure and unit-tested; the server-only boot guard lives in ./env.ts.
// Mirrors packages/mesh/src/config.ts: collect every missing/invalid var into
// ONE error naming names — never values.
const EnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  // Normalize to the bare origin: supabase-js appends its own `/rest/v1`, `/auth/v1`,
  // etc., so a pasted dashboard URL carrying a `/rest/v1` path (or a trailing slash)
  // would double up and 404 with PGRST125 "Invalid path specified in request URL".
  NEXT_PUBLIC_SUPABASE_URL: z.url().transform((value) => new URL(value).origin),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export type WebEnv = z.infer<typeof EnvSchema>

export function parseEnv(env: Record<string, string | undefined>): WebEnv {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')
    throw new Error(`@sahoda/web: missing or invalid env var(s): ${names}`)
  }
  return result.data
}
