import { z } from 'zod'
import { SiteStatusSchema, SectionKindSchema, LeadStatusSchema } from '../enums'
import { JsonbSchema } from '../common'

// ── sites ─────────────────────────────────────────────────────────────────────
export const SiteSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  goal: z.string().nullable(),
  status: SiteStatusSchema,
  theme: JsonbSchema.nullable(),
  deploy: JsonbSchema.nullable(),
  last_deployed_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Site = z.infer<typeof SiteSchema>

export const SiteInsertSchema = z.object({
  workspace_id: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  goal: z.string().nullable().optional(),
  created_by: z.string().min(1),
})
export type SiteInsert = z.infer<typeof SiteInsertSchema>

// ── site_pages ────────────────────────────────────────────────────────────────
export const SitePageSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  site_id: z.uuid(),
  path: z.string(),
  title: z.string().nullable(),
  sort: z.int(),
  seo: JsonbSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type SitePage = z.infer<typeof SitePageSchema>

export const SitePageInsertSchema = z.object({
  workspace_id: z.uuid(),
  site_id: z.uuid(),
  path: z.string().default('/'),
  title: z.string().nullable().optional(),
  sort: z.int().default(0),
  seo: JsonbSchema.nullable().optional(),
})
export type SitePageInsert = z.infer<typeof SitePageInsertSchema>

// ── site_sections ─────────────────────────────────────────────────────────────
export const SiteSectionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  page_id: z.uuid(),
  kind: SectionKindSchema,
  sort: z.int(),
  content: JsonbSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type SiteSection = z.infer<typeof SiteSectionSchema>

export const SiteSectionInsertSchema = z.object({
  workspace_id: z.uuid(),
  page_id: z.uuid(),
  kind: SectionKindSchema,
  sort: z.int().default(0),
  content: JsonbSchema,
})
export type SiteSectionInsert = z.infer<typeof SiteSectionInsertSchema>

// ── leads (insert server-only after Turnstile + rate limit) ──────────────────
export const LeadSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  site_id: z.uuid().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  payload: JsonbSchema.nullable(),
  source: JsonbSchema.nullable(),
  status: LeadStatusSchema,
  read_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Lead = z.infer<typeof LeadSchema>

/** Public form submission (validated + Turnstile-checked server-side before insert). */
export const LeadInsertSchema = z.object({
  workspace_id: z.uuid(),
  site_id: z.uuid().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  phone: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  payload: JsonbSchema.nullable().optional(),
  source: JsonbSchema.nullable().optional(),
})
export type LeadInsert = z.infer<typeof LeadInsertSchema>

export const LeadUpdateSchema = z
  .object({
    status: LeadStatusSchema,
    read_at: z.string().nullable(),
  })
  .partial()
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>
