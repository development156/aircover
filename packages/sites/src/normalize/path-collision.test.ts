import { describe, it, expect } from 'vitest'
import { normalizePath, pathToFile } from './path'
import { ACCEPTED, BOUNDARY_ACCEPTED } from './path.test'

describe('pathToFile', () => {
  it('maps the root to index.html, so the home page needs no visible filename in its url', () => {
    expect(pathToFile('/')).toBe('index.html')
  })

  it('maps a single-segment path to a directory index, so the url needs no extension', () => {
    expect(pathToFile('/about')).toBe('about/index.html')
  })

  it('maps a nested path to a nested directory index, so nesting keeps the same extension-free shape', () => {
    expect(pathToFile('/a/b')).toBe('a/b/index.html')
  })

  it('throws on an un-normalized case, since a silent fold could collide two pages', () => {
    expect(() => pathToFile('/About')).toThrow(/normalized path/i)
  })

  it('throws on a path missing its leading slash, so it never silently reaches the filesystem layer', () => {
    expect(() => pathToFile('about')).toThrow(/normalized path/i)
  })

  it('throws on a traversal instead of writing outside the bundle directory', () => {
    expect(() => pathToFile('/a/../b')).toThrow(/normalized path/i)
  })

  it('throws on a trailing slash, so it never silently reaches the filesystem layer', () => {
    expect(() => pathToFile('/a/b/')).toThrow(/normalized path/i)
  })
})

/**
 * The bundle contract: no two distinct accepted paths may produce entries that cannot both exist
 * on a real filesystem. Two entries conflict when one is a directory prefix of the other.
 */
const conflictsOnDisk = (left: string, right: string): boolean =>
  left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)

describe('pathToFile — bundle entries can all coexist on disk', () => {
  it('flags a directory-prefix conflict when given one, so the check below is not vacuous', () => {
    expect(conflictsOnDisk('index.html', 'index.html/index.html')).toBe(true)
    expect(conflictsOnDisk('a/index.html', 'a/index.html/index.html')).toBe(true)
    expect(conflictsOnDisk('a/index.html', 'a/b/index.html')).toBe(false)
  })

  it('rejects the paths that would collide with the root entry, so they never reach pathToFile', () => {
    expect(normalizePath('/index.html')).toBeNull()
    expect(() => pathToFile('/index.html')).toThrow(/normalized path/i)
  })

  it('rejects the paths that would collide with a nested entry, so they never reach pathToFile', () => {
    expect(normalizePath('/a')).toBe('/a')
    expect(normalizePath('/a/index.html')).toBeNull()
    expect(() => pathToFile('/a/index.html')).toThrow(/normalized path/i)
  })

  it('produces mutually coexistable entries for every accepted path, so no two pages can overwrite each other', () => {
    const paths = [
      ...new Set(
        [...ACCEPTED, ...BOUNDARY_ACCEPTED]
          .map((testCase) => normalizePath(testCase.input))
          .filter((path): path is string => path !== null),
      ),
    ]

    const entries = paths.map((path) => pathToFile(path))

    for (const [leftIndex, left] of entries.entries()) {
      for (const [rightIndex, right] of entries.entries()) {
        if (leftIndex === rightIndex) continue
        expect({ left, right, conflict: conflictsOnDisk(left, right) }).toEqual({
          left,
          right,
          conflict: false,
        })
      }
    }
  })
})
