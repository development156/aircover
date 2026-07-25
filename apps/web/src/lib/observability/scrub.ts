/**
 * Redaction for anything on its way to Sentry.
 *
 * Deliberately pure and dependency-free — no `@sentry/*` import. The scrubber is
 * the one piece of the observability stack that MUST be provable in isolation:
 * importing the SDK here would drag a transport, global handlers and a browser
 * shim into a unit test, and the tests would then be exercising Sentry rather
 * than our rules.
 *
 * Two layers, applied in confidence order:
 *   1. Exact values we registered (a decrypted OAuth token, a webhook secret).
 *      Zero false positives — if the string is there, it is the secret.
 *   2. Shape rules (JWT, Bearer, prefixed keys, emails, token query params).
 *      The net under layer 1, because the secret most likely to reach a stack
 *      trace is the one nobody remembered to register.
 *
 * The rules themselves live in `redaction-patterns.ts` — this file is the WALK
 * and the public API. See that file's header for why the two are separated.
 */

import { PATTERNS, REDACTED, SENSITIVE_KEY_NAME, TOKEN_CHAR } from './redaction-patterns'

// Re-exported so `redactText`'s callers get the marker they need to assert on
// from the same module they get the function from. Moving the constant was an
// internal reorganisation; it should not have forced an import change on every
// call site.
export { REDACTED }

/**
 * Below this length an "exact secret" is not a secret, it is a substring of
 * ordinary English. A one-character env var ("1", "0", "-") in the list turns a
 * naive substring pass into a censor that eats every message in the project —
 * "Scheduled 1 of 10 posts" becomes unreadable and nobody notices reporting has
 * died, because events still arrive. Eight characters is short enough to keep
 * every real credential and long enough that prose collisions stop happening.
 */
const MIN_SECRET_LENGTH = 8

/**
 * How far the walker descends before it stops and truncates. Real Sentry events
 * bottom out around six levels; anything past this is a React fiber, a DOM node
 * or a hostile payload. The cap is fail-SAFE — the subtree is REPLACED, never
 * passed through raw, so an over-deep branch cannot smuggle a secret out below
 * the point we stopped looking.
 */
const MAX_DEPTH = 12

const TRUNCATED = '[truncated: max depth]'
const CIRCULAR = '[circular]'

/**
 * How much of a single string the shape rules ever look at.
 *
 * The rules in `redaction-patterns.ts` are all linear now, so this is not what
 * makes the scrubber fast — it is the second of three defences against the same
 * failure, because the first (bounded quantifiers, over there) and the third
 * (`maxValueLength` in sentry-options.ts) are both one careless edit away from
 * being undone. Now that the rules live in another file, this cap is the only
 * one of the three a reader of THIS file can see, which is the reason to say so.
 *
 * 8192 characters is far past the end of any real stack trace and far short of
 * the sizes that hurt. The intent of an error report is diagnosis, not
 * archival: nobody has ever debugged anything from character 9000 of an
 * exception message.
 *
 * WHAT HAPPENS TO THE OVERFLOW: it is DELETED and replaced by a marker saying
 * how much went. It is never forwarded. A cap that shortened the scan while
 * still shipping the tail would be strictly worse than no cap — unscrubbed
 * text, transmitted, under a comment claiming it had been scrubbed.
 */
const MAX_SCAN_LENGTH = 8192

/**
 * Keys that must never be written onto a rebuilt object. Assigning `__proto__`
 * on a plain `{}` sets the prototype instead of creating a property, so a JSON
 * body of `{"__proto__":{"isAdmin":true}}` would promote itself onto every
 * object in the process — via our scrubber, of all things. Dropped outright:
 * there is no diagnostic value in a key by these names.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Deleted, not redacted. Cookies carry the session; the Authorization header
 * carries the bearer token. There is no version of either that belongs in a bug
 * report, so safety here does not depend on a pattern rule being right.
 *
 * `query_string` joins them for a different reason: it is a DUPLICATE. It
 * carries exactly the credentials `url` already carries and tells a reader
 * nothing `url` does not, so keeping it means maintaining a second surface for
 * zero diagnostic gain.
 *
 * `data` is deliberately NOT here. Unlike the three above, a request body is
 * mostly the content of the failed action — the caption that was rejected, the
 * id that did not resolve — and it is the single most useful field for working
 * out why a mutation failed. Dropping it would trade the main reason we collect
 * request context for a risk that the key-name policy and the shape rules
 * already cover. The trade is recorded here so a future edit has to disagree
 * with a decision rather than quietly fill a gap.
 */
const REQUEST_DROP_KEYS = ['cookies', 'headers', 'query_string'] as const

/**
 * The personal half of `user`. `id` deliberately survives: an opaque Clerk id is
 * the only way to tie a crash back to the workspace that hit it, and a report we
 * cannot correlate is anonymous noise that gets ignored.
 */
const USER_DROP_KEYS = ['email', 'ip_address', 'username'] as const

/**
 * Drop the entries that would do more harm than good, longest first.
 *
 * Longest-first matters when one registered secret contains another (a token and
 * the workspace prefix it embeds): redact the short one first and the long one
 * is left as a half-scrubbed fragment that still identifies the account.
 */
function usableSecrets(secretValues: readonly string[]): readonly string[] {
  return Array.from(new Set(secretValues))
    .filter((value) => typeof value === 'string' && value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)
}

