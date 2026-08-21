import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { asMember, bootFullSchema, currentRole, probe } from './helpers/pglite-tenant'

/**
 * THE KNOWLEDGE LIBRARY'S GUARANTEES, EACH ONE BROKEN AND WATCHED TO GO RED.
 *
 * ── WHY EVERY TEST HERE IS A REFUSAL ─────────────────────────────────────────
 * `rls_tenant_isolation.pglite.test.ts` is catalog-driven and already covers
 * these two tables — measured while writing this file: both appear in
 * `seeded`, both hold two rows, `unseeded` is empty. So the "one workspace
 * cannot read another's" property is proven THERE and is not repeated here.
 *
 * What is left is everything that makes this library trustworthy rather than
 * merely private, and each is written as a break:
 *
 *   · a member cannot rewrite the passages their brand was built from
 *   · a passage cannot be edited or deleted once written, by anyone
 *   · deleting the DOCUMENT still removes its passages (the cascade exemption)
 *   · a read that yields nothing is a FAILURE, never an index of nothing
 *   · a crashed re-read cannot leave passages that search will serve
 *   · a failed re-read does not take the last good read down with it
 *   · a document the Brand Brain is standing on cannot be deleted silently
 *   · a non-member gets NOT_A_MEMBER from every one of the five functions
 *
 * ── WHAT THIS SUITE CANNOT PROVE ─────────────────────────────────────────────
 * Anything about the LIVE project. This builds an empty Postgres from the
 * migration files. Whether production's policies match is proven separately,
 * against the real database, with an anon key and minted member tokens.
 */

const WS_A = '11111111-1111-1111-1111-111111111111'
const WS_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'user_alpha'
const USER_B = 'user_beta'

/** A minimally valid brand payload — the six sections `resolve_brand_memory` pins. */
const BRAIN = {
  voice: {
    descriptor: 'warm',
    formality_label: 'casual',
    signature_phrases: ['a', 'b', 'c'],
    banned_phrases: [],
  },
  brand_persona: { archetype: 'sage', one_liner: 'we know dosas', core_values: ['x', 'y', 'z'] },
  customer_persona: {
    one_liner: 'regulars',
    primary_pain_point: 'queues',
    primary_fear: 'cold food',
    desired_identity: 'a local',
  },
  hook: { core_promise: 'hot in five', primary_emotion: 'calm', sample_hooks: ['h1', 'h2', 'h3'] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'strong', note: '' },
}

let db: PGlite

/** Ids created by the seed, read back so no test hard-codes a generated uuid. */
let docA: string

/**
 * One statement, run OUTSIDE any transaction, whose failure is data rather than
 * the end of the test.
 *
 * `probe` from the shared helper cannot be used here: it opens a SAVEPOINT, and
 * PGlite refuses one outside a transaction block. These calls are deliberately
 * unwrapped because they act as the table OWNER — which is the only way to show
 * that what refuses a passage edit is the TRIGGER and not a policy.
 */
async function attempt(
  sql: string,
  params: unknown[] = [],
): Promise<{ affected: number } | { denied: string }> {
  try {
    const r = await db.query(sql, params)
    return { affected: r.affectedRows ?? 0 }
  } catch (error) {
    return { denied: error instanceof Error ? error.message.split('\n')[0]! : String(error) }
  }
}

/**
 * The same, as a signed-in member, in a transaction of its own.
 *
 * ONE CALL PER ATTEMPT, on purpose. Postgres aborts the whole transaction at the
 * first error, so six attempts sharing one would report the first refusal and
 * then five copies of "current transaction is aborted" — which is the shape of a
 * guard proven on element [0] of a collection it claims to cover in full.
 */
async function attemptAs(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ affected: number } | { denied: string }> {
  return asMember(db, userId, async (tx) => {
    try {
      const r = await tx.query(sql, params)
      return { affected: r.affectedRows ?? 0 } as const
    } catch (error) {
      return {
        denied: error instanceof Error ? error.message.split('\n')[0]! : String(error),
      } as const
    }
  })
}

/** What a refusal LOOKS like, reduced to one phrase, so a table of them is readable. */
function verdict(r: { affected: number } | { denied: string }): string {
  if ('denied' in r) {
    const m =
      /violates row-level security|append-only|NOT_A_MEMBER|AUTH_REQUIRED|NO_CHUNKS|NEEDS_ACKNOWLEDGEMENT|INVALID_[A-Z_]+/.exec(
        r.denied,
      )
    return m ? m[0] : `raised: ${r.denied}`
  }
  return r.affected === 0 ? 'no rows' : `WROTE ${r.affected}`
}

