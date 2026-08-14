import { describe, expect, it } from 'vitest'

import { PRODUCTION_INGEST_URL, resolveIngestUrl } from './ops-env.mjs'

/**
 * SL-061 Tier 2. These assertions exist because the default was REVERSED, and a
 * reversal with no test is one edit away from being reversed back by somebody
 * reading the older, equally reasonable comment.
 */
describe('where the sync publishes when nobody said', () => {
  it('publishes to production by default', () => {
    // The whole point of the tier: a board that nobody synced sat 30 hours
    // behind, because the default aimed at a machine that was not running.
    const resolved = resolveIngestUrl('')
    expect(resolved.ingestUrl).toBe(PRODUCTION_INGEST_URL)
    expect(resolved.ingestUrlIsProduction).toBe(true)
    expect(resolved.ingestUrlSource).toBe('default')
  })

  it('never defaults to a developer machine', () => {
    expect(resolveIngestUrl('').ingestUrl).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it('lets a developer machine be chosen, but only on purpose', () => {
    const resolved = resolveIngestUrl('http://localhost:3100')
    expect(resolved.ingestUrl).toBe('http://localhost:3100')
    expect(resolved.ingestUrlIsProduction).toBe(false)
    expect(resolved.ingestUrlSource).toBe('OPS_INGEST_URL')
  })

  it('recognises production even when it is named explicitly', () => {
    // Someone pasting the production URL into OPS_INGEST_URL must get the same
    // warnings as someone who left it unset — the target is what matters, not
    // how it was spelled.
    expect(resolveIngestUrl(`${PRODUCTION_INGEST_URL}/`).ingestUrlIsProduction).toBe(true)
  })

  it('does not mistake a typo for a local address', () => {
    // An unparseable value is not production and not localhost. The sync fails
    // loudly on it rather than quietly posting somewhere unintended.
    const resolved = resolveIngestUrl('htp:/app.sahodalabs')
    expect(resolved.ingestUrlIsProduction).toBe(false)
    expect(resolved.ingestUrl).toBe('htp:/app.sahodalabs')
  })

  it('does not treat a lookalike host as production', () => {
    // Suffix confusion: the guard must compare ORIGINS, not test `startsWith`.
    // Kept in step with PRODUCTION_INGEST_URL deliberately — pinned to the old
    // `app.sahodalabs.com` this would still pass while proving nothing, because
    // the string would no longer relate to the origin being defended.
    expect(resolveIngestUrl(`${PRODUCTION_INGEST_URL}.evil.test`).ingestUrlIsProduction).toBe(false)
    expect(resolveIngestUrl('https://sahodalabs.vercel.app.evil.test').ingestUrlIsProduction).toBe(
      false,
    )
  })

  /**
   * SL-080. The default published to `app.sahodalabs.com` for a week; that host
   * is not this project and returns Vercel's `DEPLOYMENT_NOT_FOUND`, so every
   * board move went into a hole while each sync reported a queue it would
   * replay. 140 QA runs were evicted by the 200-run cap before it ever drained.
   *
   * Asserted as a NEGATIVE against the specific dead host rather than only as a
   * positive on the live one: someone restoring the old constant from the older
   * comment above it is the exact regression this is here to stop, and a test
   * that only checks the new value would go green on a third, equally dead host.
   */
  it('never publishes to the host that was never attached to this project', () => {
    expect(new URL(PRODUCTION_INGEST_URL).host).not.toBe('app.sahodalabs.com')
    expect(resolveIngestUrl('').ingestUrl).not.toMatch(/app\.sahodalabs\.com/)
  })
})
