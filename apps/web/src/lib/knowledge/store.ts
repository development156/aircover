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
  | {
      status: 'ok'
      documents: KnowledgeDocument[]
      workspaceId: string
      /**
       * The read hit `LIST_LIMIT` — there are documents this list is not
       * showing. `true` is a bounded fact, never a fabricated count of the
       * hidden rows: the count line and the empty message are only honest if
       * they can SAY the list is capped. `lib/campaigns/read.ts` carries the
       * same flag for the same reason.
       */
      truncated: boolean
    }
  | { status: 'empty'; workspaceId: string }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * The most documents one library read returns. Following `campaigns/read.ts`:
 * a plain `.limit(LIST_LIMIT)` with `truncated = rows >= LIST_LIMIT`, rather
 * than a fabricated total. `readLibrary` was previously unbounded, so a large
 * library ran a full scan and rendered every row on one page.
 */
export const LIST_LIMIT = 200

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
      .limit(LIST_LIMIT)

    if (error) {
      console.error('[knowledge] library read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    if (!data || data.length === 0) return { status: 'empty', workspaceId }

    const now = Date.now()
    return {
      status: 'ok',
      workspaceId,
      // Measured on the ROWS RETURNED. At exactly LIST_LIMIT the read cannot
      // tell a full page from a truncated one, so it reports truncated — the
      // same conservative call campaigns makes, and the honest direction: a
      // list that says it MIGHT be capped when it is exactly full beats one
      // that says it is whole when it is not.
      truncated: data.length >= LIST_LIMIT,
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

/**
 * A `field_meta.source` string → the document and passage it names.
 *
 * ── THE CITATION SHAPE ──────────────────────────────────────────────────────
 *   `document:<uuid>`            the whole document
 *   `document:<uuid>#<ordinal>`  one passage of it
 *
 * Anything else — `owner`, `model:brand_guidelines`, a URL, a pack path — is not
 * a library citation and returns nothing. That is the ordinary case and not a
 * degraded read.
 */
export function parseDocumentCitation(
  source: string | undefined,
): { documentId: string; ordinal: number | null } | null {
  if (!source || !source.startsWith('document:')) return null
  const rest = source.slice('document:'.length)
  const hash = rest.indexOf('#')
  if (hash === -1) return { documentId: rest, ordinal: null }
  const ordinal = Number(rest.slice(hash + 1))
  return {
    documentId: rest.slice(0, hash),
    ordinal: Number.isInteger(ordinal) && ordinal >= 0 ? ordinal : null,
  }
}

export interface CitedPassage {
  documentId: string
  documentTitle: string
  ordinal: number | null
  /** The passage, or `null` when only the document was cited or it has gone. */
  text: string | null
  /** True when the document itself is no longer in the library. */
  missing: boolean
}

/**
 * Resolve a batch of citations to what they name, in ONE round trip.
 *
 * ── WHY A DELETED DOCUMENT IS `missing` AND NOT AN ERROR ────────────────────
 * `delete_knowledge_document` deliberately does NOT retract what the brain
 * learned: a fact the owner confirmed is theirs, and silently unlearning it
 * would be a second and larger surprise. So a field can outlive its source, and
 * the console has to say "this came from a document you have since deleted"
 * rather than either hiding the field or pretending the document is still there.
 */
export async function readCitedPassages(
  sources: readonly string[],
): Promise<Map<string, CitedPassage>> {
  const out = new Map<string, CitedPassage>()

  const parsed = sources
    .map((source) => ({ source, cite: parseDocumentCitation(source) }))
    .filter((entry): entry is { source: string; cite: NonNullable<typeof entry.cite> } =>
      Boolean(entry.cite),
    )
  if (parsed.length === 0) return out

  try {
    const workspace = await readActiveWorkspace()
    if (workspace.status !== 'ok') return out

    const ids = [...new Set(parsed.map((entry) => entry.cite.documentId))]
    const supabase = createServerSupabase()

    const [documents, passages] = await Promise.all([
      supabase.from('knowledge_documents').select('id, title').in('id', ids),
      supabase
        .from('knowledge_current_chunks')
        .select('document_id, ordinal, text')
        .in('document_id', ids),
    ])

    const titles = new Map(
      ((documents.data ?? []) as { id: string; title: string }[]).map((d) => [d.id, d.title]),
    )
    const text = new Map(
      ((passages.data ?? []) as { document_id: string; ordinal: number; text: string }[]).map(
        (c) => [`${c.document_id}#${c.ordinal}`, c.text],
      ),
    )

    for (const { source, cite } of parsed) {
      const title = titles.get(cite.documentId)
      out.set(source, {
        documentId: cite.documentId,
        documentTitle: title ?? 'a document you have deleted',
        ordinal: cite.ordinal,
        text:
          cite.ordinal === null ? null : (text.get(`${cite.documentId}#${cite.ordinal}`) ?? null),
        missing: title === undefined,
      })
    }
  } catch (error) {
    // A failed read leaves the map EMPTY, which renders no evidence — the same
    // as a field that has none. It must never render a partial citation, which
    // would be a claim about where a value came from built from a query that
    // did not answer.
    console.error('[knowledge] citation read threw', error instanceof Error ? error.message : '?')
  }

  return out
}

/**
 * How many suggestions from a PREVIOUS library read are still waiting.
 *
 * ── WHY THIS NUMBER EXISTS ──────────────────────────────────────────────────
 * "Read my library" spends 50 credits, and MEASURED against
 * `20260822000200_propose_memory_event.sql`: it has no dedupe, no unique key and
 * no `on conflict`. A second press does not refresh the suggestions from the
 * first, it writes another set BESIDE them and charges again. Two accidental
 * presses cost 100 credits and leave the resolution console holding each
 * suggestion twice.
 *
 * So the button asks before spending, and this is the fact it asks with: it can
 * say what is already waiting rather than a general warning about credits.
 *
 * ── WHY IT COUNTS EVIDENCE AND NOT SOURCE ───────────────────────────────────
 * `memory_events.source = 'insight'` has TWO writers: this feature and the
 * Loop's reflect stage (`lib/loop/store.ts:423`), and the table has no column
 * naming which one wrote a row. Counting by source would tell somebody the
 * library owes them suggestions the Loop actually produced. A library proposal
 * carries a `documentId` in `evidence_refs`; a Loop patch carries a
 * `loop_cycle_id` in `diff`. This counts the first and nothing else.
 *
 * `null` is "the read did not answer", never zero. The caller must not turn a
 * failed read into "nothing is waiting", because that is the one wrong answer
 * that removes the warning.
 */
export async function countPendingLibrarySuggestions(): Promise<number | null> {
  try {
    const workspace = await readActiveWorkspace()
    if (workspace.status !== 'ok') return workspace.status === 'none' ? 0 : null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('memory_events')
      .select('evidence_refs')
      .eq('status', 'pending')

    if (error) return null

    return (data ?? []).filter((row) => {
      const refs = (row as { evidence_refs?: unknown }).evidence_refs
      return (
        Array.isArray(refs) && refs.some((r) => isRecord(r) && typeof r.documentId === 'string')
      )
    }).length
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
