'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { MESH_TASK_ACTION } from '@sahoda/shared'
import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'

import { describeImpact } from '@/lib/knowledge/delete-impact'
import { createThenIndex, indexFromSource, type KnowledgeActionState } from '@/lib/knowledge/ingest'
import { knowledgeFailure } from '@/lib/knowledge/failure-copy'
import {
  MAX_UPLOAD_BYTES,
  readPdfSource,
  readTypedSource,
  readUrlSource,
} from '@/lib/knowledge/read-source'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { proposeFromLibrary } from '@/lib/knowledge/propose'
import { readCurrentPassages } from '@/lib/knowledge/store'
import { MAX_EVIDENCE_CHUNKS } from '@sahoda/research'
import { workspaceForWrite } from '@/lib/workspaces'
// Aliased: this file already binds `credits` to the withCredits Result, and
// shadowing it inside the sentence below would read as the wallet figure
// while being the call outcome.
import { credits as creditsPhrase } from '@/lib/credit-words'

/**
 * Adding a document to the library, and taking one out.
 *
 * ── THE ORDER OF OPERATIONS, AND WHY IT DIFFERS BY DOOR ─────────────────────
 * A URL and a typed note are REGISTERED before they are read, so the screen
 * shows them as "Waiting" from the moment they land and a read that fails leaves
 * a row saying what went wrong — rather than nothing at all, which is
 * indistinguishable, to the person who just pressed the button, from the press
 * never having happened.
 *
 * A PDF is DELIBERATELY THE OTHER WAY ROUND, and this used to be stated as if it
 * were not. The bytes are parsed BEFORE the object is uploaded and before the row
 * exists, because the alternative leaves an orphaned file in a customer's storage
 * folder that nothing ever goes back and cleans up — the same order `attachMedia`
 * uses and for the same reason.
 *
 * The cost of that choice is real and is paid on the likeliest failure there is:
 * a menu exported as a picture has no text layer, so `no_text` is returned to the
 * dialog, no row is created, and the sentence explaining it lives only in the
 * dialog the person is looking at. It is the right trade — a row pointing at a
 * file that was never stored is worse than a message that closes with the
 * dialog — but it is a trade, and `failure_code = 'unreadable'` is a value the
 * PDF door consequently CANNOT write. The column keeps it because a future door
 * that stores first will need it; nothing reaches it today, and saying so here is
 * cheaper than the next reader discovering it from a grep that finds no writer.
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

/**
 * ── THE TYPE IS IMPORTED, NEVER RE-EXPORTED ──────────────────────────────────
 * This line was `export type { KnowledgeActionState } from '@/lib/knowledge/ingest'`
 * and it made the DEV SERVER return 500 on /onboarding: Next allows a
 * `'use server'` module to export async functions and nothing else, and it
 * counts a type re-export as an export. MEASURED, `next dev`:
 * "Only async functions are allowed to be exported in a 'use server' file",
 * traced through `onboarding-stage.tsx`, so every browser test that bootstraps a
 * workspace was blocked.
 *
 * `tsc` and `next build` both pass on it, which is why it reached the lane: the
 * type is erased before either of them looks, and only the dev compiler enforces
 * the rule.
 *
 * Nothing replaces it here — line 18 already imports the same type for this
 * file's own use — and the one consumer that read it through this module,
 * `components/knowledge/add-document.tsx`, now imports it from the module that
 * declares it.
 */

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
    return { ok: false, message: 'Sahoda broke while adding that. Nothing was saved. Try again.' }
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
    return { ok: false, message: 'Sahoda broke while reading that. Nothing was saved. Try again.' }
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
    return { ok: false, message: 'Sahoda broke while saving that. Nothing was saved. Try again.' }
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
          ? `Deleted. Sahoda has kept what it already learned from it: ${brandFields} ${brandFields === 1 ? 'field' : 'fields'} in your Brand Brain no longer name a document you can open.`
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
  /** True only when the wallet was short. Never for any other failure. */
  insufficient?: boolean
  /** How many proposals were written. Rendered as a number, never as "some". */
  proposed?: number
  /** Documents the evidence came from, named so the receipt is checkable. */
  documents?: string[]
}

/** One charge, one ref, fresh per invocation. See `lib/planner/object-ref.ts`. */
function newLibraryResolveRef(workspaceId: string): string {
  return `${workspaceId}:knowledge_resolve:${randomUUID()}`
}

type WithCreditsFn = ReturnType<typeof createWithCredits>
let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

/**
 * READ THE LIBRARY AND OFFER WHAT IT SAYS — the point of the whole feature.
 *
 * ── THE ONLY THING ON THIS PATH THAT SPENDS, AND IT GOES THROUGH THE LEDGER ──
 * Adding, searching and deleting a document call no model and cost nothing. This
 * one calls `brand_extract`, so it is charged as `brand_research` — the same
 * action `MESH_TASK_ACTION` already maps that task to — through `withCredits`,
 * like every other paid action in this app.
 *
 * It was written WITHOUT that wrapper first, with a button reading "· 50
 * credits" above an action that debited nothing. That is a false statement about
 * the reader's wallet in their favour, which is still false, and it would have
 * become quietly true the day somebody wired charging and found the label
 * already there. The house rule is not negotiable: users never pay for failures,
 * and the ledger is the only place a charge exists.
 *
 * THE MODEL CALL AND THE PROPOSAL WRITES BOTH RUN INSIDE THE CALLBACK. So any
 * failure before the proposals are rows throws, the HOLD is RELEASED, and
 * "nothing was charged" is verifiably true rather than asserted. The DEBIT lands
 * only once there are suggestions to look at.
 *
 * ── WHAT IT STILL DOES NOT DO ───────────────────────────────────────────────
 * It does not write the Brand Brain. Every field becomes a PENDING
 * `memory_events` row through `public.propose_memory_event`, which names
 * `brand_memory` nowhere and has no parameter for `status`. It does not confirm
 * anything: each patch carries `confirmed: false` and no code path here can
 * write `true`. And it does not invent — a model that cannot be reached produces
 * nothing and says so, which is `packages/research/CLAUDE.md`'s standing rule.
 */