beforeAll(async () => {
  db = await bootFullSchema()

  await db.exec(`
    insert into workspaces (id, name, slug, created_by) values
      ('11111111-1111-1111-1111-111111111111', 'Alpha', 'alpha', 'user_alpha'),
      ('22222222-2222-2222-2222-222222222222', 'Beta',  'beta',  'user_beta');
    insert into workspace_members (workspace_id, user_id, role) values
      ('11111111-1111-1111-1111-111111111111', 'user_alpha', 'owner'),
      ('22222222-2222-2222-2222-222222222222', 'user_beta', 'owner');
  `)

  // Seeded through the FUNCTION rather than with an insert, because the function
  // is the only write path that exists and a fixture built any other way would be
  // testing a shape the application can never produce.
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: USER_A, role: 'authenticated' }),
  ])
  const created = await db.query<{ id: string }>(
    `select (public.create_knowledge_document($1, $2, 'pdf', $3, $4, 'application/pdf', 1024)).id`,
    [WS_A, 'Dosa menu', 'menu.pdf', `${WS_A}/knowledge/menu.pdf`],
  )
  docA = created.rows[0]!.id

  await db.query(
    `select public.index_knowledge_document($1, $2::text[], 'sha-1', 0, '[]'::jsonb)`,
    [docA, ['Masala dosa is 90 rupees.', 'We open at 7am on Sunday.']],
  )
})

describe('the role really drops, or nothing below means anything', () => {
  it('is not superuser inside asMember', async () => {
    const role = await asMember(db, USER_A, (tx) => currentRole(tx))
    expect(role).toEqual({ user: 'authenticated', superuser: 'off' })
  })
})

describe('a member reads the library and writes none of it', () => {
  it('reads their own documents and passages', async () => {
    const seen = await asMember(db, USER_A, async (tx) => ({
      docs: await probe<{ title: string }>(tx, `select title from knowledge_documents`),
      chunks: await probe<{ text: string }>(
        tx,
        `select text from knowledge_chunks order by ordinal`,
      ),
    }))
    expect(seen.docs).toEqual({ rows: [{ title: 'Dosa menu' }] })
    expect(seen.chunks).toEqual({
      rows: [{ text: 'Masala dosa is 90 rupees.' }, { text: 'We open at 7am on Sunday.' }],
    })
  })

  /**
   * THE BREAK. Full CRUD would let a member edit the passage their brand was
   * built from — the one thing this screen exists to make impossible. Every
   * write below is attempted as an ordinary signed-in member of the workspace
   * that OWNS the row, so nothing here is refused for being cross-tenant.
   *
   * ── A READ-ONLY TABLE REFUSES IN TWO DIFFERENT SHAPES, AND BOTH ARE HERE ──
   * `app.apply_tenant_read_policy` creates ONE policy, `t_select`. So:
   *
   *   · an INSERT has no policy permitting it and RAISES
   *     ("new row violates row-level security policy");
   *   · an UPDATE or DELETE has no policy making any row VISIBLE to it, so it
   *     succeeds and changes NOTHING — zero rows, no error.
   *
   * Measured while writing this file: an assertion that only looked for an
   * exception reported `updateDoc`, `deleteDoc`, `updateChunk` and `deleteChunk`
   * as permitted, because a statement affecting no rows does not throw. It was
   * the test that was wrong, and the shape it was wrong in — mistaking a vacuous
   * success for a write — is exactly what this suite is for. So the verdict below
   * is the refusal's OWN WORDS or the row count it actually touched, never merely
   * the absence of a throw.
   */
  it('refuses every direct write, on both tables, and says how', async () => {
    const attempts = {
      insertDoc: await attemptAs(
        USER_A,
        `insert into knowledge_documents (workspace_id, title, source_kind, source_ref)
         values ($1, 'smuggled', 'text', 'typed')`,
        [WS_A],
      ),
      updateDoc: await attemptAs(USER_A, `update knowledge_documents set title = 'renamed'`),
      deleteDoc: await attemptAs(USER_A, `delete from knowledge_documents`),
      insertChunk: await attemptAs(
        USER_A,
        `insert into knowledge_chunks (workspace_id, document_id, index_version, ordinal, text)
         values ($1, $2, 1, 99, 'a price I invented')`,
        [WS_A, docA],
      ),
      updateChunk: await attemptAs(USER_A, `update knowledge_chunks set text = 'now 900 rupees'`),
      deleteChunk: await attemptAs(USER_A, `delete from knowledge_chunks`),
    }

    expect(Object.fromEntries(Object.entries(attempts).map(([k, v]) => [k, verdict(v)]))).toEqual({
      insertDoc: 'violates row-level security',
      updateDoc: 'no rows',
      deleteDoc: 'no rows',
      insertChunk: 'violates row-level security',
      updateChunk: 'no rows',
      deleteChunk: 'no rows',
    })
  })

  /**
   * "No rows" above is only a refusal if the rows are STILL THERE afterwards.
   * Read back, as the member, after all six attempts.
   */
  it('leaves the document and its passages byte-identical after all six attempts', async () => {
    const after = await asMember(db, USER_A, async (tx) =>
      probe<{ title: string; text: string }>(
        tx,
        `select d.title, c.text from knowledge_documents d
           join knowledge_chunks c on c.document_id = d.id
          where d.id = $1 order by c.ordinal`,
        [docA],
      ),
    )
    expect(after).toEqual({
      rows: [
        { title: 'Dosa menu', text: 'Masala dosa is 90 rupees.' },
        { title: 'Dosa menu', text: 'We open at 7am on Sunday.' },
      ],
    })
  })
})

