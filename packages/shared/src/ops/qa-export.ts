import { z } from 'zod'
import {
  OpsQaKindSchema,
  OpsQaSuiteSchema,
  OpsQaStatusSchema,
  OpsArtifactMimeSchema,
} from '../enums'

/**
 * The portable QA record (doc 13 §11) — `sahoda_qa_v1`.
 *
 * One envelope, used for BOTH directions. Export writes it and import validates
 * against the same schema, so a file this app produced is a file this app
 * accepts, and a file it rejects it would never have written.
 *
 * `.strict()` throughout: an unknown key is a REJECTION, not something quietly
 * stripped. A file from a future version carrying a field this one drops on the
 * floor would import as though nothing were missing, and the QA record is
 * exactly the wrong place to be quietly lossy.
 *
 * ROUND-TRIP IS "THE SAME RUNS, RE-ATTRIBUTED", NOT BYTE-IDENTICAL (§11).
 * `ops_qa_import` files every imported run under whoever imported it, forces
 * `kind` to `manual`, and keeps the author named in the file as a claim inside
 * `details`. `actor` and `kind` therefore travel in the file and are treated as
 * claims about provenance rather than instructions. Faithful `actor`
 * round-tripping and non-repudiation of the QA record are in direct conflict;
 * non-repudiation wins, because this record is what a person reads to decide
 * whether a build is healthy.
 */

export const QA_EXPORT_SCHEMA = 'sahoda_qa_v1'

/**
 * `created_at`/`updated_at` are deliberately absent: they are the DATABASE's
 * record of when a row was written here, and carrying them across would let an
 * import claim a row existed before it did.
 */
export const OpsQaExportRunSchema = z
  .object({
    id: z.uuid(),
    task_code: z.string().max(40).nullable(),
    kind: OpsQaKindSchema,
    suite: OpsQaSuiteSchema,
    status: OpsQaStatusSchema,
    summary_plain: z.string().max(2000).nullable(),
    details: z.string().max(50_000).nullable(),
    actor: z.string().max(320).nullable(),
    duration_ms: z.int().nonnegative().nullable(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
  })
  .strict()

export type OpsQaExportRun = z.infer<typeof OpsQaExportRunSchema>

/**
 * Metadata only — §11 says so, and it is not a shortcut.
 *
 * The screenshots themselves live in a private bucket and are NOT in this file.
 * Import therefore does not recreate artifact rows: a row pointing at a
 * `storage_path` that does not exist in the destination is a thumbnail that
 * 404s forever, recorded as evidence. They travel so a reader can see what was
 * attached and where it came from, and the importer is told plainly that the
 * images did not come with them.
 */
export const OpsQaExportArtifactSchema = z
  .object({
    id: z.uuid(),
    run_id: z.uuid(),
    storage_path: z.string().max(400),
    caption: z.string().max(300).nullable(),
    bytes: z.int().nonnegative(),
    mime: OpsArtifactMimeSchema,
  })
  .strict()

export type OpsQaExportArtifact = z.infer<typeof OpsQaExportArtifactSchema>

export const OpsQaExportSchema = z
  .object({
    schema: z.literal(QA_EXPORT_SCHEMA),
    exported_at: z.string(),
    /**
     * The window this file covers, stated in the file itself. An export that
     * silently carries "the most recent 500" reads later as "everything", and
     * the difference matters when someone restores from it.
     */
    window: z
      .object({
        description: z.string().max(200),
        run_limit: z.int().positive(),
        truncated: z.boolean(),
      })
      .strict(),
    runs: z.array(OpsQaExportRunSchema).max(5000),
    artifacts: z.array(OpsQaExportArtifactSchema).max(20_000),
  })
  .strict()

export type OpsQaExport = z.infer<typeof OpsQaExportSchema>

/** What `ops_qa_import` reports back, per run it could not take. */
export const OpsQaImportConflictSchema = z.object({ id: z.uuid(), reason: z.string() }).strict()

export type OpsQaImportConflict = z.infer<typeof OpsQaImportConflictSchema>

export const OpsQaImportResultSchema = z
  .object({
    imported: z.int().nonnegative(),
    conflicts: z.array(OpsQaImportConflictSchema),
  })
  .strict()

export type OpsQaImportResult = z.infer<typeof OpsQaImportResultSchema>
