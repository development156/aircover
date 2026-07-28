import { describe, it, expect, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient } from './helpers/db'

/**
 * The changelog author rotation (doc 13 §8, acceptance criterion in §17).
 *
 * Two claims that are easy to conflate and are tested separately here:
 *
 *   1. The rotation is DETERMINISTIC and assigned server-side. No client sends an
 *      author; the trigger derives it from the global sequence, so it cannot be
 *      influenced by who or what wrote the entry.
 *   2. Three consecutive entries read DIVAS → GIRIJA → DIVAS AND GIRIJA. This is
 *      why the sequence starts at 0: with authors[seq % 3] and a bigserial
 *      starting at 1, the first entry would be GIRIJA and §17 would fail while
 *      §8's formula still held.
 *
 * The test is written against whatever the sequence happens to be at — it does
 * not assume an empty table — because a shared dev project never is.
 */
describe.skipIf(!hasRlsEnv)('ops_changelog author cycle', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  const run = Date.now()
  const AUTHORS = ['DIVAS', 'GIRIJA', 'DIVAS AND GIRIJA'] as const
  const created: string[] = []

  afterAll(async () => {
    if (created.length > 0) await svc().from('ops_changelog').delete().in('id', created)
  })

  async function write(title: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await svc()
      .from('ops_changelog')
      .insert({
        title,
        summary_plain: 'A fixture entry, written to check who gets the byline.',
        kind: 'docs',
        ...extra,
      })
      .select('id,seq,author,author_overridden')
      .single()
    if (error) throw new Error(error.message)
    const row = data as { id: string; seq: number; author: string; author_overridden: boolean }
    created.push(row.id)
    return row
  }

  it('assigns author = authors[seq % 3] server-side, with no author supplied', async () => {
    const row = await write(`cycle probe ${run}`)

    expect(row.author).toBe(AUTHORS[row.seq % 3])
    expect(row.author_overridden).toBe(false)
  })

  it('runs DIVAS → GIRIJA → DIVAS AND GIRIJA across the three sequence residues', async () => {
    // §17 phrases this as "three consecutive entries". Asserting literal
    // consecutiveness would be flaky and, worse, would be testing the wrong
    // thing: vitest runs test files in parallel and nextval() leaves permanent
    // gaps on rollback, so no test owns a contiguous run of the sequence.
    //
    // The claim that actually matters — and that the ordered one follows from —
    // is that the author is a pure function of seq. Cover all three residues and
    // check each maps to its member of the trio; consecutive seq values then
    // read DIVAS → GIRIJA → DIVAS AND GIRIJA by arithmetic.
    const rows: { seq: number; author: string }[] = []
    while (new Set(rows.map((r) => r.seq % 3)).size < 3 && rows.length < 9) {
      rows.push(await write(`residue ${run}-${rows.length}`))
    }

    expect(new Set(rows.map((r) => r.seq % 3)).size).toBe(3)
    for (const row of rows) {
      expect(row.author).toBe(AUTHORS[row.seq % 3])
    }

    // Spelled out by residue so a failure names the byline that went wrong.
    expect(rows.find((r) => r.seq % 3 === 0)?.author).toBe('DIVAS')
    expect(rows.find((r) => r.seq % 3 === 1)?.author).toBe('GIRIJA')
    expect(rows.find((r) => r.seq % 3 === 2)?.author).toBe('DIVAS AND GIRIJA')
  })

  it('honours a manual author and flags it, without shifting the cycle', async () => {
    const overridden = await write(`override ${run}`, { author: 'DIVAS AND GIRIJA' })
    expect(overridden.author).toBe('DIVAS AND GIRIJA')
    expect(overridden.author_overridden).toBe(true)

    // "Overrides don't shift the cycle" (doc 13 §8) means the derivation is
    // untouched: the next entry's author is still authors[its own seq % 3].
    //
    // It does NOT mean seq advances by exactly one per entry, and asserting that
    // is how the first version of this test failed. Two reasons: vitest runs test
    // files in parallel and ops_rls.test.ts writes a changelog row too, and —
    // more fundamentally — nextval() is non-transactional, so a rolled-back
    // insert leaves a permanent gap. Position in the sequence is not the claim.
    const after = await write(`after override ${run}`)
    expect(after.seq).toBeGreaterThan(overridden.seq)
    expect(after.author_overridden).toBe(false)
    expect(after.author).toBe(AUTHORS[after.seq % 3])
  })

  it('refuses an author outside the fixed trio', async () => {
    const { error } = await svc()
      .from('ops_changelog')
      .insert({
        title: `bad author ${run}`,
        summary_plain: 'Should never land.',
        kind: 'docs',
        author: 'SOMEONE ELSE',
      })
    expect(error).toBeTruthy()
  })

  it('refuses an entry with no plain-English summary', async () => {
    // summary_plain is mandatory by doc 13 §8 — the whole point of the changelog
    // is that a non-technical owner can read it.
    const { error } = await svc()
      .from('ops_changelog')
      .insert({ title: `no summary ${run}`, kind: 'docs' })
    expect(error).toBeTruthy()
  })
})
