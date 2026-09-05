import { z } from 'zod'

// Canonical enum vocabularies. These are the single source; Postgres CHECK
// constraints mirror these exact string sets. Adding a value = editing here AND
// the mirroring migration CHECK (text + CHECK strategy, decision D9).

/**
 * Publishable/target channels.
 *
 * ── WIDENED 2026-08-26 WITH facebook AND telegram ────────────────────────────
 * Adding a value here is not a one-file change. It MUST move together with
 * `20260826120000_widen_channels_facebook_telegram.sql`, which re-adds the CHECK
 * constraint on TEN tables and rewrites `app.is_channel_set` plus three PL/pgSQL
 * guards. Widening this enum alone makes the app accept at the edge what the
 * database refuses at the write.
 *
 * ── WHY THESE TWO AND NOT THE OTHER FOURTEEN ─────────────────────────────────
 * Zernio's spec lists sixteen connectable platforms (MEASURED against
 * `docs.zernio.com/api/openapi`, `/v1/connect/{platform}`). These two are the
 * ones whose posts are shaped like the posts `PlatformSpec` already describes:
 * text plus images, with a character cap.
 *
 *   youtube    is VIDEO. `PlatformSpec` carries `imageDims` and `aspectRange`
 *              and has no duration, codec or resolution field, and the whole
 *              media pipeline is image-shaped. An epic, not a channel.
 *   pinterest  needs a destination link and a BOARD id, and there is nowhere in
 *              `FormattedContent` or `PlatformSpec` to put a board.
 *
 * Adding a channel whose spec cannot be stated honestly would mean inventing
 * limits no engine enforces, which is the failure the whole Constraint Engine
 * exists to prevent.
 */
export const ChannelSchema = z.enum(['x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'])
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
  /**
   * Live on at least one channel and definitively NOT going out on another.
   *
   * Terminal, and recorded rather than flattened: 'failed' would tell someone
   * their post did not go out while it is live on Instagram, and 'published'
   * would hide a channel that silently never went. The dispatcher used to hold
   * these forever for want of this value.
   */
  'partial',
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

/**
 * WHO MADE THIS POST.
 *
 * `playbook` joined on 2026-08-22 with M10. It is a LABEL and never a scope: the
 * playbook kill switch finds its posts through `playbook_run_items.post_id`, not
 * through this column, because a post can carry this origin without any run
 * still pointing at it and destroying that post is the one thing the switch must
 * not do. `kill-switch.pglite.test.ts` plants exactly that row as a control.
 *
 * `radar` joined on 2026-09-03, and it is a REPAIR rather than a new feature.
 * `20260822090000_posts_origin_radar.sql` widened the column's check constraint
 * to four values and is applied to production; this enum was never widened with
 * it, so `PostInsertSchema` refused every draft `draftFromRadarChange` built and
 * the feature has never produced one. Found by a test written for the action's
 * error handling, not by the action failing loudly: the ZodError surfaced as an
 * unhandled throw in a server action, which reads to a person as the screen
 * breaking rather than as the draft being refused.
 *
 * A member added here must also be classified in `AgencyBlade`'s
 * `SAHODA_ORIGINS`, which decides whether the post is shown as Sahoda's work.
 * A Radar draft is Sahoda's, so it is on that list.
 */
export const PostOriginSchema = z.enum(['manual', 'plan_week', 'playbook', 'radar'])
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
 * the same as a channel we can hold a binding for. They no longer coincide at
 * all — this set has fourteen values and `Channel` has six — and the gap is the
 * point. Connecting proves a customer owns an account. Publishing needs a
 * measured `PlatformSpec`, and inventing one is the fabricated figure the
 * Constraint Engine exists to prevent. Do not collapse them.
 *
 * MUST MOVE TOGETHER with `connections_platform_check` and the p_platform guard in
 * `upsert_connection`.
 */
