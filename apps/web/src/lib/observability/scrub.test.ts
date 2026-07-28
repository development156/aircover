import { describe, expect, test } from 'vitest'

import { REDACTED, redactText, scrubEvent } from './scrub'

// Fake credentials, invented for this file. Shaped like the real thing so the
// pattern rules are exercised honestly, but none of them authenticate anything.
// Keep them >= 8 chars — shorter values are deliberately ignored (see below).
const SECRET_A = 'wsp_secret_AAAAAAAAAAAAAAAA'
const SECRET_B = 'vault_key_BBBBBBBBBBBBBBBB'

describe('redactText — exact secret values', () => {
  test('redacts a secret appearing mid-sentence, not just at the edges', () => {
    // Arrange — prose on both sides, which is how it actually shows up:
    // interpolated into an error message.
    const text = `Publishing failed because token ${SECRET_A} was rejected upstream`

    // Act
    const result = redactText(text, [SECRET_A])

    // Assert — value gone, surrounding prose survives so the report is still
    // diagnosable.
    expect(result).not.toContain(SECRET_A)
    expect(result).toContain(REDACTED)
    expect(result).toContain('Publishing failed because token')
    expect(result).toContain('was rejected upstream')
  })

  test('redacts every distinct secret when several appear in one string', () => {
    // A single-replacement implementation passes the test above and still leaks
    // here, which is exactly why this case is separate.
    const result = redactText(`a=${SECRET_A} b=${SECRET_B}`, [SECRET_A, SECRET_B])

    expect(result).not.toContain(SECRET_A)
    expect(result).not.toContain(SECRET_B)
  })

  test('redacts a secret that occurs more than once in the same string', () => {
    const result = redactText(`${SECRET_A} then again ${SECRET_A}`, [SECRET_A])

    expect(result).not.toContain(SECRET_A)
  })

  test('ignores empty and very short entries in secretValues', () => {
    // THE FOOTGUN. A one-character env var ("1", "0", "-") in the secret list
    // makes a naive substring pass redact every matching character in every
    // message, turning the whole report into unreadable noise. Short entries are
    // never secret enough to be worth that, so they are dropped.
    const text = 'Scheduled 1 of 10 posts for Tuesday'

    const result = redactText(text, ['1', '', ' ', '0', 'ab'])

    expect(result).toBe(text)
  })

  test('draws the short-entry line at 8 characters', () => {
    // Pins the threshold so it cannot drift silently in either direction: 7
    // chars is ignored, 8 chars is redacted.
    const sevenChars = 'abc1234'
    const eightChars = 'abc12345'

    expect(redactText(`value ${sevenChars} here`, [sevenChars])).toContain(sevenChars)
    expect(redactText(`value ${eightChars} here`, [eightChars])).not.toContain(eightChars)
  })
})

describe('redactText — pattern rules', () => {
  // These fire with NO secretValues supplied. A secret we never registered is
  // the one most likely to end up in a stack trace, so shape-matching is the
  // safety net under the exact-value list.

  test('redacts a Bearer token from an Authorization header string', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9fakeheaderpayloadsignature'

    const result = redactText(`Authorization: Bearer ${token}`, [])

    expect(result).not.toContain(token)
    expect(result).toContain(REDACTED)
  })

  test('redacts a JWT-shaped string of three base64url segments', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlLXVzZXIifQ.c2lnbmF0dXJlLWZha2U'

    const result = redactText(`session token ${jwt} expired`, [])

    expect(result).not.toContain(jwt)
    expect(result).toContain(REDACTED)
  })

  test.each([
    ['stripe live secret', 'sk_live_FAKEFAKEFAKEFAKEFAKE1234'],
    ['stripe test secret', 'sk_test_FAKEFAKEFAKEFAKEFAKE1234'],
    ['publishable live key', 'pk_live_FAKEFAKEFAKEFAKEFAKE1234'],
    ['restricted key', 'rk_live_FAKEFAKEFAKEFAKEFAKE1234'],
    ['webhook signing secret', 'whsec_FAKEFAKEFAKEFAKEFAKE1234'],
  ])('redacts a prefixed %s', (_label, key) => {
    const result = redactText(`key ${key} failed`, [])

    expect(result).not.toContain(key)
    expect(result).toContain(REDACTED)
  })

  test('redacts an email address whole, leaving nothing of the local part', () => {
    // Partial masking ("a***@sahodalabs.com") still identifies a person on a
    // small workspace, so the entire address goes.
    const result = redactText('Invite failed for aditya.sharma@sahodalabs.com', [])

    expect(result).not.toContain('aditya.sharma')
    expect(result).not.toContain('aditya.sharma@sahodalabs.com')
    expect(result).not.toContain('@sahodalabs.com')
    expect(result).toContain(REDACTED)
  })

  test.each([['access_token'], ['refresh_token']])(
    'redacts an OAuth %s fragment in a URL or body',
    (param) => {
      const value = 'ya29-FAKEoauthTOKENvalue-1234567890'

      const result = redactText(`https://example.com/cb?${param}=${value}&state=xyz`, [])

      expect(result).not.toContain(value)
      expect(result).toContain(REDACTED)
    },
  )

  test('leaves ordinary prose completely untouched', () => {
    // The regression guard against over-redaction. A scrubber that eats normal
    // sentences fails slower but just as fatally as one that leaks — nobody
    // reads a wall of [redacted].
    const prose =
      'Publishing to Google Business Profile failed after 3 attempts. ' +
      'The caption was 412 characters, over the 400 character limit. ' +
      'Retry scheduled for Tuesday at 09:30 IST.'

    expect(redactText(prose, [])).toBe(prose)
  })

  test('returns an empty string unchanged', () => {
    expect(redactText('', [SECRET_A])).toBe('')
  })
})

