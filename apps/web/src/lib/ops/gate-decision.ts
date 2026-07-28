/**
 * The one decision the `/admin` gate makes, isolated so it can be tested.
 *
 * Middleware asks PostgREST for a single row of `ops_admins` using the caller's
 * own Clerk token. Under RLS that select is gated by `app.is_ops_admin()`, so
 * the *visibility* of any row is itself the proof of membership — there is no
 * field to interpret, only "did rows come back".
 *
 * FAILS CLOSED, and this is the property that matters most:
 *
 *   · zero seats seeded (ADMIN_BOOTSTRAP_EMAILS empty) → PostgREST returns `[]`
 *     → false → 404. There is deliberately no "no admins exist yet, so let the
 *     first visitor in" bootstrap path. That footgun is how an admin console
 *     ends up open on its first deploy, and the recovery — seeding a seat with
 *     `pnpm ops:seed` — is a minute's work with no window of exposure.
 *   · a PostgREST error body is an OBJECT (`{code, message, …}`), not an array,
 *     so a failing database reads as "not an admin" rather than as truthy data.
 *   · anything else — null, undefined, a string, a number — is false.
 *
 * Pure: no fetch, no env, no Clerk. The network call around it lives in
 * middleware.ts, which has nothing left to get wrong.
 */
export function provesOpsAdmin(body: unknown): boolean {
  return Array.isArray(body) && body.length > 0
}
