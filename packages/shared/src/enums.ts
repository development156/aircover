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

/**
 * Platforms that can hold a row in `connections`.
 *
 * Two KINDS of connection now live under one vocabulary, and the difference is a
 * security property rather than a detail:
 *   · x | gbp | linkedin — an OAuth grant WE hold. Mandatory `connection_secrets`
 *     row; written only by `upsert_connection`, which raises INVALID_SECRET without
 *     a sealed token.
 *   · instagram — a REFERENCE to an account ZERNIO holds. No `connection_secrets`
 *     row at all; written only by `upsert_zernio_connection`. Zernio owns the Meta
 *     token and our app never sees one (doc 13 §7).
 *
 * Still deliberately NOT the same set as `Channel`: a channel we can address is not
 * the same as a channel we can hold a binding for. They coincide today at four
 * values; do not collapse them.
 *
 * MUST MOVE TOGETHER with `connections_platform_check` and the p_platform guard in
 * `upsert_connection`.
 */
export const ConnectionPlatformSchema = z.enum(['x', 'gbp', 'linkedin', 'instagram'])
export type ConnectionPlatform = z.infer<typeof ConnectionPlatformSchema>

export const ConnectionStatusSchema = z.enum(['active', 'expired', 'revoked', 'error'])
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>

/** Honesty flag on publish results/logs — fixture output is always labelled. */
export const PublishModeSchema = z.enum(['live', 'fixture'])
export type PublishMode = z.infer<typeof PublishModeSchema>

export const PublishLogStatusSchema = z.enum(['succeeded', 'failed'])
export type PublishLogStatus = z.infer<typeof PublishLogStatusSchema>

/** Payment rail. Alpha uses Stripe (test mode); Razorpay is backlog #8. 'cashfree' is the
 *  India rail; 'fixture' labels sandbox/test events (mirrors the DB provider CHECK). */
export const BillingProviderSchema = z.enum(['stripe', 'razorpay', 'cashfree', 'fixture'])
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

// ── Admin Ops (doc 13) ───────────────────────────────────────────────────────
// Platform-scope vocabularies for the ten ops_* tables. Same rule as above: these
// are the single source and the migration CHECKs mirror them exactly.

/** `/admin` seat level. owner also manages admins; viewer never approves or grants. */
export const OpsRoleSchema = z.enum(['owner', 'admin', 'viewer'])
export type OpsRole = z.infer<typeof OpsRoleSchema>

export const OpsAdminStatusSchema = z.enum(['active', 'revoked'])
export type OpsAdminStatus = z.infer<typeof OpsAdminStatusSchema>

/** Beta application lifecycle (doc 13 §4). */
export const OpsApplicationStatusSchema = z.enum([
  'new',
  'contacted',
  'invited',
  'joined',
  'rejected',
])
export type OpsApplicationStatus = z.infer<typeof OpsApplicationStatusSchema>

/** Maker-checker credit request lifecycle (doc 13 §6). */
export const OpsCreditRequestStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired'])
export type OpsCreditRequestStatus = z.infer<typeof OpsCreditRequestStatusSchema>

export const OpsRoadmapStatusSchema = z.enum(['todo', 'active', 'done', 'cut'])
export type OpsRoadmapStatus = z.infer<typeof OpsRoadmapStatusSchema>

/**
 * The four fixed scrum columns (doc 13 §10). Named board_column on the row
 * because `column` is a reserved word in Postgres.
 */
export const OpsTaskColumnSchema = z.enum(['todo', 'in_progress', 'review', 'done'])
export type OpsTaskColumn = z.infer<typeof OpsTaskColumnSchema>

export const OpsAssigneeSchema = z.enum(['claude', 'divas', 'girija', 'both'])
export type OpsAssignee = z.infer<typeof OpsAssigneeSchema>

/** Who moved a card. Automation defaults; a human drag stamps 'human' (doc 13 §10). */
export const OpsMovedBySchema = z.enum(['claude', 'human'])
export type OpsMovedBy = z.infer<typeof OpsMovedBySchema>

export const OpsChangelogKindSchema = z.enum([
  'added',
  'changed',
  'fixed',
  'removed',
  'security',
  'docs',
])
export type OpsChangelogKind = z.infer<typeof OpsChangelogKindSchema>

/**
 * The fixed trio (doc 13 §8). Assigned server-side from the changelog sequence —
 * never set by a client, so this schema exists to read rows, not to write them.
 */
export const OpsChangelogAuthorSchema = z.enum(['DIVAS', 'GIRIJA', 'DIVAS AND GIRIJA'])
export type OpsChangelogAuthor = z.infer<typeof OpsChangelogAuthorSchema>

export const OpsQaKindSchema = z.enum(['auto', 'manual'])
export type OpsQaKind = z.infer<typeof OpsQaKindSchema>

export const OpsQaSuiteSchema = z.enum([
  'typecheck',
  'lint',
  'unit',
  'rls',
  'smoke',
  'e2e',
  'manual',
])
export type OpsQaSuite = z.infer<typeof OpsQaSuiteSchema>

/** 'running' is also the manual composer's autosaved draft state (doc 13 §11). */
export const OpsQaStatusSchema = z.enum(['pass', 'fail', 'blocked', 'running'])
export type OpsQaStatus = z.infer<typeof OpsQaStatusSchema>

export const OpsSessionStatusSchema = z.enum(['working', 'idle', 'ended'])
export type OpsSessionStatus = z.infer<typeof OpsSessionStatusSchema>

/** Screenshot formats the qa-artifacts bucket accepts (doc 13 §3). */
export const OpsArtifactMimeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp'])
export type OpsArtifactMime = z.infer<typeof OpsArtifactMimeSchema>
