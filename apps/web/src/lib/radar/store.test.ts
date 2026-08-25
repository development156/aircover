import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * THE BINDING, AGAINST COLUMNS SOMEBODY HAS ACTUALLY READ.
 *
 * ── WHAT THIS FILE USED TO ASSERT, AND WHY IT NO LONGER DOES ────────────────
 * It asserted that `store.ts` CONTAINED NO QUERY. That was the right guard for
 * its moment: the first binding selected `id, name, url, kind, added_on,
 * last_observed_at` from `competitors`, with column names guessed from TSD prose
 * that names tables and not their columns. `competitors` is REAL, so the
 * missing-table branch never fired — Postgres answers 42703 for a missing COLUMN,
 * not 42P01 — and every `/radar` request returned a 500.
 *
 * That guard carried its own expiry: "Bind it against a migration you have read,
 * and delete this test in the same commit." This is that commit.
 *
 * ── THE COLUMN NAMES, TAKEN FROM 20260822060000_radar_registry.sql ───────────
 * Not from prose. The three that the last attempt got wrong:
 *
 *   · `competitors.display_name`   — NOT `name`. This is the 42703.
 *   · `competitors` has NO `workspace_id`. It is a SHARED catalogue and tenancy
 *     lives in `competitor_subscriptions`, so every read joins through it.
 *   · there is no `url` on a competitor. Addresses are normalised LOCATORS on
 *     `competitor_sources`, one row per source, deduped globally on
 *     (kind, locator).
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * It reads `store.ts` as TEXT, so it is blind to:
 *  · a query built somewhere else and imported — only this file is scanned;
 *  · a column named through a variable or a template literal rather than written
 *    into the `.select('…')` string, which is what the select assertions parse;
 *  · a `.rpc()` reached dynamically, or the RPC's own behaviour — whether the SQL
 *    is CORRECT is not a question source text can answer, and is deliberately not
 *    asked here;
 *  · anything about production's schema. The column names it forbids are the ones
 *    that produced a 42703; it cannot tell that the ones it allows still exist.
 *
 * ── WHAT IS ASSERTED HERE, AND WHAT IS ASSERTED AGAINST A REAL DATABASE ─────
 * These are the decisions that are the binding's own: which RPC it calls, which
 * kinds it can store, and that it never invents a reading. Whether the SQL is
 * right is not a question a mock can answer, and it is not asked here — it is
 * proved in `packages/db/tests/radar_subscribe_door.pglite.test.ts` against a
 * real Postgres with RLS enforced, and against production itself by
 * `packages/db/scripts/radar-rls-live-proof.mjs`.
 */

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'store.ts'), 'utf8')

/** The file with its prose removed — comments describe the defect, they are not code. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

describe('the Supabase binding uses the registry the migration describes', () => {
  test('goes through public.radar_subscribe, never app.radar_subscribe', () => {
    // `app.radar_subscribe` takes `p_created_by` and checks no membership: it
    // trusts both of its identity arguments because its only sanctioned caller is
    // the service role. Reaching it from a customer's session would be a
    // cross-tenant write.
    expect(CODE).toContain("rpc('radar_subscribe'")
    expect(CODE).not.toContain('app.radar_subscribe')
  })

  test('sends no actor argument — identity is the JWT’s and nothing else', () => {
    // The wrapper has no p_created_by. A parameter naming the actor is a
    // parameter that can lie about the actor.
    expect(CODE).not.toContain('p_created_by')
  })

  test('never selects the columns that produced the 42703', () => {
    // `competitors.name` and `competitors.workspace_id` do not exist. Asserted on
    // the select strings rather than on the words, so a comment explaining the
    // defect cannot fail its own test.
    const selects = [...CODE.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1] ?? '')
    expect(selects.length).toBeGreaterThan(0)
    for (const select of selects) {
      expect(select).not.toMatch(/\bworkspace_id\s*,|\bworkspace_id\)/)
      // `display_name` contains "name"; the bare column is what must be absent.
      expect(select.split(/[\s,()]+/)).not.toContain('name')
    }
  })

  test('reads the watch list through the subscription, because that is where tenancy is', () => {
    expect(CODE).toContain("from('competitor_subscriptions')")
    expect(CODE).toContain('display_name')
  })

  /**
   * RETARGETED 2026-08-25, NOT DELETED, and the distinction is the point.
   *
   * This used to read "reports watch-list-only, NEVER reading, while the change
   * feed is unbound" and asserted `not.toContain("collector: 'reading'")`. The
   * feed is bound now, so that literal is in the file and the old assertion
   * fails — but the GUARANTEE it existed for has not expired by one word:
   *
   *   `reading` means an empty feed genuinely says "nothing changed".
   *   Claiming it over a read that did not happen renders silence as good news.
   *
   * The old spelling could only ever say "the feed is unbound". This says the
   * thing that has to stay true now that it is bound: every degraded path still
   * lands on `watch-list-only`, and `reading` is reachable only after a change
   * read that came back.
   */
  test('claims `reading` only after a change read that actually returned', () => {
    expect(CODE).toContain("collector: 'reading'")

    // The failure path is explicit and lands on the honest state. `readChanges`
    // answers null when it could not read, and null must not become an empty
    // feed.
    expect(CODE).toMatch(/feed === null\) return \{ collector: 'watch-list-only'/)

    // And `reading` is returned exactly once, from the one place that has the
    // feed in hand. A second site is a second chance to claim it without one.
    expect([...CODE.matchAll(/collector: 'reading'/g)]).toHaveLength(1)
  })

  test('a failed change read is never rendered as an empty feed', () => {
    // The whole reason `readChanges` returns `RadarDay[] | null` rather than
    // `RadarDay[]`. A `?? []` anywhere on that path turns "we could not look"
    // into "we looked and nothing moved", about somebody else's business.
    expect(CODE).not.toMatch(/readChanges\([^)]*\)\s*\)?\s*\?\?\s*\[\]/)
    expect(CODE).toContain('Promise<RadarDay[] | null>')
  })

  test('never invents a last-observed timestamp', () => {
    // competitor_snapshots is empty for everyone. A `new Date()` here would be a
    // fabricated reading of a competitor that has never been read.
    expect(CODE).toContain('lastObservedAt: null')
    expect(CODE).not.toMatch(/lastObservedAt:\s*(new Date|Date\.now)/)
  })

  test('refuses google_business by name, rather than storing something else', async () => {
    // The screen's kinds are website | instagram | google_business; the registry's
    // CHECK admits website | instagram | x | linkedin | facebook. `google_business`
    // cannot be stored at all. Coercing it to `website` would tell a customer they
    // are watching something they are not.
    const { supabaseRadarStore } = await import('./store')
    await expect(
      supabaseRadarStore().add('ws-1', {
        name: 'A Shop',
        url: 'https://example.com',
        kind: 'google_business',
      }),
    ).rejects.toThrow(/Google Business/)
  })

  test('the refusal happens BEFORE any client is opened', async () => {
    // Proved by the test above passing at all: this environment has no Supabase
    // env vars, so `createServerSupabase()` throws "missing or invalid env". A
    // refusal that reached the client would surface that message instead, which
    // is a different sentence and a worse one.
    const { supabaseRadarStore } = await import('./store')
    await expect(
      supabaseRadarStore().add('ws-1', {
        name: 'A Shop',
        url: 'https://example.com',
        kind: 'google_business',
      }),
    ).rejects.not.toThrow(/env/)
  })
})
