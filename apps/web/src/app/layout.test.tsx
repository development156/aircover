import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'

// `next/font/google` is compiled away by Next's SWC plugin at build time; imported
// under plain vitest it resolves to a non-callable stub and the module throws
// "Inter is not a function" before `metadata` is ever reached. The mock stands in
// for the font loader only — nothing under test reads it.
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'test-font-variable', className: 'test-font', style: {} }),
}))

import { metadata } from './layout'

/**
 * Every route in the app 404'd on `GET /favicon.ico` because the root layout —
 * the only `Metadata` export in the app — declared no icons at all.
 *
 * These tests pin the two halves of the fix that are easy to undo by accident:
 * the scheme-qualification of the PNG entries, and the existence of the
 * unqualified `.ico` fallback that browsers and crawlers request by path
 * regardless of what `<link>` tags say.
 */

type Icon = { url: string; type?: string; media?: string }

function iconEntries(): Icon[] {
  const icons = metadata.icons as { icon?: Icon[] } | undefined
  expect(icons, 'root metadata declares no icons at all').toBeDefined()
  expect(Array.isArray(icons?.icon)).toBe(true)
  return icons?.icon as Icon[]
}

test('declares a tab icon for each colour scheme, mapped to the matching mark', () => {
  const byScheme = new Map(iconEntries().map((i) => [i.media, i.url]))

  // The dark-INK mark belongs on a LIGHT tab strip, and vice versa. Getting this
  // backwards renders an invisible mark, which no typecheck can catch.
  expect(byScheme.get('(prefers-color-scheme: light)')).toBe('/brand/favicon-dark.png')
  expect(byScheme.get('(prefers-color-scheme: dark)')).toBe('/brand/favicon-white.png')
})

test('leaves no unqualified PNG entry that could win by being declared last', () => {
  // The regression this pins: appending a plain `{ url: '...' }` with no media
  // query. Last-wins browsers pick it whatever the scheme, silently killing the
  // dark variant. The unqualified fallback is the `.ico`, which Next unshifts to
  // the front of this array — it is never allowed to be one of these entries.
  const unqualified = iconEntries().filter((i) => !i.media)
  expect(unqualified).toEqual([])
})

test('ships the app-directory favicon.ico that answers the literal request', () => {
  // A metadata-only test cannot see this: Next injects it at build time from the
  // file's presence in app/. Its absence is the original 404.
  // `new URL(...)` would be jsdom's URL class here, not Node's; `existsSync`
  // brand-checks it and quietly answers false. Hand it a plain string.
  const appDir = dirname(fileURLToPath(import.meta.url))
  expect(existsSync(join(appDir, 'favicon.ico'))).toBe(true)
})
