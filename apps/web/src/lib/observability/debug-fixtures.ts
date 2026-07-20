/**
 * The fake credentials the /api/debug/sentry endpoint throws inside an error
 * message to prove that redaction actually runs in a live request.
 *
 * THEY LIVE HERE RATHER THAN INLINE IN THE ROUTE so they can be unit-tested
 * against the real scrubber. That is not tidiness — it closes a specific trap.
 * The endpoint's entire job is to emit a string that MUST come back redacted;
 * if someone edits these literals into a shape no pattern in scrub.ts matches,
 * the endpoint keeps returning 500 and still looks like it passed, while
 * quietly proving nothing at all. A test that runs these exact values through
 * `redactText` is what keeps the verification honest.
 *
 * Every value here is structurally valid and semantically worthless — the JWT
 * segments spell FAKEFAKEFAKE and NOTAREALSIGNATURE, the key is sk_live_FAKE… .
 * NEVER replace them with a real credential to "test properly": if scrubbing is
 * broken, this endpoint's whole purpose is to transmit these strings to a third
 * party, and a real key would be genuinely leaked by the very test meant to
 * prove it could not be.
 */

/** Exercises both the `Bearer` rule and the standalone JWT rule in scrub.ts. */
export const FAKE_BEARER = 'Bearer eyJhbGciOiJIUzI1NiJ9.FAKEFAKEFAKE.NOTAREALSIGNATURE'

/** Exercises the prefixed vendor-key rule (`sk_live_…`). */
export const FAKE_API_KEY = 'sk_live_FAKE0123456789'

/** The exact message the `?kind=secret` branch throws. */
export function fakeSecretMessage(): string {
  return `boom: ${FAKE_BEARER} and ${FAKE_API_KEY}`
}
