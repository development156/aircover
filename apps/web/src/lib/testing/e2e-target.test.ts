import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ACK_VARIABLE,
  GUARDED_PROJECT_REFS,
  decideTarget,
  extractProjectRef,
  readTarget,
} from './e2e-target'
import { assertE2ETargetAllowed, describeTargetDecision, refusalMessage } from './e2e-target-report'

/**
 * The destination guard for the browser suite, and its own proof.
 *
 * A guard that has never been shown to refuse is not a guard. Every branch below
 * is driven to its refusal, and the two allowing branches are driven to their
 * allowance, so "it passed" and "it did not run" cannot look the same.
 */

const PROD = GUARDED_PROJECT_REFS[0]!
const OTHER = 'abcdefghijklmnopqrst'

const REPO = resolve(import.meta.dirname, '../../../../..')

describe('naming the target', () => {
  it.each([
    ['PostgREST origin', `https://${PROD}.supabase.co`],
    ['direct host DSN', `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`],
    [
      'session pooler DSN',
      `postgresql://postgres.${PROD}:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
    ],
    [
      'transaction pooler DSN',
      `postgresql://postgres.${PROD}:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`,
    ],
    ['bare ref', PROD],
  ])('reads the ref out of the %s', (_label, value) => {
    expect(extractProjectRef(value)).toBe(PROD)
  })

  it('reads nothing out of a local Postgres DSN, which names no project', () => {
    expect(extractProjectRef('postgresql://postgres:pw@127.0.0.1:5432/postgres')).toBeNull()
  })

  it('separates "not Supabase" from "Supabase but unreadable"', () => {
    const reading = readTarget({
      DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5432/postgres',
      SUPABASE_URL: 'https://supabase.example.invalid/whatever',
    })
    expect(reading.nonSupabase).toEqual(['DATABASE_URL'])
    expect(reading.unidentifiable).toEqual(['SUPABASE_URL'])
  })
})

describe('the refusals — each one driven to red', () => {
  it('refuses a Supabase value it cannot parse, rather than ignoring it', () => {
    // The failure direction that matters. A parser that meets a dialect it does
    // not know must not conclude "no production target here".
    const decision = decideTarget({ SUPABASE_DB_URL: 'postgres://user@my.supabase.internal/db' })
    expect(decision.outcome).toBe('refused-unidentifiable')
    expect(decision.allowed).toBe(false)
    expect(refusalMessage(decision)).toContain('could not be identified')
  })

  it('refuses an empty environment instead of passing it', () => {
    expect(decideTarget({}).outcome).toBe('refused-no-target')
  })

  it('refuses a SPLIT target — the app writing to one project, the fixtures cleaning another', () => {
    const decision = decideTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
      SUPABASE_DB_URL: `postgresql://postgres.${OTHER}:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`,
    })
    expect(decision.outcome).toBe('refused-split-target')
    expect(refusalMessage(decision)).toContain(PROD)
    expect(refusalMessage(decision)).toContain(OTHER)
  })

  it('refuses the guarded project when nothing acknowledges it', () => {
    const decision = decideTarget({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` })
    expect(decision.outcome).toBe('refused-unacknowledged')
    expect(refusalMessage(decision)).toContain(ACK_VARIABLE)
    // The operator needs the ref in the message, or they cannot type the override.
    expect(refusalMessage(decision)).toContain(`${ACK_VARIABLE}=${PROD}`)
  })

  it('refuses a TRUTHY acknowledgement that does not name the ref', () => {
    // The whole point of an ack that is a ref: `=1` is what someone types to make
    // an error go away, and it would keep working after the target changed.
    for (const ack of ['1', 'true', 'yes', OTHER, '']) {
      expect(
        decideTarget({
          NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
          [ACK_VARIABLE]: ack,
        }).outcome,
      ).toBe('refused-unacknowledged')
    }
  })
})

describe('the allowances — narrow, and also driven', () => {
  it('allows a project that is not guarded, with no acknowledgement at all', () => {
    const decision = decideTarget({ NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` })
    expect(decision.outcome).toBe('allowed-unguarded')
    expect(decision.ref).toBe(OTHER)
  })

  it('allows the guarded project when the acknowledgement names it exactly', () => {
    const decision = decideTarget({
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
      SUPABASE_DB_URL: `postgresql://postgres.${PROD}:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`,
      [ACK_VARIABLE]: PROD,
    })
    expect(decision.outcome).toBe('allowed-acknowledged')
    expect(decision.allowed).toBe(true)
  })
})