describe('a passage cannot be revised once written', () => {
  /**
   * `app.block_mutations` and not merely the read-only policy: this refusal has
   * to hold against the DEFINER functions too, which run with the table owner's
   * rights and are not subject to the policy at all. Attempted here as superuser
   * for exactly that reason — a policy is inert against this connection, so what
   * refuses can only be the trigger.
   */
  it('refuses an update and a delete even with policies bypassed', async () => {
    const asSuperuser = {
      update: await attempt(`update knowledge_chunks set text = 'edited'`),
      delete: await attempt(`delete from knowledge_chunks where ordinal = 0`),
    }
    expect(asSuperuser.update).toMatchObject({ denied: expect.stringContaining('append-only') })
    expect(asSuperuser.delete).toMatchObject({ denied: expect.stringContaining('append-only') })
  })

  /**
   * THE EXEMPTION THE DELETE DEPENDS ON. `block_mutations` returns early at
   * `pg_trigger_depth() > 1`, and a cascade from the parent arrives at depth 2.
   * If this ever stops being true, deleting a document raises instead of
   * working — so it is asserted rather than assumed.
   */
  it('still removes passages when the document itself is deleted', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'scratch', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [id, ['one passage']])

    const before = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_chunks where document_id = $1`,
      [id],
    )
    const removed = await attempt(`delete from knowledge_documents where id = $1`, [id])
    const after = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_chunks where document_id = $1`,
      [id],
    )

    expect(before.rows[0]).toEqual({ n: 1 })
    expect(removed, 'the cascade was refused').toEqual({ affected: 1 })
    expect(after.rows[0]).toEqual({ n: 0 })
  })
})