describe('redactText — bounded cost on hostile input', () => {
  // The scrubber runs inside beforeSend, on the crash path, in the user's
  // browser tab. An unbounded quantifier in front of a required literal makes
  // V8 retry from every start offset, so a long credential-shaped blob costs
  // O(n^2) — measured at 22 SECONDS for 200KB before this was bounded. A frozen
  // tab during a crash is the worst possible time to freeze a tab.
  //
  // @sentry/core does not save us: prepareEvent only truncates `if
  // (maxValueLength)` and destructures it with no default, so exception.value
  // and request.url reach beforeSend at whatever length they were thrown at.

  test('processes a 200KB credential-shaped blob in well under a second', () => {
    // Arrange — base64url characters that all live inside the email local-part
    // class, and no '@' anywhere, which is the exact shape that forces the
    // engine to scan to the end of the string and fail from every offset.
    const blob = 'aZ0._%+-'.repeat(25_000)

    // Act
    const started = performance.now()
    redactText(blob, [])
    const elapsed = performance.now() - started

    // Assert — a real wall-clock bound, not an assertion about the regex source.
    // Linearity is demonstrated here or it is not demonstrated at all.
    expect(elapsed).toBeLessThan(200)
  }, 60_000)

  test('cost stays flat as the hostile input grows, rather than compounding', () => {
    // Arrange — the cap means the scan is bounded by MAX_SCAN_LENGTH rather
    // than by whatever was handed in, so 20x the input must cost about the
    // same. A quadratic rule would take 400x. This is the property that
    // actually holds, and asserting it at several sizes catches a regression
    // that a single measurement at one size would not.
    //
    // Best-of-5 per size, and a budget with three orders of magnitude of
    // headroom: this measures the FLOOR, which stays honest on a loaded CI box
    // where any single sample can be interrupted by another process.
    const best = (chars: number): number => {
      const blob = 'aZ0._%+-'.repeat(chars / 8)
      let floor = Infinity
      for (let i = 0; i < 5; i += 1) {
        const started = performance.now()
        redactText(blob, [])
        floor = Math.min(floor, performance.now() - started)
      }
      return floor
    }

    // Act / Assert
    expect(best(50_000)).toBeLessThan(50)
    expect(best(200_000)).toBeLessThan(50)
    expect(best(1_000_000)).toBeLessThan(50)
  }, 60_000)

  test('scans a huge input for registered secrets without a regex engine', () => {
    // The one pass that DOES see the whole string, because it has to run before
    // truncation. It is a literal search — split/join, no pattern — so it is
    // linear at any size, and a secret sitting 190KB into the string is still
    // found and removed.
    const secret = 'wsp_secret_DEEPINTHEBLOBAAAAAAAA'
    const blob = `${'aZ0._%+-'.repeat(24_000)}${secret}`

    const started = performance.now()
    const result = redactText(blob, [secret])
    const elapsed = performance.now() - started

    expect(result).not.toContain(secret)
    expect(elapsed).toBeLessThan(200)
  }, 60_000)

  test('replaces the overflow tail with a visible marker instead of forwarding it', () => {
    // Arrange — the cap is the second defence, and it is only a defence if the
    // overflow is DROPPED. Truncating the scan while passing the tail through
    // untouched would be strictly worse than no cap at all: unscrubbed text,
    // shipped, with a comment claiming it was scrubbed.
    const text = `${'padding '.repeat(2_000)}TAILSENTINELVALUE`

    // Act
    const result = redactText(text, [])

    // Assert
    expect(result).not.toContain('TAILSENTINELVALUE')
    expect(result).toContain('[truncated')
  })

  test('keeps the head of an over-long string diagnosable', () => {
    // The cap must not turn a long stack trace into nothing. The first 8192
    // characters are where the useful frames are.
    const result = redactText(`Publishing failed at step 4. ${'x'.repeat(20_000)}`, [])

    expect(result).toContain('Publishing failed at step 4.')
  })

  test('redacts a registered secret that straddles the truncation boundary', () => {
    // Arrange — the nastiest case. Cutting first and scanning second would
    // leave the first half of the token sitting in the emitted head, which is
    // a leak dressed up as a truncation.
    const secret = 'wsp_secret_STRADDLESTRADDLESTRADDLE'
    const text = `${'x'.repeat(8_180)}${secret}${'y'.repeat(5_000)}`

    // Act
    const result = redactText(text, [secret])

    // Assert — no fragment of the token survives, not merely no whole token.
    expect(result).not.toContain(secret)
    expect(result).not.toContain('wsp_secret_STRA')
  })

  test('leaves a string under the cap byte-for-byte alone', () => {
    // The cap must be invisible on every real message. Only the pathological
    // ones pay for it.
    const ordinary = 'Retry scheduled for Tuesday at 09:30 IST.'

    expect(redactText(ordinary, [])).toBe(ordinary)
  })
})