describe('the banner — printed on every run, or the guard is indistinguishable from absent', () => {
  it('prints the parsed ref and the decision when it ALLOWS', () => {
    const lines: string[] = []
    assertE2ETargetAllowed({ NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` }, (l) =>
      lines.push(l),
    )
    const text = lines.join('\n')
    expect(text).toContain(OTHER)
    expect(text).toContain('allowed-unguarded')
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('prints the banner BEFORE it throws, so a refusal still says what it parsed', () => {
    const lines: string[] = []
    expect(() =>
      assertE2ETargetAllowed({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }, (l) =>
        lines.push(l),
      ),
    ).toThrow(/REFUSED/)
    expect(lines.join('\n')).toContain('refused-unacknowledged')
  })

  it('names the unidentified variable in the banner, not only in the throw', () => {
    const decision = decideTarget({ SUPABASE_URL: 'https://supabase.example.invalid/x' })
    expect(describeTargetDecision(decision).join('\n')).toContain('UNIDENTIFIED')
  })
})

/**
 * The ref is written down in four places, in four packages that cannot import
 * each other's test helpers. That is a fact about the workspace, not a choice —
 * so it is CHECKED rather than regretted. This is the scanner that catches a
 * fifth copy being added, or one of the four being edited alone.
 *
 * WHAT IT CAN SEE: a literal `['ref']` array assigned to a `*_PROJECT_REFS`
 * const in a file it is told about.
 * WHAT IT IS BLIND TO: a copy in a file not listed here. `it('finds every
 * file that declares one')` below closes that by globbing instead of trusting
 * the list, which is the only version of this check worth having.
 */
describe('the four copies of the guarded ref', () => {
  const DECLARING_FILES = [
    'apps/web/src/lib/testing/e2e-target.ts',
    'packages/db/tests/helpers/forbidden-target.ts',
    'apps/jobs/tests/helpers/forbidden-target.ts',
    'packages/billing/src/test-helpers/forbidden-target.ts',
  ]

  it('all declare the same ref, so updating one cannot silently orphan the others', () => {
    const refsByFile = DECLARING_FILES.map((file) => {
      const source = readFileSync(resolve(REPO, file), 'utf8')
      const literal = /_PROJECT_REFS[^=]*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(source)?.[1] ?? ''
      const refs = [...literal.matchAll(/['"]([a-z]{20})['"]/g)].map((m) => m[1]!)
      return { file, refs }
    })

    // Printed rather than merely asserted: a failure has to say WHICH file drifted.
    for (const { file, refs } of refsByFile) {
      expect(refs.length, `${file} declares no ref — the guard would pass everything`).toBe(1)
    }
    const distinct = new Set(refsByFile.map((r) => r.refs.join()))
    expect(distinct.size, `refs disagree: ${JSON.stringify(refsByFile)}`).toBe(1)
    expect(refsByFile[0]!.refs).toEqual([...GUARDED_PROJECT_REFS])
  })

  it('finds every file that declares one — a fifth copy cannot arrive unlisted', () => {
    // The list above is the thing this check exists to distrust. `git grep` is the
    // enumeration, so a copy added in a package nobody thought of still shows up.
    // Without this, the check above degrades to "the four files I already knew
    // about agree with each other", which is true of any number of unknown ones.
    //
    // `--untracked` is load-bearing and was added because this check FAILED on its
    // own first run: plain `git grep` reads the index, so the file being written at
    // that moment — a fifth copy of the ref, uncommitted — was invisible to it. A
    // scanner that can only see committed files certifies a working tree it has not
    // read, which is the whole defect class this lane is about.
    //
    // WHAT IT STILL CANNOT SEE: a ref built by concatenation or read from an env
    // var rather than written as a string literal, and any file git ignores.
    const found = execFileSync(
      'git',
      ['grep', '-l', '--untracked', '-E', '_PROJECT_REFS[^=]*=\\s*Object\\.freeze', '--', '*.ts'],
      { cwd: REPO, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .sort()

    expect(found, `declaring files changed — update DECLARING_FILES`).toEqual(
      [...DECLARING_FILES].sort(),
    )
  })
})
