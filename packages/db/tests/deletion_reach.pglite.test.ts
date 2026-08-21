import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, tenantTables } from './helpers/pglite-tenant'

/**
 * HOW FAR A SELF-SERVE DELETE COULD REACH — measured, not remembered.
 *
 * ── WHY THIS TEST EXISTS ─────────────────────────────────────────────────────
 * `your-data-panel.tsx` renders "Delete everything" as a PARAGRAPH rather than a
 * button, and the whole justification is a measurement: most of a workspace's
 * tables have no DELETE policy for members, so a button would delete part of it
 * and report success — the worst kind of failure, because the customer believes
 * their data is gone and it is not.
 *
 * That measurement was written into a comment on 2026-08-19 as "30 tables, 15
 * without". By 2026-08-21 it was 39 and 20, and nothing had noticed. A number in
 * a comment is a claim nobody checks, and this file exists so that the one
 * holding up a DPDP decision is checked on every gate run.
 *
 * ── IT DOES NOT ASSERT AN EXACT COUNT ────────────────────────────────────────
 * Deliberately. Pinning 20 would fail every time a migration lands, which trains
 * people to edit the number rather than think about it — the mistake this repo
 * already recorded once (LEARNINGS, 2026-08-13, ALPHA_GATE.failingCodes). What
 * is asserted is the PROPERTY the paragraph depends on: that a member-driven
 * delete genuinely cannot reach everything, and specifically cannot reach the
 * tables holding the most personal data. The counts are printed so the comment
 * can be corrected from a real number when somebody does look.
 */

let db: PGlite

/** The tables the panel names by hand as the reason there is no button. */
const NAMED_IN_THE_PANEL = ['brand_memory', 'inbox_threads', 'inbox_messages', 'leads']

const PANEL = resolve(
  import.meta.dirname,
  '../../../apps/web/src/components/settings/your-data-panel.tsx',
)

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

async function withoutMemberDelete(): Promise<string[]> {
  const tables = await tenantTables(db)
  const policies = (
    await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public'`,
    )
  ).rows
  const deletable = new Set(
    policies.filter((p) => p.cmd === 'DELETE' || p.cmd === 'ALL').map((p) => p.tablename),
  )
  return tables.filter((t) => !deletable.has(t))
}

describe('a self-serve delete could not do what it said', () => {
  it('cannot reach a substantial share of what a workspace owns', async () => {
    const tables = await tenantTables(db)
    const blocked = await withoutMemberDelete()
    // Printed so the comment in your-data-panel.tsx can be corrected from a real
    // number rather than from memory.
    console.info(
      `[deletion reach] ${tables.length} workspace-owned tables; ` +
        `${blocked.length} with no member DELETE policy: ${blocked.join(', ')}`,
    )
    expect(blocked.length).toBeGreaterThan(0)
  })

  it('cannot reach the four tables the panel names, leads included', async () => {
    // These four are the argument. If a member could delete them, the paragraph
    // would be wrong and the button should exist.
    const blocked = new Set(await withoutMemberDelete())
    for (const table of NAMED_IN_THE_PANEL) {
      expect(blocked.has(table), `${table} is now member-deletable`).toBe(true)
    }
  })

  it('the panel still names enquiries in what a deletion removes', () => {
    // The DPDP half the export cannot cover: a lead is a third party's name,
    // address and number, and the deletion route has to say it goes.
    const source = readFileSync(PANEL, 'utf8')
    const deleteSection = source.slice(source.indexOf('Delete everything'))
    expect(deleteSection).toMatch(/enquiries/i)
    // And it must not promise the credit record goes, because it does not.
    expect(deleteSection).toMatch(/credit and payment record is kept/i)
  })

  it('the panel renders deletion as a paragraph and never as a disabled button', () => {
    const source = readFileSync(PANEL, 'utf8')
    const deleteSection = source.slice(source.indexOf('Delete everything'))
    // A `<button disabled>` is still announced as a button: a screen reader
    // offers the action, the reader takes it, and nothing happens.
    expect(deleteSection).not.toMatch(/<button/i)
    expect(deleteSection).not.toMatch(/<Button/)
  })
})
