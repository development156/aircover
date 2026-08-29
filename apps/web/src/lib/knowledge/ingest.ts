import 'server-only'

import { revalidatePath } from 'next/cache'
import { buildEvidenceSet, chunkForIngestion, MAX_CHUNKS_PER_DOCUMENT } from '@sahoda/research'

import { knowledgeFailure, type KnowledgeFailureCode } from './failure-copy'
import type { SourceRead } from './read-source'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Registering a document and indexing it — the one path, for every door.
 *
 * ── WHY THIS LEFT `actions/knowledge.ts` ────────────────────────────────────
 * It was module-private there, and its own comment said why it had to be one
 * function: "The alternative is four call sites that drift, and the one used
 * least is the one that ends up leaving a document at 'Processing' forever."
 *
 * The fourth caller has now arrived, and it is not a door a person presses:
 * `lib/onboarding/seed-library.ts` puts the website read at signup into the
 * library without anybody asking. Copying forty lines to reach it would have
 * created exactly the drift that comment warned about, so the function moved
 * instead.
 *
 * ── AND WHY A PLAIN MODULE RATHER THAN A SECOND ACTION ──────────────────────
 * Every export of a `'use server'` file is a callable endpoint. Exporting these
 * two from there to share them would have published two new endpoints that take
 * a workspace id as an argument — a tenant boundary handed to the caller — to
 * save an import. This module is `server-only`: it can be reached from a server
 * action or a route handler, and from nowhere a browser can post to.
 *
 * The caller is responsible for having established the workspace. Both callers
 * do: the actions through `workspaceForWrite`, the signup seam through the
 * workspace the door route already resolved and authenticated.
 */

export interface KnowledgeActionState {
  ok: boolean
  message: string
  /** Set when a document row exists, so the screen can scroll to it. */
  documentId?: string
}

export interface CreateThenIndexInput {
  workspaceId: string
  title: string
  sourceKind: 'pdf' | 'text' | 'url'
  sourceRef: string
  storagePath?: string | null
  mime?: string | null
  bytes?: number | null
}

/**
 * Read the source, then index it — or record why not, in one place.
 *
 * Shared by all three doors, by the retry, and by the signup seam, so a failure
 * is written the same way whichever way it was reached.
 */
export async function indexFromSource(
  documentId: string,
  read: SourceRead,
): Promise<KnowledgeActionState> {
  const supabase = createServerSupabase()

  const fail = async (
    code: KnowledgeFailureCode,
    extra?: { passages?: number; limit?: number },
  ): Promise<KnowledgeActionState> => {
    const { message } = knowledgeFailure(code, extra)
    const { error } = await supabase.rpc('fail_knowledge_document', {
      p_document_id: documentId,
      p_code: code,
      p_detail: message,
    })
    if (error) {
      // The read failed AND we could not record that it failed. Say both rather
      // than reporting the first as if the row now explains itself.
      return {
        ok: false,
        documentId,
        message: `${message} Sahoda could not save that outcome either, so this document may still say it is being read.`,
      }
    }
    return { ok: false, documentId, message }
  }

  if (!read.ok) return fail(read.code)

  const chunked = chunkForIngestion(read.text)
  if (!chunked.ok) {
    return fail(chunked.code, { passages: chunked.chunks, limit: MAX_CHUNKS_PER_DOCUMENT })
  }

  /**
   * The count of spans `neutralize` ACTUALLY REWROTE, produced by building the
   * evidence set this document would produce. Not a scorer's opinion, and not a
   * safety verdict — see `neutralizeCounting`. Built here rather than at resolve
   * time so the observation is stored with the document and the screen can show
   * it without re-reading every passage.
   */
  const preview = buildEvidenceSet(
    chunked.chunks.map((text, ordinal) => ({
      id: `${documentId}:${ordinal}`,
      documentId,
      documentTitle: '',
      ordinal,
      text,
    })),
    chunked.chunks.length,
  )

  const { error } = await supabase.rpc('index_knowledge_document', {
    p_document_id: documentId,
    p_chunks: chunked.chunks,
    p_content_sha256: null,
    p_addressed_instructions: preview.addressed.length,
    p_instruction_samples: preview.addressed.slice(0, 5).map((span) => ({
      kind: span.kind,
      found: span.found.slice(0, 200),
    })),
  })

  if (error) {
    reportServerError(new Error(error.message), { action: 'knowledge.index' })
    return fail('interrupted')
  }

  revalidatePath('/brain/knowledge')
  revalidatePath('/home')
  return {
    ok: true,
    documentId,
    message: `Read and indexed. That is ${chunked.chunks.length} ${chunked.chunks.length === 1 ? 'passage' : 'passages'} Sahoda can now quote from.`,
  }
}

/** Register the row, then read it. Every door does these two things. */
export async function createThenIndex(
  input: CreateThenIndexInput,
  read: () => Promise<SourceRead>,
): Promise<KnowledgeActionState> {
  const supabase = createServerSupabase()
  const created = await supabase.rpc('create_knowledge_document', {
    p_workspace_id: input.workspaceId,
    p_title: input.title,
    p_source_kind: input.sourceKind,
    p_source_ref: input.sourceRef,
    p_storage_path: input.storagePath ?? null,
    p_mime: input.mime ?? null,
    p_bytes: input.bytes ?? null,
  })

  if (created.error || !created.data?.id) {
    reportServerError(new Error(created.error?.message ?? 'no document returned'), {
      action: 'knowledge.create',
      workspaceId: input.workspaceId,
    })
    return { ok: false, message: 'Sahoda could not add that to your library just now. Try again.' }
  }

  const documentId = created.data.id as string
  await supabase.rpc('start_knowledge_indexing', { p_document_id: documentId })
  revalidatePath('/brain/knowledge')

  return indexFromSource(documentId, await read())
}
