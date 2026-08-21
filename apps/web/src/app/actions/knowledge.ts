'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { buildEvidenceSet, chunkForIngestion, MAX_CHUNKS_PER_DOCUMENT } from '@sahoda/research'

import { describeImpact } from '@/lib/knowledge/delete-impact'
import { knowledgeFailure, type KnowledgeFailureCode } from '@/lib/knowledge/failure-copy'
import {
  MAX_UPLOAD_BYTES,
  readPdfSource,
  readTypedSource,
  readUrlSource,
} from '@/lib/knowledge/read-source'
import type { SourceRead } from '@/lib/knowledge/read-source'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { proposeFromLibrary } from '@/lib/knowledge/propose'
import { readCurrentPassages } from '@/lib/knowledge/store'
import { MAX_EVIDENCE_CHUNKS } from '@sahoda/research'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Adding a document to the library, and taking one out.
 *
 * ── THE ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER ───────────────────────
 * A document is REGISTERED before it is read, not after. So the screen shows it
 * as "Processing" from the moment the upload lands, and a read that fails leaves
 * a row saying what went wrong instead of leaving nothing at all — which would
 * be indistinguishable, to the person who just uploaded a menu, from the upload
 * never having happened.
 *
 * ── NOTHING HERE COSTS A CREDIT ─────────────────────────────────────────────
 * There is no knowledge action in `pricing.config.json` and there must not be
 * one. Parsing is local, chunking is arithmetic, and full-text search is the
 * database's own index — no model is called anywhere on this path. So there is
 * nothing to price, nothing to show before spend, and inventing a figure to put
 * on the button would be a charge for work nobody does.
 *
 * ── EVERY WRITE GOES THROUGH A FUNCTION ─────────────────────────────────────
 * `knowledge_documents` and `knowledge_chunks` are read-only to members under
 * RLS. The five `public.*_knowledge_*` functions are the only write path, each
 * checks membership itself, and `apps/web` has no service-role client to go
 * round them with.
 */

/** The bucket `assets` already uses, and whose tenant policies already cover us. */
const BUCKET = 'media'

export interface KnowledgeActionState {
  ok: boolean
  message: string
  /** Set when a document row exists, so the screen can scroll to it. */
  documentId?: string
}

const SIGNED_OUT: KnowledgeActionState = { ok: false, message: 'Sign in to add to your library.' }

/**
 * The path an uploaded file lives at.
 *
 * `<workspace_id>/knowledge/<uuid>.pdf` — the workspace id FIRST, because
 * `storage.objects`' tenant policies read `(storage.foldername(name))[1]` and
 * compare it against `app.member_workspace_ids()`. Putting anything else first
 * would put the file outside every policy that already exists, and the library
 * would need storage rules of its own.
 */
function knowledgeObjectPath(workspaceId: string, documentId: string): string {
  return `${workspaceId}/knowledge/${documentId}.pdf`
}

/**
 * Read the source, then index it — or record why not, in one place.
 *
 * Shared by all three doors and by the retry, so a failure is written the same
 * way whichever way it was reached. The alternative is four call sites that
 * drift, and the one used least is the one that ends up leaving a document at
 * "Processing" forever.
 */
async function indexFromSource(
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
    message: `Read and indexed — ${chunked.chunks.length} ${chunked.chunks.length === 1 ? 'passage' : 'passages'} Sahoda can now quote from.`,
  }
}

