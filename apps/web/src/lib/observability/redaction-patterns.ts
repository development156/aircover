/**
 * The redaction RULES. What counts as a secret — nothing about how we walk an
 * event to find one.
 *
 * Split out of `scrub.ts` when that file crossed 300 lines. The seam is not
 * arbitrary: these two halves change for completely different reasons and on
 * completely different evidence. A rule here changes because a credential
 * format leaked (a new vendor prefix, a parameter name nobody listed) and the
 * proof is a string that should have been caught and was not. The walk in
 * `scrub.ts` changes because a SHAPE broke it — a cycle, a depth bomb, a
 * `__proto__` key — and the proof is an event structure. Keeping them in one
 * file meant every "add the new token prefix" edit sat in the same blast radius
 * as the prototype-pollution guard.
 *
 * Everything here is data. No control flow, no exports that do anything: the
 * tables are read by `redactText` and by the object walk, and are inert on
 * their own. That is deliberate — it means this file can be reviewed as a list
 * of claims about credential formats, which is the only way anyone can actually
 * check it.
 */

/** Replacement marker. Visible in the report, so a reader knows data was removed rather than absent. */
export const REDACTED = '[redacted]'

/**
 * Characters that can appear inside a credential. Used only to walk the
 * truncation point backwards off a token that the cut landed in the middle of
 * — see `safeCutIndex` in `scrub.ts`.
 */
export const TOKEN_CHAR = /[A-Za-z0-9._%+/=~-]/

/**
 * EVERY quantifier below is bounded. Not as a style preference — as the fix for
 * a measured outage.
 *
 * The email rule used to read `[A-Za-z0-9._%+-]+@…`: an unbounded run in front
 * of a required literal, with no cheap prefilter. Handed a long base64url blob
 * containing no `@`, V8 scans to the end of the string, fails, and retries from
 * the next offset — O(n^2). Measured on that rule alone, before the fix:
 *
 *     50k chars 1660ms · 100k 5881ms · 200k 23244ms · 400k 88775ms
 *
 * — 3.8x per doubling, which is the signature of a quadratic scan. The same
 * series after bounding the local part: 8ms / 23ms / 34ms / 86ms, ~2.0x per
 * doubling, and 1.3ms at the 8192-character cap this module actually enforces.
 *
 * That code ran inside `beforeSend`, on the crash path, in the user's own
 * browser tab — so the tab froze for half a minute at the exact moment the user
 * was already watching something break.
 *
 * The bound is what removes the quadratic term (RFC 5321 caps an email local
 * part at 64 characters anyway, so nothing real is lost). `MAX_SCAN_LENGTH` and
 * `maxValueLength` are the other two layers of the same defence.
 *
 * Order matters in two places, both marked below.
 */
