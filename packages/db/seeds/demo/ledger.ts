import {
  ApplyLedgerInputSchema,
  CreditBalanceSchema,
  LedgerEntrySchema,
  PLAN_CATALOG,
  PRICING,
  creditCost,
  debitKey,
  holdKey,
  monthlyGrantKey,
  releaseKey,
  signupGrantKey,
  type ApplyLedgerInput,
  type LedgerEntry,
} from '@sahoda/shared'
import type { SeedCtx, SeedModule } from './context'
import { ACTION_COST, FAILED_IMAGE_COGS_USD, type PricedAction } from './costs'
import { postId } from './posts'
import { periodKey } from './time'

/** Pinned, so the seeded `hold_expires_at` survives a retune of the function's default. */
const HOLD_TTL_SECONDS = 15 * 60

/** Every post that got AI-written channel variants, except the held-then-debited one. */
const VARIANT_POSTS = [
  'monsoon-reading-list',
  'new-arrival-odia-poetry',
  'saturday-book-club',
  'filter-coffee-launch',
  'raja-parba-offer',
  'staff-picks-july',
  'cuttack-heritage-walk',
] as const

/** The two posts carrying a `post_media` row — one generated image each. */
const IMAGE_POSTS = ['monsoon-reading-list', 'filter-coffee-launch'] as const

const CAPTION_REWRITES = [
  { post: 'monsoon-reading-list', reason: 'Shortened the caption to fit the X limit' },
  { post: 'new-arrival-odia-poetry', reason: 'Warmed up the opening line' },
  { post: 'filter-coffee-launch', reason: 'Tightened the offer wording' },
] as const

/**
 * `ACTION_COST.tier` is null where the mesh has no task for the action (image generation), and
 * `modelTier` is optional-not-nullable, so null omits the field rather than inventing a routing.
 */
const tierFor = (action: PricedAction) => ACTION_COST[action].tier ?? undefined

/** One plain DEBIT. `label` is the key suffix and the wallet ref, never the object id. */
function debit(action: PricedAction, label: string, objectRef: string, reason: string) {
  return { action, label, objectRef, reason }
}

/**
 * `credit_ledger.idempotency_key` is globally unique, not per-workspace, so every free-form key
 * carries the run namespace: a `--namespace` run mints its own keys, a repeat namespace replays.
 */
const demoKey = (ctx: SeedCtx, action: string, label: string): string =>
  `demo:${ctx.namespace}:${action}:${label}`

const APPLY_ENTRY = `select app.apply_ledger_entry(
  p_workspace_id => $1, p_entry_type => $2, p_amount => $3, p_idempotency_key => $4,
  p_action_type => $5, p_object_ref => $6, p_model_tier => $7, p_cogs_usd_est => $8::numeric,
  p_settles_entry_id => $9::uuid,
  -- seconds → interval by concat, which keeps NULL as NULL (a 0-length hold expires at once).
  p_hold_ttl => ($10::text || ' seconds')::interval,
  p_actor => $11, p_meta => $12::jsonb
) as result`

/**
 * The single write path. `app.apply_ledger_entry` is service-role-only and lives outside the
 * PostgREST-exposed schema, so it is reachable only over the seed's direct pg connection — and
 * it is the ONLY thing allowed to touch credit_ledger / credit_balances.
 */
async function apply(
  ctx: SeedCtx,
  call: Omit<ApplyLedgerInput, 'workspaceId'>,
): Promise<LedgerEntry> {
  const input = ApplyLedgerInputSchema.parse({
    ...call,
    workspaceId: ctx.workspaceId,
    actor: call.actor ?? ctx.ownerId,
    // `demo: true` on every row keeps a stray seeded entry recognisable in a shared DB.
    meta: { demo: true, ...call.meta },
  })
  const rows = await ctx.sql<{ result: { entry: unknown; replayed: boolean } }>(APPLY_ENTRY, [
    input.workspaceId,
    input.entryType,
    input.amount,
    input.idempotencyKey,
    input.actionType ?? null,
    input.objectRef ?? null,
    input.modelTier ?? null,
    input.cogsUsdEst ?? null,
    input.settlesEntryId ?? null,
    input.holdTtlSeconds ?? null,
    input.actor ?? null,
    JSON.stringify(input.meta),
  ])
  const result = rows[0]?.result
  if (!result) throw new Error(`apply_ledger_entry returned no row for ${input.idempotencyKey}`)
  return LedgerEntrySchema.parse(result.entry)
}

