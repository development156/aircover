/**
 * The guard on the skip.
 *
 * `export-drift.test.ts` skips itself when this module says the database could
 * not be reached. That makes this module the thing standing between "a test
 * honestly could not run" and "a real defect disappeared into a skip", so it
 * needs a guard of its own — one that runs on every gate, with no credentials
 * and no network.
 *
 * Half of these tests assert what must NOT be excused. Those are the ones worth
 * having.
 */
import { describe, it, expect } from 'vitest'

import { unreachableReason, UNREACHABLE_CODES } from './db-reachability'

/** The real error, MEASURED in the cloud sandbox on 2026-08-28 by connecting `pg` to the configured `SUPABASE_DB_URL`. */
function measuredEnotfound(): Error {
  const error = new Error('getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co')
  return Object.assign(error, { code: 'ENOTFOUND', syscall: 'getaddrinfo' })
}

describe('unreachableReason', () => {
  it('excuses the failure that actually happens in the sandbox, and names the host', () => {
    const reason = unreachableReason(measuredEnotfound())

    expect(reason).not.toBeNull()
    // Named, not counted: whoever reads the skip must be able to see WHICH host
    // went missing without re-running anything.
    expect(reason).toContain('db.rloztdhzfliyvpvxsgjl.supabase.co')
    expect(reason).toContain('ENOTFOUND')
  })

  it.each(UNREACHABLE_CODES)('excuses %s', (code) => {
    expect(
      unreachableReason(Object.assign(new Error(`socket said ${code}`), { code })),
    ).not.toBeNull()
  })

  // ── What must stay red ────────────────────────────────────────────────────
  //
  // Each of these is a server that ANSWERED. Skipping any of them would hide a
  // defect behind a green suite, which is the whole risk this module carries.

  it('does NOT excuse a wrong password', () => {
    const authFailed = Object.assign(
      new Error('password authentication failed for user "postgres"'),
      {
        code: '28P01',
      },
    )

    expect(unreachableReason(authFailed)).toBeNull()
  })

  it('does NOT excuse permission denied on the catalog', () => {
    const denied = Object.assign(new Error('permission denied for table pg_policies'), {
      code: '42501',
    })

    expect(unreachableReason(denied)).toBeNull()
  })

  it('does NOT excuse a reset, which can come from a server that is there', () => {
    // ECONNRESET is the deliberate omission. A TLS handshake refused by a real
    // production database resets the socket, and excusing that would turn a
    // broken production connection into a silent skip.
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })

    expect(unreachableReason(reset)).toBeNull()
  })

  it('does NOT excuse an error carrying no code at all', () => {
    expect(
      unreachableReason(new Error('the manifest lists a table that does not exist')),
    ).toBeNull()
  })

  // ── Shapes the driver actually throws ─────────────────────────────────────

  it('finds the code inside an AggregateError, where a dual-stack connect puts it', () => {
    // Node tries A and AAAA in parallel and reports both failures on the
    // members. The wrapper has no `code`, so a check that only reads the top
    // level sees nothing and the test goes red on a machine with no route.
    const aggregate = Object.assign(new AggregateError([], 'connect failed'), {})
    aggregate.errors = [
      Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' }),
    ]

    expect(unreachableReason(aggregate)).toContain('ECONNREFUSED')
  })

  it('follows a cause chain', () => {
    const wrapped = new Error('could not read the schema', { cause: measuredEnotfound() })

    expect(unreachableReason(wrapped)).toContain('ENOTFOUND')
  })

  it('terminates on a cause that points at itself', () => {
    // A driver that re-wraps its own error is not hypothetical, and an
    // unbounded walk over a graph nobody built is an infinite loop waiting for
    // one bad object.
    const looping: Error & { cause?: unknown } = new Error('round and round')
    looping.cause = looping

    expect(unreachableReason(looping)).toBeNull()
  })

  it('survives a non-object being thrown', () => {
    expect(unreachableReason('ENOTFOUND')).toBeNull()
    expect(unreachableReason(null)).toBeNull()
    expect(unreachableReason(undefined)).toBeNull()
  })
})