describe('redactText — token-bearing query parameters', () => {
  // The old rule was anchored with \b, so any parameter name carrying a
  // word-character prefix slipped past it entirely. That is not a corner case:
  // a user opens /join?invitation_token=…, the page throws, and the browser SDK
  // attaches request.url verbatim (httpcontext.js sets request.url =
  // location.href even with sendDefaultPii false). A live invitation token then
  // lands in a third-party bug tracker.

  test.each([
    ['oauth_token'],
    ['__clerk_ticket'],
    ['invitation_token'],
    ['reset_token'],
    ['session_token'],
    ['x_api_key'],
    ['user.credential'],
    ['signature'],
    ['access_token'],
    ['client_secret'],
  ])('redacts the value carried by a %s parameter', (name) => {
    // Arrange
    const value = 'FAKEcredentialVALUE1234567890'

    // Act
    const result = redactText(`https://app.sahodalabs.com/join?${name}=${value}&state=xyz`, [])

    // Assert
    expect(result).not.toContain(value)
    expect(result).toContain(REDACTED)
  })

  test('keeps the parameter name visible so the report still says what leaked', () => {
    // Redacting the name along with the value throws away the one piece of the
    // URL that tells a reader which flow broke.
    const result = redactText('/join?invitation_token=FAKEinviteVALUE12345&state=xyz', [])

    expect(result).toContain('invitation_token=')
    expect(result).toContain('state=xyz')
  })

  test('redacts an OAuth2 authorization code riding in a query string', () => {
    // The single most valuable one-shot credential in the whole app, and its
    // name was absent from the list entirely.
    const code = '4/0AeanS0bFAKEauthorizationCODEvalue1234567890'

    const result = redactText(`https://app.sahodalabs.com/cb?code=${code}&state=xyz`, [])

    expect(result).not.toContain(code)
  })

  test('redacts a code parameter at the very start of a query_string field', () => {
    // request.query_string arrives without the leading '?', so '^' has to count
    // as a parameter boundary too.
    const result = redactText('code=4/0AeanS0bFAKEcodeVALUE123&state=xyz', [])

    expect(result).not.toContain('4/0AeanS0bFAKEcodeVALUE123')
  })

  test('leaves a prose "code=" carrying a diagnostic status, not a credential', () => {
    // THE TRADE-OFF, pinned. "code" is a broad name; matching it anywhere would
    // shred the status codes and error codes that make a report actionable.
    // Scoped to query position, both behaviours are available at once.
    const prose = 'Upload rejected: error code=500 after 3 attempts, code=23505 from Postgres'

    expect(redactText(prose, [])).toBe(prose)
  })
})