describe('a read that produced nothing is a failure, never an index of nothing', () => {
  it('refuses an empty array and an array of blanks', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'empty', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id

    const empty = await attempt(`select public.index_knowledge_document($1, '{}'::text[])`, [id])
    /**
     * TABS AND NEWLINES, not just spaces.
     *
     * MEASURED 2026-08-22: with `where btrim(t.chunk) <> ''` in the function,
     * this case PASSED THE FILTER and was stored. PostgreSQL's one-argument
     * `btrim` strips spaces only, so `E'\n'` is not blank to it. The library
     * gained a passage search would return as a hit containing nothing. The
     * function now asks whether any character is NOT whitespace, and this is
     * the input that says so.
     */
    const blanks = await attempt(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['   ', '\n', '\t', '  \r\n  '],
    ])
    const state = await db.query<{ status: string; index_version: number }>(
      `select status, index_version from knowledge_documents where id = $1`,
      [id],
    )

    expect(empty).toMatchObject({ denied: expect.stringContaining('NO_CHUNKS') })
    expect(blanks).toMatchObject({ denied: expect.stringContaining('NO_CHUNKS') })
    // Still pending — not silently promoted to a library entry search can never return.
    expect(state.rows[0]).toEqual({ status: 'pending', index_version: 0 })
  })

  /**
   * The sibling of the case above: SOME passages blank. The blank ones must be
   * dropped, the real one kept, and `chunk_count` must be a count of the rows
   * that exist rather than of the array that arrived.
   */
  it('drops the blank passages and counts only what it stored', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'mixed', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['\n', 'Sunday hours are 8 to 11.', '   ', '\t'],
    ])

    const doc = await db.query<{ chunk_count: number; status: string }>(
      `select chunk_count, status from knowledge_documents where id = $1`,
      [id],
    )
    const stored = await db.query<{ text: string; ordinal: number }>(
      `select text, ordinal from knowledge_chunks where document_id = $1 order by ordinal`,
      [id],
    )

    expect(doc.rows[0]).toEqual({ chunk_count: 1, status: 'indexed' })
    // Ordinal 1, not 0 — the position in the ORIGINAL document is kept, so a
    // citation still points at where the passage actually sits.
    expect(stored.rows).toEqual([{ text: 'Sunday hours are 8 to 11.', ordinal: 1 }])
  })
})

describe('a re-read supersedes rather than edits', () => {
  it('serves only the current index_version, and keeps the old passages readable', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'rates', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [id, ['old price 50']])
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['new price 90', 'and a second passage'],
    ])

    const doc = await db.query<{ index_version: number; chunk_count: number; char_count: number }>(
      `select index_version, chunk_count, char_count from knowledge_documents where id = $1`,
      [id],
    )
    const current = await db.query<{ text: string }>(
      `select c.text from knowledge_chunks c
         join knowledge_documents d on d.id = c.document_id and d.index_version = c.index_version
        where c.document_id = $1 order by c.ordinal`,
      [id],
    )
    const everything = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_chunks where document_id = $1`,
      [id],
    )

    expect(doc.rows[0]).toEqual({
      index_version: 2,
      chunk_count: 2,
      // 'new price 90' (12) + 'and a second passage' (20). Generated by the
      // database from the rows themselves, so it cannot disagree with them.
      char_count: 32,
    })
    expect(current.rows.map((r) => r.text)).toEqual(['new price 90', 'and a second passage'])
    // The superseded passage is still THERE — append-only — and simply not current.
    expect(everything.rows[0]).toEqual({ n: 3 })
  })

  it('leaves the last good read serving when a re-read fails', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'policy', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['returns: 7 days'],
    ])
    await db.query(`select public.fail_knowledge_document($1, 'no_text', $2)`, [
      id,
      'The free reader found almost no text in that document.',
    ])

    const doc = await db.query<{ status: string; index_version: number; failure_code: string }>(
      `select status, index_version, failure_code from knowledge_documents where id = $1`,
      [id],
    )
    const still = await db.query<{ text: string }>(
      `select c.text from knowledge_chunks c
         join knowledge_documents d on d.id = c.document_id and d.index_version = c.index_version
        where c.document_id = $1`,
      [id],
    )

    expect(doc.rows[0]).toEqual({ status: 'failed', index_version: 1, failure_code: 'no_text' })
    expect(still.rows.map((r) => r.text)).toEqual(['returns: 7 days'])
  })

  it('refuses a failure with no sentence, and an invented failure code', async () => {
    const noSentence = await attempt(`select public.fail_knowledge_document($1, 'no_text', '  ')`, [
      docA,
    ])
    const invented = await attempt(`select public.fail_knowledge_document($1, 'vibes', 'x')`, [
      docA,
    ])
    expect(noSentence).toMatchObject({ denied: expect.stringContaining('INVALID_FAILURE_DETAIL') })
    expect(invented).toMatchObject({ denied: expect.stringContaining('INVALID_FAILURE_CODE') })
  })
})

describe('the URL door replaces; the file doors accumulate', () => {
  it('keeps one row per address and two rows for two uploads of one filename', async () => {
    const url = 'https://example.com/prices'
    await db.query(`select public.create_knowledge_document($1, 'Prices', 'url', $2)`, [WS_A, url])
    await db.query(`select public.create_knowledge_document($1, 'Prices again', 'url', $2)`, [
      WS_A,
      url,
    ])
    await db.query(`select public.create_knowledge_document($1, 'Menu', 'pdf', 'menu.pdf')`, [WS_A])
    await db.query(`select public.create_knowledge_document($1, 'Menu', 'pdf', 'menu.pdf')`, [WS_A])

    const urls = await db.query<{ n: number; title: string }>(
      `select count(*)::int as n, max(title) as title from knowledge_documents
        where workspace_id = $1 and source_kind = 'url' and source_ref = $2`,
      [WS_A, url],
    )
    const pdfs = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_documents
        where workspace_id = $1 and source_kind = 'pdf' and source_ref = 'menu.pdf'`,
      [WS_A],
    )

    expect(urls.rows[0]).toEqual({ n: 1, title: 'Prices again' })
    // Three: the beforeAll fixture plus the two above. An owner may hold two
    // editions of one file and merging them would be a guess.
    expect(pdfs.rows[0]).toEqual({ n: 3 })
  })
})

