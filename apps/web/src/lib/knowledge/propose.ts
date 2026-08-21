import 'server-only'

import { brandExtractTask, createMesh, type BrandExtractInput, type Mesh } from '@sahoda/mesh'
import { attachProvenance, type ExtractedFieldWire } from '@sahoda/shared'
import { buildEvidenceSet, MAX_EVIDENCE_CHUNKS, type EvidenceSet } from '@sahoda/research'

import { mapExtractedFields, patchFor, type MappedField } from './field-map'
import type { KnowledgePassage } from './store'

/**
 * A RESOLVE THAT DRAWS ON THE LIBRARY, and can say which document it drew from.
 *
 * ── WHY THIS IS `brand_extract` AND NOT `brand_guidelines` ──────────────────
 * `lib/brand/brain-origin.ts` argues at length that per-field evidence "cannot
 * be built honestly", and it is right about the task it is describing:
 * `brand_guidelines` receives the whole door text and returns fifteen fields in
 * one object, so nothing traces a field back to a passage.
 *
 * `brand_extract` is a different task and does not have that problem. Its wire
 * schema carries `page` — "the index of the quarantine block the value came
 * from" — and `attachProvenance` resolves that index against a list WE built,
 * dropping anything out of range. The comment there states the property
 * outright: "an index either addresses a block we supplied or it does not."
 *
 * So the citation mechanism already existed; this points it at library passages
 * instead of crawled pages. Nothing about the model's trustworthiness changed —
 * the model emits a NUMBER, and the number is resolved to a document id by code
 * the model cannot reach.
 *
 * ── WHAT COMES OUT IS A PROPOSAL, NOT A BRAIN ───────────────────────────────
 * Every mapped field becomes a pending `memory_events` row through
 * `public.propose_memory_event`, which names `brand_memory` nowhere and has no
 * parameter for `status`. A person accepts it, or it stays a suggestion. The
 * patch carries `confirmed: false` alongside the value, so even an accepted
 * proposal is a sourced guess rather than an answer — accepting a suggestion is
 * not the same act as standing behind its wording.
 */

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

export type ProposeOutcome =
  | {
      status: 'ok'
      proposals: LibraryProposal[]
      /** Passages left out of the evidence set. Named, never silent. */
      dropped: number
      /** Documents the evidence was drawn from, for the receipt. */
      documents: string[]
    }
  | { status: 'no-passages' }
  | { status: 'model-unavailable' }

export interface LibraryProposal {
  path: string
  value: string | string[]
  /** `document:<uuid>` — from our list, never from the model's memory. */
  source: string
  /** The passage itself, so the console can show what it read. */
  evidence: { documentId: string; documentTitle: string; chunkId: string; ordinal: number } | null
  patch: Record<string, unknown>
}

/** How the extraction is actually run. Injected so this is testable with no key. */
export interface ExtractRunner {
  run(corpus: string): Promise<{ ok: true; fields: ExtractedFieldWire[] } | { ok: false }>
}

function meshRunner(
  workspaceId: string,
  userId: string,
  traceId: string,
  businessName: string,
): ExtractRunner {
  return {
    async run(corpus: string) {
      /**
       * ── TYPED, NOT CAST, AND THE DIFFERENCE WAS A DEFECT ──────────────────
       * This read `{ corpus } as Parameters<typeof brandExtractTask.buildMessages>[0]`,
       * which type-checks against anything. `BrandExtractInputSchema` requires
       * `name` (`z.string().min(1)`), and the crawl branch of `buildMessages`
       * renders `Business name: ${input.name}` — so the omission would have
       * failed the input parse, and had it not, the model would have been told
       * the business is called "undefined".
       *
       * `read-door.ts` casts the same way and gets away with it because
       * `url-door.ts` happens to pass `{ corpus, name }`. A cast that hides a
       * required field is a typecheck that proves nothing, so the real type is
       * named here instead.
       */
      const input: BrandExtractInput = { corpus, name: businessName }
      const result = await getMesh().runTask(
        brandExtractTask.def,
        input,
        // `traceId` is required: `ai_provider_logs` is keyed by it, and a call
        // with none is spend nothing can be traced back to a request.
        { workspaceId, userId, traceId, actionType: 'knowledge_resolve' },
      )
      if (!result.ok) return { ok: false }
      const data = result.data as { fields?: ExtractedFieldWire[] }
      return { ok: true, fields: data.fields ?? [] }
    },
  }
}

