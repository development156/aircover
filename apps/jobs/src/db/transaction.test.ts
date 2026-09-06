import { describe, it, expect, vi } from 'vitest'

import { withTransaction, type TxPool } from './transaction'

/**
 * The shape of a transaction, asserted on a fake client that records every
 * statement in order. What matters is not that `begin` was said but that every
 * statement, including the `commit` or `rollback`, went to the SAME client, and
 * that the client goes back to the pool whatever happened.
 */
function fakePool(failOn?: string) {
  const statements: string[] = []
  const release = vi.fn()
  const connect = vi.fn(async () => ({
    query: async (text: string) => {
      statements.push(text)
      if (failOn && text.includes(failOn)) throw new Error(`boom: ${failOn}`)
      return { rows: [], rowCount: 1 }
    },
    release,
  }))
  const pool: TxPool = { connect }
  return { pool, statements, release, connect }
}

describe('withTransaction', () => {
  it('wraps the body in begin/commit on one checked-out client', async () => {
    const { pool, statements, release, connect } = fakePool()

    const out = await withTransaction(pool, async (tx) => {
      await tx.query('insert one')
      await tx.query('update two')
      return 'done'
    })

    expect(out).toBe('done')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(statements).toEqual(['begin', 'insert one', 'update two', 'commit'])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rolls back and rethrows when a statement fails, and still releases', async () => {
    const { pool, statements, release } = fakePool('update two')

    await expect(
      withTransaction(pool, async (tx) => {
        await tx.query('insert one')
        await tx.query('update two')
      }),
    ).rejects.toThrow('boom: update two')

    expect(statements).toEqual(['begin', 'insert one', 'update two', 'rollback'])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('surfaces the ORIGINAL error when the rollback itself fails', async () => {
    const statements: string[] = []
    const release = vi.fn()
    const pool: TxPool = {
      connect: async () => ({
        query: async (text: string) => {
          statements.push(text)
          if (text === 'insert one') throw new Error('connection reset')
          if (text === 'rollback') throw new Error('no connection')
          return { rows: [], rowCount: 1 }
        },
        release,
      }),
    }

    await expect(
      withTransaction(pool, async (tx) => {
        await tx.query('insert one')
      }),
    ).rejects.toThrow('connection reset')
    expect(release).toHaveBeenCalledTimes(1)
  })
})
