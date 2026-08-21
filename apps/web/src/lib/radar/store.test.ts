import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { supabaseRadarStore } from './store'

/**
 * THE SUPABASE BINDING READS NOTHING, AND THAT IS THE ASSERTION.
 *
 * ── THE DEFECT THIS PINS ────────────────────────────────────────────────────
 * The first version of `store.ts` selected `id, name, url, kind, added_on,
 * last_observed_at` from `competitors`, with the column names guessed from TSD
 * prose that names tables and not columns. The `competitors` table is REAL — a
 * parallel lane applied its migrations to the shared database — so the
 * missing-table branch never fired, and Postgres answered 42703 (undefined
 * column) rather than 42P01 (undefined table). The throw reached the server
 * component and `/radar` returned a 500.
 *
 * It cost two suites: `roadmap-honesty` found no "not built yet" text because
 * the screen rendered nothing at all, and `every-section-loads` found no `h1`.
 *
 * ── WHY THE TEST READS THE SOURCE ───────────────────────────────────────────
 * Asserting that `read()` returns UNWIRED is necessary and not sufficient: a
 * future binding could query, catch, and return UNWIRED anyway, which passes
 * that assertion while restoring the 500 on any error the catch does not name.
 * What must hold is that this file CONTAINS NO QUERY, so the scan below looks
 * for the Supabase call surface directly.
 *
 * Deliberately a source scan and not a mocked client. A mock proves the calls
 * this test thought to stub; the file is the thing that either has a query in it
 * or does not.
 *
 * DELETE THIS TEST when the binding lands for real — with the reconcile, and on
 * purpose, alongside columns someone has actually read a migration for.
 */

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'store.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') // comments describe the defect; they are not code

describe('the Supabase binding does not guess a schema it cannot see', () => {
  test('read() answers UNWIRED without touching the database', async () => {
    const snapshot = await supabaseRadarStore().read('ws-1')
    expect(snapshot).toEqual({ collector: 'absent', competitors: [], days: [] })
  })

  test('the file contains no query at all', () => {
    for (const call of ['.from(', 'createServerSupabase', '.select(', '.insert(', '.delete(']) {
      expect(
        SOURCE.includes(call),
        `store.ts calls ${call} — a query here is a guess at another lane's columns, ` +
          'and the last one returned a 500 on every /radar request. Bind it against a ' +
          'migration you have read, and delete this test in the same commit.',
      ).toBe(false)
    }
  })

  test('removing is a no-op rather than a refusal, since nothing is stored', async () => {
    await expect(supabaseRadarStore().remove('ws-1', 'comp-1')).resolves.toBeUndefined()
  })

  test('adding refuses in the words the action maps to its not-collecting arm', async () => {
    // `actions/radar.ts` matches on "not collecting" to tell a reader that
    // retrying cannot help. If this wording moves, that arm goes silently dead.
    await expect(
      supabaseRadarStore().add('ws-1', { name: 'A', url: 'https://e.com', kind: 'website' }),
    ).rejects.toThrow(/not collecting/)
  })
})
