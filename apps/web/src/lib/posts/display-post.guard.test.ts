import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * THE GUARD ITSELF IS UNDER TEST.
 *
 * ── WHY A TEST FOR A TYPE ────────────────────────────────────────────────────
 * "Don't read `posts.status` to decide what a post did" failed three times as a
 * convention — `autoPublishTruth`, `LiveStatusBadge`, and the week grid + strip.
 * `DisplayPost` makes a fourth a compile error. But a compile error is only a
 * guard while it still fires, and nothing in a normal test run would notice it
 * stopping: `turbo typecheck` proves the code that EXISTS compiles, which is the
 * opposite property. Someone "simplifying" the sealed `status` back to a plain
 * one would turn every check green and silently reopen the hole.
 *
 * So the mutants live in `apps/web/type-mutants/`, deliberately outside
 * `tsconfig.json`'s `include` so the ordinary typecheck never compiles them, and
 * this test compiles them on purpose. `must-fail.ts` must produce an error on
 * every marked line; `must-pass.ts` must produce none, because a guard that also
 * blocks the honest reads gets weakened or deleted within a week.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../../..')
const MUTANTS = resolve(WEB, 'type-mutants')

/** Resolved rather than assumed: pnpm may hoist the binary anywhere. */
const tscEntry = createRequire(import.meta.url).resolve('typescript/bin/tsc')

interface Diagnostic {
  file: string
  line: number
}

function compileMutants(): Diagnostic[] {
  let output: string
  try {
    output = execFileSync(process.execPath, [tscEntry, '-p', resolve(MUTANTS, 'tsconfig.json')], {
      cwd: WEB,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // tsc exits non-zero WHENEVER it reports an error, which is the expected
    // case here — the diagnostics are on stdout regardless.
    output = String((error as { stdout?: string }).stdout ?? '')
  }

  return [...output.matchAll(/^(?:.*[/\\])?([\w.-]+\.tsx?)\((\d+),\d+\): error /gm)].map((m) => ({
    file: m[1] as string,
    line: Number(m[2]),
  }))
}

/**
 * Every block in `must-fail.ts` tagged `// M<n> —`, as a line RANGE running to
 * the next tag (or the end of the file).
 *
 * A range rather than a single line because a mutant is allowed to be a
 * multi-line statement, and because tsc is free to anchor a diagnostic on any
 * line of one. Read out of the file rather than hard-coded, so adding a mutant
 * to the fixture automatically adds it to this test — the failure mode of a
 * hard-coded list is that a new mutant is silently never checked.
 */
function taggedMutants(): Array<{ id: string; from: number; to: number }> {
  const lines = readFileSync(resolve(MUTANTS, 'must-fail.ts'), 'utf8').split('\n')
  const tags = lines.flatMap((text, index) => {
    const tag = /^\/\/ (M\d+) —/.exec(text)
    return tag ? [{ id: tag[1] as string, from: index + 1 }] : []
  })
  return tags.map((tag, index) => ({
    ...tag,
    to: tags[index + 1]?.from ?? lines.length + 1,
  }))
}

const diagnostics = compileMutants()

describe('reading posts.status for an outcome does not compile', () => {
  const mutants = taggedMutants()

  test('the fixture actually carries mutants (a silent empty list would pass everything)', () => {
    expect(mutants.length).toBeGreaterThanOrEqual(6)
  })

  test.each(mutants)('$id is a type error', ({ from, to }) => {
    const errored = diagnostics.some(
      (d) => d.file === 'must-fail.ts' && d.line > from && d.line < to,
    )
    expect(errored).toBe(true)
  })
})

describe('the legitimate intent reads still compile', () => {
  test('must-pass.ts produces no diagnostics at all', () => {
    // `canApprove`, the auto-publish promise gate, the badge's literal word and
    // every non-status field on the row. If this ever fails, the guard has grown
    // past what it was for and will be worked around rather than obeyed.
    expect(diagnostics.filter((d) => d.file === 'must-pass.ts')).toEqual([])
  })
})