/** Register the row, then read it. Every door does these two things. */
async function createThenIndex(
  input: {
    workspaceId: string
    title: string
    sourceKind: 'pdf' | 'text' | 'url'
    sourceRef: string
    storagePath?: string | null
    mime?: string | null
    bytes?: number | null
  },
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

/** Add a PDF. The bytes travel through here, so nothing is stored unparsed. */
export async function addPdfDocument(formData: FormData): Promise<KnowledgeActionState> {
  try {
    const { userId } = await auth()
    if (!userId) return SIGNED_OUT

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Choose a PDF to add.' }
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, message: knowledgeFailure('too_large').message }
    }

    const documentId = randomUUID()
    const path = knowledgeObjectPath(ws.workspace.id, documentId)
    const bytes = await file.arrayBuffer()

    /**
     * PARSED BEFORE IT IS STORED. A file that is not a readable PDF leaves no
     * object behind — the same order `attachMedia` uses, and for the same
     * reason: an orphaned object in a customer's folder is something nobody ever
     * goes back and cleans up.
     */
    const read = await readPdfSource({ name: file.name, size: file.size, bytes })
    if (!read.ok) {
      return { ok: false, message: knowledgeFailure(read.code).message }
    }

    const supabase = createServerSupabase()
    const uploaded = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false })
    if (uploaded.error) {
      reportServerError(new Error(uploaded.error.message), {
        action: 'knowledge.upload',
        workspaceId: ws.workspace.id,
      })
      return { ok: false, message: 'Sahoda could not save that file just now. Try again.' }
    }

    const title = String(formData.get('title') ?? '').trim() || read.title || file.name
    return await createThenIndex(
      {
        workspaceId: ws.workspace.id,
        title,
        sourceKind: 'pdf',
        sourceRef: file.name,
        storagePath: path,
        mime: 'application/pdf',
        bytes: file.size,
      },
      async () => read,
    )
  } catch (error) {
    reportServerError(error, { action: 'knowledge.addPdf' })
    return { ok: false, message: 'Sahoda broke while adding that. Nothing was saved — try again.' }
  }
}

/** Add a page. Fetched through `safeFetch`, so every redirect hop is validated. */
export async function addUrlDocument(formData: FormData): Promise<KnowledgeActionState> {
  try {
    const { userId } = await auth()
    if (!userId) return SIGNED_OUT

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const raw = String(formData.get('url') ?? '').trim()
    if (!raw) return { ok: false, message: 'Paste the address of a page to read.' }
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

    const read = await readUrlSource(url)
    const title = String(formData.get('title') ?? '').trim() || (read.ok ? read.title : null) || url

    return await createThenIndex(
      { workspaceId: ws.workspace.id, title, sourceKind: 'url', sourceRef: url },
      async () => read,
    )
  } catch (error) {
    reportServerError(error, { action: 'knowledge.addUrl' })
    return { ok: false, message: 'Sahoda broke while reading that. Nothing was saved — try again.' }
  }
}

/** Add something typed or pasted. Nothing to fetch, nothing to parse. */
export async function addTypedDocument(formData: FormData): Promise<KnowledgeActionState> {
  try {
    const { userId } = await auth()
    if (!userId) return SIGNED_OUT

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const text = String(formData.get('text') ?? '')
    const title = String(formData.get('title') ?? '').trim()
    if (!/[^\s]/.test(text)) return { ok: false, message: 'Type or paste what Sahoda should know.' }
    if (!title) return { ok: false, message: 'Give this a name, so you can find it later.' }

    return await createThenIndex(
      { workspaceId: ws.workspace.id, title, sourceKind: 'text', sourceRef: 'typed' },
      async () => readTypedSource(text),
    )
  } catch (error) {
    reportServerError(error, { action: 'knowledge.addTyped' })
    return { ok: false, message: 'Sahoda broke while saving that. Nothing was saved — try again.' }
  }
}

/**
 * Read a document again.
 *
 * The remedy for `interrupted` and for `fetch_failed` — the two failures that
 * are transient, and the two whose messages offer a retry. A typed document has
 * nothing to re-read (its text lives only in the passages already stored), and a
 * stored PDF is re-parsed from the object it was uploaded to.
 */
export async function reindexDocument(documentId: string): Promise<KnowledgeActionState> {
  try {
    const { userId } = await auth()
    if (!userId) return SIGNED_OUT

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('id, source_kind, source_ref, storage_path')
      .eq('id', documentId)
      .maybeSingle()

    if (error) return { ok: false, message: 'Sahoda could not read that document just now.' }
    if (!data) return { ok: false, message: 'That document is not in your library.' }

    await supabase.rpc('start_knowledge_indexing', { p_document_id: documentId })
    revalidatePath('/brain/knowledge')

    if (data.source_kind === 'url') {
      return await indexFromSource(documentId, await readUrlSource(data.source_ref as string))
    }
    if (data.source_kind === 'pdf' && data.storage_path) {
      const file = await supabase.storage.from(BUCKET).download(data.storage_path as string)
      if (file.error || !file.data) {
        return await indexFromSource(documentId, { ok: false, code: 'interrupted' })
      }
      return await indexFromSource(
        documentId,
        await readPdfSource({
          name: data.source_ref as string,
          size: file.data.size,
          bytes: await file.data.arrayBuffer(),
        }),
      )
    }

    /**
     * A typed document. Its words were never stored anywhere but the passages,
     * so there is nothing to re-read — and saying "read it again" would be an
     * offer Sahoda cannot keep.
     */
    return {
      ok: false,
      documentId,
      message:
        'This one was typed rather than read from a file or a page, so there is nothing to re-read. Delete it and paste it again to change what it says.',
    }
  } catch (error) {
    reportServerError(error, { action: 'knowledge.reindex' })
    return { ok: false, message: 'Sahoda broke while re-reading that. Try again.' }
  }
}

