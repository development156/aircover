import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, tenantTables } from './helpers/pglite-tenant'

/**
 * DOES `docs/38_Data_Handling.md` STILL DESCRIBE THIS DATABASE?
 *
 * ── WHY A DOCUMENT GETS A TEST ───────────────────────────────────────────────
 * Because this one is handed to a lawyer, and because the document it replaces
 * was wrong in three places within four days of being written — "30 tables" when
 * there were 39, "15 of 30" when it was 20 of 39, and "your email belongs to
 * Clerk" when a copy was in `users_profile`. Every one of those was measured
 * correctly, once, by a person, and then typed into prose where nothing could
 * check it again.
 *
 * A table added next month is a table doc 38 does not mention, and the sentence
 * "here is everything Sahoda holds about you" becomes false without anybody
 * touching that file. This is the thing that fails instead.
 *
 * ── WHAT IT DOES NOT CHECK ───────────────────────────────────────────────────
 * That the WORDS are right. Nothing can. It checks that every table the database
 * has is named in the document, that the retained set the document promises is
 * the retained set the erasure actually uses, and that the two claims a customer
 * most relies on are present. The prose around them is a human's job.
 */

const DOC = resolve(import.meta.dirname, '../../../docs/38_Data_Handling.md')

let db: PGlite
let doc: string
let tables: string[]

beforeAll(async () => {
  doc = readFileSync(DOC, 'utf8')
  db = await bootFullSchema()
  tables = await tenantTables(db)
}, 120_000)

describe('the data-handling document matches the database', () => {
  it('names every workspace-owned table', () => {
    // Named, not counted. "1 table is missing" sends somebody hunting; the name
    // sends them to the paragraph.
    const missing = tables.filter((t) => !doc.includes(`\`${t}\``))
    expect(
      missing,
      `these tables exist and docs/38 does not mention them, so the document claims to ` +
        `describe data it does not describe: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('states a table COUNT that is the real one', () => {
    /**
     * The one place a pinned number is right rather than wrong.
     *
     * `deletion_reach.pglite.test.ts` deliberately refuses to pin a count,
     * because failing on every migration trains people to edit the number rather
     * than think. This is the opposite case: the number is a sentence in a
     * document handed to a lawyer, so it MUST be right, and the correct response
     * to a schema change is exactly "go and update the document".
     *
     * MEASURED while writing this file: the document said 47 and the branch had
     * 48, twenty minutes after the document was written, by the person who wrote
     * the paragraph warning about stale numbers.
     */
    const stated = /\*\*MEASURED [0-9-]+: (\d+) tables\.\*\*/.exec(doc)
    expect(stated, 'docs/38 §2 no longer states a measured table count').not.toBeNull()
    expect(
      Number(stated?.[1]),
      `docs/38 says ${stated?.[1]} workspace-owned tables and the migrations create ${tables.length}`,
    ).toBe(tables.length)
  })

  it('names the three tables no workspace_id sweep can reach', () => {
    // The blind spot that produced the gap this whole lane closed. If the
    // document ever stops naming them, the next person reading it inherits the
    // same blind spot.
    for (const table of ['workspaces', 'users_profile', 'connection_secrets']) {
      expect(doc, `docs/38 no longer names ${table}`).toContain(`\`${table}\``)
    }
  })

  it('promises exactly what the erasure actually keeps', async () => {
    const retained = (await db.query<{ t: string[] }>(`select app.erasure_retained_tables() as t`))
      .rows[0]!.t

    /**
     * The document's table of what survives a deletion, read back out of it —
     * BOUNDED to that one table.
     *
     * The first version sliced to the end of the document, which quietly
     * swallowed every later table whose first cell is a code span: §7.1's list
     * of storage buckets made this assertion claim the erasure keeps `media`.
     * An unbounded slice reads correctly right up until somebody adds a section.
     */
    const from = doc.indexOf('**What is kept, and why:**')
    const to = doc.indexOf('Retention under a legal obligation', from)
    expect(from, 'docs/38 §4.2 no longer has a "what is kept" table').toBeGreaterThan(-1)
    expect(to, 'the end marker of that table has moved').toBeGreaterThan(from)
    const claimed = [...doc.slice(from, to).matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]!)

    expect(claimed.sort(), 'docs/38 §4.2 and app.erasure_retained_tables() disagree').toEqual(
      [...retained].sort(),
    )
  })

  it('states the two things a customer is most likely to rely on', () => {
    // Both are load-bearing sentences: one is the reason a kept record is
    // lawful, the other is the disclosure that stops it reading as anonymous.
    expect(doc).toMatch(/tax and company law/i)
    expect(doc).toMatch(/one row carries a plain email address/i)
  })

  it('says the ledger redaction is built and NOT switched on', () => {
    // The policy decision this lane deliberately did not take. If somebody later
    // switches it on, this assertion is where they are made to say so.
    expect(doc).toMatch(/question for counsel/i)
    expect(doc).toMatch(/Nothing calls it/i)
  })
})
