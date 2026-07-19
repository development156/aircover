/**
 * Package-wide source-byte gate. This is the pin that stops a raw control, bidi or zero-width
 * character entering ANY source file in this package as a literal byte.
 *
 * Why it matters more than style: git classifies a blob with such a byte as BINARY. The file
 * then has no `git diff` and no `git blame`, so a change to it cannot be reviewed at all. This
 * package has shipped binary source files twice.
 *
 * It used to live inside `render/escape.test.ts` over a hand-written two-entry list --
 * `['./escape.ts', './escape.test.ts']`. That list was already stale when it was written: two
 * sibling files it did not name, `normalize/section-coerce.ts` and
 * `normalize/section-content-caps.test.ts`, had ALREADY regressed to binary while the gate sat
 * green. A gate whose scope is typed by hand goes stale the moment a file is added, so the
 * scope is now DERIVED from the tree.
 *
 * NOTE FOR EDITORS: write every such character as a `\uXXXX` escape sequence. That is text on
 * disk and the identical string at runtime, so nothing is lost by doing it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url))

/**
 * A derived scope is only honest if it actually found the tree. A glob that silently resolves
 * to nothing turns this gate into a test that always passes -- exactly the failure mode the
 * hand-written list had, but harder to notice. Well below the current count, so ordinary
 * deletions do not trip it; high enough that a broken walk does.
 */
const MIN_EXPECTED_SOURCES = 20

/** Every `.ts` file under `src/`, at any depth. No extension filter beyond `.ts` is intended. */
const sourceFiles = (): ReadonlyArray<string> =>
  readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()

interface Offender {
  codePoint: number
  index: number
}

/**
 * Characters that must never appear as a raw byte in source: C0 and C1 controls (minus tab and
 * newline, which are ordinary formatting), the bidi and zero-width set, the Unicode tag block,
 * lone surrogates, and U+FFFD -- which is not an input hazard but PROOF the file already lost
 * bytes, since it is what invalid UTF-8 decodes to.
 *
 * Deliberately NOT flagged: ordinary printable non-ASCII. Prose in this package uses typographic
 * punctuation, git reads it as text, and banning it would produce a gate nobody could keep
 * green -- which is how the previous one came to cover two files out of thirty-five.
 */
const isForbiddenByte = (codePoint: number): boolean => {
  if (codePoint < 0x20) return codePoint !== 0x09 && codePoint !== 0x0a
  if (codePoint >= 0x7f && codePoint <= 0x9f) return true
  if (codePoint >= 0x200b && codePoint <= 0x200f) return true
  if (codePoint >= 0x202a && codePoint <= 0x202e) return true
  if (codePoint >= 0x2060 && codePoint <= 0x206f) return true
  if (codePoint >= 0xfff9 && codePoint <= 0xfffb) return true
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return true
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return true
  return (
    codePoint === 0x061c || codePoint === 0x180e || codePoint === 0xfeff || codePoint === 0xfffd
  )
}

const findOffenders = (contents: string, predicate: (codePoint: number) => boolean): Offender[] => {
  const found: Offender[] = []
  for (let index = 0; index < contents.length; index += 1) {
    const codePoint = contents.codePointAt(index) ?? 0
    if (predicate(codePoint)) found.push({ codePoint, index })
    if (codePoint > 0xffff) index += 1
  }
  return found
}

/**
 * The message has to name the FILE and WHERE, because the person reading it is staring at a
 * diff git refuses to show them. A bare `expect([]).toEqual([...])` on an anonymous array is
 * how the previous version reported, and it named neither.
 */
const describeOffender = (path: string, contents: string, offender: Offender): string => {
  const before = contents.slice(0, offender.index)
  const line = before.split('\n').length
  const column = offender.index - before.lastIndexOf('\n')
  const byteOffset = Buffer.byteLength(before, 'utf8')
  const hex = offender.codePoint.toString(16).toUpperCase().padStart(4, '0')
  return `${relative(SRC_ROOT, path)}:${line}:${column} U+${hex} (byte ${byteOffset})`
}

const report = (path: string, predicate: (codePoint: number) => boolean): ReadonlyArray<string> => {
  const contents = readFileSync(path, 'utf8')
  return findOffenders(contents, predicate).map((offender) =>
    describeOffender(path, contents, offender),
  )
}

const SOURCES = sourceFiles()

describe('package source files are text, not binary', () => {
  it('discovered the source tree, so this gate is not vacuously green', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(MIN_EXPECTED_SOURCES)
  })

  it('still covers the two files the old hand-written list named', () => {
    const found = SOURCES.map((path) => relative(SRC_ROOT, path))

    expect(found).toContain(join('render', 'escape.ts'))
    expect(found).toContain(join('render', 'escape.test.ts'))
  })

  for (const path of SOURCES) {
    it(`stores ${relative(SRC_ROOT, path)} with no raw control, bidi or zero-width byte`, () => {
      expect(report(path, isForbiddenByte)).toEqual([])
    })
  }
})

/**
 * A stricter, deliberately NARROWER promise: the security gate and its tests are pure ASCII,
 * as `escape.ts`'s own header states. Scoped by hand on purpose -- it is an opt-in commitment
 * for the files where review matters most, not a package-wide rule -- so the list is asserted
 * to resolve, and a rename fails here loudly instead of silently dropping the file.
 */
const ASCII_ONLY: ReadonlyArray<string> = [
  join('render', 'escape.ts'),
  join('render', 'escape.test.ts'),
  join('render', 'escape-url-scheme-space.test.ts'),
]

describe('the security gate and its tests are pure ASCII', () => {
  it('names only files that exist, so a rename cannot silently drop one', () => {
    const found = new Set(SOURCES.map((path) => relative(SRC_ROOT, path)))

    expect(ASCII_ONLY.filter((name) => !found.has(name))).toEqual([])
  })

  for (const name of ASCII_ONLY) {
    it(`stores ${name} as pure ASCII`, () => {
      expect(report(join(SRC_ROOT, name), (codePoint) => codePoint > 0x7f)).toEqual([])
    })
  }
})