describe('redactText — credentials embedded in a URI', () => {
  test.each([
    [
      'a dotless localhost host',
      'postgresql://postgres:MySecretPw@localhost:5432/postgres',
      'MySecretPw',
    ],
    ['a docker service name', 'postgres://admin:TopSecret123@db:5432/app', 'TopSecret123'],
    ['a bare ip address', 'redis://default:R3disPassw0rd@10.0.0.5:6379', 'R3disPassw0rd'],
  ])('redacts the password in a connection URI with %s', (_label, uri, password) => {
    // Arrange / Act
    const result = redactText(uri, [])

    // Assert — the password goes, the scheme and host stay, because "which
    // database refused the connection" is the entire diagnostic value.
    expect(result).not.toContain(password)
    expect(result).toContain(REDACTED)
  })

  test('keeps the scheme so the reader can still tell which service failed', () => {
    const result = redactText('postgresql://postgres:MySecretPw@localhost:5432/postgres', [])

    expect(result).toContain('postgresql://')
    expect(result).toContain('localhost:5432')
  })
})

describe('redactText — case-insensitivity and newer key formats', () => {
  test.each([
    ['an uppercased stripe secret', 'SK_LIVE_FAKEFAKEFAKEFAKEFAKE1234'],
    ['an uppercased github token', 'GHP_FAKEFAKEFAKEFAKEFAKE12345678'],
    ['an uppercased JWT', 'EYJHBGCIOIJIUZI1NIJ9.EYJZDWIIOIJMYWTLIN0.C2LNBMF0DXJLLWZHA2U'],
    ['a supabase secret key', 'sb_secret_FAKEsupabaseSECRETvalue'],
    ['a supabase publishable key', 'sb_publishable_FAKEsupabasePUBvalue'],
    ['an uppercased supabase secret key', 'SB_SECRET_FAKEsupabaseSECRETvalue'],
  ])('redacts %s', (_label, key) => {
    const result = redactText(`key ${key} was rejected`, [])

    expect(result).not.toContain(key)
    expect(result).toContain(REDACTED)
  })

  test('redacts a Sentry auth token whose JWT body follows an underscore', () => {
    // \b sits BETWEEN two word characters here ('_' then 'e'), which means it
    // never fires — so the one token format that can rewrite our own release
    // artifacts was the one format the JWT rule could not see.
    const token = 'sntrys_eyJpYXQiOjE3MDAwMDAwMDB9.FAKEFAKEFAKE.NOTAREALSIGNATURE'

    const result = redactText(`auth token ${token} was rejected`, [])

    expect(result).not.toContain('eyJpYXQiOjE3MDAwMDAwMDB9')
  })
})

describe('redactText — credential keys in a JSON payload', () => {
  test.each([
    ['password', '{"email":"a@example.com","password":"hunter2hunter2"}', 'hunter2hunter2'],
    ['apiKey', '{"apiKey":"abcdefghijklmnop1234"}', 'abcdefghijklmnop1234'],
    [
      'access_token',
      '{"access_token":"ya29.A0AfB_FAKEopaqueGOOGLEtoken"}',
      'ya29.A0AfB_FAKEopaqueGOOGLEtoken',
    ],
  ])('redacts the %s value in a stringified body', (_label, body, value) => {
    // A request body that was already serialised before it reached the event is
    // a plain string, so the object walk never sees its keys. The name has to
    // be recognised in the text too.
    const result = redactText(body, [])

    expect(result).not.toContain(value)
  })

  test('keeps an innocuous JSON field intact', () => {
    // Over-redaction guard for the same rule. A body scrubbed down to nothing
    // tells a reader as little as a body that never arrived.
    const result = redactText('{"caption":"Open at 9am","attempts":3}', [])

    expect(result).toBe('{"caption":"Open at 9am","attempts":3}')
  })
})

