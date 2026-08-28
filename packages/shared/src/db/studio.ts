import { z } from 'zod'

import { DesignDocumentSchema } from '../studio/document'

/**
 * ROW SCHEMAS FOR `studio_designs` AND `studio_exports`.
 *
 * ── PARSED PER ROW, WHICH IS THE WHOLE REASON `doc` IS jsonb ────────────────
 * The migration deliberately puts no CHECK constraint on `doc`: Postgres cannot
 * express the document's shape and would go stale the first time a template
 * gained a slot. This file is where the shape is enforced instead.
 *
 * That only works if the gallery parses ONE ROW AT A TIME. Parsing an array in
 * a single call means one malformed design takes the whole screen down with it,
 * which is exactly the trade `AssetSchema` already refuses to make. A bad design
 * should cost its own card and nothing else.
 *
 * ── WHAT IS A READER FIELD AND WHAT IS A CONSTRUCTOR FIELD ──────────────────
 * `is_template` carries `.default(false)` so a row written before that column
 * existed still parses. `doc` has no default: a design with no document is not a
 * design, and defaulting it to an empty one would put a blank card in a person's
 * gallery where their work used to be.
 */

export const StudioDesignSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  title: z.string(),
  preset_id: z.string(),
  doc: DesignDocumentSchema,
  is_template: z.boolean().default(false),
  created_by: z.string().nullable().default(null),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type StudioDesign = z.infer<typeof StudioDesignSchema>

/**
 * One export of one design.
 *
 * `content_sha256` is the hash of the bytes that were uploaded, and the pattern
 * is asserted here as well as in the migration. Two checks rather than one
 * because they catch different things: the column constraint stops a bad row
 * being written, and this stops a bad row already in the table being read as
 * though it were fine.
 */
export const StudioExportSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  design_id: z.uuid(),
  asset_id: z.uuid(),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: z.iso.datetime({ offset: true }),
})
export type StudioExport = z.infer<typeof StudioExportSchema>
