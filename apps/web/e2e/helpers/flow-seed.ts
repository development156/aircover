import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The workspace state the FLOW lane photographs.
 *
 * ── WHY SEEDED AND NOT DRIVEN ────────────────────────────────────────────────
 * Same argument `ux-j2-returning.spec.ts` makes: driving this would cost a paid
 * resolve plus a dozen composer round-trips per (width, theme), and the screens
 * under examination start after all of it. Rows go in through `adminClient()` —
 * test scaffolding, never app code — under the workspace the app itself
 * bootstrapped for this run's Clerk user, so `cleanupSupabase` takes every one
 * of them away again. A row hung off any other workspace leaks into the shared
 * dev database, which is how five of them came to be stranded in production.
 *
 * ── WHY THESE FOUR POSTS AND NOT FOUR DRAFTS ─────────────────────────────────
 * `docs/33` §2 measured the real defect on `/posts`: five drafts, all called
 * "Untitled post", none carrying a date. A list where every row looks the same
 * is not a list — and a fixture of four identical drafts photographs a screen
 * that looks fine while being unable to answer the returning user's only
 * question. So the four differ on every axis the list is supposed to show:
 * status, channel count, whether a time is set, and whether a body exists at
 * all. One of them is DELIBERATELY untitled and bodyless, because that row is
 * the one the audit found and it has to stay in the frame.
 */

/** X allows 280 and LinkedIn 3000. Read out of the engine; restated so a drift is visible. */
export const X_MAX = 280

/**
 * The two-channel post the composer is judged on.
 *
 * One source body OVER X's limit and comfortably under LinkedIn's, then two
 * variant bodies that are genuinely different text — not the same string twice.
 * That is the product's one structural claim, and a fixture that wrote the same
 * body to both channels would photograph a composer that cannot be told apart
 * from a single-body editor.
 */
export const DIVERGED = {
  title: 'Saturday cupping, five seats',
  body: `Saturday cupping is open again — five seats, no charge, nine in the morning. ${'We pour four origins and talk through each one. '.repeat(6)}`,
  x: 'Saturday cupping. Five seats, no charge, 9am. Reply to take one.',
  linkedin:
    'We run a free public cupping every Saturday morning. Five seats, four origins, and an hour of talking through what separates them. It is the fastest way we know to teach someone to taste the difference, and it costs nothing.',
} as const

export interface SeedPost {
  title: string | null
  body: string | null
  status: string
  channels: string[]
  /** Hours from now. Negative is in the past. Null means no schedule at all. */
  scheduleInHours: number | null
}

export const POSTS: SeedPost[] = [
  {
    title: 'Tuesday roast is on the shelf',
    body: 'Tuesday roast is on the shelf. Ethiopian Guji, roasted 48 hours ago, and we will tell you the date before you ask.',
    status: 'draft',
    channels: ['instagram'],
    scheduleInHours: null,
  },
  {
    title: DIVERGED.title,
    body: DIVERGED.body,
    status: 'review',
    channels: ['x', 'linkedin'],
    scheduleInHours: null,
  },
  {
    title: 'What a roast date actually tells you',
    body: 'A roast date is the only number on a coffee bag that changes what is in your cup. Here is how to read one.',
    status: 'approved',
    channels: ['linkedin'],
    scheduleInHours: 36,
  },
  {
    // The audit's row, kept on purpose: no title, no body, one channel picked
    // and abandoned. `/posts` has to be legible with this in it.
    title: null,
    body: null,
    status: 'draft',
    channels: ['instagram'],
    scheduleInHours: null,
  },
]

export async function workspaceIdFor(
  admin: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('created_by', clerkUserId)
    .limit(1)
  return data?.[0]?.id ?? null
}

export interface SeedResult {
  /** The two-channel post, which is the composer's subject. Null if the insert failed. */
  divergedPostId: string | null
  inserted: number
}

/**
 * Write the rows and hand back the id the composer frames need.
 *
 * Returns a COUNT rather than void: a seeder that silently inserted nothing
 * produces a full set of "empty state" frames labelled populated, and the
 * manifest would look complete. The caller asserts on it.
 */
export async function seedFlowWorkspace(
  admin: SupabaseClient,
  workspaceId: string,
  clerkUserId: string,
): Promise<SeedResult> {
  let divergedPostId: string | null = null
  let inserted = 0

  for (const post of POSTS) {
    const scheduledAt =
      post.scheduleInHours === null
        ? null
        : new Date(Date.now() + post.scheduleInHours * 3600 * 1000).toISOString()

    const { data } = await admin
      .from('posts')
      .insert({
        workspace_id: workspaceId,
        title: post.title,
        body: post.body,
        status: post.status,
        channels: post.channels,
        scheduled_at: scheduledAt,
        created_by: clerkUserId,
      })
      .select('id')
      .limit(1)

    const postId = data?.[0]?.id as string | undefined
    if (!postId) continue
    inserted += 1
    if (post.title === DIVERGED.title) divergedPostId = postId

    for (const channel of post.channels) {
      // TWO DIFFERENT BODIES on the two-channel post, which is the whole point
      // of it. Everywhere else the variant carries the source body, which is
      // what an ungenerated channel actually holds.
      const body =
        post.title === DIVERGED.title
          ? channel === 'x'
            ? DIVERGED.x
            : DIVERGED.linkedin
          : (post.body ?? '')
      await admin.from('post_variants').insert({
        workspace_id: workspaceId,
        post_id: postId,
        channel,
        body,
        char_count: body.length,
        publish_status: 'pending',
      })
    }
  }

  return { divergedPostId, inserted }
}
