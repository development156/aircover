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

/**
 * Limits are duplicated here on purpose. The module does not export them (a caller holding the
 * limits would re-implement the check instead of calling it), so the boundary cases below restate
 * them; if the module's limits move, these tests must be updated deliberately.
 */
const MAX_PATH_LENGTH = 128
const MAX_SEGMENT_LENGTH = 64
const MAX_SEGMENTS = 8

/** A path of exactly `total` characters, split into two segments within the per-segment cap. */
const pathOfLength = (total: number): string => {
  const firstLength = Math.floor((total - 2) / 2)
  const secondLength = total - 2 - firstLength
  return `/${'a'.repeat(firstLength)}/${'a'.repeat(secondLength)}`
}

const segmentsPath = (count: number): string =>
  `/${Array.from({ length: count }, (_unused, index) => `s${index}`).join('/')}`

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
  {
    name: 'a segment named index, which is not the reserved bundle filename',
    input: '/index',
    expected: '/index',
  },
  {
    name: 'a segment that merely starts with the reserved name, so the check is equality not prefix',
    input: '/index.html-old',
    expected: '/index.html-old',
  },
  {
    name: 'a segment that merely contains the reserved name, so the check is equality not substring',
    input: '/blog/my-index.htmlx',
    expected: '/blog/my-index.htmlx',
  },
  {
    name: 'a segment that merely starts with a windows device name',
    input: '/contact',
    expected: '/contact',
  },
  {
    name: 'a dot inside a segment that is not trailing',
    input: '/a.b',
    expected: '/a.b',
  },
]

const BOUNDARY_ACCEPTED: ReadonlyArray<AcceptCase> = [
  {
    name: 'a path of exactly the total-length cap',
    input: pathOfLength(MAX_PATH_LENGTH),
    expected: pathOfLength(MAX_PATH_LENGTH),
  },
  {
    name: 'a segment of exactly the per-segment cap',
    input: `/${'a'.repeat(MAX_SEGMENT_LENGTH)}`,
    expected: `/${'a'.repeat(MAX_SEGMENT_LENGTH)}`,
  },
  {
    name: 'exactly the maximum number of segments',
    input: segmentsPath(MAX_SEGMENTS),
    expected: segmentsPath(MAX_SEGMENTS),
  },
]

describe('normalizePath — accepted', () => {
  for (const testCase of [...ACCEPTED, ...BOUNDARY_ACCEPTED]) {
    it(`normalizes ${testCase.name}`, () => {
      expect(normalizePath(testCase.input)).toBe(testCase.expected)
    })
  }
})

it('accepts a path at exactly the total-length cap and it really is that long', () => {
  expect(pathOfLength(MAX_PATH_LENGTH)).toHaveLength(MAX_PATH_LENGTH)
})

/**
 * NOTE on two of the names below. `CONTROL_CHARS` and the `BACKSLASH` check in `path.ts` are
 * redundant with `SEGMENT_ALLOWED`: there is no input for which either is the sole defense, so no
 * black-box test can pin them. The NUL and backslash cases assert the *rejection*, which is the
 * contract callers depend on; they are named so they do not claim to pin those two constants.
 * See the "Guards that are deliberately redundant" section of the module docblock.
 */
