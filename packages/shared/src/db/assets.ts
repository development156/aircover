import { z } from 'zod'
import { ChannelSchema } from '../enums'

/**
 * The media library: `assets` (one row per file, owned by the WORKSPACE) and
 * `asset_usages` (which post uses which file).
 *
 * ── WHY `kind` IS NOT DERIVED FROM `mime` ────────────────────────────────────
 * A mime type says `image/jpeg`. A library filters on "a photo" — the thing a
 * person is looking for. The column is the answer to the second question, and
 * the DB carries a CHECK for exactly these three values, so the enum is stated
 * here rather than inferred from a prefix: `application/pdf` is a document and
 * `image/svg+xml` is not a photo, and a prefix test gets both wrong.
 *
 * TODAY ONLY `image` CAN BE WRITTEN HONESTLY. Every channel's `mediaTypes` in
 * the Constraint Engine lists four image types and nothing else, and
 * `sniffImage` recognises exactly those four — so a video or a document could be
 * stored but never published, and never verified. The enum keeps all three
 * because the COLUMN has all three; the upload path refuses anything it cannot
 * identify, which today means it only ever writes 'image'. See
 * `apps/web/src/lib/assets/kind.ts`.
 */
export const AssetKindSchema = z.enum(['image', 'video', 'document'])
export type AssetKind = z.infer<typeof AssetKindSchema>

// ── assets ───────────────────────────────────────────────────────────────────
export const AssetSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  storage_path: z.string(),
  kind: AssetKindSchema,
  mime: z.string().nullable(),
  /**
   * `bigint` in Postgres, and PostgREST serialises `bigint` as a JSON NUMBER,
   * not a string — so this parses as a number. It is `z.number().int()` rather
   * than `z.int()` because the column's range exceeds `int4`; a file bigger than
   * 2 GB is not something this product accepts, but a schema that would throw on
   * one is a schema that lies about the column.
   */
  bytes: z.number().int().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  alt: z.string().nullable(),
  title: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Asset = z.infer<typeof AssetSchema>

export const AssetInsertSchema = z.object({
  workspace_id: z.uuid(),
  storage_path: z.string().min(1),
  kind: AssetKindSchema,
  mime: z.string().nullable().optional(),
  bytes: z.number().int().nullable().optional(),
  width: z.int().nullable().optional(),
  height: z.int().nullable().optional(),
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
})
export type AssetInsert = z.infer<typeof AssetInsertSchema>

/**
 * Only the two fields a person edits. `storage_path`, `kind`, `bytes` and the
 * dimensions are facts about the FILE, established by sniffing its bytes at
 * upload — nothing in the UI may overwrite them, so nothing here can express it.
 */
export const AssetUpdateSchema = z
  .object({
    alt: z.string().nullable(),
    title: z.string().nullable(),
  })
  .partial()
export type AssetUpdate = z.infer<typeof AssetUpdateSchema>

// ── asset_usages ─────────────────────────────────────────────────────────────
export const AssetUsageSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  asset_id: z.uuid(),
  post_id: z.uuid(),
  /** null means "the post as a whole", which is the ordinary case today. */
  channel: ChannelSchema.nullable(),
  position: z.int(),
  created_at: z.string(),
})
export type AssetUsage = z.infer<typeof AssetUsageSchema>
