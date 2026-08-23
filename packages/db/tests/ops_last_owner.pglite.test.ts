import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * THE LAST-OWNER GUARD, DRIVEN TO ITS BOUNDARY.
 *
 * `ops_admin_revoke` and `ops_admin_set_role` both refuse when
 * `app.ops_active_owner_count()` reports 1 or fewer, and the comment above them
 * states the stake plainly: "A console with no owner has no way back in short of
 * SQL." The count used to read `status = 'active' and role = 'owner'` and stop
 * there — while `app.is_ops_admin()` authorises on `user_id = auth.jwt()->>'sub'`,
 * which NULL never satisfies.
 *
 * ── WHY THE MARGIN IS THE WHOLE PROBLEM ─────────────────────────────────────
 * Production held 5 active owners and 4 that could sign in, so nothing was
 * visibly wrong and nothing would have been until the day it mattered. A test
 * written against that shape proves nothing: with four spare owners the guard
 * never has to make a decision. So every case below is set AT the boundary — one
 * linked owner and one unlinked one — because that is the only arrangement in
 * which the two counts disagree about the answer.
 *
 * These run against the real migrations on PGlite, as SUPERUSER: this is about
 * the guard's ARITHMETIC, not about RLS, and the RPCs are `security definer`
 * anyway. `app.ops_owner()` is stubbed per test to name the caller, which is the
 * only thing standing between the assertion and Clerk.
 */

const OWNER_LINKED = '00000000-0000-4000-8000-000000000001'
const OWNER_UNLINKED = '00000000-0000-4000-8000-000000000002'
const PLAIN_ADMIN = '00000000-0000-4000-8000-000000000003'

let db: PGlite

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

afterAll(async () => {
  await db?.close()
})

/** One linked owner, one unlinked owner, one admin. The boundary, exactly. */
async function seatsAtTheBoundary(): Promise<void> {
  await db.exec(`delete from ops_admins;`)
  await db.exec(`
    insert into ops_admins (id, user_id, email, role, status) values
      ('${OWNER_LINKED}',   'user_real',  'real@sahodalabs.com',    'owner', 'active'),
      ('${OWNER_UNLINKED}', null,         'invited@sahodalabs.com', 'owner', 'active'),
      ('${PLAIN_ADMIN}',    'user_admin', 'admin@sahodalabs.com',   'admin', 'active');
    create or replace function app.ops_owner() returns text
      language sql stable as $$ select 'real@sahodalabs.com'::text $$;
  `)
}

async function ownerCount(): Promise<number> {
  const res = await db.query<{ n: number }>(`select app.ops_active_owner_count() as n`)
  return res.rows[0]!.n
}

describe('app.ops_active_owner_count()', () => {
  it('counts only owners who can actually sign in', async () => {
    await seatsAtTheBoundary()
    // Two rows are `active` owners. One of them is an owner to nobody.
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from ops_admins where status='active' and role='owner'`,
    )
    expect(rows.rows[0]!.n).toBe(2)
    expect(await ownerCount()).toBe(1)
  })

  it('an unlinked seat cannot answer is_ops_admin, which is why it must not be counted', async () => {
    await seatsAtTheBoundary()
    // The authorisation predicate itself, applied to the unlinked seat's identity.
    const res = await db.query<{ granted: boolean }>(`
      select exists (
        select 1 from ops_admins where user_id = null and status = 'active'
      ) as granted`)
    expect(res.rows[0]!.granted).toBe(false)
  })
})

describe('the guard refuses at the boundary', () => {
  it('refuses to revoke the last owner who can sign in', async () => {
    await seatsAtTheBoundary()
    await expect(db.exec(`select public.ops_admin_revoke('${OWNER_LINKED}');`)).rejects.toThrow(
      /OPS_ADMIN_LAST_OWNER/,
    )
    const still = await db.query<{ status: string }>(
      `select status from ops_admins where id = '${OWNER_LINKED}'`,
    )
    expect(still.rows[0]!.status).toBe('active')
  })

  it('refuses to demote the last owner who can sign in', async () => {
    await seatsAtTheBoundary()
    await expect(
      db.exec(`select public.ops_admin_set_role('${OWNER_LINKED}', 'viewer');`),
    ).rejects.toThrow(/OPS_ADMIN_LAST_OWNER/)
  })

  it('still allows revoking an owner when a SECOND linked owner exists', async () => {
    await seatsAtTheBoundary()
    await db.exec(`
      insert into ops_admins (user_id, email, role, status)
      values ('user_second', 'second@sahodalabs.com', 'owner', 'active');`)
    expect(await ownerCount()).toBe(2)
    await db.exec(`select public.ops_admin_revoke('${OWNER_LINKED}');`)
    const after = await db.query<{ status: string }>(
      `select status from ops_admins where id = '${OWNER_LINKED}'`,
    )
    expect(after.rows[0]!.status).toBe('revoked')
    // And now the remaining linked owner is protected in turn.
    expect(await ownerCount()).toBe(1)
  })

  it('demoting the UNLINKED owner is allowed — it was never holding the guard open', async () => {
    await seatsAtTheBoundary()
    // The sibling of the case below, and it walked through a mutation run without
    // it: `ops_admin_set_role` has its own copy of the guard, and covering only
    // `ops_admin_revoke` left that copy free to refuse or permit anything.
    await db.exec(`select public.ops_admin_set_role('${OWNER_UNLINKED}', 'viewer');`)
    const after = await db.query<{ role: string }>(
      `select role from ops_admins where id = '${OWNER_UNLINKED}'`,
    )
    expect(after.rows[0]!.role).toBe('viewer')
    expect(await ownerCount()).toBe(1)
  })

  it('revoking the UNLINKED owner is allowed and does not strand the console', async () => {
    await seatsAtTheBoundary()
    // It is not the last owner — it was never an owner — so nothing should refuse.
    await db.exec(`select public.ops_admin_revoke('${OWNER_UNLINKED}');`)
    expect(await ownerCount()).toBe(1)
  })
})