/**
 * Read the library, ask the model what it says about the business, and turn the
 * answer into proposals nobody has agreed to yet.
 */
export async function proposeFromLibrary(input: {
  passages: readonly KnowledgePassage[]
  workspaceId: string
  userId: string
  traceId: string
  /**
   * The workspace's name, which `brand_extract` REQUIRES — it is what lets the
   * extractor tell the brand apart from its suppliers in the text.
   */
  businessName: string
  runner?: ExtractRunner
}): Promise<ProposeOutcome> {
  if (input.passages.length === 0) return { status: 'no-passages' }

  const set: EvidenceSet = buildEvidenceSet(
    input.passages.map((passage) => ({
      id: passage.id,
      documentId: passage.document_id,
      documentTitle: passage.document_title,
      ordinal: passage.ordinal,
      text: passage.text,
    })),
    MAX_EVIDENCE_CHUNKS,
  )

  const runner =
    input.runner ?? meshRunner(input.workspaceId, input.userId, input.traceId, input.businessName)
  const answer = await runner.run(set.corpus)

  /**
   * NO FALLBACK PAYLOAD. `packages/research/CLAUDE.md` states the rule for the
   * crawler and it applies identically here: never invent a brand voice and
   * present it as extracted. A model that could not be reached produces nothing,
   * and the screen says the model could not be reached.
   */
  if (!answer.ok) return { status: 'model-unavailable' }

  // The model's `page` indices resolved against OUR list. An index we did not
  // supply drops the field entirely — the whole reason it is an index.
  const stamped = attachProvenance(answer.fields, set.sources)
  const mapped: MappedField[] = mapExtractedFields(stamped)

  /**
   * ── THE CITATION IS PASSAGE-LEVEL, NOT DOCUMENT-LEVEL ────────────────────
   * `document:<uuid>#<ordinal>`. The document alone would satisfy "which
   * document did this come from"; the ordinal is what lets the console show the
   * SENTENCE, which is the difference between naming a source and letting
   * somebody check one.
   *
   * `20260822000300` widened `delete_knowledge_document`'s predicate to match
   * this shape. Without that migration the delete gate would count zero fields
   * for a document every field came from — a guard still present, still running,
   * and unable to fire.
   */
  const byCitation = new Map(set.citations.map((c) => [c.source, c]))
  const passageCite = (documentId: string, ordinal: number) => `document:${documentId}#${ordinal}`

  const proposals: LibraryProposal[] = mapped.map((field) => {
    const citation = byCitation.get(field.source) ?? null
    const source = citation ? passageCite(citation.documentId, citation.ordinal) : field.source
    return {
      path: field.path,
      value: field.value,
      source,
      evidence: citation
        ? {
            documentId: citation.documentId,
            documentTitle: citation.documentTitle,
            chunkId: citation.chunkId,
            ordinal: citation.ordinal,
          }
        : null,
      /**
       * The patch carries BOTH halves: the value, and the provenance beside it.
       * `field_meta` lives inside `payload`, and `resolve_memory_event`
       * deep-merges the patch into it — so accepting a proposal writes the
       * citation into the brain in the same transaction as the value, and there
       * is no window where the brain holds one without the other.
       *
       * `confirmed: false`, always. There is no code path here that can write
       * `true`, which is the same structural property `ExtractedFieldWire` has:
       * the model has no channel to express confirmation at all.
       */
      patch: {
        ...patchFor(field),
        field_meta: {
          [field.path]: { kind: 'negotiated', confirmed: false, source },
        },
      },
    }
  })

  return {
    status: 'ok',
    proposals,
    dropped: set.dropped,
    documents: [...new Set(set.citations.map((c) => c.documentTitle))],
  }
}
