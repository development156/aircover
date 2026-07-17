import { z } from 'zod'

// Canonical enum vocabularies. These are the single source; Postgres CHECK
// constraints mirror these exact string sets. Adding a value = editing here AND
// the mirroring migration CHECK (text + CHECK strategy, decision D9).

/** Publishable/target channels. Alpha publishes to x + gbp (+ linkedin stretch); instagram is text-rules only. */
export const ChannelSchema = z.enum(['x', 'gbp', 'linkedin', 'instagram'])
export type Channel = z.infer<typeof ChannelSchema>

/** Content lifecycle (FSD 0.5). */
export const PostStatusSchema = z.enum([
  'idea',
  'draft',
  'review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'expired',
])
export type PostStatus = z.infer<typeof PostStatusSchema>

/** Per-channel publish sub-status on a variant. */
export const VariantPublishStatusSchema = z.enum([
  'pending',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'skipped',
])
export type VariantPublishStatus = z.infer<typeof VariantPublishStatusSchema>

export const PostOriginSchema = z.enum(['manual', 'plan_week'])
export type PostOrigin = z.infer<typeof PostOriginSchema>

/** Durable-job lifecycle (FSD 0.5). */
export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_final',
  'canceled',
])
export type JobStatus = z.infer<typeof JobStatusSchema>

/** Double-entry ledger entry types (TSD §9). */
export const LedgerEntryTypeSchema = z.enum([
  'GRANT',
  'DEBIT',
  'HOLD',
  'RELEASE',
  'TOPUP',
  'PERF_REWARD',
  'EXPIRE',
  'ADJUST',
])
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>

/** Model Mesh routing tiers (TSD §4). */
export const ModelTierSchema = z.enum(['nano', 'economy', 'standard', 'premium', 'research'])
export type ModelTier = z.infer<typeof ModelTierSchema>

export const PlanIdSchema = z.enum(['free', 'starter', 'growth', 'agency'])
export type PlanId = z.infer<typeof PlanIdSchema>

export const SubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'grace',
  'suspended',
  'canceled',
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const WorkspaceRoleSchema = z.enum(['owner', 'editor', 'approver', 'viewer'])
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>

/** Site section kinds produced by site_generate + stored in site_sections. */
export const SectionKindSchema = z.enum([
  'hero',
  'features',
  'offer',
  'testimonials',
  'faq',
  'contact',
])
export type SectionKind = z.infer<typeof SectionKindSchema>

export const BrandMemoryStatusSchema = z.enum(['active', 'superseded', 'draft'])
export type BrandMemoryStatus = z.infer<typeof BrandMemoryStatusSchema>

/** `resolved` = model output; `manual` = user-edited; `system` = demo-fallback payload (never presented as a real resolve). */
export const BrandMemorySourceSchema = z.enum(['resolved', 'manual', 'system'])
export type BrandMemorySource = z.infer<typeof BrandMemorySourceSchema>

export const MemoryEventSourceSchema = z.enum(['insight', 'user', 'calibration', 'system'])
export type MemoryEventSource = z.infer<typeof MemoryEventSourceSchema>

export const MemoryEventStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'auto'])
export type MemoryEventStatus = z.infer<typeof MemoryEventStatusSchema>

export const PlannerEventKindSchema = z.enum(['note', 'festival', 'custom'])
export type PlannerEventKind = z.infer<typeof PlannerEventKindSchema>

/** OAuth-connected platforms in Alpha. */
export const ConnectionPlatformSchema = z.enum(['x', 'gbp', 'linkedin'])
export type ConnectionPlatform = z.infer<typeof ConnectionPlatformSchema>

export const ConnectionStatusSchema = z.enum(['active', 'expired', 'revoked', 'error'])
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>

/** Honesty flag on publish results/logs — fixture output is always labelled. */
export const PublishModeSchema = z.enum(['live', 'fixture'])
export type PublishMode = z.infer<typeof PublishModeSchema>

export const PublishLogStatusSchema = z.enum(['succeeded', 'failed'])
export type PublishLogStatus = z.infer<typeof PublishLogStatusSchema>

/** Payment rail. Alpha uses Stripe (test mode); Razorpay is backlog #8. */
export const BillingProviderSchema = z.enum(['stripe', 'razorpay'])
export type BillingProvider = z.infer<typeof BillingProviderSchema>

export const WebhookEventStatusSchema = z.enum(['received', 'processed', 'failed'])
export type WebhookEventStatus = z.infer<typeof WebhookEventStatusSchema>

export const SiteStatusSchema = z.enum(['draft', 'deploying', 'published', 'failed', 'unpublished'])
export type SiteStatus = z.infer<typeof SiteStatusSchema>

export const LeadStatusSchema = z.enum(['new', 'contacted', 'qualified', 'won', 'lost'])
export type LeadStatus = z.infer<typeof LeadStatusSchema>

export const ThemeSourceSchema = z.enum(['default', 'extracted', 'manual'])
export type ThemeSource = z.infer<typeof ThemeSourceSchema>

export const ThemeStatusSchema = z.enum(['proposed', 'active', 'reverted', 'archived'])
export type ThemeStatus = z.infer<typeof ThemeStatusSchema>

export const TourProgressStatusSchema = z.enum([
  'active',
  'completed',
  'skipped',
  'dismissed',
  'remind_later',
])
export type TourProgressStatus = z.infer<typeof TourProgressStatusSchema>

/** Outcome recorded on an ai_provider_logs row. */
export const AiLogStatusSchema = z.enum(['ok', 'error', 'fallback'])
export type AiLogStatus = z.infer<typeof AiLogStatusSchema>

/** Signal Lock verdict from the Brand Brain resolve (FSD M1). */
export const SignalLockSchema = z.enum(['strong', 'moderate', 'weak'])
export type SignalLock = z.infer<typeof SignalLockSchema>
