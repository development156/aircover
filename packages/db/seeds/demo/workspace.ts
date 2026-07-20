import {
  ThemeTokensSchema,
  UserProfileUpsertSchema,
  WorkspaceInsertSchema,
  type BillingProvider,
  type SubscriptionStatus,
  type ThemeSource,
  type ThemeStatus,
  type ThemeTokens,
  type TourProgressStatus,
} from '@sahoda/shared'
import { DEMO_MARKER, type SeedCtx, type SeedModule, type SeedTableResult } from './context'
import { extraMembers, seedMembers } from './members'
import { monthStart, nextMonthStart } from './time'

/**
 * Tier 1 of the demo seed: the workspace row every other module hangs off, its
 * membership (./members.ts), the presenter's profile, the plan it bills on, its Brand
 * Skin, and the tour state that keeps onboarding spotlights out of a live walkthrough.
 */

const SUBSCRIPTION_STATUS: SubscriptionStatus = 'active'
const THEME_SOURCE: ThemeSource = 'extracted'
const THEME_STATUS: ThemeStatus = 'active'
const TOUR_STATUS: TourProgressStatus = 'completed'

/**
 * 'fixture' is in the CHECK since 20260718193834_widen_billing_provider.sql. It is the
 * only honest label here: no Cashfree/Stripe object backs this subscription, and
 * calling it 'stripe' would put a fake real-rail row in front of a viewer.
 */
const SUBSCRIPTION_PROVIDER: BillingProvider = 'fixture'

/** The six Alpha tours from 20260718000010_seed.sql. */
const TOUR_SLUGS = [
  'onboarding.first_tour',
  'posts.first_tour',
  'approve.first_tour',
  'connect.first_tour',
  'wallet.first_tour',
  'site.first_tour',
] as const

/**
 * Chai and paper: roasted-chai brown, cardamom green, turmeric accent on warm paper
 * surfaces. Parsed rather than asserted so a drift in ThemeTokensSchema (a fifth
 * surface step, a renamed text ramp) fails at seed time instead of shipping a theme
 * the Brand Skin renderer cannot read.
 */
const CHAI_TOKENS: ThemeTokens = ThemeTokensSchema.parse({
  primary: 'oklch(0.52 0.11 52)',
  primaryFg: 'oklch(0.98 0.01 85)',
  secondary: 'oklch(0.43 0.06 155)',
  accent: 'oklch(0.72 0.15 62)',
  surface: [
    'oklch(0.99 0.007 85)',
    'oklch(0.97 0.012 85)',
    'oklch(0.94 0.016 82)',
    'oklch(0.90 0.02 80)',
  ],
  text: { hi: 'oklch(0.24 0.02 60)', mid: 'oklch(0.44 0.02 60)', low: 'oklch(0.60 0.015 60)' },
  border: 'oklch(0.87 0.015 78)',
  success: 'oklch(0.58 0.12 150)',
  warning: 'oklch(0.75 0.14 75)',
  danger: 'oklch(0.55 0.18 27)',
  radius: '12px',
  fontHeading: 'Fraunces',
  fontBody: 'Inter',
})

async function seedWorkspaceRow(ctx: SeedCtx): Promise<number> {
  const settings = {
    demo: true,
    // The teardown refuses to delete a workspace whose settings lack this exact marker.
    demo_seed: DEMO_MARKER,
    // Written once, never moved. context.ts's pinnedClock() reads this back as the run
    // clock, so on a re-run ctx.now already IS this instant; the on-conflict below keeps
    // the stored value regardless, so a caller passing its own `now` cannot re-date the
    // demo either. Refreshing it would hide staleness rather than fix it.
    seeded_at: ctx.now.toISOString(),
    note: 'Seeded demo data. Safe to delete with pnpm seed:demo:destroy.',
    city: 'Cuttack',
    state: 'Odisha',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  }

  const insert = WorkspaceInsertSchema.parse({
    name: 'Chai & Chapters (Demo)',
    slug: ctx.slug,
    created_by: ctx.ownerId,
    settings,
  })

  await ctx.sql(
    `insert into workspaces as w (id, name, slug, created_by, settings)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do update set
       name = excluded.name,
       slug = excluded.slug,
       created_by = excluded.created_by,
       settings = jsonb_set(excluded.settings, '{seeded_at}',
         to_jsonb(coalesce(w.settings ->> 'seeded_at', excluded.settings ->> 'seeded_at')))`,
    [ctx.workspaceId, insert.name, insert.slug, insert.created_by, JSON.stringify(settings)],
  )
  return 1
}

/**
 * Only the synthetic owner gets a profile. ctx.memberIds are real people; overwriting
 * their display name or Sahoda prefs would be the seed reaching outside its own data.
 *
 * users_profile has no workspace_id and no FK to workspaces, so the cascade delete does
 * not reach it — destroy.ts removes this row by user_id explicitly.
 */