/** 1–2 · the two grants that fund the story. */
async function applyGrants(ctx: SeedCtx, period: string): Promise<void> {
  // The Free plan's monthly credits ARE the welcome grant.
  await apply(ctx, {
    entryType: 'GRANT',
    amount: PLAN_CATALOG.free.monthlyCredits,
    idempotencyKey: signupGrantKey(ctx.workspaceId),
    actionType: 'signup_grant',
    meta: { reason: 'Added welcome credits on signup' },
  })
  await apply(ctx, {
    entryType: 'GRANT',
    amount: PLAN_CATALOG.starter.monthlyCredits,
    idempotencyKey: monthlyGrantKey('starter', period, ctx.workspaceId),
    actionType: 'monthly_grant',
    meta: { reason: `Added Starter plan credits for ${period}`, plan: 'starter', period },
  })
}

/** 3–14 · the spend, in the order it happened. Tier and COGS both come from `./costs`. */
async function applySpend(ctx: SeedCtx, period: string): Promise<void> {
  const debits = [
    debit(
      'brand_research',
      'brand.v1',
      ctx.id('brand.v1'),
      'Built the Brand Brain from the website and Google listing',
    ),
    debit('site_generate', 'site', ctx.id('site'), 'Generated the shop site from the Brand Brain'),
    ...VARIANT_POSTS.map((post) =>
      debit('post_variants', post, postId(ctx, post), 'Wrote channel variants for this post'),
    ),
    ...IMAGE_POSTS.map((post) =>
      debit('image_standard', post, postId(ctx, post), 'Generated the image for this post'),
    ),
    ...CAPTION_REWRITES.map((rewrite) =>
      debit('caption_rewrite', rewrite.post, postId(ctx, rewrite.post), rewrite.reason),
    ),
    // No row to point at, so object_ref names the period the plan covers.
    debit('campaign_plan', period, `plan:${period}`, `Planned the ${period} content calendar`),
  ]
  for (const spend of debits) {
    await apply(ctx, {
      entryType: 'DEBIT',
      amount: creditCost(spend.action),
      idempotencyKey: demoKey(ctx, spend.action, spend.label),
      actionType: spend.action,
      objectRef: spend.objectRef,
      modelTier: tierFor(spend.action),
      cogsUsdEst: ACTION_COST[spend.action].cogsUsd,
      meta: { reason: spend.reason, ref: spend.label },
    })
  }
}

/**
 * 15 · an image generation that FAILED. The RELEASE hands back every credit the HOLD reserved,
 * so the pair nets to zero: seeded on purpose, because the wallet has to prove with a real row
 * that users never pay for our failures. The COGS of the rejected attempt stays recorded (that
 * loss is ours) from the same `./costs` figure `ai_provider_logs` writes, so the two tables can
 * never tell different stories about who ate it.
 */
async function applyFailedImagePair(ctx: SeedCtx): Promise<void> {
  const post = postId(ctx, 'raja-parba-offer')
  const key = holdKey('image_standard', post, 1)
  const hold = await apply(ctx, {
    entryType: 'HOLD',
    amount: creditCost('image_standard'),
    idempotencyKey: key,
    actionType: 'image_standard',
    objectRef: post,
    modelTier: tierFor('image_standard'),
    holdTtlSeconds: HOLD_TTL_SECONDS,
    meta: { reason: 'Reserved credits for a Raja Parba poster' },
  })
  await apply(ctx, {
    entryType: 'RELEASE',
    // Read back off the hold, so the released amount can never disagree with what was held.
    amount: hold.amount,
    idempotencyKey: releaseKey(key),
    actionType: 'image_standard',
    objectRef: post,
    settlesEntryId: hold.id,
    cogsUsdEst: FAILED_IMAGE_COGS_USD,
    meta: {
      reason: 'Returned all reserved credits after the image generation failed',
      error: 'PROVIDER_TIMEOUT',
    },
  })
}

