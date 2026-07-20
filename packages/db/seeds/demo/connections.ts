import { ConnectionSchema } from '@sahoda/shared'
import type { ConnectionPlatform, ConnectionStatus } from '@sahoda/shared'
import type { SeedModule, SeedTableResult } from './context'
import { at } from './time'

/**
 * Scope lists are copied from the live OAuth handlers (X_SCOPES in
 * packages/publishing/src/oauth/x.ts, GBP_SCOPE in .../gbp.ts) rather than invented, so the
 * connections screen shows the same grants a real callback would have stored.
 */
const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write']
const GBP_SCOPES = ['https://www.googleapis.com/auth/business.manage']

/**
 * Only the columns this seed writes. `created_at`/`updated_at` are left to the table defaults
 * and the set_updated_at trigger.
 */
interface ConnectionRow {
  readonly label: string
  readonly platform: ConnectionPlatform
  readonly status: ConnectionStatus
  readonly externalAccount: Record<string, unknown>
  readonly scopes: readonly string[]
  /** Always null here — see the no-secrets note below. Kept as a column so a re-run over an
   *  older seeded row CLEARS any expiry it was written with, instead of leaving it behind. */
  readonly expiresAt: Date | null
  readonly lastCheckedAt: Date
}

/**
 * The vocabularies that the table CHECKs enforce are the ones worth re-asserting in TS: a drift
 * between @sahoda/shared and 20260718000005_connections.sql should fail here, at seed time, not
 * as an opaque 23514 from Postgres. Timestamps are excluded from the parse on purpose —
 * ConnectionSchema types them as the ISO strings PostgREST returns, while pg takes Date objects.
 */
const ConnectionSeedSchema = ConnectionSchema.pick({
  id: true,
  workspace_id: true,
  platform: true,
  status: true,
  external_account: true,
  scopes: true,
  created_by: true,
})

/**
 * The conflict target is the `id` primary key, not the natural key. `connections` also carries
 * connections_ws_platform_account, unique on (workspace_id, platform, (external_account->>'id')),
 * and Postgres examines ONLY the arbiter index before choosing the DO UPDATE path: a re-run whose
 * id already exists resolves on the PK and updates that row in place, so the jsonb expression
 * index is never re-entered as a fresh insert. That shield holds only because BOTH keys are
 * deterministic — `id` comes from ctx.id(label), and the account ids below are literals. Mint the
 * id from anything run-varying while leaving the account id fixed and run two would arbitrate on
 * nothing, speculatively insert, and die with an unarbitrated 23505 on the natural key.
 */
const INSERT_CONNECTION = `
  insert into connections (
    id, workspace_id, platform, status, external_account, scopes,
    expires_at, last_checked_at, created_by
  )
  values ($1, $2, $3, $4, $5::jsonb, $6::text[], $7::timestamptz, $8::timestamptz, $9)
  on conflict (id) do update set
    workspace_id     = excluded.workspace_id,
    platform         = excluded.platform,
    status           = excluded.status,
    external_account = excluded.external_account,
    scopes           = excluded.scopes,
    expires_at       = excluded.expires_at,
    last_checked_at  = excluded.last_checked_at,
    created_by       = excluded.created_by
  returning id
`

/**
 * Two live-looking channels and DELIBERATELY NO `connection_secrets` ROW.
 *
 * The vault holds real AES-256-GCM sealed OAuth tokens. A demo may plant neither a real token
 * (that would put a genuine credential in a seed script, readable by anyone who can run it) nor
 * a fake one (a blob that decrypts to nothing is a mock-success state: the UI would read
 * "connected and ready" while the first publish dies inside the adapter with a confusing vault
 * error). Seeding no secret at all is the honest third option — an attempted publish from this
 * workspace fails at the adapter, which is exactly what SHOULD happen when no real account is
 * bound, and it is consistent with every seeded post_publish_logs row carrying mode 'fixture'.
 * Nothing in this workspace has been, or can be, published for real.
 *
 * `expires_at` is NULL on both rows, and that is the same ruling as the missing secret rather
 * than a second one. The column holds the OAuth CREDENTIAL's expiry — migration 05 line 12
 * leaves it nullable precisely because some platforms report none. With no connection_secrets
 * row there is no token, so there is no expiry to state. A date there would be the one field
 * that fabricates a PROPERTY OF THE MISSING CREDENTIAL rather than merely labelling the
 * connection usable, and it buys nothing: the connections screen would read "expires in 45
 * days" over an empty vault. `status: 'active'` stays for the reason above.
 *
 * `external_account.demo: true` is the on-sight marker; the ids are obviously synthetic. The
 * rest of the object is the production shape verbatim, because a fixture that only the seed
 * can read is worth less than one the real code paths accept: the X callback writes
 * `{ id, handle?, name? }` and the GBP callback writes `{ id, name }` with `id` the FULL
 * `accounts/{a}/locations/{l}` resource name (packages/publishing/src/oauth/x.ts:146-150,
 * gbp.ts:124-127, both landing through public.upsert_connection). An earlier draft carried a
 * `locationName` key no callback writes and a bare `demo-gbp-loc-4417` for the id, so anything
 * asserting ConnectionExternalAccount against seeded data would have failed on demo rows only.
 */
export const seedConnections: SeedModule = async (ctx) => {
  const rows: readonly ConnectionRow[] = [
    {
      label: 'connection.x',
      platform: 'x',
      status: 'active',
      externalAccount: {
        id: 'demo-x-acct-8891',
        handle: 'chaiandchapters',
        name: 'Chai & Chapters',
        demo: true,
      },
      scopes: X_SCOPES,
      expiresAt: null,
      lastCheckedAt: at(ctx.now, -1, '06:15'),
    },
    {
      label: 'connection.gbp',
      platform: 'gbp',
      status: 'active',
      externalAccount: {
        // Frozen literal, never derived from the clock or the namespace: this string is the
        // third term of connections_ws_platform_account, and a run-varying value would make
        // run two speculatively insert and die on an unarbitrated 23505 (see above).
        id: 'accounts/demo-4417/locations/demo-8823',
        name: 'Chai & Chapters, Buxi Bazaar, Cuttack',
        demo: true,
      },
      scopes: GBP_SCOPES,
      expiresAt: null,
      lastCheckedAt: at(ctx.now, -1, '06:15'),
    },
  ]

  let inserted = 0
  for (const row of rows) {
    const id = ctx.id(row.label)
    // Parse before the write so a shared-schema drift throws with the offending label in scope.
    ConnectionSeedSchema.parse({
      id,
      workspace_id: ctx.workspaceId,
      platform: row.platform,
      status: row.status,
      external_account: row.externalAccount,
      scopes: [...row.scopes],
      created_by: ctx.ownerId,
    })

    const returned = await ctx.sql<{ id: string }>(INSERT_CONNECTION, [
      id,
      ctx.workspaceId,
      row.platform,
      row.status,
      JSON.stringify(row.externalAccount),
      [...row.scopes],
      row.expiresAt,
      row.lastCheckedAt,
      ctx.ownerId,
    ])
    inserted += returned.length
  }

  ctx.log(`connections: ${inserted} (no connection_secrets — nothing here can publish for real)`)

  const results: readonly SeedTableResult[] = [{ table: 'connections', rows: inserted }]
  return results
}
