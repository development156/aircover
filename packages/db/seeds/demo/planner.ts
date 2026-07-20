import { PlannerEventInsertSchema, type PlannerEventKind } from '@sahoda/shared'
import type { SeedCtx, SeedModule, SeedTableResult } from './context'
import { postId } from './posts'
import { at } from './time'

/**
 * The planner calendar for the demo workspace: three Odisha festivals, three shop-floor
 * notes, three in-store events, spread roughly a month either side of the run clock so the
 * month view is never empty whichever way the presenter scrolls.
 *
 * The festivals are NOT real 2026 dates. This seed is clock-relative (see time.ts), so a
 * calendar-pinned Raja Parba would drift into nonsense the moment the demo is re-seeded in
 * another month. Each festival is instead placed at a sensible offset and carries
 * `meta.demo_placement = true`, which is the honest version: the date is illustrative, the
 * festival is real. Their relative order (Raja Parba, then Kumar Purnima, then Bali Jatra)
 * does match the Odia calendar, just with the months compressed into weeks.
 */

/** Weekday index used by `Date#getUTCDay`. */
const SATURDAY = 6

/**
 * Days from `anchor` to the next Saturday, IST. The book club's title says Saturday, so its
 * calendar date has to actually BE one whatever weekday the seed happens to run on — an
 * audience reads the day name off the calendar before it reads the title. Midday IST is
 * 06:30 UTC, so the UTC weekday of that instant is the IST weekday; going through `at()`
 * keeps the +05:30 offset owned by time.ts alone rather than re-deriving it here.
 */
function daysToNextSaturday(anchor: Date): number {
  const istWeekday = at(anchor, 0, '12:00').getUTCDay()
  return (SATURDAY - istWeekday + 7) % 7 || 7
}

interface PlannerSeed {
  /** Kebab-case tail of the frozen `planner.<slug>` id label. */
  readonly slug: string
  readonly kind: PlannerEventKind
  readonly title: string
  readonly startsAt: Date
  readonly endsAt?: Date
  readonly allDay?: boolean
  /** Post label tail to soft-link, e.g. `raja-parba-offer`. */
  readonly postTail?: string
  readonly meta?: Record<string, unknown>
}

function plannerEvents(ctx: SeedCtx): readonly PlannerSeed[] {
  const now = ctx.now
  const bookClubDay = daysToNextSaturday(now)

  return [
    // Multi-day festivals use a half-open interval: ends_at is the first instant AFTER the
    // last day, so "3 days" is a clean 3 × 24h and no consumer has to reason about 23:59.
    {
      slug: 'raja-parba',
      kind: 'festival',
      title: 'Raja Parba, shorter counter hours',
      startsAt: at(now, 7, '00:00'),
      endsAt: at(now, 10, '00:00'),
      allDay: true,
      // The offer post goes out two days ahead of the festival, which is the lead time a
      // shop actually works to; linking them is what makes the calendar feel planned.
      postTail: 'raja-parba-offer',
      meta: { demo_placement: true, festival: 'Raja Parba' },
    },
    {
      slug: 'kumar-purnima',
      kind: 'festival',
      title: 'Kumar Purnima, close by 6pm for moonrise',
      startsAt: at(now, 19, '00:00'),
      allDay: true,
      meta: { demo_placement: true, festival: 'Kumar Purnima' },
    },
    {
      slug: 'bali-jatra',
      kind: 'festival',
      title: 'Bali Jatra week, expect heavy footfall',
      startsAt: at(now, 26, '00:00'),
      endsAt: at(now, 31, '00:00'),
      allDay: true,
      meta: { demo_placement: true, festival: 'Bali Jatra', venue: 'Gadagadia Ghat' },
    },

    {
      slug: 'stock-delivery',
      kind: 'note',
      title: 'Receive stock, 6 cartons of Odia titles',
      startsAt: at(now, -21, '10:00'),
      endsAt: at(now, -21, '11:30'),
    },
    {
      // A reminder is a moment, not a meeting, so it gets no ends_at.
      slug: 'slow-week-note',
      kind: 'note',
      title: 'Keep posting light, quiet week after the rains',
      startsAt: at(now, -11, '09:00'),
    },
    {
      slug: 'roaster-call',
      kind: 'note',
      title: 'Call the coffee roaster about the next batch',
      startsAt: at(now, 3, '16:00'),
      endsAt: at(now, 3, '16:30'),
    },

    {
      slug: 'filter-coffee-tasting',
      kind: 'custom',
      title: 'Serve filter coffee tastings at the counter',
      startsAt: at(now, 2, '16:00'),
      endsAt: at(now, 2, '18:00'),
      // Launch post goes out that morning, tastings run that evening.
      postTail: 'filter-coffee-launch',
    },
    {
      slug: 'saturday-book-club',
      kind: 'custom',
      title: 'Read together at the Saturday book club',
      startsAt: at(now, bookClubDay, '17:00'),
      endsAt: at(now, bookClubDay, '18:30'),
      postTail: 'saturday-book-club',
      // planner_events has no recurrence column in Alpha. The club IS weekly, so the fact
      // lives in meta rather than being faked as nine separate rows.
      meta: { demo_placement: true, recurs: 'weekly', weekday: 'saturday' },
    },
    {
      slug: 'author-evening',
      kind: 'custom',
      title: 'Host an evening of Odia poetry readings',
      startsAt: at(now, 14, '18:30'),
      endsAt: at(now, 14, '20:00'),
      meta: { seats: 30 },
    },
  ]
}