describe('deleting a document says what it costs first', () => {
  it('refuses without acknowledgement once the Brand Brain cites it, then allows it', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'cited', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [id, ['a cited fact']])

    // An active brain whose `hook.core_promise` came from this document.
    await db.query(
      `insert into brand_memory (workspace_id, version, status, payload, source)
       values ($1, 1, 'active', $2::jsonb, 'resolved')`,
      [
        WS_A,
        JSON.stringify({
          ...BRAIN,
          field_meta: {
            'hook.core_promise': { kind: 'inferred', confirmed: false, source: `document:${id}` },
          },
        }),
      ],
    )

    const refused = await attempt(`select public.delete_knowledge_document($1)`, [id])
    const stillThere = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_documents where id = $1`,
      [id],
    )
    const allowed = await db.query<{ r: Record<string, unknown> }>(
      `select public.delete_knowledge_document($1, true) as r`,
      [id],
    )
    const gone = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge_documents where id = $1`,
      [id],
    )

    expect(refused).toMatchObject({ denied: expect.stringContaining('NEEDS_ACKNOWLEDGEMENT') })
    expect(stillThere.rows[0]).toEqual({ n: 1 })
    expect(allowed.rows[0]!.r).toMatchObject({
      brand_fields: 1,
      pending_proposals: 0,
      deleted: true,
    })
    expect(gone.rows[0]).toEqual({ n: 0 })
  })

  it('counts a pending proposal as impact too', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'proposed-from', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [id, ['a passage']])
    await db.query(
      `insert into memory_events (workspace_id, source, diff, status, evidence_refs)
       values ($1, 'insight', '{"patch":{}}'::jsonb, 'pending', $2::jsonb)`,
      [WS_A, JSON.stringify([{ document_id: id, chunk_ordinal: 0 }])],
    )

    const refused = await attempt(`select public.delete_knowledge_document($1)`, [id])
    expect(refused).toMatchObject({ denied: expect.stringContaining('NEEDS_ACKNOWLEDGEMENT') })
  })

  it('deletes a document nothing cites, with no acknowledgement asked for', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'uncited', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['nobody cites me'],
    ])

    const result = await db.query<{ r: Record<string, unknown> }>(
      `select public.delete_knowledge_document($1) as r`,
      [id],
    )
    expect(result.rows[0]!.r).toMatchObject({
      brand_fields: 0,
      pending_proposals: 0,
      deleted: true,
    })
  })
})

describe('every function refuses a non-member', () => {
  /**
   * All five, not one. A guard proven on element [0] of a collection it claims
   * to cover in full is the recurring shape of failure in this repo, so each
   * function is called by a signed-in user who belongs to the OTHER workspace
   * and each refusal is reported separately.
   */
  it('names NOT_A_MEMBER from all five, individually', async () => {
    const attempts = await asMember(db, USER_B, async (tx) => ({
      create: await probe(
        tx,
        `select public.create_knowledge_document($1, 'theirs', 'text', 'typed')`,
        [WS_A],
      ),
      start: await probe(tx, `select public.start_knowledge_indexing($1)`, [docA]),
      index: await probe(tx, `select public.index_knowledge_document($1, $2::text[])`, [
        docA,
        ['smuggled'],
      ]),
      fail: await probe(tx, `select public.fail_knowledge_document($1, 'no_text', 'x')`, [docA]),
      remove: await probe(tx, `select public.delete_knowledge_document($1, true)`, [docA]),
    }))

    const verdicts = Object.fromEntries(
      Object.entries(attempts).map(([name, r]) => [
        name,
        'denied' in r ? r.denied.replace(/^.*?(NOT_A_MEMBER).*$/, '$1') : 'ALLOWED',
      ]),
    )
    expect(verdicts).toEqual({
      create: 'NOT_A_MEMBER',
      start: 'NOT_A_MEMBER',
      index: 'NOT_A_MEMBER',
      fail: 'NOT_A_MEMBER',
      remove: 'NOT_A_MEMBER',
    })
  })

  it('refuses a signed-out caller before it looks anything up', async () => {
    const out = await asMember(db, '', async (tx) =>
      probe(tx, `select public.create_knowledge_document($1, 't', 'text', 'typed')`, [WS_A]),
    )
    expect(out).toMatchObject({ denied: expect.stringContaining('AUTH_REQUIRED') })
  })
})

