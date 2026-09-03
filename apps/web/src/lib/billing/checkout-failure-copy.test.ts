import { cashfreeHttpError } from '@sahoda/billing'
import { describe, expect, it } from 'vitest'

import {
  CHECKOUT_ON_OUR_SIDE,
  CHECKOUT_TRY_AGAIN,
  checkoutFailureMessage,
  isTransientProviderError,
} from './checkout-failure-copy'

/**
 * THE SENTENCE A CUSTOMER READS WHEN AN ORDER COULD NOT BE OPENED.
 *
 * The defect these pin is a remedy that cannot work, offered on the screen where
 * somebody is trying to pay: Cashfree answers 401 on production (Sentry issue,
 * 2026-08-24), and both checkout actions answered "Try again" to it, forever.
 *
 * These assert the CLAIM each sentence makes rather than its wording, except for
 * the two words that ARE the claim: a permanent failure must not say "try
 * again", and neither sentence may blame the customer or their card.
 */

/** The real 401 body Cashfree returns for a rejected key pair. */
const UNAUTHORIZED = cashfreeHttpError(
  'create order',
  401,
  JSON.stringify({ code: 'request_failed', message: 'authentication Failed' }),
)

/** A real transient one: Cashfree rate limiting. */
const RATE_LIMITED = cashfreeHttpError('create order', 429, JSON.stringify({ message: 'slow' }))

describe('which failures a retry can fix', () => {
  it('reads the flag the provider already stamps, rather than guessing from the text', () => {
    expect(isTransientProviderError(RATE_LIMITED)).toBe(true)
    expect(isTransientProviderError(UNAUTHORIZED)).toBe(false)
  })

  it('treats an error carrying no flag as permanent, which is the safe direction', () => {
    // A TypeError out of our own code is not fixed by pressing the button again.
    expect(isTransientProviderError(new TypeError('undefined is not a function'))).toBe(false)
    expect(isTransientProviderError(null)).toBe(false)
    expect(isTransientProviderError({ transient: 'yes' })).toBe(false)
  })
})

describe('the sentence', () => {
  it('offers a retry for a transient failure, because that is what fixes it', () => {
    expect(checkoutFailureMessage(RATE_LIMITED)).toBe(CHECKOUT_TRY_AGAIN)
    expect(CHECKOUT_TRY_AGAIN).toMatch(/try again/i)
  })

  it('offers no retry for the 401 that repeats identically', () => {
    expect(checkoutFailureMessage(UNAUTHORIZED)).toBe(CHECKOUT_ON_OUR_SIDE)
    // THE REGRESSION THIS PINS: the sentence this replaces ended "Try again."
    expect(CHECKOUT_ON_OUR_SIDE).not.toMatch(/try again/i)
  })

  it('says nothing was charged, and blames neither the customer nor their card', () => {
    for (const sentence of [CHECKOUT_TRY_AGAIN, CHECKOUT_ON_OUR_SIDE]) {
      expect(sentence).toMatch(/nothing was charged/i)
      expect(sentence).not.toMatch(/\b(your card|your bank|declined|check your details)\b/i)
      // Sahoda speaks in the third person, and no dash may sit inside a sentence.
      expect(sentence).not.toMatch(/\bI\b|\bwe\b/i)
      expect(sentence).not.toMatch(/[—–]/)
    }
  })
})
