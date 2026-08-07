import { describe, it, expect } from 'vitest'

import {
  FORBIDDEN_PROJECT_REFS,
  assertTargetIsNotProduction,
  findForbiddenTarget,
} from './helpers/forbidden-target'

/**
 * The destination guard's own test. Runs on every ordinary invocation, like live-guard.
 *
 * The threat this covers is narrow and specific: `SAHODA_ALLOW_LIVE_TESTS=1` is satisfiable by
 * pointing at production, because production IS the only Supabase project. So the flag and the
 * destination need separate proofs, and this is the destination's.
 */

const REF = FORBIDDEN_PROJECT_REFS[0]!

describe('production-target refusal', () => {
  it('names at least one forbidden ref — an empty denylist would pass everything', () => {
    expect(FORBIDDEN_PROJECT_REFS.length).toBeGreaterThan(0)
    expect(REF).toMatch(/^[a-z]{20}$/)
  })

  // Every shape the SAME database is reachable by. A host-only check passes the pooler form,
  // which is precisely the form production uses — so each of these must be caught.
  it.each([
    ['direct host', `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`],
    [
      'session pooler',
      `postgresql://postgres.${REF}:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    ],
    [
      'transaction pooler',
      `postgresql://postgres.${REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ],
    ['bare ref', REF],
  ])('refuses SUPABASE_DB_URL in the %s form', (_label, value) => {
    expect(findForbiddenTarget({ SUPABASE_DB_URL: value })).toEqual({
      variable: 'SUPABASE_DB_URL',
      ref: REF,
    })
    expect(() => assertTargetIsNotProduction({ SUPABASE_DB_URL: value })).toThrow(/REFUSED/)
  })

  it.each(['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_PROJECT_REF'])(
    'also refuses via %s — the ref must not slip in through a second variable',
    (variable) => {
      expect(() =>
        assertTargetIsNotProduction({ [variable]: `https://${REF}.supabase.co` }),
      ).toThrow(/REFUSED/)
    },
  )

  it('permits a throwaway target', () => {
    const safe = { SUPABASE_DB_URL: 'postgresql://postgres:pw@127.0.0.1:5432/postgres' }
    expect(findForbiddenTarget(safe)).toBeNull()
    expect(() => assertTargetIsNotProduction(safe)).not.toThrow()
  })

  it('permits a Supabase BRANCH of the same project — branches have their own ref', () => {
    const branch = {
      SUPABASE_DB_URL: 'postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    }
    expect(findForbiddenTarget(branch)).toBeNull()
  })

  it('says nothing when no target is configured at all', () => {
    expect(findForbiddenTarget({})).toBeNull()
    expect(() => assertTargetIsNotProduction({})).not.toThrow()
  })

  it('the message names the variable and the ref, so the operator can act on it', () => {
    let message = ''
    try {
      assertTargetIsNotProduction({ SUPABASE_DB_URL: `db.${REF}.supabase.co` })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('SUPABASE_DB_URL')
    expect(message).toContain(REF)
    expect(message).toContain('does not permit')
  })
})
