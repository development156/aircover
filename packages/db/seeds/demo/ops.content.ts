import type { AiProviderLog, AuditLog, ErrorCode } from '@sahoda/shared'
import type { SeedCtx } from './context'
import { ACTION_COST, FAILED_IMAGE_COGS_USD, type PricedAction } from './costs'
import { postId } from './posts'
import { leadId } from './site'
import { at } from './time'

/**
 * The static half of the ops module: what happened, when, and to which row. Split out of
 * ops.ts to keep both files under the 300-line rule and to put the narrative in one place —
 * editing the demo's activity feed should not mean reading INSERT plumbing.
 */

/** Obviously-fake trace ids: nothing here came from a real provider call. */
export const trace = (slug: string) => `demo-trace-${slug}`

/**
 * Audit rows are listed in the order they happened, and every one is dated against the
 * row it describes rather than against a convenient gap in the calendar: brand.ts writes
 * v1 at -21 16:20 and v2 at -14 10:05 (the instant the odia-poetry memory_event, raised at
 * -16 19:15, was resolved). An activity feed sorted by created_at has to read forwards, so
 * an "edit accepted" entry dated before the brain version it accepted is a bug in the
 * story, not a cosmetic detail.
 */
export function auditRows(ctx: SeedCtx): readonly AuditLog[] {
  const base = { workspace_id: ctx.workspaceId, meta: null } as const
  return [
    {
      ...base,
      id: ctx.id('audit.1'),
      actor: ctx.ownerId,
      action: 'brand.resolved',
      target: { type: 'brand', id: ctx.id('brand.v1') },
      meta: { source: 'website', signal_lock: 'moderate' },
      trace_id: trace('brand-resolve'),
      // One minute after the model call that wrote brand.v1 (brand.ts: at(-21, '16:20')).
      created_at: at(ctx.now, -21, '16:21').toISOString(),
    },
    {
      ...base,
      id: ctx.id('audit.2'),
      actor: ctx.ownerId,
      action: 'connection.linked',
      target: { type: 'connection', id: ctx.id('connection.x'), channel: 'x' },
      trace_id: trace('connect-x'),
      created_at: at(ctx.now, -18, '16:20').toISOString(),
    },
    {
      // connections.ts seeds both platforms, so the trail carries both links. A demo that
      // shows a live GBP connection with no record of anyone granting it reads as a gap.
      ...base,
      id: ctx.id('audit.3'),
      actor: ctx.ownerId,
      action: 'connection.linked',
      target: { type: 'connection', id: ctx.id('connection.gbp'), channel: 'gbp' },
      trace_id: trace('connect-gbp'),
      created_at: at(ctx.now, -18, '16:34').toISOString(),
    },
    {
      // Stamped at brand.v2's own created_at: accepting the writeback IS what wrote v2.
      // `fields` names top-level BrandMemoryPayload keys, checked against brand.ts — the
      // owner's rewrite changed all six, so each one has a diff a reviewer can open.
      ...base,
      id: ctx.id('audit.4'),
      actor: ctx.ownerId,
      action: 'brand.edit_accepted',
      target: { type: 'brand', id: ctx.id('brand.v2') },
      meta: {
        fields: ['voice', 'brand_persona', 'customer_persona', 'hook', 'taboo', 'alignment'],
        version: 2,
      },
      trace_id: trace('brand-edit'),
      created_at: at(ctx.now, -14, '10:05').toISOString(),
    },
    {
      ...base,
      id: ctx.id('audit.5'),
      actor: ctx.ownerId,
      action: 'plan.upgraded',
      target: { type: 'subscription', id: ctx.id('subscription') },
      meta: { from: 'free', to: 'starter' },
      trace_id: trace('upgrade-starter'),
      created_at: at(ctx.now, -14, '10:30').toISOString(),
    },
    {
      ...base,
      id: ctx.id('audit.6'),
      actor: ctx.ownerId,
      action: 'site.generated',
      target: { type: 'site', id: ctx.id('site') },
      meta: { pages: ['home', 'events'] },
      trace_id: trace('site-generate'),
      created_at: at(ctx.now, -12, '12:30').toISOString(),
    },
    {
      ...base,
      id: ctx.id('audit.7'),
      actor: ctx.ownerId,
      action: 'post.approved',
      target: { type: 'post', id: postId(ctx, 'saturday-book-club') },
      trace_id: trace('approve-book-club'),
      created_at: at(ctx.now, -9, '10:45').toISOString(),
    },
    {
      // actor 'system': the scheduler sent this one, the owner only approved it.
      ...base,
      id: ctx.id('audit.8'),
      actor: 'system',
      action: 'post.published',
      target: { type: 'post', id: postId(ctx, 'saturday-book-club') },
      meta: { channels: ['gbp', 'x'], retries: 1, mode: 'fixture' },
      trace_id: trace('publish-book-club'),
      created_at: at(ctx.now, -9, '11:00').toISOString(),
    },
    {
      // Named target, not a bare `{type:'lead'}`: site.ts owns the ids and exports leadId
      // for exactly this. Dated minutes after the owner opened Priyanka's message
      // (site.ts: arrived -5 20:15, read 780 minutes later), because that read is what
      // moves a lead off 'new'.
      ...base,
      id: ctx.id('audit.9'),
      actor: ctx.ownerId,
      action: 'lead.status_changed',
      target: { type: 'lead', id: leadId(ctx, 'priyanka-book-club') },
      meta: { from: 'new', to: 'contacted', source: 'site_form' },
      trace_id: trace('lead-contacted'),
      created_at: at(ctx.now, -4, '09:20').toISOString(),
    },
    {
      // instagram is not publishable in Alpha, so the trail says skipped, never sent.
      ...base,
      id: ctx.id('audit.10'),
      actor: 'system',
      action: 'post.published',
      target: { type: 'post', id: postId(ctx, 'monsoon-reading-list') },
      meta: { channels: ['x', 'gbp'], skipped: ['instagram'], mode: 'fixture' },
      trace_id: trace('publish-monsoon'),
      created_at: at(ctx.now, -3, '09:00').toISOString(),
    },
  ]
}

