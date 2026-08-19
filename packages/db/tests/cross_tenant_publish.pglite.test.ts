import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, applyMigration, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * The cross-tenant publish guard, EXECUTED — the applied file, not a paraphrase.
 *
 * ── WHY THIS EXISTS WHEN THE FUNCTION IS ALREADY LIVE ───────────────────────
 * It was proven against production on 2026-08-19 with workspace A's real post and
 * workspace B's real, active Instagram account: `CROSS_TENANT_ACCOUNT`. That is
 * the strongest possible evidence and it is not repeatable in CI — the live suite
 * is banned from this project by `forbidden-target.ts`, and rightly, because it
 * holds twenty workspaces of real work.
 *
 * So this is the regression half: the same file, the same arguments, on a Postgres
 * that starts empty. If a later migration ever weakens the predicate, this goes red
 * without anyone having to remember to re-run a hostile query by hand.
 *
 * ── WHAT THE FUNCTION PROMISES ──────────────────────────────────────────────
 * The workspace is NEVER taken from the caller. It is re-derived from the post,
 * and the account id is returned only if an ACTIVE connection — same workspace,
 * same channel as the variant, under that workspace's Zernio profile — owns it.
 * Every argument is treated as attacker-supplied, because in an RPC signature it is.
 */

/**
 * ALL THREE definitions, in order, because the LAST one wins.
 *
 * ── A TRAP THIS TEST WALKED INTO FIRST ──────────────────────────────────────
 * Applying only `20260801000005` — the file named after the function — produced a
 * function that refuses an `approved` post and every channel but Instagram, and
 * every test here failed. The DEPLOYED function accepts `approved` and all four
 * channels, because two later migrations replace it with `create or replace`.
 *
 * A test that loads the first definition is describing SQL nobody runs, which is
 * the same class of error `schedule_guard_parity.test.ts` exists to catch for the
 * schedule guards. The chain is applied in filename order, exactly as the founder
 * applied it.
 */
const DEFINITIONS = [
  '20260801000005_assert_account_for_scheduled_post.sql',
  '20260804000000_publish_claim.sql',
  '20260804010000_zernio_all_channels.sql',
] as const

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const POST_A = '33333333-3333-4333-8333-333333333333'
const VARIANT_A = '44444444-4444-4444-8444-444444444444'
const PROFILE_A = 'a'.repeat(24)
const PROFILE_B = 'b'.repeat(24)
const ACCOUNT_A = 'c'.repeat(24)
/** Workspace B's account. Real, active — and not A's to publish through. */
const ACCOUNT_B = 'd'.repeat(24)

/** Only what this function reads. `connections` and `zernio_profiles` are its inputs. */
const DEPS = `
  create table zernio_profiles (
    workspace_id uuid primary key references workspaces (id) on delete cascade,
    profile_id text not null
  );
  create table connections (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces (id) on delete cascade,
    platform text not null,
    status text not null default 'active',
    external_account jsonb,
    updated_at timestamptz not null default now()
  );
`

