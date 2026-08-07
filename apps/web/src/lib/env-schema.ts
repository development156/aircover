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

  // ── Admin Ops (doc 13 §19) ─────────────────────────────────────────────────
  // All optional, because /admin is additive: without them the app boots and
  // serves exactly as before, the console 404s, and the public form and the
  // ingest endpoint fail closed. Optional is not unvalidated, though — a present
  // value that is wrong is a boot failure, not a silent degradation.
  //
  // Doc 13 §16 requires ≥32 bytes of randomness on the ops token. A short one is
  // a real defect (it is the only thing between a stranger and fake board rows),
  // so it fails the boot loudly rather than being accepted and quietly weak.
  DEVOPS_INGEST_TOKEN: z.string().min(32).optional(),
  /**
   * Read by exactly one module — lib/ops/service-rpc.ts — for the two endpoints
   * that have no user to act as. Optional so a build box without it still
   * compiles; absent at runtime means those endpoints answer "unavailable"
   * rather than pretending to have written something.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /**
   * Svix signing secret for the Clerk webhook. Optional so a build without it
   * still compiles; absent at runtime means the webhook answers 503 rather than
   * accepting unverified events.
   */
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Comma-separated. Seeds the first owner seats; read by scripts/ops-seed.mjs. */
  ADMIN_BOOTSTRAP_EMAILS: z.string().optional(),
  /** Dev-only escape hatch for the maker-checker rule. Anything but 'true' is false. */
  // Not provisioned yet (tracked in the handoff). While it is missing,
  // /api/public/beta-apply rejects every submission: an unprovisioned captcha
  // that degrades to accepting everything is an open public insert endpoint.
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  /** Delivers the two-admin OTP. Absent → creating a credit request fails honestly. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /**
   * Zernio publishing rail. `sk_` + 64 hex = 67 chars, shown once, stored by them
   * as SHA-256 (doc 13 §1). The length is validated because a truncated paste is
   * otherwise indistinguishable from a wrong key until the first 401 — and that
   * first 401 would happen at publish time, in front of a customer.
   *
   * Optional so a build box without it still compiles; absent at runtime means the
   * connect buttons say so rather than starting a flow that cannot finish.
   */
  ZERNIO_API_KEY: z
    .string()
    .regex(/^sk_[0-9a-f]{64}$/, 'ZERNIO_API_KEY must be sk_ followed by 64 hex characters')
    .optional(),
  /**
   * Absolute origin used to build the OAuth return URL we hand to Zernio. Vercel
   * sets VERCEL_URL without a scheme and it differs per deployment, so this is
   * explicit: a return URL pointing at the wrong origin sends the customer's
   * browser somewhere that cannot finish the connection.
   */
  NEXT_PUBLIC_APP_URL: z.url().optional(),
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