async function seedProfile(ctx: SeedCtx): Promise<number> {
  const prefs = {
    theme_override: null,
    reduced_motion: false,
    sahoda: { muted: false, frequency: 'normal', personality: 'warm' },
    mode: 'guided',
  }

  const profile = UserProfileUpsertSchema.parse({
    user_id: ctx.ownerId,
    email: 'hello@chaiandchapters.demo',
    display_name: 'Chai & Chapters',
    prefs,
  })

  await ctx.sql(
    `insert into users_profile (user_id, email, display_name, avatar_url, prefs)
     values ($1, $2, $3, null, $4::jsonb)
     on conflict (user_id) do update set
       email = excluded.email,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       prefs = excluded.prefs`,
    [profile.user_id, profile.email, profile.display_name, JSON.stringify(prefs)],
  )
  return 1
}

/**
 * The provider ids stay null: a fixture subscription has no external billing object to
 * point at, and provider_subscription_id is globally unique, so a literal like
 * 'sub_demo_chai' would collide the moment a second namespace seeded alongside this one.
 *
 * subscriptions_one_live is a partial unique index on (workspace_id) over the live
 * statuses. Re-running is safe because the id is deterministic, but a hand-added live
 * subscription on this workspace will make the seed fail here rather than double-bill.
 */
async function seedSubscription(ctx: SeedCtx): Promise<number> {
  await ctx.sql(
    `insert into subscriptions (
       id, workspace_id, plan_id, status, provider, provider_customer_id,
       provider_subscription_id, current_period_start, current_period_end,
       cancel_at_period_end
     )
     values ($1, $2, $3, $4, $5, null, null, $6, $7, $8)
     on conflict (id) do update set
       workspace_id = excluded.workspace_id,
       plan_id = excluded.plan_id,
       status = excluded.status,
       provider = excluded.provider,
       provider_customer_id = excluded.provider_customer_id,
       provider_subscription_id = excluded.provider_subscription_id,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end`,
    [
      ctx.id('subscription'),
      ctx.workspaceId,
      'starter',
      SUBSCRIPTION_STATUS,
      SUBSCRIPTION_PROVIDER,
      monthStart(ctx.now),
      nextMonthStart(ctx.now),
      false,
    ],
  )
  return 1
}

/** version 1 is the extracted skin; workspace_themes_one_active keeps it the only active row. */
async function seedTheme(ctx: SeedCtx): Promise<number> {
  await ctx.sql(
    `insert into workspace_themes (
       id, workspace_id, version, tokens, source, diff_log, status, created_by
     )
     values ($1, $2, $3, $4::jsonb, $5, null, $6, $7)
     on conflict (id) do update set
       workspace_id = excluded.workspace_id,
       version = excluded.version,
       tokens = excluded.tokens,
       source = excluded.source,
       diff_log = excluded.diff_log,
       status = excluded.status,
       created_by = excluded.created_by`,
    [
      ctx.id('theme.v1'),
      ctx.workspaceId,
      1,
      JSON.stringify(CHAI_TOKENS),
      THEME_SOURCE,
      THEME_STATUS,
      ctx.ownerId,
    ],
  )
  return 1
}

/**
 * Every tour completed, for the owner and for each real presenter subject. A spotlight
 * firing over the wallet mid-demo reads as a bug to the room, not as onboarding.
 *
 * The PK is (user_id, workspace_id, tour_slug), so there is no surrogate id to conflict on.
 */
async function seedTours(ctx: SeedCtx): Promise<number> {
  const userIds = [ctx.ownerId, ...extraMembers(ctx).map((row) => row.userId)]

  for (const userId of userIds) {
    for (const slug of TOUR_SLUGS) {
      await ctx.sql(
        `insert into tour_progress (user_id, workspace_id, tour_slug, version, step, status)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, workspace_id, tour_slug) do update set
           version = excluded.version,
           step = excluded.step,
           status = excluded.status`,
        [userId, ctx.workspaceId, slug, 1, 0, TOUR_STATUS],
      )
    }
  }
  return userIds.length * TOUR_SLUGS.length
}

export const seedWorkspace: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  const results: readonly SeedTableResult[] = [
    { table: 'workspaces', rows: await seedWorkspaceRow(ctx) },
    { table: 'workspace_members', rows: await seedMembers(ctx) },
    { table: 'users_profile', rows: await seedProfile(ctx) },
    { table: 'subscriptions', rows: await seedSubscription(ctx) },
    { table: 'workspace_themes', rows: await seedTheme(ctx) },
    { table: 'tour_progress', rows: await seedTours(ctx) },
  ]

  ctx.log(`workspace ${ctx.slug} ready (${ctx.memberIds.length} presenter member(s))`)
  return results
}