describe('scrubEvent — the fields Sentry actually ships', () => {
  function pristineEvent() {
    return {
      message: `boom ${SECRET_A}`,
      exception: { values: [{ type: 'Error', value: `thrown with ${SECRET_A}` }] },
      breadcrumbs: [{ category: 'console', message: `logged ${SECRET_A}` }],
      extra: { nested: { deeper: `extra ${SECRET_A}` } },
      contexts: { workspace: { note: `context ${SECRET_A}` } },
      request: {
        url: `https://app.sahodalabs.com/cb?access_token=${SECRET_A}`,
        query_string: `token=${SECRET_A}`,
        data: { body: `payload ${SECRET_A}` },
        cookies: { __session: 'fake-session-cookie-value' },
        headers: { authorization: `Bearer ${SECRET_A}` },
      },
      user: {
        id: 'user_2fakeClerkIdOpaque',
        email: 'someone@sahodalabs.com',
        ip_address: '203.0.113.7',
        username: 'someone',
      },
    }
  }

  test('redacts the secret in every field it walks', () => {
    // Arrange
    const event = pristineEvent()

    // Act
    const result = scrubEvent(event, [SECRET_A])

    // Assert — field by field, because a walker that misses one branch passes
    // any single-field assertion.
    expect(result.message).not.toContain(SECRET_A)
    expect(result.exception.values[0].value).not.toContain(SECRET_A)
    expect(result.breadcrumbs[0].message).not.toContain(SECRET_A)
    expect(result.extra.nested.deeper).not.toContain(SECRET_A)
    expect(result.contexts.workspace.note).not.toContain(SECRET_A)
    expect(result.request.url).not.toContain(SECRET_A)
    expect(result.request.data.body).not.toContain(SECRET_A)
    // query_string used to be asserted here field-by-field. It is now DELETED
    // outright (see the drop-keys test below), which is strictly stronger than
    // redacting it — so the assertion moves up a level to cover the whole event
    // rather than being dropped.
    expect(JSON.stringify(result)).not.toContain(SECRET_A)
  })

  test('deletes request cookies and headers entirely', () => {
    // Deleted, not redacted. These carry the session cookie and the
    // Authorization header; there is no version of them we want in a bug
    // report, so no pattern rule should have to be right for us to be safe.
    const result = scrubEvent(pristineEvent(), [])

    expect('cookies' in result.request).toBe(false)
    expect('headers' in result.request).toBe(false)
  })

  test('deletes request query_string, which duplicates url with no extra value', () => {
    // Dropped rather than redacted. query_string carries exactly the same
    // credentials as url and adds nothing a reader cannot get from url, so it
    // is a second surface to keep right for no benefit. Deleting it means no
    // pattern rule has to be correct for this field to be safe.
    const result = scrubEvent(pristineEvent(), [])

    expect('query_string' in result.request).toBe(false)
  })

  test('keeps request.data, which is where the failing payload lives', () => {
    // Deliberately NOT dropped. Unlike cookies and headers, a request body is
    // mostly diagnostic content — the caption that was rejected, the id that
    // did not resolve — and it is the single most useful field for debugging a
    // failed action. It is covered by the key-name policy and the shape rules
    // instead. This test exists so a future "drop everything" edit has to argue
    // with a named decision rather than silently win.
    const result = scrubEvent(pristineEvent(), [])

    expect('data' in result.request).toBe(true)
  })

  test('deletes user email, ip and username but preserves the opaque id', () => {
    const result = scrubEvent(pristineEvent(), [])

    // The half that protects the person.
    expect('email' in result.user).toBe(false)
    expect('ip_address' in result.user).toBe(false)
    expect('username' in result.user).toBe(false)
    // The half that keeps the report actionable — an opaque Clerk id is our only
    // way to tie a crash back to the workspace that hit it. Scrubbing it too
    // leaves anonymous, uncorrelatable noise.
    expect(result.user.id).toBe('user_2fakeClerkIdOpaque')
  })

  test('redacts inside arrays as well as objects', () => {
    const event = { extra: { tags: [`first ${SECRET_A}`, { deep: `second ${SECRET_A}` }] } }

    const result = scrubEvent(event, [SECRET_A])

    expect(result.extra.tags[0]).not.toContain(SECRET_A)
    expect(JSON.stringify(result)).not.toContain(SECRET_A)
  })

  test('does not mutate the input event', () => {
    // Sentry hands beforeSend a live object; mutating it would scrub state that
    // the caller may still be using, and makes the function untestable in
    // isolation. House rule regardless: never mutate an input argument.
    const event = pristineEvent()
    const before = structuredClone(event)

    scrubEvent(event, [SECRET_A])

    expect(event).toEqual(before)
  })

  test('returns a result that shares no mutable structure with the input', () => {
    const event = pristineEvent()

    const result = scrubEvent(event, [SECRET_A])

    expect(result.extra).not.toBe(event.extra)
    expect(result.extra.nested).not.toBe(event.extra.nested)
  })
})