/** 16 · the exam-hours post: held, generated, then settled by a DEBIT. */
async function applyHeldVariantPair(ctx: SeedCtx): Promise<void> {
  const post = postId(ctx, 'exam-season-study-hours')
  const key = holdKey('post_variants', post, 1)
  const hold = await apply(ctx, {
    entryType: 'HOLD',
    amount: creditCost('post_variants'),
    idempotencyKey: key,
    actionType: 'post_variants',
    objectRef: post,
    modelTier: tierFor('post_variants'),
    holdTtlSeconds: HOLD_TTL_SECONDS,
    meta: { reason: 'Reserved credits for exam season study hours' },
  })
  await apply(ctx, {
    entryType: 'DEBIT',
    amount: creditCost('post_variants'),
    idempotencyKey: debitKey(key),
    actionType: 'post_variants',
    objectRef: post,
    modelTier: tierFor('post_variants'),
    cogsUsdEst: ACTION_COST.post_variants.cogsUsd,
    settlesEntryId: hold.id,
    meta: { reason: 'Wrote channel variants for this post', ref: 'exam-season-study-hours' },
  })
}

/** 17 · performance reward. No model ran, so it carries no tier and no COGS. */
async function applyPerfReward(ctx: SeedCtx): Promise<void> {
  await apply(ctx, {
    entryType: 'PERF_REWARD',
    amount: PRICING.perf_reward.per_post,
    idempotencyKey: demoKey(ctx, 'perf_reward', 'monsoon-reading-list'),
    actionType: 'perf_reward',
    objectRef: postId(ctx, 'monsoon-reading-list'),
    meta: { reason: 'Rewarded this post for beating its usual reach' },
  })
}

/**
 * The module's most important claim: the number the wallet screen will show. Restated from
 * PLAN_CATALOG and PRICING rather than summed from the calls above, so it stays an independent
 * check. The failed-image pair is absent on purpose — it charged nothing, and if it ever starts
 * charging, this is what catches it.
 */
async function assertBalance(ctx: SeedCtx): Promise<number> {
  const expectedGranted = PLAN_CATALOG.free.monthlyCredits + PLAN_CATALOG.starter.monthlyCredits
  const expectedSpend =
    creditCost('brand_research') +
    creditCost('site_generate') +
    creditCost('post_variants', VARIANT_POSTS.length + 1) +
    creditCost('image_standard', IMAGE_POSTS.length) +
    creditCost('caption_rewrite', CAPTION_REWRITES.length) +
    creditCost('campaign_plan')
  const expectedTotal = expectedGranted - expectedSpend + PRICING.perf_reward.per_post

  // Read back through the shared row schema. `to_jsonb` first because that schema models the
  // PostgREST shape (timestamps as strings) and node-pg would hand us Date objects.
  const [row] = await ctx.sql<{ balance: unknown }>(
    'select to_jsonb(b) as balance from credit_balances b where workspace_id = $1',
    [ctx.workspaceId],
  )
  if (!row) throw new Error('credit_balances has no row for the demo workspace')
  const balance = CreditBalanceSchema.parse(row.balance)
  if (balance.balance_total !== expectedTotal || balance.balance_held !== 0) {
    throw new Error(
      `demo ledger arithmetic is wrong: got total=${balance.balance_total} ` +
        `held=${balance.balance_held}, expected total=${expectedTotal} held=0 (granted ` +
        `${expectedGranted}, spent ${expectedSpend}, reward ${PRICING.perf_reward.per_post}). ` +
        'A wallet demo must never show a wrong number, and a stuck hold reads as broken.',
    )
  }
  return balance.balance_total
}

export const seedLedger: SeedModule = async (ctx) => {
  // Both date-derived keys (the Starter `monthlyGrantKey`, the `campaign_plan` debit label) only
  // REPLAY because `ctx.now` is pinned to the workspace's original `seeded_at` on a re-run — see
  // `pinnedClock` in context.ts. "Simplify" ctx.now back to `new Date()` and the first re-run
  // after a month rollover mints fresh keys: a second 1500-credit grant and a second
  // campaign_plan debit, which assertBalance then rejects, rolling the whole seed back.
  const period = periodKey(ctx.now)

  // Applied one step at a time, deliberately: apply_ledger_entry takes a row lock on
  // credit_balances and the story only reads correctly in ledger order. Never parallelise.
  await applyGrants(ctx, period)
  await applySpend(ctx, period)
  await applyFailedImagePair(ctx)
  await applyHeldVariantPair(ctx)
  await applyPerfReward(ctx)
  const total = await assertBalance(ctx)

  const [counted] = await ctx.sql<{ rows: number }>(
    'select count(*)::int as rows from credit_ledger where workspace_id = $1',
    [ctx.workspaceId],
  )
  ctx.log(`ledger: ${counted?.rows ?? 0} entries, balance ${total}`)

  return [
    { table: 'credit_ledger', rows: counted?.rows ?? 0 },
    { table: 'credit_balances', rows: 1 },
  ]
}