describe('the view is what makes "current" impossible to get wrong', () => {
  /**
   * The mutation run on 2026-08-22 could break every other guarantee in the
   * migration and watch it go red, and could not break this one — because until
   * `knowledge_current_chunks` existed the rule lived in whoever wrote the
   * query. These two tests are what makes it a guard.
   */
  it('hides a superseded passage that is still in the table', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'tariff', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['delivery costs 40'],
    ])
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [
      id,
      ['delivery costs 60'],
    ])

    const inTable = await db.query<{ text: string }>(
      `select text from knowledge_chunks where document_id = $1 order by index_version`,
      [id],
    )
    const throughView = await asMember(db, USER_A, async (tx) =>
      probe<{ text: string }>(
        tx,
        `select text from knowledge_current_chunks where document_id = $1`,
        [id],
      ),
    )

    // Both prices are STILL STORED — the table is append-only and that is the point.
    expect(inTable.rows.map((r) => r.text)).toEqual(['delivery costs 40', 'delivery costs 60'])
    // Only one of them is current, and the view is the thing that knows which.
    expect(throughView).toEqual({ rows: [{ text: 'delivery costs 60' }] })
  })

  it('hides every passage of a document that has not indexed successfully', async () => {
    const scratch = await db.query<{ id: string }>(
      `select (public.create_knowledge_document($1, 'half-read', 'text', 'typed')).id`,
      [WS_A],
    )
    const id = scratch.rows[0]!.id
    await db.query(`select public.index_knowledge_document($1, $2::text[])`, [id, ['a passage']])
    await db.query(`select public.start_knowledge_indexing($1)`, [id])

    const throughView = await asMember(db, USER_A, async (tx) =>
      probe<{ text: string }>(
        tx,
        `select text from knowledge_current_chunks where document_id = $1`,
        [id],
      ),
    )
    // A document being re-read shows nothing rather than a mixture of the old
    // reading and whatever has landed so far.
    expect(throughView).toEqual({ rows: [] })
  })

  it('applies the caller’s own policy — B sees none of A’s passages through it', async () => {
    const seen = await asMember(db, USER_B, async (tx) =>
      probe<{ n: number }>(tx, `select count(*)::int as n from knowledge_current_chunks`),
    )
    // The server's own answer: zero. `security_invoker` is what makes it so — a
    // view without it would run as its owner and hand over everything.
    expect(seen).toEqual({ rows: [{ n: 0 }] })
  })
})

describe('search returns the passage, under the caller’s own policy', () => {
  it('matches a stemmed word and stays inside the workspace', async () => {
    const found = await asMember(db, USER_A, async (tx) =>
      probe<{ text: string }>(
        tx,
        `select c.text from knowledge_chunks c
           join knowledge_documents d on d.id = c.document_id and d.index_version = c.index_version
          where c.tsv @@ plainto_tsquery('english', $1)
            and d.status = 'indexed'
          order by c.ordinal`,
        ['rupees'],
      ),
    )
    expect(found).toEqual({ rows: [{ text: 'Masala dosa is 90 rupees.' }] })
  })

  it('finds nothing of workspace A’s from workspace B', async () => {
    const found = await asMember(db, USER_B, async (tx) =>
      probe<{ text: string }>(
        tx,
        `select text from knowledge_chunks where tsv @@ plainto_tsquery('english', $1)`,
        ['rupees'],
      ),
    )
    // The server's own answer, printed: an empty result set, not an inequality.
    expect(found).toEqual({ rows: [] })
  })
})