describe('scrubEvent — key-name policy', () => {
  // The shape rules can only catch credentials that LOOK like credentials. An
  // opaque provider token (ya29.…, xoxb-…, an AWS secret) is indistinguishable
  // from a random identifier by inspection — the only signal is the key it
  // arrived under. This is the layer that reads that signal.

  test.each([
    ['password', 'hunter2hunter2'],
    ['apiKey', 'abcdefghijklmnop1234'],
    ['access_token', 'ya29.A0AfB_FAKEopaqueGOOGLEtoken'],
    ['refreshToken', 'xoxb-FAKE-slack-bot-token-value'],
    ['aws_secret_access_key', 'wJalrXUtnFEMIfakeAWSsecretKEYvalue'],
    ['sessionId', 'sess_FAKEopaqueSESSIONvalue'],
    ['Authorization', 'Basic ZmFrZTpjcmVkZW50aWFs'],
    ['db_credential', 'FAKEopaqueCREDENTIALvalue'],
  ])('redacts a string under the %s key whatever shape its value has', (key, value) => {
    // Arrange — request.data is where a failed mutation's body lands, and
    // @sentry/core sets include.data unconditionally true.
    const event = { request: { data: { [key]: value } } }

    // Act
    const result = scrubEvent(event, [])

    // Assert
    expect(result.request.data[key]).toBe(REDACTED)
  })

  test('applies the key-name policy at every depth, not just the top level', () => {
    const event = { extra: { context: { config: { client_secret: 'FAKEopaqueCLIENTsecret' } } } }

    const result = scrubEvent(event, [])

    expect(result.extra.context.config.client_secret).toBe(REDACTED)
  })

  test('redacts a credential key nested inside an array of records', () => {
    const event = { extra: { attempts: [{ token: 'FAKEopaqueTOKENvalue' }] } }

    const result = scrubEvent(event, [])

    expect(JSON.stringify(result)).not.toContain('FAKEopaqueTOKENvalue')
  })

  test('leaves ordinary keys and their values untouched', () => {
    // The over-redaction guard for this layer. A policy that eats every key
    // makes the request body worthless, which is the whole reason we keep it.
    const event = { request: { data: { caption: 'Open at 9am', attempts: 3, status: 'failed' } } }

    const result = scrubEvent(event, [])

    expect(result.request.data).toEqual({ caption: 'Open at 9am', attempts: 3, status: 'failed' })
  })

  test('recurses into a credential-named key whose value is an object', () => {
    // Blanking a whole subtree would lose its structure; the walk still has to
    // descend and scrub the leaves.
    const event = { extra: { auth: { attempts: 2, token: 'FAKEopaqueNESTEDtoken' } } }

    const result = scrubEvent(event, [])

    expect(result.extra.auth.attempts).toBe(2)
    expect(result.extra.auth.token).toBe(REDACTED)
  })
})