describe('assert_account_for_scheduled_post (real Postgres, in-process)', () => {
  let db: PGlite

  async function assert(post: string, variant: string, account: string | null): Promise<string> {
    const r = await db.query<{ account_id: string }>(
      'select public.assert_account_for_scheduled_post($1, $2, $3) as account_id',
      [post, variant, account],
    )
    return r.rows[0]?.account_id ?? ''
  }

  beforeAll(async () => {
    db = await bootSchema(CONTENT_FOUNDATION)
    await db.exec(DEPS)
    for (const file of DEFINITIONS) await applyMigration(db, file)

    // Read back what is now installed, not what any one file says. This is the
    // assertion that would have caught the stale-definition trap immediately.
    const def = await db.query<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'assert_account_for_scheduled_post'`,
    )
    const body = def.rows[0]?.def ?? ''
    expect(body).toContain('CROSS_TENANT_ACCOUNT')
    // The widened forms the last definition brought, so a silent revert to the
    // first one fails here rather than four tests down.
    expect(body).toContain("'approved'")
    expect(body).toContain('c.platform')
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.exec('truncate connections, zernio_profiles, post_variants, posts, workspaces cascade')
    for (const [id, slug] of [
      [WS_A, 'a'],
      [WS_B, 'b'],
    ] as const) {
      await db.query(
        `insert into workspaces (id, name, slug, created_by) values ($1, $2, $2, 'user_x')`,
        [id, slug],
      )
    }
    await db.query(
      `insert into posts (id, workspace_id, title, status) values ($1, $2, 'A post', 'approved')`,
      [POST_A, WS_A],
    )
    await db.query(
      `insert into post_variants (id, workspace_id, post_id, channel, body)
       values ($1, $2, $3, 'instagram', 'hello')`,
      [VARIANT_A, WS_A, POST_A],
    )
    await db.query(
      `insert into zernio_profiles (workspace_id, profile_id) values ($1,$2), ($3,$4)`,
      [WS_A, PROFILE_A, WS_B, PROFILE_B],
    )
    // A's own connection, and B's — both real, both active.
    await db.query(
      `insert into connections (workspace_id, platform, status, external_account)
       values ($1, 'instagram', 'active', $2), ($3, 'instagram', 'active', $4)`,
      [
        WS_A,
        JSON.stringify({ id: ACCOUNT_A, profileId: PROFILE_A }),
        WS_B,
        JSON.stringify({ id: ACCOUNT_B, profileId: PROFILE_B }),
      ],
    )
  })

  it('returns the account when it really is this workspace’s', async () => {
    // The positive control. Without it every refusal below could be the function
    // refusing everything, which is not a guard — it is a broken function.
    expect(await assert(POST_A, VARIANT_A, ACCOUNT_A)).toBe(ACCOUNT_A)
  })

  it('REFUSES another workspace’s real, active account', async () => {
    // The attack the whole exception in the access grant is about: one customer's
    // post published to another customer's feed, which Zernio answers 200 to.
    await expect(assert(POST_A, VARIANT_A, ACCOUNT_B)).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
  })

  it('refuses a well-formed account id belonging to nobody', async () => {
    await expect(assert(POST_A, VARIANT_A, 'e'.repeat(24))).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
  })

  it('refuses A’s own account once the connection is no longer active', async () => {
    // A revoked or expired connection is not a licence to keep publishing.
    await db.query(`update connections set status = 'expired' where workspace_id = $1`, [WS_A])
    await expect(assert(POST_A, VARIANT_A, ACCOUNT_A)).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
  })

  it('refuses A’s own account when the profile mapping has moved', async () => {
    // The case a stale connection row creates: the id is right, the profile is not.
    await db.query(`update zernio_profiles set profile_id = $1 where workspace_id = $2`, [
      'f'.repeat(24),
      WS_A,
    ])
    await expect(assert(POST_A, VARIANT_A, ACCOUNT_A)).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
  })

  it('refuses when the connection is for a DIFFERENT channel than the variant', async () => {
    await db.query(`update connections set platform = 'x' where workspace_id = $1`, [WS_A])
    await expect(assert(POST_A, VARIANT_A, ACCOUNT_A)).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
  })

  it('REFUSES when two workspaces share one Zernio profile', async () => {
    // ── THE CASE THAT MAKES THE WORKSPACE CLAUSE LOAD-BEARING ─────────────────
    // Removing `c.workspace_id = v_ws_id` from the connection lookup did NOT fail
    // any test here, and the reason is that the profile check usually does the same
    // work: `zernio_profiles` is keyed by workspace, so a foreign connection is
    // normally excluded by its profileId alone.
    //
    // `profile_id` is NOT unique though — nothing stops two workspaces mapping to
    // one Zernio profile, which is exactly what a shared agency account looks like.
    // In that arrangement the profile check separates nothing and the workspace
    // clause is the only thing left standing between two tenants.
    //
    // MEASURED 2026-08-19: no production workspace shares a profile today. This is
    // the case that must not become reachable silently.
    await db.query(`update zernio_profiles set profile_id = $1 where workspace_id = $2`, [
      PROFILE_A,
      WS_B,
    ])
    await db.query(`update connections set external_account = $1 where workspace_id = $2`, [
      JSON.stringify({ id: ACCOUNT_B, profileId: PROFILE_A }),
      WS_B,
    ])

    await expect(assert(POST_A, VARIANT_A, ACCOUNT_B)).rejects.toThrow(/CROSS_TENANT_ACCOUNT/)
    // And A's own still works, so this is a boundary rather than a blanket refusal.
    expect(await assert(POST_A, VARIANT_A, ACCOUNT_A)).toBe(ACCOUNT_A)
  })

  it('refuses a variant that belongs to another post', async () => {
    const other = '55555555-5555-4555-8555-555555555555'
    await db.query(
      `insert into posts (id, workspace_id, title, status) values ($1, $2, 'Other', 'approved')`,
      [other, WS_A],
    )
    await expect(assert(other, VARIANT_A, ACCOUNT_A)).rejects.toThrow(/INVALID_VARIANT/)
  })

  it('refuses a post that is not publishable', async () => {
    await db.query(`update posts set status = 'draft' where id = $1`, [POST_A])
    await expect(assert(POST_A, VARIANT_A, ACCOUNT_A)).rejects.toThrow(/POST_NOT_PUBLISHABLE/)
  })

  it('refuses a malformed account id rather than looking it up', async () => {
    for (const hostile of [null, '', "' or '1'='1", 'A'.repeat(24), 'c'.repeat(23)]) {
      await expect(assert(POST_A, VARIANT_A, hostile)).rejects.toThrow(/INVALID_ACCOUNT/)
    }
  })

  it('takes the workspace from the POST, never from the caller', async () => {
    // There is no workspace argument at all, and that is the design: a signature
    // that accepted one would be a signature an attacker could fill in.
    const args = await db.query<{ args: string }>(
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'assert_account_for_scheduled_post'`,
    )
    expect(args.rows[0]?.args).toBe('p_post_id uuid, p_variant_id uuid, p_account_id text')
  })
})
