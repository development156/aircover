import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asMember, asRole, bootFullSchema, probe } from './helpers/pglite-tenant'

/**
 * THE TWO DOORS INTO `leads`, AND EVERY REFUSAL PROVED SEPARATELY.
 *
 * ── WHY "SEPARATELY" IS THE WHOLE POINT ──────────────────────────────────────
 * A door can fail in more than one way, and a suite that proves one of them
 * leaves the others untested while reading as complete. `lead_submit` refuses an
 * unknown slug AND a submission with no way to reply to it; `lead_from_inbox`
 * refuses a thread that does not exist AND a thread that belongs to somebody
 * else. Those are four refusals, not two, and the second of each pair is the one
 * that matters — it is the one a caller reaches on purpose.
 *
 * ── AND EVERY REFUSAL IS CHECKED AGAINST THE TABLE, NOT THE RETURN VALUE ─────
 * `{ok: false}` is what the function SAYS. What matters is whether a row landed.
 * Each refusal below counts the rows afterwards.
 *
 * ── WHAT THIS PROVES AND WHAT `rls.test.ts` PROVES ───────────────────────────
 * This runs against a real Postgres with the policies applied, in process, with
 * no credentials, on every gate run — `set local role` drops the superuser bit
 * and the policies bite. `rls.test.ts` asks the same questions of the LIVE
 * database through PostgREST with a minted member token, which is the only thing
 * that can speak for production, and it is skipped without a non-production
 * target. Both exist; only this one executes today.
 */

let db: PGlite

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'user_leads_a'
const USER_B = 'user_leads_b'
const SITE_A = '33333333-3333-4333-8333-333333333333'
const SITE_B = '44444444-4444-4444-8444-444444444444'
let threadA = ''

async function leadCount(workspaceId?: string): Promise<number> {
  const sql = workspaceId
    ? `select count(*)::int as n from leads where workspace_id = $1`
    : `select count(*)::int as n from leads`
  const rows = (await db.query<{ n: number }>(sql, workspaceId ? [workspaceId] : [])).rows
  return rows[0]!.n
}

/**
 * Call an RPC with a chosen member's JWT claims in force, in AUTOCOMMIT.
 *
 * ── WHY NOT `asMember` ───────────────────────────────────────────────────────
 * `asMember` opens a transaction and ROLLS IT BACK, which is exactly right for
 * reading under a policy and exactly wrong here, twice over. A promotion that
 * really inserted would be undone, so the idempotency check would never see the
 * first row — and, far worse, a REFUSAL that wrongly inserted would be rolled
 * back too, so "the table did not grow" would be true no matter what the
 * function did. The count is the assertion; it has to be measured against a
 * committed state.
 *
 * So the claims are set at SESSION level and the function is called on its own.
 * The role is not dropped, which is correct rather than a shortcut: these are
 * `SECURITY DEFINER` functions and run as the owner whatever the caller is, so
 * the caller's role decides nothing inside them. What the caller's role DOES
 * decide is whether they may call at all, and that is proved separately by the
 * grant assertions, which do drop the role.
 */
async function callAs(
  userId: string | null,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(userId === null ? {} : { sub: userId, role: 'authenticated' }),
  ])
  try {
    const result = await db.query<{ out: Record<string, unknown> }>(sql, params)
    return result.rows[0]!.out
  } finally {
    await db.query(`select set_config('request.jwt.claims', '', false)`)
  }
}

beforeAll(async () => {
  db = await bootFullSchema()
  await db.query(
    `insert into workspaces (id, name, slug, created_by) values ($1,'A','leads-a',$3), ($2,'B','leads-b',$4)`,
    [WS_A, WS_B, USER_A, USER_B],
  )
  await db.query(
    `insert into workspace_members (workspace_id, user_id, role) values ($1,$3,'owner'), ($2,$4,'owner')`,
    [WS_A, WS_B, USER_A, USER_B],
  )
  await db.query(
    `insert into sites (id, workspace_id, name, slug, created_by)
     values ($1,$3,'Site A','corner-bakery',$5), ($2,$4,'Site B','other-shop',$6)`,
    [SITE_A, SITE_B, WS_A, WS_B, USER_A, USER_B],
  )
  const thread = await db.query<{ id: string }>(
    `insert into inbox_threads (workspace_id, channel, kind, platform_thread_id, author_name, body)
     values ($1, 'instagram', 'dm', 'zern-1', 'Priya', 'Do you do birthday cakes?')
     returning id`,
    [WS_A],
  )
  threadA = thread.rows[0]!.id
}, 120_000)

