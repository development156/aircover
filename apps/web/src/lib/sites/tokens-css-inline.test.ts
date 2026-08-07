import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { TOKENS_CSS } from './tokens-css-inline'
import { sharedTokensCss } from './tokens-css'

/**
 * `tokens.css` is the single source of truth (Design System §2) but the /sites
 * preview needs it as a string in a serverless bundle where the filesystem read
 * cannot be relied on. The copy therefore lives in `tokens-css-inline.ts`, and
 * THIS test is the thing that keeps the copy honest: it reads the real file
 * from disk — which works fine here, in Node, at test time — and fails loudly
 * if the two ever diverge.
 *
 * If this fails: re-generate `tokens-css-inline.ts` from `packages/shared/
 * tokens.css`. Never edit the inline copy by hand.
 */
const TOKENS_CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/shared/tokens.css',
)

describe('tokens.css inline copy', () => {
  test('is byte-for-byte identical to packages/shared/tokens.css', () => {
    const onDisk = readFileSync(TOKENS_CSS_PATH, 'utf8')

    expect(TOKENS_CSS).toBe(onDisk)
  })

  test('sharedTokensCss serves it', () => {
    expect(sharedTokensCss()).toBe(readFileSync(TOKENS_CSS_PATH, 'utf8'))
  })

  test('carries the brand tokens the Brand Skin overrides', () => {
    // The seven tokens `themeCss` emits per workspace must exist as defaults
    // here, or an unthemed preview renders with no brand colours at all.
    for (const token of ['--p', '--pfg', '--pstrong', '--acc', '--t50', '--t100', '--t300']) {
      expect(TOKENS_CSS).toContain(`${token}:`)
    }
  })

  test('is non-empty — an empty baseline renders an unstyled document', () => {
    // The regression this whole module exists to prevent: the previous
    // fail-safe returned '' on a read failure, so the live preview rendered
    // with no styling whatsoever (verified in the browser 2026-07-20).
    expect(sharedTokensCss().length).toBeGreaterThan(500)
  })
})
