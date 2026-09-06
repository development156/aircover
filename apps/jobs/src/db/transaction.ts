/**
 * One transaction on one checked-out client.
 *
 * ── WHY A POOL IS NOT ENOUGH ─────────────────────────────────────────────────
 * `pool.query('begin')` followed by `pool.query('insert …')` is NOT a transaction:
 * each call may land on a different pooled connection, so the `begin` opens a
 * transaction one client never uses and the insert autocommits on another. The
 * only honest shape is `pool.connect()`, every statement on THAT client, then
 * `commit` or `rollback`, then `release()` — whatever happened.
 *
 * The two publish writes this exists for (F-33) used to be two pool statements:
 * the succeeded log row committed, then the variant was marked. A process killed
 * between them left a post live on the platform with a variant still claimable
 * after the lease, and the next tick sent it again. Inside one transaction the
 * pair either both land or neither does.
 */

/** The slice of `pg.PoolClient` a transaction body may use. */
export interface TxClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

/** The slice of `pg.Pool` this needs: hand out a client that can be released. */
export interface TxPool {
  connect(): Promise<TxClient & { release(err?: Error | boolean): void }>
}

export async function withTransaction<T>(
  pool: TxPool,
  body: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await body(client)
    await client.query('commit')
    return out
  } catch (error) {
    // The rollback is best-effort: if the connection is what died, there is nothing
    // to roll back and the original error is the one worth surfacing.
    try {
      await client.query('rollback')
    } catch {
      /* the original error is the cause */
    }
    throw error
  } finally {
    client.release()
  }
}