const UPSERT = `
  insert into planner_events
    (id, workspace_id, kind, title, starts_at, ends_at, all_day, post_id, meta)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    kind = excluded.kind,
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    all_day = excluded.all_day,
    post_id = excluded.post_id,
    meta = excluded.meta
`

/**
 * `planner_events.post_id` is a PLAIN FK to `posts (id)` with ON DELETE SET NULL, not the
 * composite `(post_id, workspace_id)` FK the other child tables use. The database will
 * therefore happily accept another tenant's post id here, and RLS would not catch it either
 * — the row's own workspace_id is what policies read. Tenancy is safe by construction in
 * this file because every linked id comes from `postId(ctx, tail)`, which resolves through
 * the same `ctx.id` namespace that posts.ts inserted under `ctx.workspaceId`. Construction
 * is an argument, not a check, so the argument is verified below before the transaction
 * commits.
 */
async function assertLinksStayInTenant(ctx: SeedCtx, postIds: readonly string[]): Promise<void> {
  if (postIds.length === 0) return
  const [row] = await ctx.sql<{ owned: number }>(
    'select count(*)::int as owned from posts where id = any($1::uuid[]) and workspace_id = $2',
    [postIds, ctx.workspaceId],
  )
  if (row?.owned !== postIds.length) {
    throw new Error(
      `planner_events soft-links escaped the workspace: ${postIds.length} linked post ids, ` +
        `${row?.owned ?? 0} owned by ${ctx.workspaceId}`,
    )
  }
}

export const seedPlanner: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  const events = plannerEvents(ctx)

  const rows = events.map((event) => {
    const postIdValue = event.postTail ? postId(ctx, event.postTail) : null
    // Parsing through the shared insert schema means a column rename or a widened enum in
    // @sahoda/shared fails here, at seed time, instead of producing a row the app cannot read.
    const insert = PlannerEventInsertSchema.parse({
      workspace_id: ctx.workspaceId,
      kind: event.kind,
      title: event.title,
      starts_at: event.startsAt.toISOString(),
      ends_at: event.endsAt?.toISOString() ?? null,
      all_day: event.allDay ?? false,
      post_id: postIdValue,
      meta: event.meta ?? null,
    })
    return { id: ctx.id(`planner.${event.slug}`), postIdValue, insert }
  })

  const ids = new Set(rows.map((row) => row.id))
  if (ids.size !== rows.length) {
    throw new Error('planner.<slug> label collision — two events resolved to the same id')
  }

  for (const { id, insert } of rows) {
    await ctx.sql(UPSERT, [
      id,
      insert.workspace_id,
      insert.kind,
      insert.title,
      insert.starts_at,
      insert.ends_at ?? null,
      insert.all_day,
      insert.post_id ?? null,
      insert.meta ? JSON.stringify(insert.meta) : null,
    ])
  }

  const linked = [...new Set(rows.map((row) => row.postIdValue).filter((v) => v !== null))]
  await assertLinksStayInTenant(ctx, linked)

  ctx.log(`planner_events: ${rows.length} rows (${linked.length} linked to posts)`)
  return [{ table: 'planner_events', rows: rows.length }]
}
