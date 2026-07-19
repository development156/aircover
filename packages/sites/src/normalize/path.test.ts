import { describe, it, expect } from 'vitest'
import { normalizePath } from './path'

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
 * Limits are duplicated here on purpose, including the windows device count below: the module
 * does not export them (a caller holding the limits would re-implement the check instead of
 * calling it), so the boundary cases restate them. If the module's limits move, these tests must
 * be updated deliberately.
 */
const MAX_PATH_LENGTH = 128
const MAX_SEGMENT_LENGTH = 64
const MAX_SEGMENTS = 8
const WINDOWS_NUMBERED_DEVICE_COUNT = 9

/** A path of exactly `total` characters, split into two segments within the per-segment cap. */
const pathOfLength = (total: number): string => {
  const firstLength = Math.floor((total - 2) / 2)
  const secondLength = total - 2 - firstLength
  return `/${'a'.repeat(firstLength)}/${'a'.repeat(secondLength)}`
}

/**
 * A slashless path of exactly `total` characters as received. Normalizing it adds the leading
 * slash a caller may omit, so the output is always one character longer than `total` -- this gap
 * is what lets the cases below pin whether the length cap bounds the input or the output.
 */
const slashlessPathOfLength = (total: number): string => {
  const firstLength = Math.floor((total - 1) / 2)
  const secondLength = total - 1 - firstLength
  return `${'a'.repeat(firstLength)}/${'a'.repeat(secondLength)}`
}

const segmentsPath = (count: number): string =>
  `/${Array.from({ length: count }, (_unused, index) => `s${index}`).join('/')}`

// prettier-ignore
export const ACCEPTED: ReadonlyArray<AcceptCase> = [
  { name: 'an empty path becomes the root, since the model omits it for the home page', input: '', expected: '/' },
  { name: 'a whitespace-only path becomes the root, so stray spaces do not create a page distinct from home', input: '   ', expected: '/' },
  { name: 'the root is already normal, so normalization is idempotent for the home page', input: '/', expected: '/' },
  { name: 'a doubled root collapses to the root, so a stray extra slash cannot create a second home page', input: '//', expected: '/' },
  { name: 'a missing leading slash is added, so a relative-looking path is normalized rather than dropped', input: 'about', expected: '/about' },
  { name: 'a well-formed path is unchanged, so normalization does not perturb already-correct input', input: '/about', expected: '/about' },
  { name: 'case is folded and the trailing slash dropped, so /About/ and /about resolve to one page, not two', input: '/About/', expected: '/about' },
  { name: 'repeated separators collapse, so extra slashes cannot produce a path distinct from the intended one', input: '//a//b', expected: '/a/b' },
  { name: 'a trailing slash on a nested path is dropped, so /a/b and /a/b/ do not collide as two pages', input: '/a/b/', expected: '/a/b' },
  { name: 'surrounding whitespace is trimmed, so a copy-pasted stray space does not change the path', input: '  /pricing  ', expected: '/pricing' },
  { name: 'digits and hyphens survive, since slugs commonly use them and rejecting them would drop pages', input: '/pricing-2', expected: '/pricing-2' },
  { name: 'underscores survive, since slugs commonly use them and rejecting them would drop pages', input: '/our_team', expected: '/our_team' },
  { name: 'a dot inside a segment survives, since version-like slugs use them and rejecting would drop pages', input: '/v1.2', expected: '/v1.2' },
  { name: 'a segment named index, accepted since only the literal filename index.html is reserved', input: '/index', expected: '/index' },
  { name: 'a segment that merely starts with the reserved name, so the check is equality not prefix', input: '/index.html-old', expected: '/index.html-old' },
  { name: 'a segment that merely contains the reserved name, so the check is equality not substring', input: '/blog/my-index.htmlx', expected: '/blog/my-index.htmlx' },
  { name: 'a segment that merely starts with a windows device name, so the device check is equality not prefix', input: '/contact', expected: '/contact' },
  { name: 'a dot inside a segment that is not trailing, since only a trailing dot collides on windows', input: '/a.b', expected: '/a.b' },
  { name: 'com0, one below the reserved range and not a real device name, so it must not be dropped', input: '/com0', expected: '/com0' },
  { name: 'lpt0, one below the reserved range and not a real device name, so it must not be dropped', input: '/lpt0', expected: '/lpt0' },
  { name: 'com10, one above the reserved range and not a real device name, so it must not be dropped', input: `/com${WINDOWS_NUMBERED_DEVICE_COUNT + 1}`, expected: `/com${WINDOWS_NUMBERED_DEVICE_COUNT + 1}` },
]

