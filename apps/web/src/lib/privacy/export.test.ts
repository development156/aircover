/**
 * The export, and the three ways it could quietly under-report.
 *
 * Every test here is about the SAME failure: a file that looks complete and is
 * not. That is the only failure mode of a subject-access export that matters,
 * because the person reading it has no way to check. So the assertions are about
 * `notIncluded` at least as much as about the rows.
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { buildWorkspaceExport, MAX_ROWS_PER_TABLE } from './export'
import {
  EXPORT_TABLES,
  EXPORTABLE_TABLES,
  OMITTED_BY_DESIGN,
  UNEXPORTABLE_TABLES,
} from './export-manifest'

/**
 * The two tables owned by a key that is not `workspace_id`, read by name.
 *
 * They are listed HERE, by hand, on purpose. Everything else in this file is
 * derived from the manifest, and derivation is what keeps it honest — but these
 * two are the exception the manifest structurally cannot describe, so a test
 * that derived them would be deriving them from the same blind spot.
 */
const BY_KEY = ['workspaces', 'users_profile']

const WORKSPACE = '11111111-2222-3333-4444-555555555555'
const NOW = new Date('2026-08-19T12:00:00.000Z')
const USER = 'user_export_subject'

/**
 * A Supabase stand-in whose `from(table)` chain resolves to whatever the handler
 * says. Records the table names and the workspace filter each call used, so a
 * query that forgot to scope itself is visible rather than merely untested.
 */
function fakeSupabase(handler: (table: string) => { data: unknown; error: unknown }) {
  const asked: Array<{ table: string; column: string; value: unknown; limit: number | null }> = []
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              // A THENABLE that is also chainable. `readTable` calls `.limit()`;
              // `readByKey` awaits the `eq` directly — because `workspaces` and
              // `users_profile` are single rows keyed by something other than
              // `workspace_id` and a row cap on them would be noise. A fake that
              // only supported the `.limit()` shape would make the second reader
              // untestable, and untestable reads exactly like untested.
              const record = (limit: number | null) => {
                asked.push({ table, column, value, limit })
                return Promise.resolve(handler(table))
              }
              return {
                limit: (limit: number) => record(limit),
                then: (
                  resolve: (v: { data: unknown; error: unknown }) => unknown,
                  reject?: (e: unknown) => unknown,
                ) => record(null).then(resolve, reject),
              }
            },
          }
        },
      }
    },
    storage: {
      from() {
        return {
          list: () => Promise.resolve({ data: [], error: null }),
        }
      },
    },
  }
  return { client: client as unknown as SupabaseClient, asked }
}

const allEmpty = () => ({ data: [], error: null })

describe('what the export contains', () => {
  it('reads every readable table, scoped to the workspace, and nothing else', async () => {
    const { client, asked } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    expect(result.included.map((t) => t.table).sort()).toEqual(
      [...EXPORTABLE_TABLES.map((t) => t.table), ...BY_KEY].sort(),
    )

    // Every workspace-owned read is filtered by workspace_id. A missing filter
    // on ONE table is a cross-tenant export, and it would not be visible in the
    // row counts of an empty fixture.
    const sweep = asked.filter((a) => !BY_KEY.includes(a.table))
    expect(sweep.every((a) => a.column === 'workspace_id' && a.value === WORKSPACE)).toBe(true)
    expect(sweep).toHaveLength(EXPORTABLE_TABLES.length)

    // And the two by-key reads are scoped by THEIR key, to THIS workspace and
    // THIS person. A `users_profile` read that forgot its filter would hand the
    // customer every other customer's email address.
    const byKey = asked.filter((a) => BY_KEY.includes(a.table))
    expect(byKey).toHaveLength(2)
    expect(byKey.find((a) => a.table === 'workspaces')).toMatchObject({
      column: 'id',
      value: WORKSPACE,
    })
    expect(byKey.find((a) => a.table === 'users_profile')).toMatchObject({
      column: 'user_id',
      value: USER,
    })
  })

  it('stamps its own format and instant', async () => {
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })
    expect(result.format).toBe('sahoda.workspace-export.v2')
    expect(result.generatedAt).toBe('2026-08-19T12:00:00.000Z')
    expect(result.workspaceId).toBe(WORKSPACE)
  })

  it('carries the rows through unchanged', async () => {
    const row = { id: 'p1', workspace_id: WORKSPACE, body: 'Chai at 5', odd: { nested: [1, 2] } }
    const { client } = fakeSupabase((table) =>
      table === 'posts' ? { data: [row], error: null } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })
    const posts = result.included.find((t) => t.table === 'posts')
    // Deep equality, not a shape check: an export is evidence, and a
    // transformation is a place for a mistake to hide.
    expect(posts?.rows).toEqual([row])
  })
})

