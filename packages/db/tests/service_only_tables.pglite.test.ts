import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * THE TABLES THAT DENY EVERYONE, PINNED AS A DECISION RATHER THAN AN ACCIDENT.
 *
 * NINE tables on this branch carry `enable row level security` and NO policies
 * at all — eleven in production, and the split is explained below. That
 * denies every read and write by `anon` and `authenticated`, and it is
 * deliberate — `ai_provider_logs` says so in its own migration: "no policies:
 * service-only — raw COGS is margin data, not user-facing". The last audit read
 * the same state as "unreadable rather than governed"; it is governed, by the
 * strictest rule available, and the thing actually missing was that the decision
 * lived in a comment.
 *
 * ── WHY A LIST AND NOT A RULE ───────────────────────────────────────────────
 * "No policies" cannot be asserted as a general property: the correct number of
 * policy-free tables is not zero and not eleven, it is whatever set has been
 * decided. So the set is named. Adding a table to it is a deliberate edit here;
 * so is REMOVING one — and that is the direction that matters. A future lane
 * adding `create policy … on connection_secrets` opens the OAuth token vault to
 * every signed-in user, and today nothing anywhere would notice: the export
 * manifest's own drift guard only covers workspace-owned tables, and ten of
 * these eleven have no `workspace_id` to qualify them.
 *
 * PROVEN LIVE against production the same day, as the member owning the most
 * rows (control: that token saw 40 of its own posts, so the zeros below are a
 * refusal and not a blind probe): all eleven answered 0 rows to that member AND
 * to anon.
 */

/**
 * RLS on, zero policies, on purpose. Each line says who writes it instead.
 *
 * A table leaving this list must ALSO leave it here, which is the point.
 */
const SERVICE_ONLY: ReadonlyArray<readonly [table: string, why: string]> = [
  ['ai_provider_logs', 'raw COGS — margin data; written by packages/mesh with the service role'],
  ['app_settings', 'platform configuration, owned by no workspace'],
  ['billing_webhook_events', 'provider deliveries; written by the Cashfree receiver over pg'],
  ['clerk_id_map', 'the dev-to-production subject remap; empty, and read by no application code'],
  ['connection_secrets', 'THE OAUTH TOKEN VAULT. A policy here is a token disclosure'],
  ['invoice_serials', 'the invoice counter; a member reading it learns other customers volumes'],
  [
    'ledger_actor_redactions',
    'whether a workspace name may be shown on its own credit record — Sahoda’s decision record, not the customer’s content. Arrived from wt-dpdp at integration on 2026-08-23: wt-sec wrote this list and wt-dpdp created the table, and neither branch could see the other',
  ],
  ['radar_fetch_log', 'per-fetch provider cost; those prices are ours, not the customers'],
  ['radar_limits', 'the global spend cap — one row nobody may read or move'],
]

/**
 * ── THIS ASSERTS THE MIGRATIONS, AND PRODUCTION HAS FOUR MORE ───────────────
 * MEASURED 2026-08-23. Production's policy-free set is ELEVEN, not nine, and
 * the difference is not drift in the policies — it is drift in the TABLES:
 *
 *   in prod, created by no migration on this branch:
 *       brands, elements, jobs, ledger   (all RLS on, 0 policies, 0-1 rows)
 *   on this branch, absent from prod:
 *       clerk_id_map              (20260805000000 has never been applied there)
 *       ledger_actor_redactions   (20260823000000 is deliberately unapplied)
 *
 * The four are legacy, they predate the migration set, and they deny everyone —
 * so they are untracked schema rather than an opening. This test cannot assert
 * them: it boots the migrations, and a table no migration creates cannot appear.
 * The prod-side check is `audit/sec/schema-drift.mjs`, which needs credentials
 * and therefore cannot be a gate leg. Naming the split here is what stops the
 * next reader treating nine as a contradiction of eleven.
 */

let db: PGlite

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

afterAll(async () => {
  await db?.close()
})

async function policyFreeTables(): Promise<string[]> {
  const res = await db.query<{ relname: string }>(`
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and (select count(*) from pg_policy p where p.polrelid = c.oid) = 0
     order by 1`)
  return res.rows.map((r) => r.relname)
}

describe('tables that deny everyone', () => {
  it('is exactly the declared set — a table joining or LEAVING it is an edit here', async () => {
    expect(await policyFreeTables()).toEqual(SERVICE_ONLY.map(([table]) => table))
  })

  it('every one of them still has RLS enabled', async () => {
    const res = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)
    expect(res.rows.map((r) => r.relname)).toEqual([])
  })

  it('the OAuth vault is in the set, named, because that is the one that must never move', async () => {
    // Singled out deliberately. If a future edit re-orders or trims the list
    // above, this still fails rather than passing on a shorter array.
    expect(SERVICE_ONLY.map(([table]) => table)).toContain('connection_secrets')
    expect(await policyFreeTables()).toContain('connection_secrets')
  })
})
