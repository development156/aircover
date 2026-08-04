import { describe, it, expect } from 'vitest'
import { isBundleFilePath, normalizePath, pathToFile } from './path'

/**
 * `isBundleFilePath` guards the OTHER end of the bundle: the file name a deployer joins
 * onto a host directory. It must accept exactly what `pathToFile` emits (or a deploy of a
 * legitimate site fails) and nothing that could leave the directory it is joined to.
 */

const NUL = String.fromCharCode(0)

describe('isBundleFilePath -- accepts exactly what the bundle producer emits', () => {
  it('accepts every file name pathToFile produces from a normalized path', () => {
    for (const page of ['/', '/about', '/about/team', '/shop-2026', '/a.b-c']) {
      const normalized = normalizePath(page)
      expect(normalized, page).toBe(page)
      expect(isBundleFilePath(pathToFile(page)), pathToFile(page)).toBe(true)
    }
  })

  it('accepts sibling asset files, which are not pages and have no index.html tail', () => {
    for (const path of ['styles.css', 'robots.txt', 'assets/styles.css']) {
      expect(isBundleFilePath(path), path).toBe(true)
    }
  })
})

describe('isBundleFilePath -- rejects anything that could escape or collide', () => {
  const rejected: Array<[string, string]> = [
    ['a parent traversal', '../../../etc/cron.d/x'],
    ['a mid-path traversal', 'assets/../../x'],
    ['a bare parent reference', '..'],
    ['an absolute path', '/etc/passwd'],
    ['an absolute entry file', '/index.html'],
    ['the bare separator', '/'],
    ['the empty string', ''],
    ['a doubled separator', 'a//b'],
    ['a trailing separator', 'assets/'],
    ['a backslash separator', 'a\\b'],
    ['a NUL byte', 'a' + NUL + '.css'],
    ['a dotfile', '.env'],
    ['a windows device name', 'nul.html'],
    ['an index.html DIRECTORY, which cannot coexist with the entry file', 'index.html/index.html'],
  ]

  for (const [label, path] of rejected) {
    it('rejects ' + label, () => {
      expect(isBundleFilePath(path)).toBe(false)
    })
  }

  it('rejects rather than trims a leading slash, so a.css and /a.css cannot collapse into one file', () => {
    expect(isBundleFilePath('styles.css')).toBe(true)
    expect(isBundleFilePath('/styles.css')).toBe(false)
  })
})

/**
 * `BundleFile.path` is declared `string`, but the declaration is not the guarantee: `fixture.ts`
 * says these fields have "no enforced provenance", and a bundle read back from json carries
 * whatever the json held. While the parameter was typed `string` the function opened with
 * `raw.length` and `raw.endsWith`, so `42` threw a `TypeError` out of `Deployer`'s
 * `Promise<Result<SiteDeployState>>` instead of being reported as a rejected path.
 *
 * `normalizePath` in the same file already takes `unknown` and answers `null`; this is the
 * sibling entry point that did not. Each shape below reaches a DIFFERENT line of the old body --
 * `null`/`undefined` threw on `.length`, everything else threw on `.endsWith` -- and the empty
 * array answered `false` by accident, via `[].length === 0`, which is the right answer for the
 * wrong reason and would have flipped the moment the body was reordered.
 */
describe('isBundleFilePath -- a non-string answers false rather than throwing', () => {
  const notStrings: Array<[string, unknown]> = [
    ['a number', 42],
    ['zero, which is falsy but still not a name', 0],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
    ['a plain object', {}],
    ['an empty array, whose length is 0 for the wrong reason', []],
    ['an array holding a valid name', ['index.html']],
    ['a bigint', 10n],
    ['a symbol', Symbol('index.html')],
    ['an object faking a length', { length: 5 }],
    ['an object faking the whole string protocol', { length: 10, endsWith: () => true }],
    ['a String wrapper object, which is not a primitive string', new String('index.html')],
  ]

  for (const [label, value] of notStrings) {
    it('rejects ' + label + ' without throwing', () => {
      expect(() => isBundleFilePath(value)).not.toThrow()
      expect(isBundleFilePath(value)).toBe(false)
    })
  }
})
