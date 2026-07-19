import { describe, it, expect } from 'vitest'
import { findBundlePathConflict } from './bundle-paths'

/**
 * `isBundleFilePath` is pure and per-path, so it CANNOT see a collision between two entries --
 * that was the explicit rationale for keeping it that way. The consequence is that the
 * cross-file check has to exist somewhere, and this is it. Two entries can fail to coexist in
 * exactly two ways: they name the same file, or one names a file that the other needs to be a
 * directory.
 */

describe('findBundlePathConflict -- two entries naming one file', () => {
  it('reports nothing for a bundle whose paths are all distinct', () => {
    expect(
      findBundlePathConflict(['index.html', 'about/index.html', 'styles.css', 'assets/app.js']),
    ).toBeNull()
  })

  it('reports nothing for an empty bundle', () => {
    expect(findBundlePathConflict([])).toBeNull()
  })

  it('reports nothing for a single entry', () => {
    expect(findBundlePathConflict(['index.html'])).toBeNull()
  })

  it('reports a repeated entry file, naming BOTH positions', () => {
    expect(findBundlePathConflict(['index.html', 'index.html'])).toEqual({
      kind: 'duplicate',
      index: 1,
      conflictsWith: 0,
    })
  })

  it('reports a repeated ASSET too, not only the entry document', () => {
    expect(findBundlePathConflict(['index.html', 'styles.css', 'styles.css'])).toEqual({
      kind: 'duplicate',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('reports a repeated SUBPAGE, the third shape of the same input', () => {
    expect(findBundlePathConflict(['index.html', 'about/index.html', 'about/index.html'])).toEqual({
      kind: 'duplicate',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('reports a duplicate even when the entries are not adjacent', () => {
    expect(findBundlePathConflict(['a.css', 'index.html', 'b.css', 'a.css'])).toEqual({
      kind: 'duplicate',
      index: 3,
      conflictsWith: 0,
    })
  })

  it('reports the FIRST conflicting pair, so the report is deterministic', () => {
    expect(findBundlePathConflict(['a.css', 'a.css', 'b.css', 'b.css'])).toEqual({
      kind: 'duplicate',
      index: 1,
      conflictsWith: 0,
    })
  })

  it('reports a duplicate whose CONTENT would be identical -- the bundle is malformed either way', () => {
    // The caller never proves the two entries agree; contentType may differ and the writer is
    // asked to write the same name twice regardless. Rejecting all duplicates keeps the rule
    // free of a content-comparison special case.
    expect(findBundlePathConflict(['index.html', 'index.html'])?.kind).toBe('duplicate')
  })
})

describe('findBundlePathConflict -- one name needed as both a file and a directory', () => {
  it('reports the exact pair isBundleFilePath admits: a bare name and its index page', () => {
    expect(findBundlePathConflict(['index.html', 'a', 'a/index.html'])).toEqual({
      kind: 'directory-file',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('reports the pair in the OPPOSITE order too, since neither position is privileged', () => {
    expect(findBundlePathConflict(['index.html', 'a/index.html', 'a'])).toEqual({
      kind: 'directory-file',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('reports an asset that shadows a directory holding another asset', () => {
    expect(findBundlePathConflict(['index.html', 'assets', 'assets/styles.css'])).toEqual({
      kind: 'directory-file',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('reports a conflict at a DEEPER ancestor, not only the immediate parent', () => {
    expect(findBundlePathConflict(['index.html', 'a', 'a/b/c/index.html'])).toEqual({
      kind: 'directory-file',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('does NOT report a shared directory prefix, which coexists perfectly well', () => {
    expect(
      findBundlePathConflict(['index.html', 'a/index.html', 'a/b/index.html', 'a/styles.css']),
    ).toBeNull()
  })

  it('does NOT report names that merely share a string prefix without a separator', () => {
    expect(findBundlePathConflict(['index.html', 'ab', 'ab.css', 'a/index.html'])).toBeNull()
  })

  it('does NOT treat the bundle-root entry file as an ancestor of anything', () => {
    expect(findBundlePathConflict(['index.html', 'about/index.html'])).toBeNull()
  })

  /**
   * `ancestorsOf` walks LONGEST-FIRST, documented as "a conflict is attributed to the NEAREST
   * shadowing entry, which is the one the caller most likely mistyped". Every case above has at
   * most ONE ancestor present, so they pass identically under a shortest-first walk. These two
   * put TWO ancestors of the same path in the bundle, which is the only shape that can tell the
   * orderings apart -- and the index is the only information the caller gets, since `fixture.ts`
   * deliberately withholds the paths themselves.
   */
  it('attributes a two-ancestor conflict to the NEAREST shadowing entry, not the shallowest', () => {
    // `a/b` (index 2) and `a` (index 3) both shadow `a/b/c.css` (index 1). Nearest is `a/b`.
    expect(findBundlePathConflict(['index.html', 'a/b/c.css', 'a/b', 'a'])).toEqual({
      kind: 'directory-file',
      index: 2,
      conflictsWith: 1,
    })
  })

  it('still picks the nearest ancestor when the shallower one comes FIRST in the bundle', () => {
    // Here `a` is at index 2 and `a/b` at index 3, so a shortest-first walk would report the
    // pair (2, 1). Position must not decide which ancestor is named; depth must.
    expect(findBundlePathConflict(['index.html', 'a/b/c.css', 'a', 'a/b'])).toEqual({
      kind: 'directory-file',
      index: 3,
      conflictsWith: 1,
    })
  })

  it('prefers the duplicate report when a bundle contains both defects', () => {
    // Deterministic ordering matters more than which defect is "worse": the caller fixes one
    // and re-submits, and the second report is then reached.
    const both = findBundlePathConflict(['a.css', 'a.css', 'b', 'b/index.html'])
    expect(both).toEqual({ kind: 'duplicate', index: 1, conflictsWith: 0 })
  })
})
