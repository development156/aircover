import { describe, expect, test } from 'vitest'

import { doorErrorCode, doorTransportFailure } from './door-transport-failure'

/**
 * These tests assert the CLAIM, never the wording — the discipline
 * `lib/inbox/emptiness.ts` established for the same reason. Rewrite any sentence
 * below freely; what may not change is that none of these arms is allowed to
 * tell a customer their website could not be read.
 */

/** Every arm the route can produce, plus the two it cannot name. */
const ARMS: ReadonlyArray<{ status: number; code: string | null; what: string }> = [
  { status: 401, code: 'signed_out', what: 'the session expired' },
  { status: 400, code: 'no_workspace', what: 'the account has no workspace' },
  { status: 503, code: 'workspace_unreadable', what: 'our database was unreachable' },
  { status: 500, code: 'failed', what: 'we threw before reading' },
  { status: 502, code: null, what: 'a proxy ate the request' },
  { status: 413, code: null, what: 'the upload was refused at the edge' },
  { status: 429, code: null, what: 'rate limited' },
]

/**
 * The sentence that shipped, and the shape of it. A message is dishonest here if
 * it asserts a verdict on the document — "could not read that", "unreadable",
 * "could not read your website" — because on every arm above the document was
 * never opened.
 */
const VERDICT_ON_THE_DOCUMENT =
  /could not read (that|your (site|website|link|pdf|document))|couldn't read that|unreadable (site|website|link|pdf|document)/i

/**
 * The diversion. "Tell us in your own words instead" is the remedy for a
 * document Sahoda genuinely could not parse. Offered after an expired sign-in it
 * sends someone to retype their business by hand over a fault that a page
 * refresh fixes — and it implies, without saying it, that their site was at
 * fault.
 */
const RETYPE_DIVERSION = /in your own words instead/i

describe('doorTransportFailure', () => {
  test.each(ARMS)('$what: never claims the document could not be read', ({ status, code }) => {
    const { message } = doorTransportFailure(status, code)
    expect(message).not.toMatch(VERDICT_ON_THE_DOCUMENT)
    expect(message).not.toMatch(RETYPE_DIVERSION)
  })

  test.each(ARMS)('$what: says the document is unexamined', ({ status, code }) => {
    const { message } = doorTransportFailure(status, code)
    // The positive half. Silence about the document is not enough — the reader
    // just pressed a button on a document, so an error that does not mention it
    // WILL be read as being about it.
    expect(message).toMatch(/link|pdf|upload|document/i)
  })

  /**
   * THE GUARD, SHOWN BITING. The literal string this module was written to
   * remove must fail both matchers — otherwise a regex that matches nothing
   * would make every assertion above pass on any message at all.
   */
  test('the matchers recognise the sentence that actually shipped', () => {
    const shipped = 'We could not read that — tell us in your own words instead.'
    expect(shipped).toMatch(VERDICT_ON_THE_DOCUMENT)
    expect(shipped).toMatch(RETYPE_DIVERSION)
  })

  test('each named cause gets its own sentence — none is a duplicate', () => {
    const named = ARMS.filter((arm) => arm.code !== null)
    const messages = named.map((arm) => doorTransportFailure(arm.status, arm.code).message)
    expect(new Set(messages).size).toBe(named.length)
  })

  /**
   * A session or account fault is not retryable: pressing the button again
   * reproduces it exactly. Marking it retryable is how a "try again" button ends
   * up looping someone through the same 401 forever.
   */
  test('session and account faults are not offered as retryable', () => {
    expect(doorTransportFailure(401, 'signed_out').retryable).toBe(false)
    expect(doorTransportFailure(400, 'no_workspace').retryable).toBe(false)
    expect(doorTransportFailure(503, 'workspace_unreadable').retryable).toBe(true)
    expect(doorTransportFailure(500, 'failed').retryable).toBe(true)
  })
})

describe('doorErrorCode', () => {
  test('reads the code the route sends', () => {
    expect(doorErrorCode({ error: 'signed_out' })).toBe('signed_out')
  })

  /**
   * The crash path must not crash. A 502 from a platform proxy carries an HTML
   * body, `res.json()` rejects, and the caller passes whatever it salvaged —
   * null, a string, an empty object. All three must yield null, not throw.
   */
  test.each([[null], [undefined], ['<html>502</html>'], [{}], [{ error: '' }], [{ error: 7 }]])(
    'a body that is not the expected shape reads as no code: %s',
    (body) => {
      expect(doorErrorCode(body)).toBeNull()
    },
  )
})
