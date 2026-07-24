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
  // Sentry is observability, not a dependency — the app boots and serves without it.
  // Optional is load-bearing: a build box with no env at all (the Vercel failure in
  // b133a68) must still compile, and an optional var must never surface in the
  // missing-vars error, which developers read as "here is what you must set".
  // Optional is NOT unvalidated, though: a typo'd DSN swallows events silently for
  // weeks, so a *present* value still has to parse as a URL and fails the boot loudly.
  SENTRY_DSN: z.url().optional(),
  // The public twin exists because these are two different transports, not one var
  // read twice. Server code reads SENTRY_DSN at runtime; browser code cannot read
  // process.env at all, so Next.js inlines NEXT_PUBLIC_* into the client bundle at
  // BUILD time. That inlining is a literal text substitution on `process.env.NEXT_PUBLIC_SENTRY_DSN`
  // — routing it through this schema (or any computed/destructured key) makes the
  // inliner miss it and ships `undefined` to the browser. See ./env.ts.
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
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
