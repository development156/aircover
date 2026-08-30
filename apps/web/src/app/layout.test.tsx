import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'

// `next/font/google` is compiled away by Next's SWC plugin at build time; imported
// under plain vitest it resolves to a non-callable stub and the module throws
// "<Face> is not a function" before `metadata` is ever reached. The mock stands in
// for the font loader only — nothing under test reads it.
//
// It names the face the layout actually imports. v5 moved from Inter to
// Plus Jakarta Sans and this mock kept only `Inter`, so the whole FILE failed to
// collect and reported "0 test" — which is the shape of a suite that runs
// nothing while looking like it ran. Keep this in step with layout.tsx.
vi.mock('next/font/google', () => ({
  Plus_Jakarta_Sans: () => ({
    variable: 'test-font-variable',
    className: 'test-font',
    style: {},
  }),
}))

import { metadata } from './layout'

/**
 * Every route in the app 404'd on `GET /favicon.ico` because the root layout,
 * the only `Metadata` export in the app, declared no icons at all.
 *
 * The fix for that was a `metadata.icons` array of two PNGs qualified by
 * `prefers-color-scheme`, and these tests pinned its two fragile halves. That
 * array is now GONE, and these tests are retargeted rather than deleted, because
 * the claim they were protecting has not gone anywhere: exactly one declaration
 * of the icon, so no entry can win by being declared last.
 *
 * What changed is where the declaration lives. `app/favicon.ico`, `app/icon.png`
 * and `app/apple-icon.png` are Next FILE CONVENTIONS: Next emits the link tags
 * from the files themselves, reading their real pixel dimensions for `sizes`. A
 * `metadata.icons` array emits link tags TOO, so reintroducing one would restore
 * the double declaration these tests exist to prevent. That is the regression
 * the first test now pins, and it is a stronger guard than the old one, which
 * could only check that the second declaration was well formed.
 *
 * The size and squareness of the bytes themselves are `favicon-assets.test.ts`.
 */

test('declares no icons in metadata, so the files are the only declaration', () => {
  // THE REGRESSION THIS PINS. Adding `icons: { icon: [...] }` back here does not
  // replace the file-convention tags, it ADDS to them: two rel="icon" links for
  // one icon, and the last one wins in some browsers and not in others. The
  // 594x508 scheme-qualified pair that used to live here is exactly that shape.
  expect(metadata.icons).toBeUndefined()
})

test('ships the three app-directory icon files that answer every request', () => {
  // A metadata-only test cannot see these: Next injects the tags at build time
  // from the files' presence in app/. The absence of the .ico is the original
  // 404; the absence of apple-icon.png is an iPhone home screen falling back to
  // a snapshot of the page.
  // `new URL(...)` would be jsdom's URL class here, not Node's; `existsSync`
  // brand-checks it and quietly answers false. Hand it a plain string.
  const appDir = dirname(fileURLToPath(import.meta.url))
  for (const file of ['favicon.ico', 'icon.png', 'apple-icon.png']) {
    expect(existsSync(join(appDir, file)), `app/${file} is missing`).toBe(true)
  }
})
