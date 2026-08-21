import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootSchema } from './helpers/pglite-schema'

/**
 * `20260819213000_billing_lifecycle.sql`, APPLIED.
 *
 * ── WHAT THIS CATCHES THAT READING THE FILE DOES NOT ─────────────────────────
 * A migration can be entirely sensible and still fail on apply: a foreign key with no
 * matching unique constraint, a `grant` whose signature is one argument off, a CHECK that
 * contradicts its own default. Every one of those is invisible in review and instantly
 * fatal in the founder's terminal. This file applies to PRODUCTION by hand, so the least
 * this run can do is prove it runs.
 *
 * ── AND THE PART THAT IS NOT MERELY STRUCTURAL ───────────────────────────────
 * `app.issue_invoice` claims a GAPLESS serial, which is a statutory requirement rather
 * than a nicety. That claim is only worth anything if a rolled-back issue is shown NOT to
 * burn a number — which is exactly what a Postgres sequence would have done, and why one
 * is not used. It is measured below.
 */

/**
 * The FOUNDATION only, not every file in the directory. Booting brand, content and
 * connections underneath a billing test drags in thirty seconds of unrelated DDL and
 * makes an unrelated migration's breakage look like this one's — the same reasoning
 * `CONTENT_FOUNDATION` in the helper is built on.
 */
const SCHEMA = [
  '20260718000001_helpers.sql',
  '20260718000002_identity.sql',
  '20260718000006_billing_ledger.sql',
  '20260718193834_widen_billing_provider.sql',
  '20260819213000_billing_lifecycle.sql',
] as const

/** A checksum-valid synthetic GSTIN in Maharashtra (27). Belongs to nobody. */
const SUPPLIER_GSTIN = '27ABCDE1234F1Z0'
const CUSTOMER_GSTIN_KA = '29ABCDE1234F1ZW'

let db: PGlite
let ws: string

beforeAll(async () => {
  db = await bootSchema([...SCHEMA])
  await db.exec(`
    insert into plans (id, name, monthly_credits, price_inr, price_usd, limits) values
      ('free','Free',100,0,0,'{}'::jsonb),
      ('starter','Starter',1500,499,12,'{}'::jsonb),
      ('growth','Growth',5000,1499,29,'{}'::jsonb),
      ('agency','Agency',15000,3999,79,'{}'::jsonb)
    on conflict (id) do nothing;
  `)
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  const r = await db.query<{ id: string }>(
    `insert into workspaces (name, slug, created_by)
     values ('bl', 'bl-' || replace(gen_random_uuid()::text, '-', ''), 'user_test')
     returning id`,
  )
  ws = r.rows[0]!.id
})

afterEach(async () => {
  await db.query('delete from workspaces where id = $1', [ws])
})

/** Issue a tax invoice through the only write path, with sensible intra-state defaults. */
async function issue(
  over: Partial<Record<string, unknown>> = {},
): Promise<
  { ok: true; serial: string; seq: number; replayed: boolean } | { ok: false; message: string }