// prettier-ignore
export const BOUNDARY_ACCEPTED: ReadonlyArray<AcceptCase> = [
  { name: 'a path of exactly the total-length cap, so the boundary itself is not mistakenly rejected', input: pathOfLength(MAX_PATH_LENGTH), expected: pathOfLength(MAX_PATH_LENGTH) },
  { name: 'a segment of exactly the per-segment cap, so that boundary itself is not mistakenly rejected', input: `/${'a'.repeat(MAX_SEGMENT_LENGTH)}`, expected: `/${'a'.repeat(MAX_SEGMENT_LENGTH)}` },
  { name: 'exactly the maximum number of segments, so that boundary itself is not mistakenly rejected', input: segmentsPath(MAX_SEGMENTS), expected: segmentsPath(MAX_SEGMENTS) },
  { name: 'a slashless input one under the total-length cap, whose output lands exactly at the cap once the leading slash is added -- pinning that the cap is checked against the output, not the argument received', input: slashlessPathOfLength(MAX_PATH_LENGTH - 1), expected: `/${slashlessPathOfLength(MAX_PATH_LENGTH - 1)}` },
]

describe('normalizePath — accepted', () => {
  for (const testCase of [...ACCEPTED, ...BOUNDARY_ACCEPTED]) {
    it(`normalizes ${testCase.name}`, () => {
      expect(normalizePath(testCase.input)).toBe(testCase.expected)
    })
  }
})

it('accepts a path at exactly the total-length cap, confirming the helper really produces that length', () => {
  expect(pathOfLength(MAX_PATH_LENGTH)).toHaveLength(MAX_PATH_LENGTH)
})

/**
 * NOTE on two of the names below. `CONTROL_CHARS` and the `BACKSLASH` check in `path.ts` are
 * redundant with `SEGMENT_ALLOWED`: there is no input for which either is the sole defense, so no
 * black-box test can pin them. The NUL and backslash cases assert the *rejection*, which is the
 * contract callers depend on; they are named so they do not claim to pin those two constants.
 * See the "Guards that are deliberately redundant" section of the module docblock.
 */
// prettier-ignore
const REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'a classic traversal that would escape the bundle directory', input: '/a/../../etc/passwd' },
  { name: 'a bare parent segment, which by itself would climb out of the bundle root', input: '/..' },
  { name: 'a bare current-directory segment, which combined with others could still enable traversal', input: '/.' },
  { name: 'an interior current-directory segment, which combined with others could still enable traversal', input: '/a/./b' },
  { name: 'a percent-encoded traversal, which a later decode would revive', input: '/%2e%2e/etc' },
  { name: 'a NUL byte (caught by the segment allowlist; CONTROL_CHARS is a redundant second net, so this pins the rejection, not that constant)', input: '/a\u0000b' },
  { name: 'a control character, which could corrupt a filesystem path or log line if let through', input: '/a\u0007b' },
  { name: 'an interior newline, which could inject a second line into a log or header downstream', input: '/a\nb' },
  { name: 'a backslash (caught by the segment allowlist; the BACKSLASH check is a redundant second net, so this pins the rejection, not that check)', input: '/a\\b' },
  { name: 'a lone backslash, since windows treats it as a path separator that could redirect the write', input: '\\' },
  { name: 'a space inside a segment, since a space-containing filename is easy to mishandle in a shell', input: '/about us' },
  { name: 'a non-ascii segment, which cannot round-trip a filesystem safely', input: '/caf\u00e9' },
  { name: 'a leading dot, which would write a hidden file', input: '/.hidden' },
  { name: 'html metacharacters in a segment, which could enable injection if the path is ever echoed unescaped', input: '/<script>' },
  { name: 'an over-long path, so an unbounded path cannot exhaust storage or violate downstream limits', input: `/${'a'.repeat(200)}` },
  { name: 'an over-long single segment, so one component alone cannot exceed filesystem name-length limits', input: `/${'b'.repeat(70)}` },
  { name: 'a path within every per-segment and per-count limit but over the total length cap, so the total-length check cannot be deleted without a test noticing', input: `/${Array.from({ length: 8 }, () => 'a'.repeat(20)).join('/')}` },
  { name: 'too many segments, so a deeply nested path cannot build an arbitrarily deep directory tree', input: '/a/b/c/d/e/f/g/h/i' },
  { name: 'null, so a non-string value is dropped rather than coerced into a path', input: null },
  { name: 'undefined, so a non-string value is dropped rather than coerced into a path', input: undefined },
  { name: 'a number, so a non-string value is dropped rather than coerced into a path', input: 42 },
  { name: 'an object, so a non-string value is dropped rather than coerced into a path', input: {} },
  { name: 'an array, so a non-string value is dropped rather than coerced into a path', input: [] },
  { name: 'a boolean, so a non-string value is dropped rather than coerced into a path', input: true },
]

