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
import { EXPORT_TABLES, EXPORTABLE_TABLES, UNEXPORTABLE_TABLES } from './export-manifest'

const WORKSPACE = '11111111-2222-3333-4444-555555555555'
const NOW = new Date('2026-08-19T12:00:00.000Z')

/**
 * A Supabase stand-in whose `from(table)` chain resolves to whatever the handler
 * says. Records the table names and the workspace filter each call used, so a
 * query that forgot to scope itself is visible rather than merely untested.
 */
function fakeSupabase(handler: (table: string) => { data: unknown; error: unknown }) {
  const asked: Array<{ table: string; column: string; value: unknown; limit: number }> = []
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              return {
                limit(limit: number) {
                  asked.push({ table, column, value, limit })
                  return Promise.resolve(handler(table))
                },
              }
            },
          }
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, asked }
}

const allEmpty = () => ({ data: [], error: null })

describe('what the export contains', () => {
  it('reads every readable table, scoped to the workspace, and nothing else', async () => {
    const { client, asked } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)

    expect(result.included.map((t) => t.table).sort()).toEqual(
      EXPORTABLE_TABLES.map((t) => t.table).sort(),
    )
    // Every single read is filtered by workspace_id. A missing filter on ONE
    // table is a cross-tenant export, and it would not be visible in the row
    // counts of an empty fixture.
    expect(asked.every((a) => a.column === 'workspace_id' && a.value === WORKSPACE)).toBe(true)
    expect(asked).toHaveLength(EXPORTABLE_TABLES.length)
  })

  it('stamps its own format and instant', async () => {
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)
    expect(result.format).toBe('sahoda.workspace-export.v1')
    expect(result.generatedAt).toBe('2026-08-19T12:00:00.000Z')
    expect(result.workspaceId).toBe(WORKSPACE)
  })

  it('carries the rows through unchanged', async () => {
    const row = { id: 'p1', workspace_id: WORKSPACE, body: 'Chai at 5', odd: { nested: [1, 2] } }
    const { client } = fakeSupabase((table) =>
      table === 'posts' ? { data: [row], error: null } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)
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
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)

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
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)

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
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)

    expect(result.notIncluded.find((t) => t.table === 'brand_memory')?.reason).toContain('boom')
    expect(result.included.length).toBe(EXPORTABLE_TABLES.length - 1)
  })

  it('accounts for every table in the manifest, in one list or the other', async () => {
    // The completeness invariant. Nothing may be silently absent from BOTH
    // lists — that is precisely how a table nobody remembered disappears.
    const { client } = fakeSupabase(allEmpty)
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)
    const seen = [...result.included.map((t) => t.table), ...result.notIncluded.map((t) => t.table)]
    expect(seen.sort()).toEqual(EXPORT_TABLES.map((t) => t.table).sort())
  })

  it('says so when a table hit the row cap', async () => {
    const many = Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({ id: `r${i}` }))
    const { client } = fakeSupabase((table) =>
      table === 'inbox_messages' ? { data: many, error: null } : allEmpty(),
    )
    const result = await buildWorkspaceExport(client, WORKSPACE, NOW)

    expect(result.included.find((t) => t.table === 'inbox_messages')?.truncated).toBe(true)
    // And a table under the cap must NOT claim truncation, or the flag means
    // nothing and every reader learns to ignore it.
    expect(result.included.find((t) => t.table === 'posts')?.truncated).toBe(false)
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