export async function resolveFromLibrary(): Promise<LibraryResolveState> {
  const action = MESH_TASK_ACTION['brand_extract']
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to read your library.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    /**
     * READ BEFORE THE CALLBACK. Reserving credits and then discovering the
     * library is empty would burn a hold on a call that was never going to
     * happen — the same reason `plan-week` parses its input before reserving.
     */
    const passages = await readCurrentPassages(MAX_EVIDENCE_CHUNKS)
    if (passages.status !== 'ok') {
      return {
        ok: false,
        message:
          'Sahoda could not read your library just now. This is not a claim that it is empty. The read did not come back. Try again.',
      }
    }
    if (passages.passages.length === 0) {
      return {
        ok: false,
        message: 'There is nothing in your library yet. Add a document and Sahoda can read it.',
      }
    }

    let failure: string | null = null
    let delivered = false
    let written = 0
    let documents: string[] = []

    const credits = await getWithCredits()(
      { workspaceId: ws.workspace.id, action, objectRef: newLibraryResolveRef(ws.workspace.id) },
      async (_ctx) => {
        const outcome = await proposeFromLibrary({
          passages: passages.passages,
          workspaceId: ws.workspace.id,
          userId,
          traceId: randomUUID(),
          businessName: ws.workspace.name,
        })

        if (outcome.status !== 'ok') {
          // Our own reason, never a provider string.
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }
        documents = outcome.documents

        if (outcome.proposals.length === 0) {
          /**
           * NOTHING USABLE IS NOT A DELIVERY, and this is the branch a menu of
           * prices lands in: it says a great deal about what a business sells
           * and nothing a Brand Brain field can hold. Releasing the hold is the
           * honest outcome — the owner has nothing to look at, so they pay
           * nothing, and the message says exactly that.
           */
          failure = FAILURE_REASON.NO_PLAN
          throw new Error('MESH_EMPTY') // → RELEASE
        }

        failure = FAILURE_REASON.SAVE_FAILED
        const supabase = createServerSupabase()
        for (const proposal of outcome.proposals) {
          const { error } = await supabase.rpc('propose_memory_event', {
            p_workspace_id: ws.workspace.id,
            p_diff: { patch: proposal.patch, path: proposal.path },
            p_evidence_refs: proposal.evidence ? [proposal.evidence] : null,
            p_source: 'insight',
          })
          if (!error) written += 1
        }
        if (written === 0) throw new Error('INSERT_FAILED') // → RELEASE

        // Last statement before the return: from here the wrapper owns the
        // outcome, and any failure it reports may still have debited.
        delivered = true
        return { written }
      },
    )

    if (delivered) {
      revalidatePath('/brain/resolve')
      revalidatePath('/brain')
    }
    // The credit chip lives in the layout, which a page-scoped revalidate never
    // reaches.
    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('knowledge-resolve', credits.error)
      if (!delivered && isDeploymentConfigCause(credits.error)) {
        return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
      }
      /**
       * The two RELEASED branches get their own sentences rather than the
       * generic charge-failure line, because neither is a fault the owner can
       * act on by retrying blindly and both are common.
       */
      if (!delivered && failure === FAILURE_REASON.NO_PLAN) {
        return {
          ok: false,
          insufficient: false,
          documents,
          message:
            'Sahoda read your library and found nothing it could turn into a Brand Brain field. That is an honest outcome. A menu of prices says a lot about what you sell and little about how you sound. You were not charged.',
        }
      }
      if (!delivered && failure === FAILURE_REASON.MESH_ERROR) {
        return {
          ok: false,
          insufficient: false,
          message:
            'Sahoda could not reach the model, so it has nothing to suggest. Nothing was written and you were not charged. Try again.',
        }
      }
      const state = chargeFailureState({ error: credits.error, action, delivered, reason: failure })
      /**
       * ── AN INSUFFICIENT BALANCE CARRIES NUMBERS, NOT A SENTENCE ───────────
       * `ChargeFailureState`'s insufficient branch returns `required` and
       * `available` and NO `message`, deliberately: docs/26 requires the
       * SHORTFALL to be named rather than "not enough credits", and only the
       * caller knows how to phrase it for its own screen. The hold raises this
       * before the callback runs, so nothing was spent and the sentence may say
       * so plainly.
       */
      if (state.insufficient) {
        const short = Math.max(0, state.required - state.available)
        return {
          ok: false,
          insufficient: true,
          message: `Reading your library costs ${creditsPhrase(state.required)} and you have ${state.available}. You are ${short} short. Nothing was read and nothing was charged.`,
        }
      }
      return { ok: false, insufficient: false, message: state.message }
    }

    return {
      ok: true,
      proposed: written,
      documents,
      message: `Sahoda read ${documents.length} ${documents.length === 1 ? 'document' : 'documents'} and has ${written} ${written === 1 ? 'suggestion' : 'suggestions'} for you. Nothing has changed in your Brand Brain. Each one is waiting for you to agree with it.`,
    }
  } catch (error) {
    reportServerError(error, { action: 'knowledge.resolveFromLibrary', workspaceId })
    reportPaidActionFailure('knowledge-resolve', error)
    // The billing env loader throws before any HOLD exists, so a config failure
    // caught here is verifiably uncharged and a retry cannot fix it.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return {
      ok: false,
      message: 'Sahoda broke while reading your library. Nothing was written. Try again.',
    }
  }
}