> {
  const args = {
    documentType: 'tax_invoice',
    financialYear: '26-27',
    prefix: 'SL',
    grossPaise: 49_900,
    taxablePaise: 42_288,
    cgstPaise: 3_806,
    sgstPaise: 3_806,
    igstPaise: 0,
    treatment: 'intra_state',
    placeOfSupply: '27',
    referencesInvoiceId: null as string | null,
    reason: null as string | null,
    shortfall: 0,
    providerPaymentId: null as string | null,
    ...over,
  }
  try {
    const r = await db.query<{
      res: { invoice: { serial: string; serial_seq: number }; replayed: boolean }
    }>(
      `select app.issue_invoice(
         $1::uuid, $2, $3, $4, '998434',
         'Sahoda Labs Private Limited', $5, '27',
         'Customer Pvt Ltd', $6, $7, null,
         $8, $9, 18,
         $10::bigint, $11::bigint, $12::bigint, $13::bigint, $14::bigint,
         false, false,
         '2026-08', 'starter', $15::uuid, $16, $17::int,
         'cashfree', 'sah_order_1', $18, null, null
       ) as res`,
      [
        ws,
        args.documentType,
        args.financialYear,
        args.prefix,
        SUPPLIER_GSTIN,
        args.treatment === 'inter_state' ? CUSTOMER_GSTIN_KA : SUPPLIER_GSTIN,
        args.treatment === 'inter_state' ? '29' : '27',
        args.placeOfSupply,
        args.treatment,
        args.grossPaise,
        args.taxablePaise,
        args.cgstPaise,
        args.sgstPaise,
        args.igstPaise,
        args.referencesInvoiceId,
        args.reason,
        args.shortfall,
        args.providerPaymentId,
      ],
    )
    const res = r.rows[0]!.res
    return {
      ok: true,
      serial: res.invoice.serial,
      seq: res.invoice.serial_seq,
      replayed: res.replayed,
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

describe('the migration applies', () => {
  it('creates every object it claims to', async () => {
    const tables = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    const live = new Set(tables.rows.map((r) => r.tablename))
    expect(['billing_profiles', 'invoices', 'invoice_serials'].filter((t) => !live.has(t))).toEqual(
      [],
    )

    const fn = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'issue_invoice'`,
    )
    expect(fn.rows[0]!.n).toBe(1)
  })

  it('adds the dunning columns to the subscription that already existed', async () => {
    const cols = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_name = 'subscriptions'`,
    )
    const byName = new Map(cols.rows.map((r) => [r.column_name, r.is_nullable]))
    for (const c of [
      'grace_ends_at',
      'dunning_attempts',
      'last_failure_at',
      'last_failure_code',
      'pending_plan_id',
      'pending_plan_effective_at',
    ]) {
      expect(byName.has(c)).toBe(true)
    }
    // Every added column is nullable or defaulted, so no existing row can violate it.
    expect(byName.get('grace_ends_at')).toBe('YES')
    expect(byName.get('dunning_attempts')).toBe('NO') // NOT NULL, but DEFAULT 0
  })

  it('switches row-level security on for both tenant tables', async () => {
    // Structural fact only. PGlite connects as superuser, so no policy is EXERCISED here.
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('billing_profiles', 'invoices', 'invoice_serials')`,
    )
    expect(r.rows.every((row) => row.relrowsecurity)).toBe(true)
  })

  it('refuses a half-written pending downgrade', async () => {
    await db.query(
      `insert into subscriptions (workspace_id, plan_id, status) values ($1,'growth','active')`,
      [ws],
    )
    // A plan with no date would never be applied; a date with no plan would apply nothing.
    await expect(
      db.query(`update subscriptions set pending_plan_id = 'starter' where workspace_id = $1`, [
        ws,
      ]),
    ).rejects.toThrow(/pending_plan_paired/)
  })
})

describe('the billing profile cannot hold a contradiction', () => {
  const insertProfile = (cols: string, values: unknown[]) =>
    db.query(
      `insert into billing_profiles (workspace_id, ${cols}) values ($1, ${values
        .map((_, i) => `$${i + 2}`)
        .join(', ')})`,
      [ws, ...values],
    )

  it('accepts a registered customer whose state matches their GSTIN', async () => {
    await insertProfile('tax_kind, legal_name, gstin, state_code', [
      'registered',
      'Customer Pvt Ltd',
      SUPPLIER_GSTIN,
      '27',
    ])
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from billing_profiles where workspace_id = $1`,
      [ws],
    )
    expect(r.rows[0]!.n).toBe(1)
  })

  it('refuses a registered customer whose state disagrees with their GSTIN', async () => {
    // The state and the GSTIN are two records of one fact. If they can disagree, the
    // invoice will eventually be filed against the wrong one.
    await expect(
      insertProfile('tax_kind, legal_name, gstin, state_code', [
        'registered',
        'Customer Pvt Ltd',
        SUPPLIER_GSTIN, // 27…
        '29',
      ]),
    ).rejects.toThrow(/registered_shape/)
  })

  it('refuses "registered with no GSTIN" — the state that produces a wrong invoice', async () => {
    await expect(
      insertProfile('tax_kind, legal_name', ['registered', 'Customer Pvt Ltd']),
    ).rejects.toThrow(/registered_shape/)
  })

  it('refuses an overseas customer carrying an Indian state', async () => {
    await expect(
      insertProfile('tax_kind, legal_name, state_code, country_code', [
        'overseas',
        'Acme Inc',
        '27',
        'US',
      ]),
    ).rejects.toThrow(/overseas_shape/)
  })
})

/**
 * `invoice_serials` is keyed on (financial year, document type) and is GLOBAL — deliberately,
 * because a statutory series belongs to the business and not to a tenant. Deleting a
 * workspace therefore does not rewind it, so nothing below may assert an absolute serial:
 * that would pass or fail on the order vitest happened to pick. Every assertion here is
 * RELATIVE to a number read immediately before the act being measured.
 */
describe('the invoice document', () => {
  it('numbers consecutively, one at a time', async () => {
    const a = await issue()
    const b = await issue()
    const c = await issue()
    expect([a, b, c].every((r) => r.ok)).toBe(true)
    if (!a.ok || !b.ok || !c.ok) return
    expect(b.seq).toBe(a.seq + 1)
    expect(c.seq).toBe(b.seq + 1)
    expect(c.serial).toBe(`SL/26-27/${String(c.seq).padStart(6, '0')}`)
    // 15 characters, inside the statutory 16-character cap.
    expect(c.serial.length).toBeLessThanOrEqual(16)
  })

  /**
   * THE REASON A SEQUENCE IS NOT USED.
   *
   * `nextval` is non-transactional by design, so a rolled-back insert burns a number and
   * leaves a gap in a sequence the law requires to be consecutive. The counter row rolls
   * back with the insert. Measured, because "gapless" is otherwise just a comment.
   */
  it('a rolled-back issue burns no number', async () => {
    const before = await issue()
    expect(before.ok).toBe(true)
    if (!before.ok) return

    await db.exec('begin')
    await db
      .query(
        `select app.issue_invoice(
           $1::uuid, 'tax_invoice', '26-27', 'SL', '998434',
           'Sahoda Labs Private Limited', $2, '27',
           'Customer Pvt Ltd', $2, '27', null,
           '27', 'intra_state', 18,
           49900::bigint, 42288::bigint, 3806::bigint, 3806::bigint, 0::bigint,
           false, false, '2026-08', 'starter', null, null, 0,
           'cashfree', 'sah_rollback', null, null, null
         ) as res`,
        [ws, SUPPLIER_GSTIN],
      )
      .catch(() => undefined)
    await db.exec('rollback')

    const after = await issue()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    // Exactly one apart. A burnt number would show up here as a gap of two.
    expect(after.seq).toBe(before.seq + 1)
  })

  it('keeps a separate series for credit notes, independent of the invoice numbering', async () => {
    const invoice = await issue()
    expect(invoice.ok).toBe(true)
    if (!invoice.ok) return
    const invoiceRow = await db.query<{ id: string }>(
      `select id from invoices where workspace_id = $1 and serial = $2`,
      [ws, invoice.serial],
    )

    const note = await issue({
      documentType: 'credit_note',
      prefix: 'SLC',
      referencesInvoiceId: invoiceRow.rows[0]!.id,
      reason: 'chargeback',
      shortfall: 1300,
    })
    expect(note.ok).toBe(true)
    if (!note.ok) return
    expect(note.serial).toBe(`SLC/26-27/${String(note.seq).padStart(6, '0')}`)
    // Its own counter: the credit-note series has issued far fewer documents than the
    // invoice series, so sharing one counter would be immediately visible here.
    expect(note.seq).toBeLessThan(invoice.seq)
    // 16 characters exactly — the statutory ceiling, which is why the prefix is capped at 4.
    expect(note.serial.length).toBeLessThanOrEqual(16)

    const second = await issue({
      documentType: 'credit_note',
      prefix: 'SLC',
      referencesInvoiceId: invoiceRow.rows[0]!.id,
      reason: 'refund',
    })
    expect(second.ok && second.seq).toBe(note.seq + 1)
  })

  it('replays one payment into one document rather than burning a second number', async () => {
    // A webhook redelivery that minted a second invoice would leave a real gap in a
    // statutory sequence, which is the failure this idempotency exists to stop.
    const first = await issue({ providerPaymentId: 'pay_abc' })
    const second = await issue({ providerPaymentId: 'pay_abc' })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.replayed).toBe(true)
    expect(second.serial).toBe(first.serial)
  })

  it('cannot be edited or deleted once issued', async () => {
    await issue()
    // A tax invoice is not amendable. A correction is a credit note — the same
    // compensating-entry discipline the credit ledger uses.
    await expect(
      db.query(`update invoices set gross_paise = 1 where workspace_id = $1`, [ws]),
    ).rejects.toThrow(/append-only/)
    await expect(db.query(`delete from invoices where workspace_id = $1`, [ws])).rejects.toThrow(
      /append-only/,
    )
  })
})

