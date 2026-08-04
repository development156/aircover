import { describe, it, expect } from 'vitest'
import { isBundleFilePath, normalizePath, pathToFile } from './path'
import { findBundlePathConflict } from '../deploy/bundle-paths'

/**
 * `isBundleFilePath`'s docblock claimed it gave "the same guarantee `normalizePath` gives",
 * and the module docblock states that guarantee as: no two distinct accepted paths may produce
 * bundle entries that cannot both exist on a real filesystem. That proof rests on EVERY entry
 * ending in `index.html`, which stopped being true once the non-page arm began admitting bare
 * asset names. These tests pin the real, narrower guarantee, and pin where the cross-file half
 * of the contract is actually enforced -- so the prose can never again promise more than the
 * code delivers without a test failing.
 */

describe('normalizePath -- its own contract still holds, unchanged', () => {
  it('rejects a segment equal to index.html, the only way one page can prefix another', () => {
    expect(normalizePath('/index.html')).toBeNull()
    expect(normalizePath('/a/index.html')).toBeNull()
    expect(normalizePath('/INDEX.HTML')).toBeNull()
  })

  it('maps every accepted page to a file ending in index.html, which is what makes the proof work', () => {
    for (const page of ['/', '/about', '/about/team', '/shop-2026']) {
      expect(pathToFile(page).endsWith('index.html')).toBe(true)
    }
  })

  it('produces no two pages whose bundle files conflict, over the whole accepted shape', () => {
    const pages = ['/', '/a', '/a/b', '/a/b/c', '/about', '/about/team', '/styles-css']
    const files = pages.map(pathToFile)

    expect(findBundlePathConflict(files)).toBeNull()
  })
})

describe('isBundleFilePath -- the guarantee it ACTUALLY gives, per name in isolation', () => {
  it('accepts a bare asset name, which is why its accepted set is wider than normalizePath output', () => {
    expect(isBundleFilePath('styles.css')).toBe(true)
    expect(isBundleFilePath('a')).toBe(true)
    expect(isBundleFilePath('assets/app.js')).toBe(true)
  })

  it('still rejects every name that could escape the site directory', () => {
    for (const raw of [
      '..',
      '.',
      '../../etc/passwd',
      'assets/../../x',
      '/etc/passwd',
      '/index.html',
      '~/.ssh/id_rsa',
      'a\\b',
      '%2e%2e/x',
      '',
      '/',
      'a//b',
      'a/',
      '.env',
      'nul.html',
    ]) {
      expect(isBundleFilePath(raw), raw).toBe(false)
    }
  })

  it('rejects names that would COERCE onto one file, the collision it can see per-path', () => {
    // Uppercase is refused outright rather than folded, so `A.css` cannot collapse onto `a.css`.
    expect(isBundleFilePath('a.css')).toBe(true)
    expect(isBundleFilePath('A.css')).toBe(false)
    // A leading slash is refused rather than trimmed, so `/a.css` cannot collapse onto `a.css`.
    expect(isBundleFilePath('/a.css')).toBe(false)
  })

  it('does NOT guarantee two accepted names can coexist -- the documented narrowing', () => {
    // This is the pair the old docblock implied was impossible. Both are accepted, and a bundle
    // containing both asks the writer for a file `a` and a directory `a`.
    expect(isBundleFilePath('a')).toBe(true)
    expect(isBundleFilePath('a/index.html')).toBe(true)
  })

  it('hands that cross-file check to findBundlePathConflict, which does catch the pair', () => {
    expect(findBundlePathConflict(['a', 'a/index.html'])).not.toBeNull()
    expect(findBundlePathConflict(['assets', 'assets/styles.css'])).not.toBeNull()
  })

  it('accepts every file pathToFile emits, so the narrowing costs no real bundle', () => {
    for (const page of ['/', '/about', '/about/team']) {
      expect(isBundleFilePath(pathToFile(page)), page).toBe(true)
    }
  })
})