describe('what the export admits it does NOT contain', () => {
  it('names a table with no read policy instead of showing it as empty', async () => {
    // THE CENTRAL CASE. ai_provider_logs has RLS on and no policies at all, so
    // PostgREST answers [] — indistinguishable from "you have none". Rendering
    // that as an empty array would be the export asserting a fact about the
    // customer's data that is false.
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    expect(UNEXPORTABLE_TABLES.length).toBeGreaterThan(0)
    for (const entry of UNEXPORTABLE_TABLES) {
      expect(result.included.map((t) => t.table)).not.toContain(entry.table)
      const omitted = result.notIncluded.find((t) => t.table === entry.table)
      expect(omitted, `${entry.table} must be named as omitted`).toBeDefined()
      expect(omitted?.reason).toMatch(/no read policy/i)
      // And it says so in words a shop owner can act on.
      expect(omitted?.reason).toMatch(/not empty/i)
    }
  })

  it('reports a failed read rather than shortening the file in silence', async () => {
    const { client } = fakeSupabase((table) =>
      table === 'posts' ? { data: null, error: { message: 'connection reset' } } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    expect(result.included.map((t) => t.table)).not.toContain('posts')
    const omitted = result.notIncluded.find((t) => t.table === 'posts')
    expect(omitted?.reason).toContain('connection reset')
  })

  it('reports a THROWN read too, and keeps going', async () => {
    // One table exploding must not cost the customer the other twenty-eight.
    const { client } = fakeSupabase((table) => {
      if (table === 'brand_memory') throw new Error('boom')
      return allEmpty()
    })
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    expect(result.notIncluded.find((t) => t.table === 'brand_memory')?.reason).toContain('boom')
    expect(result.included.length).toBe(EXPORTABLE_TABLES.length + BY_KEY.length - 1)
  })

  it('accounts for every table in the manifest, in one list or the other', async () => {
    // The completeness invariant. Nothing may be silently absent from BOTH
    // lists — that is precisely how a table nobody remembered disappears.
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })
    const seen = [...result.included.map((t) => t.table), ...result.notIncluded.map((t) => t.table)]
    expect(seen.sort()).toEqual(
      [
        ...EXPORT_TABLES.map((t) => t.table),
        ...BY_KEY,
        ...OMITTED_BY_DESIGN.map((t) => t.table),
      ].sort(),
    )
  })

  it('names every permanent omission IN the file, with a reason a customer can read', async () => {
    // An omission the customer cannot see is a lie by silence. This is the
    // assertion that keeps `connection_secrets` — the OAuth tokens — from simply
    // being absent, which is indistinguishable from "you have none".
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })
    for (const omission of OMITTED_BY_DESIGN) {
      const named = result.notIncluded.find((t) => t.table === omission.table)
      expect(named, `${omission.table} is omitted and not named`).toBeDefined()
      // A reason, not a label. "Not included" tells the reader nothing they did
      // not already know from the absence.
      expect((named?.reason ?? '').length).toBeGreaterThan(40)
    }
    expect(result.notIncluded.find((t) => t.table === 'connection_secrets')?.reason).toMatch(
      /never shown to anyone/i,
    )
  })

  it('reports the profile as NOT included when there is no signed-in person', async () => {
    // The one place a null could quietly shorten the export. It is reported.
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: null,
      now: NOW,
    })
    expect(result.included.map((t) => t.table)).not.toContain('users_profile')
    expect(result.notIncluded.find((t) => t.table === 'users_profile')?.reason).toMatch(
      /could not be identified/i,
    )
  })

  it('says so when a table hit the row cap', async () => {
    const many = Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({ id: `r${i}` }))
    const { client } = fakeSupabase((table) =>
      table === 'inbox_messages' ? { data: many, error: null } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    expect(result.included.find((t) => t.table === 'inbox_messages')?.truncated).toBe(true)
    // And a table under the cap must NOT claim truncation, or the flag means
    // nothing and every reader learns to ignore it.
    expect(result.included.find((t) => t.table === 'posts')?.truncated).toBe(false)
  })
})

describe('a lead is a real person, and the export carries them', () => {
  /**
   * VERIFIED, not assumed. `leads` holds a name, an email address and a phone
   * number belonging to somebody who is NOT the customer — the only personal
   * data in this database about a third party. Under DPDP the export has to
   * contain it, and the manifest being manifest-driven is a reason to believe
   * it does, not evidence.
   *
   * So this one runs the export with a lead in it and reads the row back out of
   * the file. Named on its own rather than left to the completeness sweep above,
   * because a sweep that goes green tells you nothing about WHICH table it was
   * green about.
   */
  const LEAD = {
    id: 'lead-1',
    workspace_id: WORKSPACE,
    name: 'Priya',
    email: 'priya@example.com',
    phone: '+91 90000 00000',
    message: 'Do you do birthday cakes?',
    status: 'new',
  }

  it('includes the lead, with the contact details intact', async () => {
    const { client } = fakeSupabase((table) =>
      table === 'leads' ? { data: [LEAD], error: null } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })

    const leads = result.included.find((t) => t.table === 'leads')
    expect(leads, 'leads must be exported, not omitted').toBeTruthy()
    expect(leads!.rows).toEqual([LEAD])
    // And it must NOT be on the omitted list at the same time.
    expect(result.notIncluded.find((t) => t.table === 'leads')).toBeUndefined()
  })

  it('describes it in words the person reading the file understands', async () => {
    const entry = EXPORT_TABLES.find((t) => t.table === 'leads')
    expect(entry).toMatchObject({ readability: 'readable' })
    expect(entry!.describes).toMatch(/enquir/i)
  })

  it('carries the Remix tables too, which were added the same day as this test', async () => {
    // The other half of the same rule: a table added today must be in the export
    // today, not the month somebody notices.
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, {
      workspaceId: WORKSPACE,
      userId: USER,
      now: NOW,
    })
    const included = result.included.map((t) => t.table)
    expect(included).toContain('remix_batches')
    expect(included).toContain('remix_derivatives')
  })
})

describe('the manifest itself', () => {
  it('describes every table in words a shop owner reads, not column names', async () => {
    for (const entry of EXPORT_TABLES) {
      expect(entry.describes.length, entry.table).toBeGreaterThan(3)
      expect(entry.describes, entry.table).not.toContain('_')
    }
  })

  it('splits cleanly into exportable and not, with nothing lost between them', () => {
    expect(EXPORTABLE_TABLES.length + UNEXPORTABLE_TABLES.length).toBe(EXPORT_TABLES.length)
  })
})
