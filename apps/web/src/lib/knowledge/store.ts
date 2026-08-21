import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { staleIndexing, type KnowledgeFailureCode } from './failure-copy'

/**
 * Reading the library. Every query here runs under the caller's own RLS —
 * `createServerSupabase` carries the Clerk session token and there is no
 * service-role client in apps/web at all.
 *
 * ── THE FOUR ANSWERS, KEPT APART ────────────────────────────────────────────
 * `no-workspace`, `empty`, `ok` and `unreadable` are four different facts and
 * three of them are frequently collapsed into "nothing here". They are not the
 * same: a person with no workspace has nothing to see, a person with an empty
 * library has nothing YET, and a failed query means Sahoda does not know. The
 * screen says something different for each, and it can only do that if the read
 * keeps them apart. `lib/inbox/emptiness.ts` makes the same argument at length.
 */

export interface KnowledgeDocumentRow {
  id: string
  title: string
  source_kind: 'pdf' | 'text' | 'url'
  source_ref: string
  storage_path: string | null
  bytes: number | null
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
  failure_code: KnowledgeFailureCode | null
  failure_detail: string | null
  chunk_count: number
  char_count: number
  addressed_instructions: number
  instruction_samples: unknown
  created_at: string
  updated_at: string
  indexed_at: string | null
}

/**
 * What the SCREEN shows, which is the stored row plus one derived state.
 *
 * `interrupted` is not in the database and cannot be: a process killed
 * mid-parse — a platform timeout, a deploy, an out-of-memory — does not run a
 * `finally`, so nothing is left alive to write the failure. Deriving it on read
 * is what stops a document sitting at "Processing" forever with no way back.
 * See `STALE_INDEXING_MS`, which is derived from the route's own `maxDuration`
 * rather than picked.
 */
export type ShownStatus = 'pending' | 'indexing' | 'indexed' | 'failed' | 'interrupted'

export interface KnowledgeDocument extends KnowledgeDocumentRow {
  shownStatus: ShownStatus
}

export type LibraryRead =
  | { status: 'ok'; documents: KnowledgeDocument[]; workspaceId: string }
  | { status: 'empty'; workspaceId: string }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

const DOCUMENT_COLUMNS =
  'id, title, source_kind, source_ref, storage_path, bytes, status, failure_code, failure_detail, chunk_count, char_count, addressed_instructions, instruction_samples, created_at, updated_at, indexed_at'

function withShownStatus(row: KnowledgeDocumentRow, now: number): KnowledgeDocument {
  return {
    ...row,
    shownStatus: staleIndexing(row.status, row.updated_at, now) ? 'interrupted' : row.status,
  }
}

/**
 * The whole library, newest first.
 *
 * Memoised per request because the page body and the count in the header both
 * need it, and without this they issue the same query twice — and could disagree
 * if a write landed between them.
 */
export const readLibrary = cache(async (): Promise<LibraryRead> => {
  try {
    const workspace = await readActiveWorkspace()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select(DOCUMENT_COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[knowledge] library read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    if (!data || data.length === 0) return { status: 'empty', workspaceId }

    const now = Date.now()
    return {
      status: 'ok',
      workspaceId,
      documents: (data as KnowledgeDocumentRow[]).map((row) => withShownStatus(row, now)),
    }
  } catch (error) {
    console.error('[knowledge] library read threw', error instanceof Error ? error.message : '?')
    return { status: 'unreadable' }
  }
})

/**
 * How many documents are INDEXED — the only number a tile may render.
 *
 * ── WHY THIS FUNCTION EXISTS RATHER THAN A LENGTH ───────────────────────────
 * The reference design shows `Knowledge — 120 docs`. A peer refused to render it
 * because there was no table behind it, and `/home` deleted the tile rather than
 * print a permanent em dash for a quantity that did not exist. The table exists
 * now, so the count is real — and it is a count of documents SEARCH CAN RETURN,
 * not of rows. A document that failed to parse is in the table and is not in the
 * library in any sense the reader means.
 *
 * `null` is "the read did not answer", which is a different thing from zero and
 * must render differently. Zero is knowledge and renders as 0.
 */
export async function countIndexedDocuments(): Promise<number | null> {
  const library = await readLibrary()
  if (library.status === 'no-workspace') return 0
  if (library.status === 'empty') return 0
  if (library.status === 'unreadable') return null
  return library.documents.filter((d) => d.status === 'indexed').length
}

export interface KnowledgePassage {
  id: string
  document_id: string
  document_title: string
  ordinal: number
  text: string
}

export type SearchRead =
  | { status: 'ok'; passages: KnowledgePassage[] }
  | { status: 'unreadable' }
  | { status: 'no-workspace' }

/**
 * Search the library.
 *
 * ── AGAINST `tsv`, AND NEVER AGAINST `text` ─────────────────────────────────
 * `.textSearch('tsv', …)` matches the GENERATED column, which is what the GIN
 * index is built over. Pointing the same call at `text` makes PostgREST wrap it
 * in `to_tsvector(text)` at query time — a different expression, no index, and a
 * full scan that gets slower for every customer as the table grows.
 *
 * `knowledge_current_chunks` and not `knowledge_chunks`: the view is what knows
 * which passages belong to a document's current read. Measured against the real
 * project — 420ms across ~3,900 passages.
 */
export async function searchLibrary(query: string, limit = 20): Promise<SearchRead> {
  const trimmed = query.trim()
  if (!trimmed) return { status: 'ok', passages: [] }

  try {
    const workspace = await readActiveWorkspace()
    if (workspace.status !== 'ok') {
      return workspace.status === 'none' ? { status: 'no-workspace' } : { status: 'unreadable' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('knowledge_current_chunks')
      .select('id, document_id, document_title, ordinal, text')
      .textSearch('tsv', trimmed, { type: 'plain', config: 'english' })
      .limit(limit)

    if (error) {
      console.error('[knowledge] search failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    return { status: 'ok', passages: (data ?? []) as KnowledgePassage[] }
  } catch (error) {
    console.error('[knowledge] search threw', error instanceof Error ? error.message : '?')
    return { status: 'unreadable' }
  }
}

/**
 * Every current passage in the library, oldest document first.
 *
 * What a library-backed resolve draws on when nothing narrower was asked for.
 * Bounded by the caller, because an evidence set has a ceiling and a read that
 * fetched the whole library to show twenty-five of it would be paying for the
 * rest.
 */
export async function readCurrentPassages(limit: number): Promise<SearchRead> {
  try {
    const workspace = await readActiveWorkspace()
    if (workspace.status !== 'ok') {
      return workspace.status === 'none' ? { status: 'no-workspace' } : { status: 'unreadable' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('knowledge_current_chunks')
      .select('id, document_id, document_title, ordinal, text')
      .order('document_id', { ascending: true })
      .order('ordinal', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[knowledge] passages read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    return { status: 'ok', passages: (data ?? []) as KnowledgePassage[] }
  } catch (error) {
    console.error('[knowledge] passages read threw', error instanceof Error ? error.message : '?')
    return { status: 'unreadable' }
  }
}
