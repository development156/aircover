import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describePublishError } from './publish-error-copy'

const GENERIC = 'Something went wrong sending this one. Try again, or ask us to take a look.'

describe('describePublishError', () => {
  it('never echoes a stored message for a code it does not know', () => {
    const display = describePublishError('SOMETHING_ZERNIO_INVENTED')
    expect(display.message).toBe(GENERIC)
  })

  it('handles a null code', () => {
    expect(describePublishError(null).message).toBe(GENERIC)
  })
})

/**
 * ── THE GAP THIS FILE WAS WRITTEN TO CLOSE, AND TO KEEP CLOSED ──────────────
 * `runPublishPost` refuses a post with a CODE and a sentence that says exactly
 * what is wrong. This map turns that code into copy, and every code missing from
 * it degrades to "Something went wrong sending this one. Try again" — advice that
 * is actively false, because a post refused for its shape fails identically every
 * time.
 *
 * Four format codes and the Google CTA codes were missing on 2026-08-20, months
 * after the refusals that emit them shipped. Nothing noticed, because a generic
 * sentence is a plausible-looking sentence.
 *
 * So this does not check a list I typed twice. It READS the refusal sources for
 * the codes they actually emit and requires each to have copy — which is the only
 * form of this test that fails when someone adds a refusal and forgets this file.
 */
describe('every refusal code the publish path can emit has copy', () => {
  const readSource = (relative: string): string =>
    readFileSync(resolve(import.meta.dirname, relative), 'utf8')

  /** `code: 'THING'` — the shape every refusal in these files is built with. */
  const codesIn = (source: string): string[] => {
    const found = new Set<string>()
    for (const match of source.matchAll(/\bcode:\s*'([A-Z][A-Z0-9_]{2,})'/g)) {
      found.add(match[1]!)
    }
    return [...found]
  }

  /**
   * `fail(message, 'THING', …)` — the adapter's POSITIONAL shape.
   *
   * The sweep above reads `code: 'THING'` and found nothing in `adapters/zernio.ts`,
   * because that file never writes the key: its `fail()` helper takes the code as
   * the second argument. So the adapter was invisible to a test whose whole purpose
   * is that no refusal source is invisible, and `ALREADY_POSTED` and
   * `PROVIDER_UNAUTHORIZED` reached customers as "Something went wrong. Try again"
   * with a Retry button beside them — for months, in the duplicate case, a button
   * that could never once have worked.
   *
   * Two extractors, not one widened regex: a pattern loose enough to catch both
   * would also catch the second argument of every other two-string call in the
   * tree.
   *
   * Anchored on the CLASSIFICATION that always follows the code, because the first
   * argument is a customer sentence and sentences contain commas — a `[^,]+` for
   * the message stops inside "…last 24 hours, so this one was not sent again" and
   * misses the very code this test was added for. Measured, on the first run.
   *
   * `fail(msg, err.code, …)` at the tail of `fromZernio` passes a VARIABLE and is
   * deliberately not matched: those codes come from the client's own vocabulary,
   * which the other sources already sweep.
   */
  const positionalCodesIn = (source: string): string[] => {
    const found = new Set<string>()
    const pattern = /\bfail\([\s\S]*?'([A-Z][A-Z0-9_]{2,})',\s*'(?:permanent|transient)'/g
    for (const match of source.matchAll(pattern)) {
      found.add(match[1]!)
    }
    return [...found]
  }

  const ADAPTER_SOURCE = '../../../../../packages/publishing/src/adapters/zernio.ts'

  const SOURCES = [
    '../../../../../packages/publishing/src/format-refusal.ts',
    '../../../../../packages/publishing/src/thread-plan.ts',
    '../../../../../packages/publishing/src/zernio/variant-options.ts',
    '../../../../../packages/publishing/src/zernio/platform-data.ts',
  ]

  it('reads the adapter too, which writes its codes positionally', () => {
    const codes = positionalCodesIn(readSource(ADAPTER_SOURCE))
    // An empty sweep passes forever, which is the failure this whole file exists
    // to prevent — so the extractor must prove it read something first.
    expect(codes.length).toBeGreaterThan(0)
    expect(codes).toContain('ALREADY_POSTED')

    const missing = codes.filter((code) => describePublishError(code).message === GENERIC)
    expect(missing).toEqual([])
  })

  it('never tells someone to retry a post the platform already has', () => {
    // The duplicate refusal is the sharpest case: retrying sends identical bytes
    // into the same 24-hour window. `variant-status.ts` renders Retry from
    // `worthRetrying`, so this assertion is what keeps that button off the row.
    expect(describePublishError('ALREADY_POSTED').worthRetrying).toBe(false)
    expect(describePublishError('ALREADY_POSTED').message).toContain('Change the wording')

    // And reconnecting cannot fix Sahoda's own key, so that affordance stays off too.
    expect(describePublishError('PROVIDER_UNAUTHORIZED').worthRetrying).toBe(false)
    expect(describePublishError('PROVIDER_UNAUTHORIZED').needsReconnect).toBe(false)
  })

  it('finds refusal codes to check — an empty sweep would pass forever', () => {
    const all = SOURCES.flatMap((path) => codesIn(readSource(path)))
    expect(all.length).toBeGreaterThan(15)
    // A spot check that the extractor reads what it claims to.
    expect(all).toContain('FORMAT_NEEDS_MEDIA')
    expect(all).toContain('THREAD_UNBREAKABLE')
    expect(all).toContain('POLL_WITH_MEDIA')
    expect(all).toContain('GBP_EVENT_NEEDS_DATE')
  })

  it.each(SOURCES)('%s', (path) => {
    const missing = codesIn(readSource(path)).filter(
      (code) => describePublishError(code).message === GENERIC,
    )
    expect(missing).toEqual([])
  })

  it('gives every one of them advice that is not "try again"', () => {
    // A refusal about the post's shape retrying identically is the one piece of
    // advice guaranteed to be wrong. THREAD_NOT_PLANNED is the exception and is
    // named: it is a plan that failed to travel, not a rule the writer broke.
    const codes = SOURCES.flatMap((path) => codesIn(readSource(path)))
    const wrongly = codes.filter(
      (code) => describePublishError(code).worthRetrying && code !== 'THREAD_NOT_PLANNED',
    )
    expect(wrongly).toEqual([])
  })
})