export interface MeshCall {
  /** Priced action this call performed. Tier, model, COGS and credits all follow from it. */
  readonly action: PricedAction
  /** [tokens_in, tokens_out, cached_tokens, latency_ms] */
  readonly usage: readonly [number, number, number, number]
  readonly traceSlug: string
  readonly at: Date
}

/**
 * Each call mirrors one ledger debit. Only the shape of the traffic is declared here —
 * tokens, latency, when it ran. Tier, model, cost and credits come from ACTION_COST so
 * this table and `credit_ledger` cannot disagree about the same piece of work: the wallet
 * saying "standard tier" while the margin log says Haiku is the exact contradiction the
 * shared cost table exists to prevent.
 */
export function meshCalls(ctx: SeedCtx): readonly MeshCall[] {
  return [
    {
      action: 'brand_research',
      usage: [4820, 1310, 0, 8420],
      traceSlug: 'brand-resolve',
      // The call that produced brand.v1, stamped with that row's own created_at.
      at: at(ctx.now, -21, '16:20'),
    },
    {
      action: 'site_generate',
      usage: [6240, 4980, 1180, 21400],
      traceSlug: 'site-generate',
      at: at(ctx.now, -12, '12:30'),
    },
    {
      action: 'post_variants',
      usage: [1840, 620, 900, 3100],
      traceSlug: 'variants-monsoon',
      at: at(ctx.now, -4, '17:20'),
    },
    {
      action: 'post_variants',
      usage: [1760, 580, 900, 2840],
      traceSlug: 'variants-filter-coffee',
      at: at(ctx.now, -2, '11:05'),
    },
    {
      action: 'post_variants',
      usage: [1920, 660, 900, 3320],
      traceSlug: 'variants-raja-parba',
      at: at(ctx.now, -1, '15:40'),
    },
    {
      action: 'caption_rewrite',
      usage: [380, 210, 0, 1240],
      traceSlug: 'caption-hookify',
      at: at(ctx.now, -4, '17:35'),
    },
  ]
}

/**
 * The image generation that failed — the telemetry half of the ledger's HOLD → RELEASE
 * pair. `credits_charged` is 0 because the hold was released and the shop paid nothing,
 * but `cost_usd` carries what the attempt really cost us: the ledger books the same
 * FAILED_IMAGE_COGS_USD on its RELEASE, and a 0 here would have the two tables
 * contradicting each other about who ate the loss. Alpha has no MeshTaskName for images
 * (ACTION_COST.image_standard has a null tier and null meshTask for that reason), so this
 * row carries the ledger action name with no model rather than inventing a route.
 */
export function failedImageRow(ctx: SeedCtx): AiProviderLog {
  return {
    id: ctx.id('ailog.7'),
    workspace_id: ctx.workspaceId,
    task: 'image_standard',
    tier: ACTION_COST.image_standard.tier,
    provider: 'openrouter',
    model: null,
    tokens_in: null,
    tokens_out: null,
    cached_tokens: null,
    cost_usd: FAILED_IMAGE_COGS_USD,
    latency_ms: 30120,
    credits_charged: 0,
    status: 'error',
    error_code: 'PROVIDER_ERROR' satisfies ErrorCode,
    trace_id: trace('image-raja-parba'),
    created_at: at(ctx.now, -5, '19:12').toISOString(),
  }
}