export interface DeleteKnowledgeState extends KnowledgeActionState {
  /** Fields in the active Brand Brain that cite this document. */
  brandFields?: number
  /** Proposals waiting on a decision that cite it. */
  pendingProposals?: number
  /** True when the delete was refused pending an acknowledgement. */
  needsAcknowledgement?: boolean
}

/**
 * Remove a document, and say what that costs FIRST.
 *
 * The gate is `public.delete_knowledge_document`, which counts the citations and
 * deletes in ONE transaction. It is not a check in this function, deliberately:
 * the ruling from the media library
 * (`20260820000100_delete_asset_rpc.sql`) is that a two-round-trip gate decides
 * on stale facts, and a Brand Brain version written between the count and the
 * delete would cite a document that no longer exists.
 *
 * Called without `acknowledge`, a cited document is REFUSED. So a caller that
 * forgets to ask cannot delete anything the brain is standing on.
 */
export async function deleteKnowledgeDocument(
  documentId: string,
  acknowledge = false,
): Promise<DeleteKnowledgeState> {
  try {
    const { userId } = await auth()
    if (!userId) return SIGNED_OUT

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('delete_knowledge_document', {
      p_document_id: documentId,
      p_acknowledge: acknowledge,
    })

    if (error) {
      if (error.message.includes('NEEDS_ACKNOWLEDGEMENT')) {
        const impact = await readDeleteImpact(documentId)
        return {
          ok: false,
          needsAcknowledgement: true,
          documentId,
          ...impact,
          message: describeImpact(impact),
        }
      }
      if (error.message.includes('INVALID_DOCUMENT')) {
        return { ok: false, message: 'That document is not in your library.' }
      }
      reportServerError(new Error(error.message), { action: 'knowledge.delete' })
      return { ok: false, message: 'Sahoda could not delete that just now. Try again.' }
    }

    /**
     * The object goes AFTER the row is gone, using the path the function
     * returned. Postgres cannot delete a file, and a transaction that could
     * would be one that removes a customer's document and then rolls back the
     * row pointing at it. A failure here leaves an object nothing references,
     * which is recoverable; the other order loses the file outright.
     */
    const path = (data as { storage_path?: string | null } | null)?.storage_path
    if (path) await supabase.storage.from(BUCKET).remove([path])

    revalidatePath('/brain/knowledge')
    revalidatePath('/home')

    const brandFields = (data as { brand_fields?: number } | null)?.brand_fields ?? 0
    return {
      ok: true,
      brandFields,
      message:
        brandFields > 0
          ? `Deleted. Sahoda has kept what it already learned from it — ${brandFields} ${brandFields === 1 ? 'field' : 'fields'} in your Brand Brain no longer name a document you can open.`
          : 'Deleted, along with everything Sahoda had indexed from it.',
    }
  } catch (error) {
    reportServerError(error, { action: 'knowledge.delete' })
    return { ok: false, message: 'Sahoda broke while deleting that. Try again.' }
  }
}

/**
 * What deleting this would break, for the confirmation screen.
 *
 * A SECOND read, and it is allowed to be stale — it exists to write a sentence,
 * not to make the decision. The decision is made inside the transaction that
 * does the delete, which is why this being a few milliseconds out of date cannot
 * let anything through.
 */