// prettier-ignore
const BOUNDARY_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'a path one character over the total-length cap, so that boundary is exact, not off by one', input: pathOfLength(MAX_PATH_LENGTH + 1) },
  { name: 'a segment one character over the per-segment cap, so that boundary is exact, not off by one', input: `/${'a'.repeat(MAX_SEGMENT_LENGTH + 1)}` },
  { name: 'one segment more than the maximum, so the segment-count boundary is exact, not off by one', input: segmentsPath(MAX_SEGMENTS + 1) },
  { name: 'a slashless input at exactly the total-length cap, whose output gains a leading slash and so must be rejected -- pinning that the cap bounds the returned path, not the argument received', input: slashlessPathOfLength(MAX_PATH_LENGTH) },
]

// prettier-ignore
const CASE_FOLD_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'a bare kelvin sign, which folds to ascii k and would collide with a real /k if accepted', input: '/\u212A' },
  { name: 'a kelvin sign inside a segment, which folds to ascii k and could collide with a real segment', input: '/ba\u212Ae' },
]

/** Every accepted path maps to `<segments>/index.html`, so no segment may be that filename. */
// prettier-ignore
const RESERVED_SEGMENT_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'the reserved bundle filename as the only segment, which would collide with the root entry', input: '/index.html' },
  { name: 'the reserved bundle filename as a trailing segment, needing a directory and file of one name', input: '/a/index.html' },
  { name: 'the reserved bundle filename as an interior segment, needing a directory and file of one name', input: '/index.html/a' },
  { name: 'the reserved bundle filename in uppercase, which folds onto it so case cannot smuggle it past', input: '/INDEX.HTML' },
  { name: 'the reserved bundle filename with a trailing slash, so a slash cannot smuggle it past the check', input: '/a/index.html/' },
]

// prettier-ignore
const FILESYSTEM_HOSTILE_REJECTED: ReadonlyArray<RejectCase> = [
  { name: 'a trailing dot, which windows strips so it would collide with the plain name', input: '/a.' },
  { name: 'a trailing dot on an interior segment, which would collide with the plain segment on windows', input: '/a./b' },
  { name: 'a trailing dot on a longer segment, which would collide with the plain segment on windows', input: '/about.' },
  { name: 'the windows console device, reserved so bundles stay portable to a windows checkout', input: '/con' },
  { name: 'the windows null device, reserved so bundles stay portable to a windows checkout', input: '/nul' },
  { name: 'the windows auxiliary device, reserved so bundles stay portable to a windows checkout', input: '/aux' },
  { name: 'the windows printer device, reserved so bundles stay portable to a windows checkout', input: '/prn' },
  { name: 'the first windows serial device, pinning the low end of the reserved com range', input: '/com1' },
  { name: 'the last windows serial device, pinning the high end of the reserved com range', input: `/com${WINDOWS_NUMBERED_DEVICE_COUNT}` },
  { name: 'the first windows parallel device, pinning the low end of the reserved lpt range', input: '/lpt1' },
  { name: 'the last windows parallel device, pinning the high end of the reserved lpt range', input: '/lpt9' },
  { name: 'a windows device name in uppercase, which folds onto the reserved name so case cannot smuggle it', input: '/CON' },
  { name: 'a windows device name with an extension, still reserved since windows resolves by the pre-dot name', input: '/nul.html' },
  { name: 'a windows device name as an interior segment, so the check applies to every segment, not just ends', input: '/blog/con/post' },
]

describe('normalizePath — rejected, so the page is dropped rather than coerced into a wrong file', () => {
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
  it('does not fold the kelvin sign onto a plain k, so a lookalike cannot silently collide with a real segment', () => {
    expect(normalizePath('/k')).toBe('/k')
    expect(normalizePath('/\u212A')).not.toBe(normalizePath('/k'))
  })

  it('still folds ascii case, which is the fold the module wants, so /ABOUT and /about resolve to one page', () => {
    expect(normalizePath('/ABOUT')).toBe(normalizePath('/about'))
  })
})
