import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * AN AUDIT ROW MUST NAME SOMETHING.
 *
 * `ops_application_link_user` runs on every Clerk `user.created`. It wrote an
 * audit row unconditionally — including when it linked no beta application and
 * no admin seat, which is what happens for almost every sign-up, because almost
 * every sign-up is an ordinary customer.
 *
 * MEASURED IN PRODUCTION 2026-08-23: 12,196 of 12,839 rows in `ops_audit_log`
 * were that one shape, all carrying `target_id = ''`. Ninety-five per cent of the
 * audit trail naming nothing, and the rows that DO matter — `admin.role`,
 * `admin.revoke`, `credit.*` — buried under it. That is the ordinary shape of
 * anti-forensics: you do not delete the entry, you make the log unusable.
 *
 * ── THE HALF THAT MUST NOT BREAK ────────────────────────────────────────────
 * A fix that simply stopped writing would be worse than the flood: the row is
 * the ONLY record that a Clerk account was bound to an admin seat, and binding a
 * seat is the single most security-relevant thing this webhook does. So every
 * case below comes in a pair — the no-op writes nothing, the real link still
 * writes, and the real link still names what it linked.
 */

let db: PGlite

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

afterAll(async () => {
  await db?.close()
})

/**
 * ops_audit_log CANNOT BE TRUNCATED — a trigger refuses DELETE outright
 * ("append-only: DELETE on ops_audit_log is not permitted"), which this test
 * discovered by trying. So each case measures a DELTA rather than resetting, and
 * that refusal is also why the 12,196 rows already in production stay: an audit
 * table that can be emptied is not an audit table.
 */
let mark = 0

beforeEach(async () => {
  await db.exec(`delete from ops_admins; delete from ops_beta_applications;`)
  mark = await auditCount()
})

async function auditCount(): Promise<number> {
  const res = await db.query<{ n: number }>(
    `select count(*)::int as n from ops_audit_log where action = 'user.created'`,
  )
  return res.rows[0]!.n
}

async function link(email: string, clerkId: string): Promise<void> {
  await db.query(`select public.ops_application_link_user($1, $2)`, [email, clerkId])
}

/** Only the rows this test wrote — everything before `mark` belongs to another case. */
async function auditRows(): Promise<Array<{ target_id: string; meta: unknown }>> {
  const res = await db.query<{ target_id: string; meta: unknown }>(
    `select target_id, meta from ops_audit_log where action = 'user.created'
      order by created_at offset $1`,
    [mark],
  )
  return res.rows
}

describe('a sign-up that links nothing', () => {
  it('writes no audit row at all', async () => {
    await link('a-customer@example.com', 'user_ordinary')
    expect(await auditRows()).toEqual([])
  })

  it('writes none however many times it fires — the flood, reproduced', async () => {
    // The same webhook delivery replayed. Before the fix this produced one row
    // per delivery, forever, each naming the empty string.
    for (let i = 0; i < 50; i += 1) await link('a-customer@example.com', 'user_ordinary')
    expect(await auditRows()).toHaveLength(0)
  })

  it('still returns the shape the caller reads', async () => {
    const res = await db.query<{
      ops_application_link_user: { application: null; admin_seat: null }
    }>(`select public.ops_application_link_user($1, $2)`, [
      'a-customer@example.com',
      'user_ordinary',
    ])
    expect(res.rows[0]!.ops_application_link_user).toEqual({ application: null, admin_seat: null })
  })
})

describe('a sign-up that links something', () => {
  it('STILL records the admin seat it bound — the half that must not break', async () => {
    await db.exec(`
      insert into ops_admins (user_id, email, role, status)
      values (null, 'invited@sahodalabs.com', 'owner', 'active');`)

    await link('invited@sahodalabs.com', 'user_new_owner')

    const rows = await auditRows()
    expect(rows).toHaveLength(1)
    // It names the seat, rather than the empty string the old row carried.
    expect(rows[0]!.target_id).not.toBe('')
    expect(rows[0]!.meta).toMatchObject({ linked_admin_seat: true })

    const seat = await db.query<{ user_id: string }>(
      `select user_id from ops_admins where email = 'invited@sahodalabs.com'`,
    )
    expect(seat.rows[0]!.user_id).toBe('user_new_owner')
  })

  it('STILL records a beta application it marked joined', async () => {
    await db.exec(`
      insert into ops_beta_applications (name, business_name, email, phone, status)
      values ('A', 'B', 'applicant@example.com', '+910000000000', 'invited');`)

    await link('applicant@example.com', 'user_applicant')

    const rows = await auditRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.target_id).not.toBe('')
    expect(rows[0]!.meta).toMatchObject({ linked_application: true })
  })

  it('records once, not once per replay, because the second call links nothing', async () => {
    await db.exec(`
      insert into ops_admins (user_id, email, role, status)
      values (null, 'invited@sahodalabs.com', 'owner', 'active');`)

    await link('invited@sahodalabs.com', 'user_new_owner')
    await link('invited@sahodalabs.com', 'user_new_owner')
    await link('invited@sahodalabs.com', 'user_new_owner')

    // The seat is no longer `user_id is null`, so replays match nothing — and now
    // that a no-op writes nothing, idempotency falls out of the same change.
    expect(await auditRows()).toHaveLength(1)
  })
})