export async function readDeleteImpact(
  documentId: string,
): Promise<{ brandFields: number; pendingProposals: number }> {
  const supabase = createServerSupabase()
  const cite = `document:${documentId}`

  const brain = await supabase
    .from('brand_memory')
    .select('payload')
    .eq('status', 'active')
    .maybeSingle()

  let brandFields = 0
  const meta = (brain.data as { payload?: { field_meta?: Record<string, { source?: string }> } })
    ?.payload?.field_meta
  if (meta) brandFields = Object.values(meta).filter((m) => m?.source === cite).length

  const proposals = await supabase
    .from('memory_events')
    .select('id, evidence_refs')
    .eq('status', 'pending')

  const pendingProposals = (proposals.data ?? []).filter((row) =>
    JSON.stringify((row as { evidence_refs?: unknown }).evidence_refs ?? '').includes(documentId),
  ).length

  return { brandFields, pendingProposals }
}

export interface LibraryResolveState {
  ok: boolean
  message: string
  /** How many proposals were written. Rendered as a number, never as "some". */
  proposed?: number
  /** Documents the evidence came from, named so the receipt is checkable. */
  documents?: string[]
}

/**
 * READ THE LIBRARY AND OFFER WHAT IT SAYS — the point of the whole feature.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 * It does not write the Brand Brain. Every field it produces becomes a PENDING
 * `memory_events` row through `public.propose_memory_event`, which names
 * `brand_memory` nowhere and has no parameter for `status`. The only path from
 * a proposal to the brain is a person pressing Accept.
 *
 * It does not confirm anything. Each patch carries `confirmed: false` beside its
 * value, and there is no code path here that could write `true` — the same
 * structural property `ExtractedFieldWire` has, one layer up.
 *
 * It does not invent. A model that cannot be reached produces nothing and says
 * so; `packages/research/CLAUDE.md` states the rule ("never invent a brand voice
 * and present it as extracted") and it holds identically here.
 *
 * ── THIS ONE DOES SPEND ─────────────────────────────────────────────────────
 * Unlike everything else on the knowledge path, this makes a model call. It is
 * therefore the one control on the screen that carries a cost, and the cost is
 * `brand_research`'s — the same task, the same tier, reading a different corpus.
 */
export async function resolveFromLibrary(): Promise<LibraryResolveState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to read your library.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }

    const passages = await readCurrentPassages(MAX_EVIDENCE_CHUNKS)
    if (passages.status !== 'ok') {
      return {
        ok: false,
        message:
          'Sahoda could not read your library just now. This is not a claim that it is empty — the read did not come back. Try again.',
      }
    }

    const outcome = await proposeFromLibrary({
      passages: passages.passages,
      workspaceId: ws.workspace.id,
      userId,
      traceId: randomUUID(),
    })

    if (outcome.status === 'no-passages') {
      return {
        ok: false,
        message: 'There is nothing in your library yet. Add a document and Sahoda can read it.',
      }
    }
    if (outcome.status === 'model-unavailable') {
      return {
        ok: false,
        message:
          'Sahoda could not reach the model, so it has nothing to suggest. Nothing was written and nothing was charged — try again.',
      }
    }

    const supabase = createServerSupabase()
    let written = 0
    for (const proposal of outcome.proposals) {
      const { error } = await supabase.rpc('propose_memory_event', {
        p_workspace_id: ws.workspace.id,
        p_diff: { patch: proposal.patch, path: proposal.path },
        p_evidence_refs: proposal.evidence ? [proposal.evidence] : null,
        p_source: 'insight',
      })
      if (!error) written += 1
    }

    revalidatePath('/brain/resolve')
    revalidatePath('/brain')

    if (written === 0) {
      return {
        ok: false,
        documents: outcome.documents,
        message:
          'Sahoda read your library and found nothing it could turn into a Brand Brain field. That is an honest outcome — a menu of prices says a lot about what you sell and little about how you sound.',
      }
    }

    return {
      ok: true,
      proposed: written,
      documents: outcome.documents,
      message: `Sahoda read ${outcome.documents.length} ${outcome.documents.length === 1 ? 'document' : 'documents'} and has ${written} ${written === 1 ? 'suggestion' : 'suggestions'} for you. Nothing has changed in your Brand Brain — each one is waiting for you to agree with it.`,
    }
  } catch (error) {
    reportServerError(error, { action: 'knowledge.resolveFromLibrary' })
    return {
      ok: false,
      message: 'Sahoda broke while reading your library. Nothing was written — try again.',
    }
  }
}
