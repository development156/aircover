/**
 * The skip condition on `export-drift.test.ts`, checked on every gate run.
 *
 * This is a claim about which failures do not matter. Half the cases below are
 * therefore the ones that must stay RED: a wrong password and a denied `select`
 * arrive shaped exactly like a socket errno, because `pg` puts SQLSTATE on
 * `error.code` in the same field.
 */
import { describe, it, expect } from 'vitest'

import { unreachableCode } from './db-reachability'

/** What `pg` throws after `getaddrinfo` fails, near enough for shape. */
function socketError(code: string): Error {
  return Object.assign(new Error(`connect ${code} db.example.supabase.co:5432`), { code })
}

/** What `pg` throws once the SERVER has answered. `code` is a SQLSTATE. */
function postgresError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, severity: 'FATAL', routine: 'auth_failed' })
}

describe('an error that means the database was never reached', () => {
  it.each([
    ['ENOTFOUND', 'the resolver returned nothing'],
    ['EAI_AGAIN', 'the resolver failed temporarily'],
    ['EAFNOSUPPORT', 'no socket of that address family — the v6-only host case'],
    ['ECONNREFUSED', 'nothing listening'],
    ['EHOSTUNREACH', 'no route to the host'],
    ['ENETUNREACH', 'no route to the network'],
    ['ETIMEDOUT', 'the connect never completed'],
  ])('%s is unreachable (%s)', (code) => {
    expect(unreachableCode(socketError(code))).toBe(code)
  })

  it('finds the errno through a cause chain', () => {
    const wrapped = new Error('could not connect', { cause: socketError('ENOTFOUND') })
    expect(unreachableCode(wrapped)).toBe('ENOTFOUND')
  })

  it('finds the errno inside an AggregateError, which is what a multi-address connect throws', () => {
    const both = new AggregateError(
      [socketError('EAFNOSUPPORT'), socketError('ECONNREFUSED')],
      'all attempts failed',
    )
    expect(unreachableCode(both)).toBe('EAFNOSUPPORT')
  })

  it('gives up rather than looping forever on a cyclic cause', () => {
    const looped: { cause?: unknown } = new Error('round and round')
    looped.cause = looped
    expect(unreachableCode(looped)).toBeNull()
  })
})

describe('an error the SERVER answered with, which must never be swallowed', () => {
  it.each([
    ['28P01', 'password authentication failed for user "postgres"'],
    ['3D000', 'database "sahoda" does not exist'],
    ['42501', 'permission denied for table workspaces'],
    ['28000', 'no pg_hba.conf entry for host'],
    ['53300', 'sorry, too many clients already'],
  ])('SQLSTATE %s is NOT unreachable', (code, message) => {
    expect(unreachableCode(postgresError(code, message))).toBeNull()
  })

  it('a rejected certificate is NOT unreachable — we got far enough to be rejected', () => {
    expect(unreachableCode(socketError('CERT_HAS_EXPIRED'))).toBeNull()
    expect(unreachableCode(socketError('SELF_SIGNED_CERT_IN_CHAIN'))).toBeNull()
  })

  it('ECONNRESET is NOT unreachable — something answered far enough to reset us', () => {
    expect(unreachableCode(socketError('ECONNRESET'))).toBeNull()
  })

  it('a failed assertion is NOT unreachable — it is the finding this test exists for', () => {
    expect(unreachableCode(new Error('expected [ "audience_snapshots" ] to equal []'))).toBeNull()
  })

  it.each([[null], [undefined], ['ENOTFOUND'], [42]])(
    'a non-error value (%s) is not unreachable, even when it spells one',
    (value) => {
      expect(unreachableCode(value)).toBeNull()
    },
  )
})
