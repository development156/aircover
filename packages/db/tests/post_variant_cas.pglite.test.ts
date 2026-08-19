import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, applyMigration, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * A1 — the compare-and-set that stops two tabs overwriting each other, EXECUTED.
 *
 * ── THE DEFECT THIS FILE REPRODUCES FIRST ────────────────────────────────────
 * `describes the loss` below runs today's save — a PostgREST upsert on
 * `(post_id, channel)` — twice, from two writers who both read the same row. The
 * second one wins and the first one's words are gone, with nothing anywhere
 * recording that it happened. That test passes BEFORE the migration and is the
 * only thing here that would still pass with the CAS removed, which is what makes
 * the rest of the file a detector rather than a description.
 *
 * ── WHY THE SQL IS LOADED FROM THE MIGRATION FILE ────────────────────────────
 * The file the founder applies is the file executed here. A test carrying its own
 * copy of the function would go green against SQL nobody will ever run.
 */

const MIGRATION = '20260819000000_post_variant_version_cas.sql'

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const POST = '22222222-2222-4222-8222-222222222222'

interface VariantRow extends Record<string, unknown> {
  body: string
  version: number
  is_linked: boolean
  char_count: number | null
}

describe('A1 · post_variants version CAS (real Postgres, in-process)', () => {
  let db: PGlite

  /** A workspace and a post for the variants to hang off — the FKs require both. */
  async function seed(): Promise<void> {
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa')`,
      [WS],
    )
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'Other', 'other', 'user_x')`,
      [OTHER_WS],
    )
    await db.query(`insert into posts (id, workspace_id, title) values ($1, $2, 'A post')`, [
      POST,
      WS,
    ])
  }

  /** Today's save, exactly as `app/actions/posts.ts` issues it: an upsert, no version. */
  async function legacyUpsert(body: string): Promise<void> {
    await db.query(
      `insert into post_variants (workspace_id, post_id, channel, body, is_linked)
       values ($1, $2, 'instagram', $3, false)
       on conflict (post_id, channel) do update
         set body = excluded.body, is_linked = excluded.is_linked`,
      [WS, POST, body],
    )
  }

  /** The new save. `null` expected version means "I think this channel has no copy yet". */
  async function cas(
    body: string,
    expectedVersion: number | null,
    workspaceId: string = WS,
  ): Promise<VariantRow[]> {
    const r = await db.query<VariantRow>(
      `select * from public.save_post_variant($1, $2, 'instagram', $3, null, $4, $5, false)`,
      [POST, workspaceId, body, body.length, expectedVersion],
    )
    return r.rows
  }

  async function stored(): Promise<VariantRow | undefined> {
    const r = await db.query<VariantRow>(
      `select * from post_variants where post_id = $1 and channel = 'instagram'`,
      [POST],
    )
    return r.rows[0]
  }

  /**
   * ONE Postgres per block, not one per test.
   *
   * Each boot is a fresh WebAssembly Postgres and costs about three seconds of CPU.
   * Booting per test made this file alone start fourteen of them, and under the
   * full gate — where every package's suite runs at once — that starved the web
   * suite into timeouts. Truncating between tests gives the same isolation for a
   * fraction of the cost: every table these tests touch is emptied and re-seeded.
   */
  async function reset(): Promise<void> {
    await db.exec('truncate post_variants, posts, workspaces cascade')
    await seed()
  }

  describe('before the migration — the schema as production has it today', () => {
    beforeAll(async () => {
      db = await bootSchema(CONTENT_FOUNDATION)
    })
    beforeEach(reset)
    afterAll(async () => {
      await db.close()
    })

    it('has no version column at all', async () => {
      // The runtime detector in apps/web branches on exactly this. If the column
      // were already there, every "legacy path" test below would be vacuous.
      const r = await db.query(
        `select column_name from information_schema.columns
          where table_name = 'post_variants' and column_name = 'version'`,
      )
      expect(r.rows).toEqual([])
    })

    it('describes the loss: the second writer overwrites the first, silently', async () => {
      // Two tabs. Both read the empty row. Both save. Nothing errors, nothing is
      // flagged, and one person's paragraph no longer exists anywhere.
      await legacyUpsert('TAB B wrote this second.')
      await legacyUpsert('TAB A wrote this, unaware of B.')

      expect((await stored())?.body).toBe('TAB A wrote this, unaware of B.')
    })
  })

  describe('after the migration', () => {
    beforeAll(async () => {
      db = await bootSchema(CONTENT_FOUNDATION)
      await applyMigration(db, MIGRATION)
    })
    beforeEach(reset)
    afterAll(async () => {
      await db.close()
    })

    it('backfills every existing row to version 1', async () => {
      // Ordering matters and this is the assertion that proves it: the column is
      // added to a table that already holds rows, so a default that did not apply
      // retroactively would leave live posts with a null version and unsaveable.
      const fresh = await bootSchema(CONTENT_FOUNDATION)
      await fresh.query(
        `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa')`,
        [WS],
      )
      await fresh.query(`insert into posts (id, workspace_id, title) values ($1, $2, 'P')`, [
        POST,
        WS,
      ])
      await fresh.query(
        `insert into post_variants (workspace_id, post_id, channel, body)
         values ($1, $2, 'x', 'written before the migration')`,
        [WS, POST],
      )
      await applyMigration(fresh, MIGRATION)

      const r = await fresh.query<{ version: number }>(
        `select version from post_variants where channel = 'x'`,
      )
      expect(r.rows[0]?.version).toBe(1)
      await fresh.close()
    })

    it('creates the row when no version is supplied', async () => {
      // Today's save is an UPSERT, so the very first write to a channel has no row
      // to compare against. docs/23's SQL only ever UPDATEs — with it as printed,
      // the first save of every channel would be reported as a conflict.
      const returned = await cas('the first draft', null)

      expect(returned).toHaveLength(1)
      expect(returned[0]?.body).toBe('the first draft')
      expect(returned[0]?.version).toBe(1)
    })

    it('refuses a second create, so two tabs cannot both make the first row', async () => {
      await cas('tab A first draft', null)
      const second = await cas('tab B first draft', null)

      // Zero rows back = conflict. The important half is the next line: B's attempt
      // changed nothing, so A's words are still there to be shown alongside B's.
      expect(second).toEqual([])
      expect((await stored())?.body).toBe('tab A first draft')
    })

    it('saves and bumps the counter when the version matches', async () => {
      await cas('version one', null)
      const returned = await cas('version two', 1)

      expect(returned[0]?.body).toBe('version two')
      expect(returned[0]?.version).toBe(2)
      expect((await stored())?.version).toBe(2)
    })

    it('refuses and changes NOTHING when the version is stale', async () => {
      await cas('version one', null)
      await cas('the other tab got there first', 1) // row is now version 2

      const late = await cas('my paragraph, sent against version 1', 1)

      expect(late).toEqual([])
      // The refusal is only worth anything if the stored row survived it intact.
      const row = await stored()
      expect(row?.body).toBe('the other tab got there first')
      expect(row?.version).toBe(2)
    })

    it('lets the loser win the retry with the version it just read', async () => {
      // This is the "Keep mine" path, and the reason a stale notice is harmless:
      // whatever happened in between, re-reading gives a real current version and
      // the re-send lands against it.
      await cas('version one', null)
      await cas('someone else', 1)

      const current = await stored()
      const retry = await cas('my paragraph, kept', current?.version ?? 0)

      expect(retry[0]?.body).toBe('my paragraph, kept')
      expect(retry[0]?.version).toBe(3)
    })

    it('survives a third writer arriving between the refusal and the retry', async () => {
      // The notice shows text read AFTER the clash, so a third writer can make it
      // stale. Stale is not false — it is still a version that was really stored —
      // and the retry re-reads, so nothing is lost. Proven rather than assumed.
      await cas('version one', null)
      await cas('writer two', 1)
      const refused = await cas('writer one, late', 1)
      expect(refused).toEqual([])

      const readForTheNotice = await stored()
      await cas('writer three, in between', readForTheNotice?.version ?? 0)

      // The retry against the now-stale read is refused, not applied blindly.
      const staleRetry = await cas('writer one, keeping mine', readForTheNotice?.version ?? 0)
      expect(staleRetry).toEqual([])

      // And re-reading again lands it. No path here overwrites anyone unknowingly.
      const again = await stored()
      const landed = await cas('writer one, keeping mine', again?.version ?? 0)
      expect(landed[0]?.body).toBe('writer one, keeping mine')
    })

    it('will not write a row belonging to another workspace', async () => {
      await cas('version one', null)

      // Same post id, wrong tenant. RLS is not what is being tested here — PGlite
      // connects as a superuser and bypasses it — this asserts the `workspace_id`
      // in the function's own WHERE, which is the layer that survives a
      // service-role caller.
      const crossTenant = await cas('written from the wrong account', 1, OTHER_WS)

      expect(crossTenant).toEqual([])
      expect((await stored())?.body).toBe('version one')
    })

    it('keeps writing is_linked, so nothing about linking changes', async () => {
      // Today's save writes `is_linked: false`. A function that dropped the column
      // would silently stop, which is a behaviour change this migration must not
      // make. Nothing reads the column yet — that is why it would go unnoticed.
      await db.query(
        `insert into post_variants (workspace_id, post_id, channel, body, is_linked)
         values ($1, $2, 'instagram', 'linked copy', true)`,
        [WS, POST],
      )
      await cas('edited copy', 1)

      expect((await stored())?.is_linked).toBe(false)
    })

    it('grants execute to members only, and not to signed-out visitors', async () => {
      const r = await db.query<{ ok: boolean }>(
        `select has_function_privilege('authenticated',
                 'public.save_post_variant(uuid,uuid,text,text,jsonb,integer,integer,boolean)',
                 'execute') as ok`,
      )
      expect(r.rows[0]?.ok).toBe(true)

      const anon = await db.query<{ ok: boolean }>(
        `select has_function_privilege('anon',
                 'public.save_post_variant(uuid,uuid,text,text,jsonb,integer,integer,boolean)',
                 'execute') as ok`,
      )
      expect(anon.rows[0]?.ok).toBe(false)
    })

    it('runs as the caller, so row-level security still decides', async () => {
      // `security definer` here would move a tenant boundary for no reason. This is
      // the assertion that catches it if the word is ever changed.
      const r = await db.query<{ prosecdef: boolean }>(
        `select prosecdef from pg_proc where proname = 'save_post_variant'`,
      )
      expect(r.rows[0]?.prosecdef).toBe(false)
    })

    it('leaves row-level security switched on for post_variants', async () => {
      const r = await db.query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class where relname = 'post_variants'`,
      )
      expect(r.rows[0]?.relrowsecurity).toBe(true)
    })
  })
})