export const PATTERNS: readonly { readonly re: RegExp; readonly with: string }[] = [
  // `Authorization: Bearer <token>`. Requires 16+ token chars so the word
  // "Bearer" in prose cannot swallow the sentence that follows it.
  { re: /\bBearer\s{1,8}[A-Za-z0-9._~+/=-]{16,4096}/gi, with: `Bearer ${REDACTED}` },

  // Credentials in a URI's userinfo. MUST RUN BEFORE THE EMAIL RULE, which
  // otherwise eats `user:pass@host.example.com` and makes this look unnecessary
  // — and that accident is exactly why the hole was invisible: a Postgres URL
  // with a DOTLESS host (`localhost`, a Docker service name, a bare IP) has no
  // domain dots, so the email rule missed it and the password shipped verbatim.
  // The scheme and host survive, because "which database refused us" is the
  // whole diagnostic value of the line.
  {
    re: /\b([a-z][a-z0-9+.-]{1,15}):\/\/[^:/?#\s]{1,256}:[^@/?#\s]{1,256}@/gi,
    with: `$1://${REDACTED}@`,
  },

  // A JWT: three dot-separated base64url segments, anchored on the `eyJ` every
  // JWT header starts with (base64 of `{"`), which is what keeps this off dotted
  // filenames and version strings.
  //
  // NO `\b` — it was actively harmful. `\b` needs a word/non-word transition,
  // and `_` is a word character, so `sntrys_eyJ…` (a Sentry auth token, which
  // can rewrite our own release artifacts) never matched. Dropping the anchor
  // only ever makes this fire more often, and `eyJ` + three base64url runs does
  // not occur in prose.
  //
  // The `i` flag matters as much: without it an uppercased JWT sailed through.
  {
    re: /eyJ[A-Za-z0-9_-]{4,4096}\.[A-Za-z0-9_-]{4,4096}\.[A-Za-z0-9_-]{4,4096}/gi,
    with: REDACTED,
  },

  // Vendor keys that announce themselves: sk_live_/sk_test_/pk_live_/rk_live_,
  // whsec_, GitHub ghp_/gho_, sk- style provider keys, and Supabase's newer
  // sb_secret_/sb_publishable_ format.
  //
  // The Supabase entry earns its place in the FORM layer specifically: the
  // browser deliberately registers no exact secret values (they would be inlined
  // into the public bundle), so client-side events have no registry at all and
  // anything not matched by shape here is not covered anywhere.
  //
  // `i` added — `SK_LIVE_…` and `GHP_…` both leaked before. It does mean
  // `[a-z]{2}_` now matches uppercase prefixes too, which is the point.
  {
    re: /\b(?:[a-z]{2}_(?:live|test)_[A-Za-z0-9]{8,256}|whsec_[A-Za-z0-9]{8,256}|gh[pousr]_[A-Za-z0-9]{16,256}|sk-[A-Za-z0-9_-]{16,256}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,256})/gi,
    with: REDACTED,
  },

  // Credential values riding in a URL or form body. Matched by PARAM NAME rather
  // than value shape, because an access token is just an opaque blob — there is
  // nothing about `ya29-…` to recognise except the key it arrived under.
  //
  // The name is matched as a SUFFIX with an arbitrary prefix in front. The old
  // rule led with `\b`, which meant any name carrying a word-character prefix
  // never matched at all: `oauth_token`, `__clerk_ticket`, `invitation_token`,
  // `reset_token`, `session_token` and `x_api_key` every one of them leaked.
  // That is not theoretical — a user opens `/join?invitation_token=…`, the page
  // throws, and the browser SDK attaches `request.url` verbatim (it reads
  // `location.href` even with `sendDefaultPii: false`), so a live invitation
  // token lands in a third-party bug tracker.
  //
  // The delimiter and the name are CAPTURED and put back. Swallowing them would
  // redact the one part of the URL that tells a reader which flow broke.
  {
    re: /(^|[?&#;\s"'{,])([A-Za-z0-9_.[\]-]{0,64}(?:access_token|refresh_token|id_token|client_secret|api_?key|token|secret|password|passwd|signature|sig|ticket|credential))=[^&\s"'#]{1,4096}/gi,
    with: `$1$2=${REDACTED}`,
  },

  // `code=` — the OAuth2 authorization code, the most valuable one-shot
  // credential in the app, and a name that was missing from the list entirely.
  //
  // IT GETS ITS OWN RULE BECAUSE THE NAME IS TOO BROAD FOR THE ONE ABOVE. Put
  // `code` in the general list and `error code=500`, `code=23505 from Postgres`
  // and every other status in every message we receive turns into `[redacted]`
  // — a scrubber that guts diagnostics fails more slowly than one that leaks,
  // but it still fails, and nobody notices because events keep arriving.
  //
  // The discriminator is POSITION, not length or entropy: an OAuth code arrives
  // as a query parameter (after `?`, `&`, `#`, or at the start of a bare
  // `query_string`), while a prose "code=" follows a space or a colon. Both
  // behaviours are available at once, and no threshold has to be guessed.
  {
    re: /(^|[?&#])([A-Za-z0-9_.[\]-]{0,64}code)=[^&\s"'#]{1,4096}/gi,
    with: `$1$2=${REDACTED}`,
  },

  // The same credential names, in a body that was already serialised to JSON
  // before it reached us. The object walk's key-name policy cannot see inside a
  // string, so `{"password":"…"}` arriving as one `request.data` STRING needs a
  // text rule. Structure is required on both sides ("name" : "value"), which is
  // what keeps this off ordinary prose.
  {
    re: /("[A-Za-z0-9_.[\]-]{0,48}(?:password|passwd|secret|token|api_?key|credential|authorization|cookie|session)[A-Za-z0-9_.[\]-]{0,48}"\s{0,8}:\s{0,8})"[^"]{0,4096}"/gi,
    with: `$1"${REDACTED}"`,
  },

  // Whole address, never a partial mask. "a***@sahodalabs.com" still identifies
  // one specific person on a five-seat workspace, which is the only size of
  // workspace we have. Every run is bounded — 64 for the local part (RFC 5321's
  // own limit), 63 per domain label (RFC 1035's), 8 labels deep — so the engine
  // does a bounded amount of work per start offset instead of scanning to the
  // end of the string and back. This is the rule that cost 29 seconds.
  //
  // MUST RUN AFTER THE URI RULE ABOVE.
  { re: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g, with: REDACTED },
]

/**
 * Key names whose STRING value is replaced wholesale, without looking at it.
 *
 * This is the layer that catches what no shape rule can. `ya29.A0AfB_…`,
 * `xoxb-…`, an AWS secret access key — these are opaque by design and
 * indistinguishable from a random identifier by inspection. The only signal
 * they carry is the key they arrived under, so that is what gets read.
 *
 * It matters most for `request.data`, which @sentry/core includes
 * unconditionally: a login or token-exchange body is a JSON object whose values
 * never match `name=value`, so before this every one of `{"password":…}`,
 * `{"apiKey":…}` and `{"access_token":…}` walked straight through.
 *
 * Substring matching, on purpose — `aws_secret_access_key` and `refreshToken`
 * have to match as readily as `secret` and `token`.
 *
 * WHY `authori[sz]|auth(?!or)` AND NOT PLAIN `auth`.
 *
 * A bare `auth` also matches "author". This app has posts with authors, so
 * `tags.authorName` and `extra.author` arrived in every crash report as
 * [redacted] — losing the answer to "whose post broke publishing" for no safety
 * gain, because a human name is not a credential.
 *
 * The obvious repair, `auth(?!or)`, is WRONG, and wrong in the dangerous
 * direction. "authorization" does not merely resemble "author" — it BEGINS with
 * it, so the lookahead throws away the most important header name on the list.
 * Measured, not assumed: `auth(?!or)` alone stops matching `authorization`,
 * `Authorization`, `authorizationHeader` and `authorised_by`.
 *
 * So the real discriminator is the letter AFTER "author": an `i` continues into
 * authoris/authoriz (permission), anything else ends the English word "author"
 * (a person). `authori[sz]` re-admits the permission words the lookahead vetoes;
 * `auth(?!or)` covers authToken, auth_header, x-auth and oauth.
 *
 * The two branches do NOT depend on their order, though it reads as if they
 * might: alternation retries every branch at the SAME start offset before
 * advancing, so `auth(?!or)` failing on "authorization" simply backtracks into
 * `authori[sz]` at that same offset. Verified both ways round. Order here is
 * readability only — do not "fix" it thinking it is load-bearing.
 *
 * Deliberately still redacted: `session_id`. A session id IS a credential —
 * whoever holds it is the user.
 *
 * Deliberately now surviving: `authorEmail` and friends. The key name is let
 * through, but an actual address in the VALUE is still caught by the email rule
 * above, so the two layers cover each other.
 */
export const SENSITIVE_KEY_NAME =
  /pass|secret|token|api[-_]?key|authori[sz]|auth(?!or)|credential|cookie|session/i