export const ConnectionPlatformSchema = z.enum([
  'x',
  'gbp',
  'linkedin',
  'instagram',
  'facebook',
  'telegram',
  // ── THE EIGHT THAT MADE THIS SET GENUINELY WIDER THAN `Channel` ───────────
  // Added 2026-08-26. Until now the two enums "coincided at four values" and the
  // paragraph above was a warning about a distinction nothing had yet exercised.
  // These eight exercise it: each can be CONNECTED and none can be PUBLISHED to,
  // because publishing needs a `PlatformSpec` and a spec needs measured limits.
  //
  // MEASURED against the live API, not read off documentation. Each was probed
  // with `GET /v1/connect/{platform}?profileId=…` against a real profile and
  // returned HTTP 200 carrying an `authUrl`:
  //
  //   discord  pinterest  reddit  slack  threads  tiktok  whatsapp  youtube
  //
  // The probe mattered. `docs.zernio.com/llms-full.txt` lists `x`, `mastodon`,
  // `medium` and `substack` as connectable — all four answer 400
  // `platform_not_supported` — and omits `reddit`, `slack` and `googlebusiness`,
  // which all answer 200. A documented enum is not a measurement.
  'discord',
  'pinterest',
  'reddit',
  'slack',
  'threads',
  'tiktok',
  'whatsapp',
  'youtube',
])
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

/**
 * The platforms Zernio fronts for us — the ones `upsert_zernio_connection` and
 * `assert_account_for_scheduled_post` admit.
 *
 * Kept beside the enums because three layers must agree on it: the connect route
 * that asks Zernio for an auth URL, the RPC allowlist in Postgres, and the adapter
 * selector. A platform in one and not the others produces a connection row that
 * looks live and can never publish.
 *
 * ── THIS IS A SUBSET OF `Channel`, AND TELEGRAM IS WHY ───────────────────────
 * It reads "channels connectable through the OAuth rail", not "channels we
 * support". Telegram is a real `Channel` whose publish adapter works, and it is
 * absent here because `GET /v1/connect/telegram` returns a bot access CODE
 * rather than an `authUrl` — there is no consent screen to send anyone to.
 * Listing it made its Connect button answer "Couldn't start the connection. Try
 * again." on every press.
 *
 * So: a channel belongs here when it can complete THIS flow, not when it exists.
 */
/**
 * Channels whose connect flow is an OAUTH HANDOFF — a consent screen we can send
 * a customer to and get them back from.
 *
 * MEASURED 2026-08-26 by probing `GET /v1/connect/{platform}` against a real
 * profile, one platform at a time. Thirteen of ours answered 200 with an
 * `authUrl`. Two facts from the same probe are load-bearing and are why our ids
 * are translated rather than passed through (see `connect-platform.ts`):
 *
 *   `x`   answers 400 `platform_not_supported`. Zernio's name is `twitter`.
 *   `gbp` answers 400 too, as does `google_business`. Its name is `googlebusiness`.
 *
 * TELEGRAM IS ABSENT AND THAT IS THE MEASUREMENT, not an omission.
 * `GET /v1/connect/telegram` returns 200 with NO `authUrl` — the body is
 * `{code, expiresAt, expiresIn, botUsername, instructions}`, an access code valid
 * fifteen minutes. There is no consent screen to open, so putting it on this rail
 * gives a button that can only ever fail.
 *
 * SNAPCHAT is absent for a third reason: 403 `PLATFORM_BETA_RESTRICTED`.
 */
export const ZERNIO_PLATFORMS = [
  'instagram',
  'x',
  'gbp',
  'linkedin',
  'facebook',
  'discord',
  'pinterest',
  'reddit',
  'slack',
  'threads',
  'tiktok',
  'whatsapp',
  'youtube',
  /**
   * ── TELEGRAM WAS ABSENT, AND ITS ABSENCE WAS ABOUT THE WRONG QUESTION ─────
   * It was left out because `GET /v1/connect/telegram` returns no `authUrl` —
   * it returns a pairing CODE, so putting it on the OAuth rail gave a button
   * that answered "Couldn't start the connection" on every press.
   *
   * That is a fact about ONE flow, not about whether a workspace may hold a
   * Telegram connection, and this list answers the second question. Membership
   * here is what lets the return route's reconcile sweep find a Telegram account
   * under our profile at all — without it, a link completed inside Telegram is
   * invisible to us for ever.
   *
   * The OAuth start route refuses it explicitly and by name now, pointing at the
   * code-and-poll surface instead. See lib/zernio/connect-platform.ts.
   */
  'telegram',
] as const
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]

export function isZernioPlatform(value: unknown): value is ZernioPlatform {
  return typeof value === 'string' && (ZERNIO_PLATFORMS as readonly string[]).includes(value)
}