describe('scrubEvent — the key-name policy must not eat "author"', () => {
  // The policy matches key names by SUBSTRING, which is what lets it catch
  // `aws_secret_access_key` and `refreshToken` without listing every variant.
  // The cost is collisions, and "auth" inside "author" was a real one: a post's
  // authorName came out of every crash report as [redacted]. This app has posts
  // with authors, so that is a diagnostic loss on a field we actually read —
  // "which author's post broke publishing" is often the whole question.
  //
  // Both lists are pinned together on purpose. Tightening a substring rule is
  // exactly the edit where you fix the false positive and quietly open a false
  // NEGATIVE next to it, and "authorization" is the trap: it does not merely
  // resemble "author", it STARTS with it, so the obvious auth(?!or) fix silently
  // stops redacting the single most important header name in the list.

  const OPAQUE = 'FAKEopaqueVALUE1234567890'

  test.each([
    ['authorization'],
    ['authToken'],
    ['auth_header'],
    ['x-auth'],
    ['password'],
    ['apiKey'],
    ['api_key'],
    ['access_token'],
    ['refresh_token'],
    ['client_secret'],
    ['credential'],
    ['cookie'],
    // A session id IS a credential — whoever holds it is the user.
    ['session_id'],
    ['sessionToken'],
  ])('still redacts a string under the %s key', (key) => {
    // Arrange — an opaque value that matches NO shape rule, so a pass here
    // proves the key-name layer fired rather than a pattern picking it up.
    const event = { request: { data: { [key]: OPAQUE } } }

    // Act
    const result = scrubEvent(event, [])

    // Assert
    expect(result.request.data[key]).toBe(REDACTED)
  })

  test.each([['author'], ['authorName'], ['authors'], ['authored_at']])(
    'leaves the %s key intact, because a post author is not a credential',
    (key) => {
      // Arrange — a human name, which no shape rule touches either.
      const event = { tags: { [key]: 'Ada Lovelace' } }

      // Act
      const result = scrubEvent(event, [])

      // Assert
      expect(result.tags[key]).toBe('Ada Lovelace')
    },
  )

  test('keeps the author while still redacting the token beside it', () => {
    // The two rules have to hold on the SAME object. A fix that survives only
    // when the innocent key is alone has not been tested against the thing it
    // sits next to in real payloads.
    const event = { extra: { author: 'Ada', authorName: 'Ada Lovelace', authToken: OPAQUE } }

    const result = scrubEvent(event, [])

    expect(result.extra.author).toBe('Ada')
    expect(result.extra.authorName).toBe('Ada Lovelace')
    expect(result.extra.authToken).toBe(REDACTED)
  })
})

describe('scrubEvent — hostile and degenerate payloads', () => {
  test('terminates on an event containing a circular reference', () => {
    // Breadcrumb payloads routinely contain React fibers and DOM nodes, which
    // are cyclic. A naive recursive walk hangs the process inside beforeSend.
    const cyclic: Record<string, unknown> = { message: `boom ${SECRET_A}` }
    cyclic.self = cyclic

    let result: Record<string, unknown> | undefined
    expect(() => {
      result = scrubEvent(cyclic, [SECRET_A])
    }).not.toThrow()

    // and the reachable fields were still scrubbed on the way past the cycle
    expect(result?.message).not.toContain(SECRET_A)
  })

  test('does not write through to Object.prototype via a __proto__ key', () => {
    // Arrange — an object literal with "__proto__" sets the prototype rather
    // than creating an own key, so JSON.parse is the only way to build the
    // genuinely dangerous shape. This is what an attacker-controlled response
    // body looks like once parsed.
    const event = JSON.parse(
      '{"extra":{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"},"prototype":{"polluted":"yes"}}}',
    )

    // Act
    scrubEvent(event, [])

    // Assert — a rebuild that assigns keys onto a fresh {} without guarding
    // these three names promotes the payload onto every object in the process.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  test('handles very deep nesting without leaking the secret or blowing the stack', () => {
    // Arrange — 1000 levels. Deeper than any real event, which is the point:
    // whatever the implementation does at the bottom must be fail-SAFE.
    let deep: Record<string, unknown> = { leaf: `bottom ${SECRET_A}` }
    for (let i = 0; i < 1000; i += 1) deep = { child: deep }

    // Act
    let result: unknown
    expect(() => {
      result = scrubEvent({ extra: deep }, [SECRET_A])
    }).not.toThrow()

    // Assert — a depth cap is fine, but it must truncate the subtree rather
    // than pass it through raw. Either way the secret must not survive.
    expect(JSON.stringify(result)).not.toContain(SECRET_A)
  })

  test('tolerates null, undefined and non-object leaves', () => {
    const event = {
      message: null,
      extra: { a: undefined, b: 42, c: true, d: null, e: [null, undefined, 7] },
      user: undefined,
      request: null,
    }

    expect(() => scrubEvent(event, [SECRET_A])).not.toThrow()
  })

  test('tolerates an event with none of the known fields', () => {
    const result = scrubEvent({ unrelated: 'value' }, [SECRET_A])

    expect(result.unrelated).toBe('value')
  })
})
