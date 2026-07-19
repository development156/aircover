import { describe, it, expect } from 'vitest'
import { normalizePath, pathToFile } from './path'

interface AcceptCase {
  name: string
  input: string
  expected: string
}

interface RejectCase {
  name: string
  input: unknown
}

const ACCEPTED: ReadonlyArray<AcceptCase> = [
  {
    name: 'an empty path becomes the root, since the model omits it for the home page',
    input: '',
    expected: '/',
  },
  { name: 'a whitespace-only path becomes the root', input: '   ', expected: '/' },
  { name: 'the root is already normal', input: '/', expected: '/' },
  { name: 'a doubled root collapses to the root', input: '//', expected: '/' },
  { name: 'a missing leading slash is added', input: 'about', expected: '/about' },
  { name: 'a well-formed path is unchanged', input: '/about', expected: '/about' },
  { name: 'case is folded and the trailing slash dropped', input: '/About/', expected: '/about' },
  { name: 'repeated separators collapse', input: '//a//b', expected: '/a/b' },
  { name: 'a trailing slash on a nested path is dropped', input: '/a/b/', expected: '/a/b' },
  { name: 'surrounding whitespace is trimmed', input: '  /pricing  ', expected: '/pricing' },
  { name: 'digits and hyphens survive', input: '/pricing-2', expected: '/pricing-2' },
  { name: 'underscores survive', input: '/our_team', expected: '/our_team' },
  { name: 'a dot inside a segment survives', input: '/v1.2', expected: '/v1.2' },
]

describe('normalizePath — accepted', () => {
  for (const testCase of ACCEPTED) {
    it(`normalizes ${testCase.name}`, () => {
      expect(normalizePath(testCase.input)).toBe(testCase.expected)
    })
  }
})

const REJECTED: ReadonlyArray<RejectCase> = [
  {
    name: 'a classic traversal that would escape the bundle directory',
    input: '/a/../../etc/passwd',
  },
  { name: 'a bare parent segment', input: '/..' },
  { name: 'a bare current-directory segment', input: '/.' },
  { name: 'an interior current-directory segment', input: '/a/./b' },
  { name: 'a percent-encoded traversal, which a later decode would revive', input: '/%2e%2e/etc' },
  { name: 'a NUL byte, which truncates a path in C-backed filesystem calls', input: '/a\u0000b' },
  { name: 'a control character', input: '/a\u0007b' },
  { name: 'an interior newline', input: '/a\nb' },
  { name: 'a backslash, which separates paths on Windows hosts', input: '/a\\b' },
  { name: 'a lone backslash', input: '\\' },
  { name: 'a space inside a segment', input: '/about us' },
  { name: 'a non-ascii segment, which cannot round-trip a filesystem safely', input: '/café' },
  { name: 'a leading dot, which would write a hidden file', input: '/.hidden' },
  { name: 'html metacharacters in a segment', input: '/<script>' },
  { name: 'an over-long path', input: `/${'a'.repeat(200)}` },
  { name: 'an over-long single segment', input: `/${'b'.repeat(70)}` },
  {
    name:
      'a path within every per-segment and per-count limit but over the total length cap, ' +
      'so the total-length check cannot be deleted without a test noticing',
    input: `/${Array.from({ length: 8 }, () => 'a'.repeat(20)).join('/')}`,
  },
  { name: 'too many segments', input: '/a/b/c/d/e/f/g/h/i' },
  { name: 'null', input: null },
  { name: 'undefined', input: undefined },
  { name: 'a number', input: 42 },
  { name: 'an object', input: {} },
  { name: 'an array', input: [] },
  { name: 'a boolean', input: true },
]

describe('normalizePath — rejected, so the page is dropped rather than coerced', () => {
  for (const testCase of REJECTED) {
    it(`rejects ${testCase.name}`, () => {
      expect(normalizePath(testCase.input)).toBeNull()
    })
  }
})

describe('pathToFile', () => {
  it('maps the root to index.html', () => {
    expect(pathToFile('/')).toBe('index.html')
  })

  it('maps a single-segment path to a directory index, so the url needs no extension', () => {
    expect(pathToFile('/about')).toBe('about/index.html')
  })

  it('maps a nested path to a nested directory index', () => {
    expect(pathToFile('/a/b')).toBe('a/b/index.html')
  })

  it('throws on an un-normalized case, since a silent fold could collide two pages', () => {
    expect(() => pathToFile('/About')).toThrow(/normalized path/i)
  })

  it('throws on a path missing its leading slash', () => {
    expect(() => pathToFile('about')).toThrow(/normalized path/i)
  })

  it('throws on a traversal instead of writing outside the bundle directory', () => {
    expect(() => pathToFile('/a/../b')).toThrow(/normalized path/i)
  })

  it('throws on a trailing slash', () => {
    expect(() => pathToFile('/a/b/')).toThrow(/normalized path/i)
  })
})