/**
 * Where to cut an over-long string so the cut itself cannot leak.
 *
 * Slicing at a fixed offset can land in the MIDDLE of a credential, leaving its
 * first half in the emitted head where no shape rule will match it — a leak
 * wearing a truncation's clothes. So if the character at the cut is one a
 * credential can contain, the cut walks backwards to the start of that run.
 *
 * A head made entirely of token characters (the 200KB base64 blob that started
 * all this) therefore collapses to nothing at all. That is the right answer:
 * an unbroken 8192-character base64 run is not something anyone was going to
 * debug from.
 */
function safeCutIndex(text: string): number {
  // `text[i]` is `string | undefined` under noUncheckedIndexedAccess. Past the
  // end reads as undefined, which is not a token character — the right answer
  // for a walk that only ever moves left.
  const isTokenChar = (char: string | undefined): boolean =>
    char !== undefined && TOKEN_CHAR.test(char)

  let cut = MAX_SCAN_LENGTH
  if (!isTokenChar(text[cut])) return cut
  while (cut > 0 && isTokenChar(text[cut - 1])) cut -= 1
  return cut
}

/**
 * Redact one string: exact registered values first, then the length cap, then
 * shape rules.
 *
 * THE ORDER IS THE POINT.
 *
 * Exact values run over the WHOLE string, before anything is cut. They go
 * through split/join rather than a built regex — it replaces every occurrence,
 * needs no metacharacter escaping (a secret containing `.` or `+` would
 * otherwise become a wildcard matching innocent text), and, being a literal
 * search with no engine behind it, it is linear at any input size. Running it
 * first is also what makes a registered secret lying across the cut safe: it is
 * already gone by the time the cut happens.
 *
 * Then the string is capped and the overflow is REPLACED by a marker naming its
 * size. The tail is never forwarded, scrubbed or otherwise.
 *
 * Then the shape rules run, over a bounded string, with bounded quantifiers.
 */
export function redactText(text: string, secretValues: readonly string[]): string {
  if (!text) return text

  let output = text
  for (const secret of usableSecrets(secretValues)) {
    if (output.includes(secret)) output = output.split(secret).join(REDACTED)
  }

  if (output.length > MAX_SCAN_LENGTH) {
    const cut = safeCutIndex(output)
    output = `${output.slice(0, cut)}[truncated: ${output.length - cut} more chars]`
  }

  for (const pattern of PATTERNS) {
    output = output.replace(pattern.re, pattern.with)
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An event on the way in: arbitrary JSON-ish keys, nothing we can narrow honestly. */
export type ScrubbableEvent = Record<string, unknown>

/**
 * An event on the way out.
 *
 * `any` rather than `unknown`, deliberately and only here. A scrubbed event is
 * arbitrarily-shaped third-party JSON that nothing downstream ever READS — it is
 * serialised and shipped. Typing the values as `unknown` would not buy safety,
 * it would force a cast at every `event.exception.values[0].value` access in
 * call sites and tests, and casts are where real type errors hide. The honest
 * statement is "we do not know the shape", which is what this says.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScrubbedEvent = Record<string, any>

/**
 * Rebuild `value` with every reachable string redacted.
 *
 * `ancestors` holds only the objects on the CURRENT path (added on the way down,
 * removed on the way back up) rather than everything ever seen. A plain
 * seen-set would misreport a shared reference — the same context object hanging
 * off two breadcrumbs — as a cycle and blank out the second one.
 */
function scrubValue(
  value: unknown,
  secrets: readonly string[],
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value === 'string') return redactText(value, secrets)
  if (value === null || typeof value !== 'object') return value

  if (ancestors.has(value)) return CIRCULAR
  if (depth >= MAX_DEPTH) return TRUNCATED

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => scrubValue(entry, secrets, depth + 1, ancestors))
    }

    // A fresh object every time — the input belongs to the caller and Sentry
    // hands `beforeSend` a live event it may still be using.
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) continue

      // The key-name policy, applied to STRING leaves only. An object under a
      // credential-ish key (`auth: { attempts, token }`) is still walked, so its
      // structure survives and its own leaves get judged on their own names —
      // blanking the whole subtree would throw away context for no extra safety.
      next[key] =
        typeof entry === 'string' && SENSITIVE_KEY_NAME.test(key)
          ? REDACTED
          : scrubValue(entry, secrets, depth + 1, ancestors)
    }
    return next
  } finally {
    ancestors.delete(value)
  }
}

function omitKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!keys.includes(key)) next[key] = value
  }
  return next
}

/**
 * Scrub a Sentry event (or breadcrumb — same shape rules, same walk).
 *
 * Returns a new object; the input is never touched.
 *
 * A non-object argument comes back as `{}` rather than being handed on. Sentry
 * never produces one, so this is the JS-caller path only — and dropping an
 * event we could not inspect is the fail-safe answer, where passing it through
 * unexamined is the one outcome this whole module exists to prevent.
 */
export function scrubEvent(event: ScrubbableEvent, secretValues: readonly string[]): ScrubbedEvent {
  if (!isRecord(event)) return {}

  const secrets = usableSecrets(secretValues)
  const walked = scrubValue(event, secrets, 0, new WeakSet()) as Record<string, unknown>

  // Field policy runs AFTER the generic walk, on our own copy, so it only ever
  // removes keys — it can never reintroduce raw data the walk already redacted.
  if (isRecord(walked.request)) walked.request = omitKeys(walked.request, REQUEST_DROP_KEYS)
  if (isRecord(walked.user)) walked.user = omitKeys(walked.user, USER_DROP_KEYS)

  return walked
}