describe('the invoice arithmetic is a constraint, not a convention', () => {
  it('refuses a document whose lines do not add up to what was charged', async () => {
    const bad = await issue({ taxablePaise: 42_000 }) // 42000 + 3806 + 3806 ≠ 49900
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.message).toMatch(/totals_add_up/)
  })

  it('refuses unequal CGST and SGST halves', async () => {
    const bad = await issue({ cgstPaise: 3_807, sgstPaise: 3_805 })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.message).toMatch(/equal_halves/)
  })

  it('refuses IGST on an intra-state supply, and CGST on an inter-state one', async () => {
    const bothHeads = await issue({ igstPaise: 100, taxablePaise: 42_188 })
    expect(bothHeads.ok).toBe(false)
    if (bothHeads.ok) return
    expect(bothHeads.message).toMatch(/heads_match_treatment/)

    const interWithCgst = await issue({
      treatment: 'inter_state',
      placeOfSupply: '29',
      cgstPaise: 3_806,
      sgstPaise: 3_806,
      igstPaise: 0,
    })
    expect(interWithCgst.ok).toBe(false)
  })

  it('accepts a well-formed inter-state supply', async () => {
    const ok = await issue({
      treatment: 'inter_state',
      placeOfSupply: '29',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 7_612,
    })
    expect(ok.ok).toBe(true)
  })

  it('refuses a credit note that names nothing, and a tax invoice that names something', async () => {
    const orphanNote = await issue({ documentType: 'credit_note', prefix: 'SLC' })
    expect(orphanNote.ok).toBe(false)
    if (orphanNote.ok) return
    expect(orphanNote.message).toMatch(/credit_note_shape/)

    const inv = await db.query<{ id: string }>(
      `select id from invoices where workspace_id = $1 limit 1`,
      [ws],
    )
    const taggedInvoice = await issue({
      referencesInvoiceId: inv.rows[0]?.id ?? null,
      reason: 'refund',
    })
    expect(taggedInvoice.ok).toBe(false)
  })

  it('refuses a shortfall on a tax invoice — only a credit note can carry one', async () => {
    const bad = await issue({ shortfall: 100 })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.message).toMatch(/shortfall_only_on_credit_note/)
  })
})

