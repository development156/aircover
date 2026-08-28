/**
 * The classifier that decides whether `export-drift.test.ts` is allowed to stand
 * down. It needs no database, so unlike the file it serves it runs on every gate
 * run — which matters, because it is the piece that can silence a real failure.
 *
 * Both directions are asserted: the codes that MUST stand down, and the ones
 * that must stay red. The second half is the one that earns its place.
 */
import { describe, it, expect } from 'vitest'

import { noRouteReason, readOrStandDown } from './db-route'

/** Shaped like a Node socket error, because that is what `pg` re-throws. */
function errnoError(code: string, hostname?: string): Error {
  return Object.assign(new Error(`getaddrinfo ${code}`), { code, hostname })
}

describe('noRouteReason', () => {
  it('names the host and the code, so the reader is not left guessing', () => {
    expect(noRouteReason(errnoError('ENOTFOUND', 'db.example.supabase.co'))).toBe(
      'no route to db.example.supabase.co from this machine (ENOTFOUND)',
    )
  })

  it('still stands down when the error carries no hostname', () => {
    expect(noRouteReason(errnoError('ENETUNREACH'))).toBe(
      'no route to the database from this machine (ENETUNREACH)',
    )
  })

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'])(
    'treats %s as an absent network',
    (code) => {
      expect(noRouteReason(errnoError(code, 'db.example.supabase.co'))).not.toBeNull()
    },
  )

  it('reads a wrapped errno, because a driver may hand back its own error', () => {
    const wrapped = new Error('connection terminated unexpectedly', {
      cause: errnoError('ENOTFOUND', 'db.example.supabase.co'),
    })
    expect(noRouteReason(wrapped)).toBe(
      'no route to db.example.supabase.co from this machine (ENOTFOUND)',
    )
  })

  // ── The half that keeps the guard a guard ─────────────────────────────────
  // Every one of these reached the host, or says nothing about the network. If
  // any of them starts standing down, the export manifest loses its only check
  // against production and nothing says so.

  it.each([
    ['ECONNREFUSED', 'a machine answered and refused'],
    ['ETIMEDOUT', 'indistinguishable from a database too slow to answer'],
    ['ECONNRESET', 'the connection existed before it was cut'],
    ['EPIPE', 'the socket was open'],
    ['CERT_HAS_EXPIRED', 'TLS is not routing'],
  ])('keeps %s red (%s)', (code) => {
    expect(noRouteReason(errnoError(code, 'db.example.supabase.co'))).toBeNull()
  })

  it('keeps a Postgres SQLSTATE red — the host was reached', () => {
    expect(noRouteReason(errnoError('28P01'))).toBeNull()
  })

  it('keeps a plain failure red', () => {
    expect(noRouteReason(new Error('relation "workspaces" does not exist'))).toBeNull()
  })

  it.each([[null], [undefined], ['ENOTFOUND'], [42]])(
    'does not throw on a non-error value (%s)',
    (value) => {
      expect(noRouteReason(value)).toBeNull()
    },
  )

  it('does not loop forever on a self-referencing cause', () => {
    const looping: { cause?: unknown } = {}
    looping.cause = looping
    expect(noRouteReason(looping)).toBeNull()
  })
})

describe('readOrStandDown', () => {
  it('hands back the rows when the read works', async () => {
    const result = await readOrStandDown(async () => [{ table_name: 'posts' }])
    expect(result).toEqual({ rows: [{ table_name: 'posts' }], noRoute: null })
  })

  it('stands down, with the reason, when there is no route', async () => {
    const result = await readOrStandDown(async () => {
      throw errnoError('ENOTFOUND', 'db.example.supabase.co')
    })
    expect(result.rows).toBeNull()
    expect(result.noRoute).toBe('no route to db.example.supabase.co from this machine (ENOTFOUND)')
  })

  /**
   * The one that matters. Deleting the rethrow turned a REFUSED connection into
   * two quietly skipped tests and no red anywhere — MEASURED against
   * `127.0.0.1:1` before this test existed.
   */
  it('rethrows a reachable database that is broken, rather than standing down', async () => {
    await expect(
      readOrStandDown(async () => {
        throw errnoError('ECONNREFUSED', 'db.example.supabase.co')
      }),
    ).rejects.toThrow('ECONNREFUSED')
  })

  it('rethrows a query failure — the host answered', async () => {
    await expect(
      readOrStandDown(async () => {
        throw new Error('permission denied for schema information_schema')
      }),
    ).rejects.toThrow('permission denied')
  })
})
