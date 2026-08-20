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

  const SOURCES = [
    '../../../../../packages/publishing/src/format-refusal.ts',
    '../../../../../packages/publishing/src/thread-plan.ts',
    '../../../../../packages/publishing/src/zernio/variant-options.ts',
    '../../../../../packages/publishing/src/zernio/platform-data.ts',
  ]

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
