import { z } from 'zod'
import { ChannelSchema } from '../enums'

/**
 * REMIX — one source, many drafts (FSD M3.3, PRD §5.2).
 *
 * Two tables: the run, and the pieces it produced. Both mirror
 * `20260821000000_remix.sql` exactly; the CHECK constraints there and the enums
 * here are the same vocabulary written twice on purpose (decision D9), and the
 * `remix_migrations.pglite.test.ts` suite reads the CHECKs out of the catalog
 * and compares them to these lists, so a drift fails rather than surprises.
 */

/**
 * What kind of derivative this is, and therefore which mesh task writes it.
 *
 * The vocabulary is CLOSED and every value maps to a task that exists today.
 * The mapping itself is NOT here — it lives beside the prices, in one place, so
 * that a derivative's task and its price key cannot be changed independently.
 *
 * `hook` is named for what `caption_rewrite`'s `hookify` DOES rather than for
 * what the roadmap drawing promised. The directive is "rework the opening into
 * a strong, scroll-stopping hook; keep the rest intact" — it returns a whole
 * post with a new opening, not a standalone one-line hook. A kind called
 * `hooks` would have promised three short hooks and delivered three full posts.
 */
export const RemixKindSchema = z.enum(['adaptation', 'short', 'hook', 'thread'])
export type RemixKind = z.infer<typeof RemixKindSchema>

/**
 * `approved` is the ONLY state the runner acts on, and reaching it needs a
 * person who saw a total. See the migration header for why the halt is a stored
 * fact rather than a branch.
 */
export const RemixBatchStatusSchema = z.enum(['planned', 'approved', 'running', 'done', 'failed'])
export type RemixBatchStatus = z.infer<typeof RemixBatchStatusSchema>

export const RemixDerivativeStatusSchema = z.enum(['pending', 'written', 'failed', 'skipped'])
export type RemixDerivativeStatus = z.infer<typeof RemixDerivativeStatusSchema>

export const RemixBatchSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  source_post_id: z.uuid().nullable(),
  source_title: z.string().nullable(),
  source_credit: z.string().nullable(),
  status: RemixBatchStatusSchema,
  approved_credits: z.number().int().nullable(),
  approved_at: z.string().nullable(),
  approved_by: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type RemixBatch = z.infer<typeof RemixBatchSchema>

export const RemixDerivativeSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  batch_id: z.uuid(),
  kind: RemixKindSchema,
  channel: ChannelSchema,
  /**
   * A `post_variants.format` value — and DELIBERATELY NOT AN ENUM HERE.
   *
   * The format vocabulary lives in `@sahoda/publishing/format-vocabulary`,
   * beside the CHECK it mirrors, and `@sahoda/publishing` depends on this
   * package. Restating the six strings here would be the second source of truth
   * CLAUDE.md forbids, pointing the wrong way round: publishing could widen the
   * list and this copy would silently disagree with the column.
   *
   * So the string is carried, and `isPostFormat` — the one reader that owns the
   * vocabulary — is what narrows it. `lib/remix/read.ts` does that on the way in
   * and drops a row whose format the vocabulary does not know, rather than
   * rendering a format nothing can publish.
   */
  format: z.string().min(1),
  included: z.boolean(),
  status: RemixDerivativeStatusSchema,
  post_id: z.uuid().nullable(),
  failure: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type RemixDerivative = z.infer<typeof RemixDerivativeSchema>
