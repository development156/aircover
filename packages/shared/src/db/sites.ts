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

/**
 * What a stranger may send the public site form.
 *
 * ── THE ONE FIELD THAT IS NOT HERE ───────────────────────────────────────────
 * There is no workspace id, and there must never be one. `public.lead_submit`
 * runs as `service_role` and resolves the tenant from the SITE SLUG, so no value
 * a caller sends can steer which workspace the enquiry lands in. A schema that
 * accepted one would make the whole endpoint cross-tenant lead injection, and
 * the schema is the first place that has to refuse it.
 *
 * ── AND WHY email AND phone ARE BOTH OPTIONAL ────────────────────────────────
 * A shop's customers leave one or the other, not both, and a form that demands
 * an address from somebody who only has a number turns them away. The rule that
 * ONE of them must be present is a rule about the ROW, so it lives in the
 * function rather than here — every caller the door ever gains has to obey it,
 * and a zod schema in one route cannot make that true.
 *
 * `website` is the honeypot, exactly as `OpsBetaApplyInputSchema` uses it: a bot
 * that fills every field fails here and never reaches Turnstile or the database.
 */
/**
 * A browser form posts EVERY field, and an empty one arrives as `''`, never as
 * an absent key. zod treats `''` as present-and-invalid for `z.email()`, so
 * without this a visitor who left email blank and typed a phone number was
 * refused as "invalid email" before the one-or-the-other rule was reached.
 * Blank means absent, for the four fields a visitor may leave empty. The
 * honeypot and the token are deliberately NOT routed through it: an empty
 * honeypot must stay `''` (that is what a real browser sends) and an empty
 * token must fail, not vanish.
 */
const blankIsAbsent = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export const SiteLeadSubmitSchema = z.object({
  site_slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    // The subdomain shape `sites.slug` already holds. A slug that could not be a
    // subdomain cannot name a real site, so it is refused before any lookup.
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'That is not a site address.'),
  name: z.preprocess(blankIsAbsent, z.string().trim().max(120).optional()),
  email: z.preprocess(blankIsAbsent, z.email().max(254).optional()),
  phone: z.preprocess(blankIsAbsent, z.string().trim().max(40).optional()),
  message: z.preprocess(blankIsAbsent, z.string().trim().max(4000).optional()),
  source_url: z.string().trim().max(500).optional(),
  website: z.string().max(0).optional(),
  turnstile_token: z.string().min(1).max(4096),
})
export type SiteLeadSubmit = z.infer<typeof SiteLeadSubmitSchema>

export const LeadUpdateSchema = z
  .object({
    status: LeadStatusSchema,
    read_at: z.string().nullable(),
  })
  .partial()
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>
