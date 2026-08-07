import { z } from 'zod'
import {
  ThemeSourceSchema,
  ThemeStatusSchema,
  TourProgressStatusSchema,
  ModelTierSchema,
  AiLogStatusSchema,
} from '../enums'
import { JsonbSchema, NumericSchema } from '../common'
import { ThemeTokensSchema } from '../theme/tokens'
import { TourDefinitionSchema } from '../guide/tour'

// ── workspace_themes ─────────────────────────────────────────────────────────
export const WorkspaceThemeSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  version: z.int(),
  tokens: ThemeTokensSchema,
  source: ThemeSourceSchema,
  diff_log: JsonbSchema.nullable(),
  status: ThemeStatusSchema,
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type WorkspaceTheme = z.infer<typeof WorkspaceThemeSchema>

// ── guide_tours (⚙ platform content) ─────────────────────────────────────────
export const GuideTourSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  locale: z.string(),
  version: z.int(),
  definition: TourDefinitionSchema,
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type GuideTour = z.infer<typeof GuideTourSchema>

// ── tour_progress (👤 PK: user_id + workspace_id + tour_slug) ────────────────
export const TourProgressSchema = z.object({
  user_id: z.string(),
  workspace_id: z.uuid(),
  tour_slug: z.string(),
  version: z.int(),
  step: z.int(),
  status: TourProgressStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type TourProgress = z.infer<typeof TourProgressSchema>

export const TourProgressUpsertSchema = z.object({
  workspace_id: z.uuid(),
  tour_slug: z.string().min(1),
  version: z.int(),
  step: z.int().default(0),
  status: TourProgressStatusSchema.default('active'),
})
export type TourProgressUpsert = z.infer<typeof TourProgressUpsertSchema>

// ── ai_provider_logs (⚙ service-only; margin telemetry) ──────────────────────
export const AiProviderLogSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  task: z.string(),
  tier: ModelTierSchema.nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.int().nullable(),
  tokens_out: z.int().nullable(),
  cached_tokens: z.int().nullable(),
  cost_usd: NumericSchema.nullable(),
  latency_ms: z.int().nullable(),
  credits_charged: z.int().nullable(),
  status: AiLogStatusSchema.nullable(),
  error_code: z.string().nullable(),
  trace_id: z.string().nullable(),
  created_at: z.string(),
})
export type AiProviderLog = z.infer<typeof AiProviderLogSchema>

// ── audit_logs ────────────────────────────────────────────────────────────────
export const AuditLogSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  actor: z.string(),
  action: z.string(),
  target: JsonbSchema.nullable(),
  meta: JsonbSchema.nullable(),
  trace_id: z.string().nullable(),
  created_at: z.string(),
})
export type AuditLog = z.infer<typeof AuditLogSchema>

// ── app_settings (⚙ service-only) ────────────────────────────────────────────
export const AppSettingSchema = z.object({
  key: z.string(),
  value: JsonbSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type AppSetting = z.infer<typeof AppSettingSchema>
