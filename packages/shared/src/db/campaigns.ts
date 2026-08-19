import { z } from 'zod'

// ── campaigns ────────────────────────────────────────────────────────────────
/**
 * A named push — "Diwali week", "New menu launch" — that a handful of posts
 * belong to, so they can be planned and reported on together.
 *
 * ── THE FOUR VALUES ARE THE DATABASE'S FOUR VALUES ───────────────────────────
 * `20260819000500_campaigns.sql` writes
 * `check (status in ('draft', 'active', 'finished', 'cancelled'))`, and this
 * enum is character-identical to it on purpose. The screen this table replaced
 * rendered filter chips reading "All · Active · Draft · **Completed**", which
 * is a word the column has never accepted — a filter on it would have matched
 * nothing, forever, and looked like an empty workspace rather than a bug.
 * `campaigns.status-values.test.ts` executes both spellings and prints what
 * each one parses to, so the placeholder's label can never come back as a value.
 *
 * ── WHY THE ENUM IS HERE AND NOT IN `enums.ts` ───────────────────────────────
 * Convention would put it there beside `PostStatusSchema`. It is here because
 * five sessions are editing this package concurrently and `enums.ts` is the
 * file every one of them touches; a new domain that owns its own file adds no
 * merge surface at all. Move it when the traffic dies down.
 */
export const CampaignStatusSchema = z.enum(['draft', 'active', 'finished', 'cancelled'])
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>

/**
 * THERE IS NO BUDGET FIELD, AND ITS ABSENCE IS THE CONTRACT.
 *
 * The migration argues this at length and the argument is worth repeating where
 * the type lives, because a type is what a screen reaches for: a budget is not a
 * number on a row, it is money moving, and it needs a spend record that cannot
 * be edited after the fact plus a rule for a charge that a platform reports days
 * late. This codebase has exactly one system built to that standard — the credit
 * ledger — and the reason it is that careful is that money is where a mistake is
 * not recoverable by re-running something.
 *
 * So there is no `budget`, no `spend`, no `roas`, no `reach`, no `conversions`
 * and no `health`. Not nullable versions of them — absent. A nullable column
 * would put those words in the type, and a word in a type becomes a slot on a
 * screen, and a slot on a screen gets filled with a dash. The only figures a
 * campaign surface may render are the ones a query produces: how many posts are
 * in it, which channels those posts target, and the dates the customer typed.
 */
export const CampaignSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  objective: z.string().nullable(),
  status: CampaignStatusSchema,
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Campaign = z.infer<typeof CampaignSchema>

/**
 * `name` is `.min(1)` after trimming because the column is
 * `check (length(trim(name)) > 0)`. Catching it here turns a 23514 from Postgres
 * — which reaches a person as "new row violates check constraint" — into a
 * sentence a form can render beside the field.
 */
export const CampaignInsertSchema = z.object({
  workspace_id: z.uuid(),
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1).nullable().optional(),
  status: CampaignStatusSchema.default('draft'),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  created_by: z.string().min(1),
})
export type CampaignInsert = z.infer<typeof CampaignInsertSchema>

export const CampaignUpdateSchema = z
  .object({
    name: z.string().trim().min(1),
    objective: z.string().trim().min(1).nullable(),
    status: CampaignStatusSchema,
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
  })
  .partial()
export type CampaignUpdate = z.infer<typeof CampaignUpdateSchema>

// ── campaign_posts ───────────────────────────────────────────────────────────
/**
 * Which posts are in which campaign. A membership row, not a column on the post,
 * so a post can eventually belong to more than one push without a schema change.
 *
 * `workspace_id` is on the row because both foreign keys are composite —
 * `(campaign_id, workspace_id)` and `(post_id, workspace_id)` — which is what
 * makes it structurally impossible to pull one customer's post into another
 * customer's campaign. It is not redundant with RLS; it is the constraint RLS
 * would otherwise have to be trusted to duplicate.
 */
export const CampaignPostSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  campaign_id: z.uuid(),
  post_id: z.uuid(),
  created_at: z.string(),
})
export type CampaignPost = z.infer<typeof CampaignPostSchema>

export const CampaignPostInsertSchema = z.object({
  workspace_id: z.uuid(),
  campaign_id: z.uuid(),
  post_id: z.uuid(),
})
export type CampaignPostInsert = z.infer<typeof CampaignPostInsertSchema>