describe('door 1 · lead_submit', () => {
  it('stores an enquiry against the workspace the SLUG belongs to', async () => {
    const before = await leadCount(WS_A)
    const out = (
      await db.query<{ out: Record<string, unknown> }>(
        `select public.lead_submit('corner-bakery','Priya','priya@example.com',null,'Cakes?','{}'::jsonb,'https://x/y') as out`,
      )
    ).rows[0]!.out
    expect(out).toMatchObject({ ok: true })
    expect(await leadCount(WS_A)).toBe(before + 1)

    const row = (
      await db.query<{ workspace_id: string; site_id: string; source: Record<string, unknown> }>(
        `select workspace_id, site_id, source from leads where email = 'priya@example.com'`,
      )
    ).rows[0]!
    // The tenant was RESOLVED, not supplied. There is no argument that could
    // have aimed this row anywhere else.
    expect(row.workspace_id).toBe(WS_A)
    expect(row.site_id).toBe(SITE_A)
    expect(row.source).toMatchObject({ kind: 'site_form', site_slug: 'corner-bakery' })
  })

  it('REFUSAL 1 · an unknown slug stores nothing', async () => {
    const before = await leadCount()
    const out = (
      await db.query<{ out: Record<string, unknown> }>(
        `select public.lead_submit('no-such-shop','X','x@example.com',null,null,'{}'::jsonb,null) as out`,
      )
    ).rows[0]!.out
    expect(out).toMatchObject({ ok: false, reason: 'no_such_site' })
    expect(await leadCount()).toBe(before)
  })

  it('REFUSAL 2 · no email and no phone stores nothing', async () => {
    // A different refusal from the one above, and the one a real visitor hits.
    const before = await leadCount()
    const out = (
      await db.query<{ out: Record<string, unknown> }>(
        `select public.lead_submit('corner-bakery','X','  ','  ','hello','{}'::jsonb,null) as out`,
      )
    ).rows[0]!.out
    expect(out).toMatchObject({ ok: false, reason: 'no_contact' })
    expect(await leadCount()).toBe(before)
  })

  it('a slug can only ever aim at its OWN workspace', async () => {
    const beforeA = await leadCount(WS_A)
    await db.query(
      `select public.lead_submit('other-shop','Z',null,'+91 90000 00000',null,'{}'::jsonb,null)`,
    )
    // Landed in B. A cannot be reached by naming B, and there is no third thing
    // to name.
    expect(await leadCount(WS_A)).toBe(beforeA)
    const row = (
      await db.query<{ workspace_id: string }>(
        `select workspace_id from leads where phone = '+91 90000 00000'`,
      )
    ).rows[0]!
    expect(row.workspace_id).toBe(WS_B)
  })

  it('REFUSAL 3 · neither anon nor a signed-in member may call it at all', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      const result = await asRole(db, role, { sub: USER_A, role }, (tx) =>
        probe(tx, `select public.lead_submit('corner-bakery','X','x@e.com',null,null,'{}'::jsonb,null)`),
      )
      // service_role only. A signed-in customer posting as if a stranger had
      // left an enquiry is lead forgery with a friendly face.
      expect(result, `${role} must be refused`).toHaveProperty('denied')
    }
  })
})

describe('door 2 · lead_from_inbox, on a stored thread', () => {
  it('promotes a thread the member owns, and copies nothing it should not', async () => {
    const out = await callAs(USER_A, `select public.lead_from_inbox($1) as out`, [threadA])
    expect(out).toMatchObject({ ok: true, existing: false })

    const row = (
      await db.query<{ email: string | null; phone: string | null; name: string | null }>(
        `select email, phone, name from leads where source->>'thread_id' = $1`,
        [threadA],
      )
    ).rows[0]!
    expect(row.name).toBe('Priya')
    // A handle is not an address and not a number. Both stay null rather than
    // being filled with something that is not one.
    expect(row.email).toBeNull()
    expect(row.phone).toBeNull()
  })

  it('is idempotent — pressing twice chases one person once', async () => {
    const before = await leadCount(WS_A)
    const out = await callAs(USER_A, `select public.lead_from_inbox($1) as out`, [threadA])
    expect(out).toMatchObject({ ok: true, existing: true })
    expect(await leadCount(WS_A)).toBe(before)
  })

  it('REFUSAL 1 · a thread that does not exist stores nothing', async () => {
    const before = await leadCount()
    const out = await callAs(USER_A, `select public.lead_from_inbox($1) as out`, [
      '99999999-9999-4999-8999-999999999999',
    ])
    expect(out).toMatchObject({ ok: false, reason: 'no_such_thread' })
    expect(await leadCount()).toBe(before)
  })

  it('REFUSAL 2 · another tenant’s thread stores nothing', async () => {
    // The refusal that matters: the id is real, the caller is real, and the
    // caller is not a member. Definer rights have already bypassed the policy
    // that would have refused this, so the function has to.
    const before = await leadCount()
    const out = await callAs(USER_B, `select public.lead_from_inbox($1) as out`, [threadA])
    expect(out).toMatchObject({ ok: false, reason: 'not_a_member' })
    expect(await leadCount()).toBe(before)
  })

  it('REFUSAL 3 · anon may not call it', async () => {
    const result = await asRole(db, 'anon', { role: 'anon' }, (tx) =>
      probe(tx, `select public.lead_from_inbox($1)`, [threadA]),
    )
    expect(result).toHaveProperty('denied')
  })
})

