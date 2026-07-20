/**
 * Which env vars are secret enough that their VALUES must never survive into a
 * Sentry event.
 *
 * This list lives in one module for the same reason `buildSentryOptions` does:
 * it is consumed by two runtimes (node and edge) whose init files are otherwise
 * identical, and a list duplicated across two files is a list that drifts. The
 * failure mode of that drift is silent and one-directional — someone adds a new
 * secret to the server config, forgets the edge one, and the edge runtime keeps
 * shipping the raw value for months without a single error to show for it.
 *
 * Registering a value here buys ZERO-false-positive redaction (layer 1 in
 * scrub.ts). The shape rules are the net underneath, but they only fire on
 * things that LOOK like credentials — so anything whose format we cannot predict
 * has to be named here or it is not really covered.
 */

/**
 * Read by name, never enumerated from `process.env`.
 *
 * Sweeping every var matching /SECRET|KEY|TOKEN/ would look thorough and be
 * actively worse: it would pull in values like `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
 * and any short flag var a future deploy adds, and every one of those becomes a
 * blind find-and-replace over the text of every error message we receive. An
 * explicit list means a human decided, and the decision is reviewable in a diff.
 */
export const SECRET_ENV_VARS = [
  // Clerk's backend key. Full read/write on every user and session we have.
  'CLERK_SECRET_KEY',
  // Bypasses RLS entirely — the single highest-value string in the process.
  // Absent in the browser and on most edge deploys; filtered out when unset.
  'SUPABASE_SERVICE_ROLE_KEY',
  // The AES vault key. Per CLAUDE.md every stored OAuth token is encrypted with
  // it, so leaking this one string leaks every connected account in every
  // workspace at once — a strictly larger blast radius than any single token.
  // It is raw key material with no recognisable format, which means the shape
  // rules will never see it and naming it here is the ONLY coverage it gets.
  'TOKEN_VAULT_KEY',
  // Signs Supabase JWTs, so it forges a valid token for any user in the
  // project. Same story: a base64 blob no pattern can pick out of a message.
  'SUPABASE_JWT_SECRET',
  // Connection strings carry the database password in their userinfo. There IS
  // a URI-credential shape rule in scrub.ts covering this, and it is a good
  // rule — but it only fires on text that still looks like a URI. Registering
  // the values means a connection string that arrives split, re-encoded or
  // partially interpolated is covered too, by exact match, with no pattern
  // needing to be right.
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  // Rewrites our own releases and source maps. Its `sntrys_eyJ…` format is
  // matched by the JWT rule now, but the token that uploads our artifacts is
  // not something to protect by shape alone.
  'SENTRY_AUTH_TOKEN',
  // Public by design (it ships in the client bundle), so this is not damage
  // control — it is format insurance. The legacy anon key is a JWT and the JWT
  // shape rule already catches it, but Supabase's newer publishable keys are
  // `sb_publishable_…`, which no pattern here matches. Naming the var means the
  // redaction does not quietly stop working the day a project rotates formats.
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/**
 * Pull the registered secrets out of an env bag, dropping the ones that would
 * be useless or harmful downstream.
 *
 * Trimmed and emptiness-filtered here rather than in the scrubber: an unset var
 * in a `.env` file reads as `''`, and `''` is a substring of every string in
 * existence — a naive `split('').join('[redacted]')` would shred every character
 * of every message. `scrub.ts` independently drops anything under 8 characters,
 * so this is belt-and-braces on the same trap, applied at the boundary where the
 * ragged real-world values actually enter.
 *
 * Takes the env bag as an argument and returns a new array, so it is a pure
 * function that can be tested without mutating `process.env` in a test runner
 * shared by every other suite.
 */
export function secretValuesFrom(
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return SECRET_ENV_VARS.map((name) => env[name]?.trim()).filter(
    (value): value is string => Boolean(value),
  )
}
