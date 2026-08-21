import { describe, expect, it } from 'vitest'

import {
  X_API_PRICE_USD,
  X_MONTHLY_RATION,
  X_RATE_LIMIT,
  checkXRation,
  xPostPriceUsd,
  xRationRefusalMessage,
} from './x-cost'

/**
 * A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD. Every case here executes the
 * refusal rather than asserting that a flag exists somewhere.
 */
describe('X per-post pricing', () => {
  it('charges 13.3x more for a post carrying a link', () => {
    // Arrange / Act
    const plain = xPostPriceUsd(false)
    const withLink = xPostPriceUsd(true)

    // Assert — the ratio is the product-relevant fact, not either price alone.
    expect(plain).toBe(0.015)
    expect(withLink).toBe(0.2)
    expect(withLink / plain).toBeCloseTo(13.33, 2)
  })

  it('quotes X’s published numbers and nothing derived from them', () => {
    // If either literal is ever "rounded for display" this fails, which is the
    // point: these are quotes, and a quote that drifts is a fabrication.
    expect(X_API_PRICE_USD.createPost).toBe(0.015)
    expect(X_API_PRICE_USD.createPostWithLink).toBe(0.2)
  })

  it('records X’s real rate limits, which are NOT what the ration counts', () => {
    // Asserted so the constant is live documentation rather than an unreferenced
    // export that rots. It is deliberately not rendered: 100 posts per 15 minutes
    // is a ceiling no small business approaches, so a meter against it would
    // always read full and teach the reader that the meter means nothing.
    // Source: https://docs.x.com/x-api/fundamentals/rate-limits (read 2026-08-19)
    expect(X_RATE_LIMIT.perUserPer15Min).toBe(100)
    expect(X_RATE_LIMIT.perAppPer24Hours).toBe(10_000)
    // And the ration is far below the burst ceiling, so the two never fight.
    expect(X_MONTHLY_RATION).toBeLessThan(X_RATE_LIMIT.perUserPer15Min)
  })
})

describe('the monthly ration', () => {
  it('allows a post when the workspace has room', () => {
    const verdict = checkXRation({ used: 0 })

    expect(verdict.allowed).toBe(true)
    expect(verdict.used).toBe(0)
    expect(verdict.remaining).toBe(X_MONTHLY_RATION)
  })

  it('REFUSES the post that would go one over, not the one after it', () => {
    // The off-by-one that matters: at `used === ration` the allowance is spent,
    // so this call must refuse. Refusing only at ration+1 would let every
    // workspace send exactly one post more than it is rationed.
    const atLimit = checkXRation({ used: X_MONTHLY_RATION })
    const oneBelow = checkXRation({ used: X_MONTHLY_RATION - 1 })

    expect(oneBelow.allowed).toBe(true)
    expect(oneBelow.remaining).toBe(1)
    expect(atLimit.allowed).toBe(false)
    expect(atLimit.remaining).toBe(0)
  })

  it('never renders a negative remainder when the ration is lowered under usage', () => {
    // Lowering the ration mid-month is a real operation. "-7 left" is not a
    // quantity anybody can act on; 0 is.
    const verdict = checkXRation({ used: X_MONTHLY_RATION + 7 })

    expect(verdict.allowed).toBe(false)
    expect(verdict.remaining).toBe(0)
  })

  it('floors a fractional or negative count rather than trusting it', () => {
    // `used` arrives from a database count. A malformed one must not widen the
    // allowance — which `Math.max(0, …)` on the REMAINDER alone would allow, by
    // letting used = -5 report 45 left.
    expect(checkXRation({ used: -5 }).remaining).toBe(X_MONTHLY_RATION)
    expect(checkXRation({ used: -5 }).used).toBe(0)
    expect(checkXRation({ used: 3.9 }).used).toBe(3)
  })

  it('carries NO price, because the allowance is counted in posts', () => {
    // A price on the verdict invites the caller to render one, and on the publish
    // path `PublishVariant.hasLink` is optional — so the quoted figure would often
    // be an assumption presented to a customer as a fact about their money.
    expect(checkXRation({ used: 0 })).not.toHaveProperty('priceUsd')
  })
})

describe('the refusal sentence', () => {
  const message = xRationRefusalMessage(checkXRation({ used: X_MONTHLY_RATION }))

  it('says nothing was sent and nothing was charged', () => {
    // The whole promise of refusing BEFORE the spend. If the copy ever softens
    // to "may have been charged", the guarantee has quietly been given up.
    expect(message).toContain('nothing was sent and nothing was charged')
  })

  it('blames Sahoda, never X', () => {
    // X did not refuse this post. Saying it did would send the customer to X's
    // support for a limit X has no knowledge of.
    expect(message).toContain('X charges Sahoda')
    expect(message).not.toMatch(/X (refused|rejected|blocked|declined)/i)
  })

  it('names the real number', () => {
    expect(message).toContain(String(X_MONTHLY_RATION))
  })

  it('says the other channels still go out', () => {
    // ONE BODY PER CHANNEL: an X refusal is a refusal of the X variant. A
    // sentence that reads as "your post is blocked" would misdescribe the
    // product's central behaviour.
    expect(message).toContain('Other channels are unaffected.')
  })
})
