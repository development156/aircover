import { z } from 'zod'
import { WorkspaceRoleSchema } from '../enums'
import { JsonbSchema } from '../common'

// Identity / tenancy tables. `user_id` is always a Clerk subject (text).

/**
 * The `workspaces` row.
 *
 * `deleted_at` and the four columns below it were all added to the table after
 * this schema was written, and none of them appeared here until 2026-08-26 —
 * `deleted_at` had been missing since 20260823000000. `identity.parity.test.ts`
 * now reads the migrations and fails if a column is added without landing here,
 * because a mirror nobody checks stops being a mirror on the first change.
 *
 * The last four are nullable on purpose and NULL is the common case: it means
 * nobody has told us, which the product must be able to say. See
 * `20260826200000_workspace_timezone_and_intake.sql` for why none of them is
 * defaulted.
 */
export const WorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  created_by: z.string(),
  settings: JsonbSchema,
  created_at: z.string(),
  updated_at: z.string(),
  /** Set by `public.erase_workspace`. The row survives its own erasure. */
  deleted_at: z.string().nullable(),
  /** IANA zone name. NULL means nobody has told us; it is never defaulted. */
  timezone: z.string().nullable(),
  /** One of BUSINESS_MODELS. NULL means onboarding never classified it. */
  business_model: z.string().nullable(),
  /** One of REGIMES, and the axis a cohort groups by. */
  regime: z.string().nullable(),
  /** One of LOCALES. A jurisdiction, never a timezone. */
  locale: z.string().nullable(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const WorkspaceInsertSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  created_by: z.string().min(1),
  settings: JsonbSchema.optional(),
})
export type WorkspaceInsert = z.infer<typeof WorkspaceInsertSchema>

export const WorkspaceMemberSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  user_id: z.string(),
  role: WorkspaceRoleSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>

export const WorkspaceMemberInsertSchema = z.object({
  workspace_id: z.uuid(),
  user_id: z.string().min(1),
  role: WorkspaceRoleSchema.default('owner'),
})
export type WorkspaceMemberInsert = z.infer<typeof WorkspaceMemberInsertSchema>

/** User-scoped (👤). `prefs` is the Alpha home of user_prefs (theme_override, reduced_motion, sahoda {muted, frequency, personality}, mode) — decision D7. */
export const UserProfileSchema = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  prefs: JsonbSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type UserProfile = z.infer<typeof UserProfileSchema>

export const UserProfileUpsertSchema = z.object({
  user_id: z.string().min(1),
  email: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  prefs: JsonbSchema.optional(),
})
export type UserProfileUpsert = z.infer<typeof UserProfileUpsertSchema>