const REJECTED: ReadonlyArray<RejectCase> = [
  {
    name: 'a classic traversal that would escape the bundle directory',
    input: '/a/../../etc/passwd',
  },
  { name: 'a bare parent segment', input: '/..' },
  { name: 'a bare current-directory segment', input: '/.' },
  { name: 'an interior current-directory segment', input: '/a/./b' },
  { name: 'a percent-encoded traversal, which a later decode would revive', input: '/%2e%2e/etc' },
  {
    name:
      'a NUL byte (caught by the segment allowlist; CONTROL_CHARS is a redundant second net, ' +
      'so this pins the rejection, not that constant)',
    input: '/a\u0000b',
  },
  { name: 'a control character', input: '/a\u0007b' },
  { name: 'an interior newline', input: '/a\nb' },
  {
    name:
      'a backslash (caught by the segment allowlist; the BACKSLASH check is a redundant second ' +
      'net, so this pins the rejection, not that check)',
    input: '/a\\b',
  },
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

const BOUNDARY_REJECTED: ReadonlyArray<RejectCase> = [
  {
    name: 'a path one character over the total-length cap, within every other limit',
    input: pathOfLength(MAX_PATH_LENGTH + 1),
  },
  {
    name: 'a segment one character over the per-segment cap, within the total-length cap',
    input: `/${'a'.repeat(MAX_SEGMENT_LENGTH + 1)}`,
  },
  {
    name: 'one segment more than the maximum, within the total-length cap',
    input: segmentsPath(MAX_SEGMENTS + 1),
  },
]

/**
 * U+212A KELVIN SIGN is the only code point in U+0080-U+10FFFF that `toLowerCase` folds into the
 * ASCII allowlist. Folding before the allowlist ran would turn it into `/k` and silently collide
 * with a real `/k`; the allowlist must therefore see the character as received.
 */
const CASE_FOLD_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'a bare kelvin sign, which folds to ascii k', input: '/\u212A' },
  { name: 'a kelvin sign inside a segment', input: '/ba\u212Ae' },
]

/** Every accepted path maps to `<segments>/index.html`, so no segment may be that filename. */
const RESERVED_SEGMENT_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'the reserved bundle filename as the only segment', input: '/index.html' },
  { name: 'the reserved bundle filename as a trailing segment', input: '/a/index.html' },
  { name: 'the reserved bundle filename as an interior segment', input: '/index.html/a' },
  { name: 'the reserved bundle filename in uppercase, which folds onto it', input: '/INDEX.HTML' },
  { name: 'the reserved bundle filename with a trailing slash', input: '/a/index.html/' },
]

const FILESYSTEM_HOSTILE_REJECTED: ReadonlyArray<RejectCase> = [
  {
    name: 'a trailing dot, which windows strips so it would collide with the plain name',
    input: '/a.',
  },
  { name: 'a trailing dot on an interior segment', input: '/a./b' },
  { name: 'a trailing dot on a longer segment', input: '/about.' },
  { name: 'the windows console device', input: '/con' },
  { name: 'the windows null device', input: '/nul' },
  { name: 'the windows auxiliary device', input: '/aux' },
  { name: 'the windows printer device', input: '/prn' },
  { name: 'the first windows serial device', input: '/com1' },
  { name: 'the last windows parallel device', input: '/lpt9' },
  { name: 'a windows device name in uppercase, which folds onto the reserved name', input: '/CON' },
  {
    name: 'a windows device name with an extension, still reserved on windows',
    input: '/nul.html',
  },
  { name: 'a windows device name as an interior segment', input: '/blog/con/post' },
]

describe('normalizePath — rejected, so the page is dropped rather than coerced', () => {
  const cases = [
    ...REJECTED,
    ...BOUNDARY_REJECTED,
    ...CASE_FOLD_REJECTED,
    ...RESERVED_SEGMENT_REJECTED,
    ...FILESYSTEM_HOSTILE_REJECTED,
  ]

  for (const testCase of cases) {
    it(`rejects ${testCase.name}`, () => {
      expect(normalizePath(testCase.input)).toBeNull()
    })
  }
})

describe('normalizePath — case folding cannot manufacture a collision', () => {
  it('does not fold the kelvin sign onto a plain k', () => {
    expect(normalizePath('/k')).toBe('/k')
    expect(normalizePath('/\u212A')).not.toBe(normalizePath('/k'))
  })

  it('still folds ascii case, which is the fold the module does want', () => {
    expect(normalizePath('/ABOUT')).toBe(normalizePath('/about'))
  })
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

  it('rejects the paths that would collide with a nested entry', () => {
    expect(normalizePath('/a')).toBe('/a')
    expect(normalizePath('/a/index.html')).toBeNull()
    expect(() => pathToFile('/a/index.html')).toThrow(/normalized path/i)
  })

  it('produces mutually coexistable entries for every accepted path in this suite', () => {
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