describe('door 2b · lead_from_conversation, on the live inbox', () => {
  it('promotes a conversation and records that the details came from the caller', async () => {
    const out = await callAs(
      USER_A,
      `select public.lead_from_conversation($1,'zc-77','instagram','Ravi','@ravi','Do you deliver?','https://ig/1') as out`,
      [WS_A],
    )
    expect(out).toMatchObject({ ok: true, existing: false })

    const row = (
      await db.query<{ workspace_id: string; source: Record<string, unknown> }>(
        `select workspace_id, source from leads where source->>'conversation_ref' = 'zc-77'`,
      )
    ).rows[0]!
    expect(row.workspace_id).toBe(WS_A)
    // The honest marker. A reader six months from now must be able to tell a
    // lead Sahoda observed from one a person typed in.
    expect(row.source).toMatchObject({ kind: 'inbox', details: 'from_client' })
  })

  it('is idempotent on the conversation', async () => {
    const before = await leadCount(WS_A)
    const out = await callAs(
      USER_A,
      `select public.lead_from_conversation($1,'zc-77','instagram','Ravi','@ravi',null,null) as out`,
      [WS_A],
    )
    expect(out).toMatchObject({ ok: true, existing: true })
    expect(await leadCount(WS_A)).toBe(before)
  })

  it('REFUSAL 1 · an empty conversation reference stores nothing', async () => {
    const before = await leadCount()
    const out = await callAs(
      USER_A,
      `select public.lead_from_conversation($1,'   ','instagram',null,null,null,null) as out`,
      [WS_A],
    )
    expect(out).toMatchObject({ ok: false, reason: 'no_conversation' })
    expect(await leadCount()).toBe(before)
  })

  it('REFUSAL 2 · a workspace the caller is not a member of stores nothing', async () => {
    // This one takes a workspace id from the caller, so this is THE assertion
    // that makes that safe. Member A names workspace B and gets nothing.
    const before = await leadCount(WS_B)
    const out = await callAs(
      USER_A,
      `select public.lead_from_conversation($1,'zc-cross','instagram','X',null,null,null) as out`,
      [WS_B],
    )
    expect(out).toMatchObject({ ok: false, reason: 'not_a_member' })
    expect(await leadCount(WS_B)).toBe(before)
  })

  it('REFUSAL 3 · anon may not call it', async () => {
    const result = await asRole(db, 'anon', { role: 'anon' }, (tx) =>
      probe(tx, `select public.lead_from_conversation($1,'zc-1','x',null,null,null,null)`, [WS_A]),
    )
    expect(result).toHaveProperty('denied')
  })
})

describe('the doors did not open anything else', () => {
  it('a member still cannot INSERT a lead directly, even in their own tenant', async () => {
    // The assertion `rls.test.ts` has pinned since 2026-07-18. If it stops
    // holding, this migration chose the wrong shape: the doors are functions
    // precisely so this stays true.
    const before = await leadCount(WS_A)
    const result = await asMember(db, USER_A, (tx) =>
      probe(tx, `insert into leads (workspace_id, email) values ($1,'forged@example.com')`, [WS_A]),
    )
    expect(result).toHaveProperty('denied')
    expect(await leadCount(WS_A)).toBe(before)
  })

  it('a member still cannot DELETE a lead, even in their own tenant', async () => {
    const before = await leadCount(WS_A)
    await asMember(db, USER_A, (tx) => probe(tx, `delete from leads where workspace_id = $1`, [WS_A]))
    // No delete policy means no visible row to delete — a silent no-op, not an
    // error. The count is the only thing that can tell the difference.
    expect(await leadCount(WS_A)).toBe(before)
  })

  it('a member can still move their own lead along the pipeline', async () => {
    // The positive control. Without it every refusal above would pass on a
    // table nobody can touch at all.
    const id = (
      await db.query<{ id: string }>(`select id from leads where workspace_id = $1 limit 1`, [WS_A])
    ).rows[0]!.id
    const result = await asMember(db, USER_A, (tx) =>
      probe<{ status: string }>(
        tx,
        `update leads set status = 'contacted' where id = $1 returning status`,
        [id],
      ),
    )
    expect(result).toEqual({ rows: [{ status: 'contacted' }] })
  })

  it('member B cannot move member A’s lead', async () => {
    const id = (
      await db.query<{ id: string }>(`select id from leads where workspace_id = $1 limit 1`, [WS_A])
    ).rows[0]!.id
    const result = await asMember(db, USER_B, (tx) =>
      probe<{ id: string }>(tx, `update leads set status = 'won' where id = $1 returning id`, [id]),
    )
    // Invisible rather than refused: the policy hides the row, so the update
    // matches nothing.
    expect(result).toEqual({ rows: [] })
  })
})