/**
 * The client-reachable writes.
 *
 * These functions are callable by ANY signed-in user with arbitrary arguments — that is the
 * whole point of a PostgREST-exposed definer function — so the guards inside them are the
 * trust boundary, not a convenience. Each one is therefore exercised in its refusing state
 * as well as its accepting one.
 *
 * PGlite connects as superuser and the helper stubs `auth.jwt()` to read
 * `request.jwt.claims`, exactly as Supabase's does. So identity here is real from the
 * function's point of view: it reads the claim, not an argument.
 */
describe('the client-reachable billing writes', () => {
  const asUser = (sub: string | null) =>
    db.query(`select set_config('request.jwt.claims', $1, false)`, [
      sub === null ? '' : JSON.stringify({ sub }),
    ])

  /** Call an RPC and return the error message instead of throwing. */
  const call = async (
    sql: string,
    params: unknown[],
  ): Promise<{ ok: true; res: Record<string, unknown> } | { ok: false; message: string }> => {
    try {
      const r = await db.query<{ res: Record<string, unknown> }>(sql, params)
      return { ok: true, res: r.rows[0]!.res }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }

  const setPending = (workspaceId: string, planId: string) =>
    call(`select public.set_pending_plan_change($1::uuid, $2) as res`, [workspaceId, planId])

  const clearPending = (workspaceId: string) =>
    call(`select public.clear_pending_plan_change($1::uuid) as res`, [workspaceId])

  const upsertProfile = (workspaceId: string, args: (string | null)[]) =>
    call(`select public.upsert_billing_profile($1::uuid, $2, $3, $4, $5, $6, $7, $8) as res`, [
      workspaceId,
      ...args,
    ])

  /** An owner of `ws`, plus a live Growth subscription for it. */
  const seedOwnerOnGrowth = async (role = 'owner') => {
    await db.query(
      `insert into workspace_members (workspace_id, user_id, role) values ($1, 'user_test', $2)
       on conflict (workspace_id, user_id) do update set role = excluded.role`,
      [ws, role],
    )
    await db.query(
      `insert into subscriptions (workspace_id, plan_id, status, current_period_end)
       values ($1, 'growth', 'active', '2026-09-01T00:00:00Z')`,
      [ws],
    )
    await asUser('user_test')
  }

  describe('app.gstin_is_valid', () => {
    it('accepts a checksum-valid GSTIN and rejects a one-character typo', async () => {
      // The SQL implementation is a deliberate duplicate of parseGstin in @sahoda/shared.
      // This is what pins the two together: if either drifts, one of them accepts a number
      // the other rejects and a wrong tax number reaches a statutory document.
      const r = await db.query<{ good: boolean; typo: boolean; short: boolean; junk: boolean }>(
        `select app.gstin_is_valid($1) as good,
                app.gstin_is_valid('27ABCDE1234F1Z1') as typo,
                app.gstin_is_valid('27ABCDE') as short,
                app.gstin_is_valid(null) as junk`,
        [SUPPLIER_GSTIN],
      )
      expect(r.rows[0]).toEqual({ good: true, typo: false, short: false, junk: false })
    })

    it('agrees with the published sample GSTIN that @sahoda/shared is pinned to', async () => {
      const r = await db.query<{ ok: boolean }>(
        `select app.gstin_is_valid('27AAPFU0939F1ZV') as ok`,
      )
      expect(r.rows[0]!.ok).toBe(true)
    })
  })

  describe('set_pending_plan_change', () => {
    /**
     * THE ESCALATION GUARD, SHOWN TO REFUSE.
     *
     * Giving `subscriptions` a tenant UPDATE policy would have let any member write
     * `plan_id = 'agency'` directly. This function exists so the only writable columns are
     * the pending ones — and a "pending upgrade", applied by the period-end sweeper, would
     * be an upgrade nobody paid for. So it must refuse one.
     */
    it('REFUSES an upgrade — a pending upgrade would be a free one', async () => {
      await seedOwnerOnGrowth()
      const up = await setPending(ws, 'agency')
      expect(up.ok).toBe(false)
      if (up.ok) return
      expect(up.message).toContain('NOT_A_DOWNGRADE')

      // And nothing was written.
      const after = await db.query<{ pending_plan_id: string | null }>(
        `select pending_plan_id from subscriptions where workspace_id = $1`,
        [ws],
      )
      expect(after.rows[0]!.pending_plan_id).toBeNull()
    })

    it('REFUSES a move to the same plan, which is not a downgrade either', async () => {
      await seedOwnerOnGrowth()
      const same = await setPending(ws, 'growth')
      expect(same.ok).toBe(false)
      if (same.ok) return
      expect(same.message).toContain('NOT_A_DOWNGRADE')
    })

    it('REFUSES a non-member, with no existence oracle', async () => {
      await db.query(
        `insert into subscriptions (workspace_id, plan_id, status, current_period_end)
         values ($1, 'growth', 'active', '2026-09-01T00:00:00Z')`,
        [ws],
      )
      await asUser('a_stranger')
      const denied = await setPending(ws, 'starter')
      expect(denied.ok).toBe(false)
      if (denied.ok) return
      expect(denied.message).toContain('NOT_A_MEMBER')
    })

    it('REFUSES an editor — changing what the business pays is an owner decision', async () => {
      await seedOwnerOnGrowth('editor')
      const denied = await setPending(ws, 'starter')
      expect(denied.ok).toBe(false)
      if (denied.ok) return
      expect(denied.message).toContain('FORBIDDEN_ROLE')
    })

    it('REFUSES a signed-out caller', async () => {
      await seedOwnerOnGrowth()
      await asUser(null)
      const denied = await setPending(ws, 'starter')
      expect(denied.ok).toBe(false)
      if (denied.ok) return
      expect(denied.message).toContain('AUTH_REQUIRED')
    })

    it('REFUSES when there is no period boundary to land on', async () => {
      await db.query(
        `insert into workspace_members (workspace_id, user_id, role) values ($1, 'user_test', 'owner')`,
        [ws],
      )
      await db.query(
        `insert into subscriptions (workspace_id, plan_id, status) values ($1, 'growth', 'active')`,
        [ws],
      )
      await asUser('user_test')
      const denied = await setPending(ws, 'starter')
      expect(denied.ok).toBe(false)
      if (denied.ok) return
      // Inventing a date would move a customer's plan on a day nothing else agrees with.
      expect(denied.message).toContain('NO_PERIOD_END')
    })

    it('ACCEPTS a downgrade, and lands it on the period boundary already paid for', async () => {
      await seedOwnerOnGrowth()
      const down = await setPending(ws, 'starter')
      expect(down.ok).toBe(true)
      if (!down.ok) return
      expect(down.res.pending_plan_id).toBe('starter')

      const row = await db.query<{ pending_plan_id: string; pending_plan_effective_at: string }>(
        `select pending_plan_id, pending_plan_effective_at from subscriptions where workspace_id = $1`,
        [ws],
      )
      expect(row.rows[0]!.pending_plan_id).toBe('starter')
      expect(new Date(row.rows[0]!.pending_plan_effective_at).toISOString()).toBe(
        '2026-09-01T00:00:00.000Z',
      )
    })

    it('never touches plan_id itself — the live plan is not writable from here', async () => {
      await seedOwnerOnGrowth()
      await setPending(ws, 'starter')
      const row = await db.query<{ plan_id: string }>(
        `select plan_id from subscriptions where workspace_id = $1`,
        [ws],
      )
      // Still Growth. The customer keeps everything they paid for until the boundary.
      expect(row.rows[0]!.plan_id).toBe('growth')
    })
  })

  describe('clear_pending_plan_change', () => {
    it('clears both columns together, because the CHECK requires them paired', async () => {
      await seedOwnerOnGrowth()
      await setPending(ws, 'starter')
      const cleared = await clearPending(ws)
      expect(cleared.ok && cleared.res.cleared).toBe(true)

      const row = await db.query<{ pending_plan_id: null; pending_plan_effective_at: null }>(
        `select pending_plan_id, pending_plan_effective_at from subscriptions where workspace_id = $1`,
        [ws],
      )
      expect(row.rows[0]).toEqual({ pending_plan_id: null, pending_plan_effective_at: null })
    })

    it('is idempotent — cancelling a cancellation is a no-op, not an error', async () => {
      await seedOwnerOnGrowth()
      const first = await clearPending(ws)
      expect(first.ok).toBe(true)
      expect(first.ok && first.res.cleared).toBe(false)
    })
  })

  describe('upsert_billing_profile', () => {
    const asOwner = async () => {
      await db.query(
        `insert into workspace_members (workspace_id, user_id, role) values ($1, 'user_test', 'owner')`,
        [ws],
      )
      await asUser('user_test')
    }

    it('REFUSES a GSTIN that fails its checksum, even though it is shaped like one', async () => {
      // The application checks this too. That check is not a guard: any signed-in user can
      // call this function directly and skip it entirely.
      await asOwner()
      const bad = await upsertProfile(ws, [
        'registered',
        'Customer Pvt Ltd',
        '27ABCDE1234F1Z1',
        '27',
        null,
        null,
        null,
      ])
      expect(bad.ok).toBe(false)
      if (bad.ok) return
      expect(bad.message).toContain('INVALID_GSTIN')
    })

    it('DERIVES the state from the GSTIN, so a supplied one cannot disagree with it', async () => {
      await asOwner()
      const ok = await upsertProfile(ws, [
        'registered',
        'Customer Pvt Ltd',
        CUSTOMER_GSTIN_KA, // Karnataka, 29
        '27', // deliberately wrong
        null,
        null,
        null,
      ])
      expect(ok.ok).toBe(true)
      const row = await db.query<{ state_code: string; gstin: string }>(
        `select state_code, gstin from billing_profiles where workspace_id = $1`,
        [ws],
      )
      // The number the return is filed under wins.
      expect(row.rows[0]!.state_code).toBe('29')
    })

    it('REFUSES an unregistered customer with no state', async () => {
      await asOwner()
      const bad = await upsertProfile(ws, ['unregistered', 'A Shop', null, null, null, null, null])
      expect(bad.ok).toBe(false)
      if (bad.ok) return
      expect(bad.message).toContain('INVALID_STATE')
    })

    it('REFUSES an overseas customer with no country', async () => {
      await asOwner()
      const bad = await upsertProfile(ws, ['overseas', 'Acme Inc', null, null, null, null, null])
      expect(bad.ok).toBe(false)
      if (bad.ok) return
      expect(bad.message).toContain('INVALID_COUNTRY')
    })

    it('REFUSES a non-owner and a signed-out caller', async () => {
      await db.query(
        `insert into workspace_members (workspace_id, user_id, role) values ($1, 'user_test', 'editor')`,
        [ws],
      )
      await asUser('user_test')
      const editor = await upsertProfile(ws, [
        'unregistered',
        'A Shop',
        null,
        '27',
        null,
        null,
        null,
      ])
      expect(editor.ok).toBe(false)
      if (editor.ok) return
      expect(editor.message).toContain('FORBIDDEN_ROLE')

      await asUser(null)
      const anon = await upsertProfile(ws, ['unregistered', 'A Shop', null, '27', null, null, null])
      expect(anon.ok).toBe(false)
      if (anon.ok) return
      expect(anon.message).toContain('AUTH_REQUIRED')
    })

    it('switching from registered to overseas clears the GSTIN rather than keeping a stale one', async () => {
      await asOwner()
      await upsertProfile(ws, [
        'registered',
        'Customer Pvt Ltd',
        SUPPLIER_GSTIN,
        '27',
        null,
        null,
        null,
      ])
      const moved = await upsertProfile(ws, ['overseas', 'Acme Inc', null, null, 'us', null, null])
      expect(moved.ok).toBe(true)
      const row = await db.query<{
        gstin: string | null
        state_code: string | null
        country_code: string
      }>(`select gstin, state_code, country_code from billing_profiles where workspace_id = $1`, [
        ws,
      ])
      // A stale GSTIN on an export invoice would claim an Indian registration that no
      // longer applies to this customer.
      expect(row.rows[0]).toEqual({ gstin: null, state_code: null, country_code: 'US' })
    })
  })
})
