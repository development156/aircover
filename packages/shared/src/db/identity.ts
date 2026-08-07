import { z } from 'zod'
import { WorkspaceRoleSchema } from '../enums'
import { JsonbSchema } from '../common'

// Identity / tenancy tables. `user_id` is always a Clerk subject (text).

export const WorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  created_by: z.string(),
  settings: JsonbSchema,
  created_at: z.string(),
  updated_at: z.string(),
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
