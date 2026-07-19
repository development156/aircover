/**
 * Pins the EXACT public surface of `@sahoda/sites`.
 *
 * `src/index.ts` is what `package.json` names as the package entry, but every consumer inside
 * this package imports `./render/escape` directly -- so until this file existed, nothing in the
 * monorepo observed `index.ts` at all. Deleting a re-export and corrupting `SITES_PACKAGE` both
 * left the suite green and `tsc --noEmit` at exit 0.
 *
 * Two halves, and the negative one is the half that rots:
 *   POSITIVE -- each name is present AND is the real implementation, not a re-pointed stub.
 *   NEGATIVE -- nothing else is exported. `index.ts`'s docblock promises the internal `coerce`
 *   helper and the module-level limit constants stay private; a promise in a comment that no
 *   test reads is not a contract. An exact key-set assertion is the only form that fails when
 *   a name is ADDED, which is the direction a surface actually drifts.
 */
import { describe, it, expect } from 'vitest'
import * as index from './index'
import * as escape from './render/escape'

/** The complete, intended export list. Adding a name here is a deliberate API decision. */
const PUBLIC_SURFACE: ReadonlyArray<string> = [
  'SITES_PACKAGE',
  'escapeAttr',
  'escapeHtml',
  'safeUrl',
  'stripControl',
]

describe('@sahoda/sites public surface', () => {
  it('exports exactly the intended names and nothing more', () => {
    expect(Object.keys(index).sort()).toEqual([...PUBLIC_SURFACE].sort())
  })

  it('does not leak the internal coerce helper, which would let a caller skip the escapers', () => {
    // Named separately from the key-set pin: this is the one the docblock argues for, so it
    // should fail by name rather than as an anonymous diff in a sorted array.
    expect(Object.hasOwn(index, 'coerce')).toBe(false)
    expect(Object.hasOwn(escape, 'coerce')).toBe(false)
  })

  it('does not leak the module-level limit or character-class constants', () => {
    const internals = [
      'MAX_URL_LENGTH',
      'URL_FORBIDDEN',
      'URL_FORBIDDEN_ALLOW_SPACE',
      'URL_SCHEME',
      'URL_AUTHORITY_SLASHES',
      'ALLOWED_SCHEMES',
      'CONTROL_CHARS',
      'INVISIBLE_CHARS',
      'LONE_SURROGATES',
      'HTML_CHARS',
      'HTML_ENTITIES',
      'ATTR_CHARS',
      'ATTR_ENTITIES',
    ]

    expect(internals.filter((name) => Object.hasOwn(index, name))).toEqual([])
  })

  it('names the package identically to package.json, since callers key config off it', () => {
    expect(index.SITES_PACKAGE).toBe('@sahoda/sites')
  })

  /*
   * Identity, not just presence: a re-export rewired to a lookalike stub would satisfy the
   * key-set pin. These are the security gate, so the binding itself is the contract.
   */
  it('re-exports the real escapers, not lookalikes', () => {
    expect(index.escapeHtml).toBe(escape.escapeHtml)
    expect(index.escapeAttr).toBe(escape.escapeAttr)
    expect(index.safeUrl).toBe(escape.safeUrl)
    expect(index.stripControl).toBe(escape.stripControl)
  })

  /*
   * One live assertion per escaper, reached through the package entry rather than through
   * `./render/escape`. If the entry point is ever rebuilt (a barrel, a bundler alias), these
   * fail on behaviour rather than on binding identity.
   */
  it('escapes html through the package entry', () => {
    expect(index.escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes attributes through the package entry', () => {
    expect(index.escapeAttr('a"b')).toBe('a&quot;b')
  })

  it('rejects a dangerous url through the package entry', () => {
    expect(index.safeUrl('javascript:alert(1)')).toBeNull()
  })

  it('strips control characters through the package entry', () => {
    expect(index.stripControl('a\u200Bb')).toBe('ab')
  })
})
