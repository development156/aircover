import 'server-only'

import { cache } from 'react'
import {
  CampaignPostSchema,
  CampaignSchema,
  PostSchema,
  PostVariantSchema,
  type Campaign,
  type Post,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { variantStatusRow, type VariantStatusRow } from '@/lib/posts/variant-status'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { rollupCampaigns, type CampaignRollup } from '@/lib/campaigns/rollup'
import type { VariantsRead } from '@/lib/campaigns/cell'

/**
 * Campaign reads, RLS-scoped through the Clerk session JWT.
 *
 * `campaigns` and `campaign_posts` each carry the four tenant policies
 * (`t_select` / `t_insert` / `t_update` / `t_delete`, verified against the live
 * database), so these are plain PostgREST selects with no RPC in the way.
 *
 * Every read is filtered to the ACTIVE workspace. RLS is the security boundary
 * and this filter is NOT an authorization check — the member policy admits every
 * workspace the user belongs to, so without it a list would blend two tenants.
 *
 * ── EVERY READ IS THREE-WAY, AND CAMPAIGNS NEED IT MORE THAN POSTS DO ────────
 * `readPosts` returns `ok | no-workspace | unreadable` because an empty array
 * said three different things at once. Campaigns start at ZERO ROWS FOR EVERY
 * WORKSPACE THAT EXISTS — the tables were applied with nothing reading them — so
 * on day one the genuinely-empty case and the failed-read case are both live and
 * both common. "You have not made a campaign yet" invites an action; "we could
 * not read your campaigns" must not, because creating one is not the remedy and
 * the list may be full.
 */

const LIST_LIMIT = 100
/**
 * Membership rows read in one pass. Deliberately larger than `LIST_LIMIT`: it
 * bounds POSTS-ACROSS-ALL-CAMPAIGNS, not campaigns, and truncating it would
 * under-report a post count — a figure that would then be wrong rather than
 * absent, which is the worse failure.
 */
const MEMBERSHIP_LIMIT = 2000

const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
})

export type CampaignsRead =
  | { status: 'ok'; rollups: CampaignRollup[] }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * Every campaign in the workspace, with the two figures a query can produce.
 *
 * FOUR queries, whatever the campaign count: campaigns, memberships, the posts
 * those memberships name, and nothing else. Taking the posts as one `in (…)`
 * rather than one call per campaign is the difference between a screen and an
 * N+1, and `rollupCampaigns` takes a Map precisely so the loop cannot be
 * rewritten into a fetch.
 */
export async function readCampaigns(): Promise<CampaignsRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data: campaignRows, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (campaignError || !campaignRows) {
      if (campaignError) {
        console.error('[campaigns] list failed', campaignError.code, campaignError.message)
      }
      return { status: 'unreadable' }
    }

    const campaigns = campaignRows.flatMap((row) => {
      const parsed = CampaignSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })

    // No campaigns means no memberships to look for. Skipping the next two
    // queries is not an optimisation — an `in ()` with an empty list is a query
    // shape PostgREST handles differently, and there is nothing to roll up.
    if (campaigns.length === 0) return { status: 'ok', rollups: [] }

    const { data: membershipRows, error: membershipError } = await supabase
      .from('campaign_posts')
      .select('campaign_id, post_id')
      .eq('workspace_id', workspaceId)
      .in(
        'campaign_id',
        campaigns.map((campaign) => campaign.id),
      )
      .limit(MEMBERSHIP_LIMIT)

    // A membership read that failed is NOT zero posts. Reporting the list as
    // readable with every count at zero would put a wrong figure on every card,
    // which is worse than saying the screen could not be read.
    if (membershipError || !membershipRows) {
      if (membershipError) {
        console.error('[campaigns] memberships failed', membershipError.code)
      }
      return { status: 'unreadable' }
    }

    const memberships = membershipRows.flatMap((row) => {
      const record = row as Record<string, unknown>
      return typeof record.campaign_id === 'string' && typeof record.post_id === 'string'
        ? [{ campaign_id: record.campaign_id, post_id: record.post_id }]
        : []
    })

    const postIds = [...new Set(memberships.map((row) => row.post_id))]
    const postsById = new Map<string, Pick<Post, 'id' | 'channels'>>()
    if (postIds.length > 0) {
      const { data: postRows, error: postError } = await supabase
        .from('posts')
        .select('id, channels')
        .eq('workspace_id', workspaceId)
        .in('id', postIds)
      if (postError || !postRows) return { status: 'unreadable' }
      for (const row of postRows) {
        const record = row as Record<string, unknown>
        // Parsed through the shared schema's channel SET, not read as an array:
        // `posts.channels` is a bare `text[]` and the dedupe belongs at the one
        // place both reads and writes pass through.
        const parsed = PostSchema.pick({ id: true, channels: true }).safeParse(record)
        if (parsed.success) postsById.set(parsed.data.id, parsed.data)
      }
    }

    return { status: 'ok', rollups: rollupCampaigns(campaigns, memberships, postsById) }
  } catch (error) {
    console.error('[campaigns] list threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
}

export type CampaignRead =
  { status: 'ok'; campaign: Campaign } | { status: 'missing' } | { status: 'unreadable' }

/**
 * One campaign. `missing` and `unreadable` are separate because only one of them
 * is a 404: a read that threw must not tell a customer their campaign is gone.
 */
export async function readCampaign(campaignId: string): Promise<CampaignRead> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error) return { status: 'unreadable' }
    if (!data) return { status: 'missing' }

    const parsed = CampaignSchema.safeParse(data)
    return parsed.success ? { status: 'ok', campaign: parsed.data } : { status: 'unreadable' }
  } catch {
    return { status: 'unreadable' }
  }
}

export type CampaignPostsRead =
  { status: 'ok'; posts: Post[]; variants: VariantsRead } | { status: 'unreadable' }

/**
 * The posts in one campaign, with the per-channel evidence the grid needs.
 *
 * ── WHY THE VARIANTS COME BACK AS A THREE-WAY READ ───────────────────────────
 * `listVariantStates` in `lib/posts/read.ts` returns an empty Map on any
 * failure, and its own callers can live with that: a chip falls back to a weaker
 * claim. The grid cannot. Every targeted channel with no row renders as "no body
 * yet", so one failed query would report the customer's whole campaign as
 * unwritten — a false claim about their own work, on every cell at once, wearing
 * the costume of a designed empty state.
 *
 * So this reads the variants itself and says which of the two happened. It does
 * not change `listVariantStates`; that function has five other callers across
 * four concurrent branches and its empty-map contract is documented where they
 * read it.
 */
export async function readCampaignPosts(campaignId: string): Promise<CampaignPostsRead> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { data: membershipRows, error: membershipError } = await supabase
      .from('campaign_posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .limit(MEMBERSHIP_LIMIT)

    if (membershipError || !membershipRows) return { status: 'unreadable' }

    const postIds = membershipRows.flatMap((row) => {
      const parsed = CampaignPostSchema.safeParse(row)
      return parsed.success ? [parsed.data.post_id] : []
    })
    if (postIds.length === 0) {
      return { status: 'ok', posts: [], variants: { status: 'ok', byPost: new Map() } }
    }

    const [postResult, variantResult] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('id', postIds)
        .order('updated_at', { ascending: false }),
      supabase
        .from('post_variants')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('post_id', postIds)
        .order('channel', { ascending: true }),
    ])

    if (postResult.error || !postResult.data) return { status: 'unreadable' }

    const posts = postResult.data.flatMap((row) => {
      const parsed = PostSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })

    // The one branch this whole function exists for.
    if (variantResult.error || !variantResult.data) {
      return { status: 'ok', posts, variants: { status: 'unreadable' } }
    }

    const byPost = new Map<string, VariantStatusRow[]>()
    for (const row of variantResult.data) {
      const parsed = PostVariantSchema.safeParse(row)
      if (!parsed.success) continue
      const list = byPost.get(parsed.data.post_id) ?? []
      list.push(variantStatusRow(parsed.data))
      byPost.set(parsed.data.post_id, list)
    }

    return { status: 'ok', posts, variants: { status: 'ok', byPost } }
  } catch (error) {
    console.error('[campaigns] posts threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
}

/**
 * Which campaign each post belongs to — one query for a whole planner page.
 *
 * Returns null on a failed read rather than an empty Map, for the reason this
 * file keeps repeating: an empty Map means "none of these posts is in a
 * campaign", which is a claim, and a planner row would then silently drop a
 * label the customer put there. Null means the caller renders no labels at all,
 * which asserts nothing.
 *
 * A post can hold more than one membership (the table allows it by design), so
 * the value is a LIST. Collapsing it to the first would hide the second campaign
 * from the only screen that shows either.
 */
export async function readCampaignsByPost(
  postIds: readonly string[],
): Promise<Map<string, Array<{ id: string; name: string }>> | null> {
  if (postIds.length === 0) return new Map()

  try {
    // The THREE-WAY read, not the memoised `activeWorkspaceId` the rest of this
    // file uses. That helper folds `unreadable` into `null` on purpose, and its
    // own comment says only callers who cannot render the difference should take
    // it — this one can. Through it, a failed WORKSPACE read returned an empty
    // Map, which is the claim "none of these posts is in a campaign": exactly
    // the lie the null return below exists to prevent, arriving one branch
    // earlier. An account with genuinely no workspace has no memberships either,
    // so that arm keeps the empty Map and is a true statement.
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return null
    if (workspace.status === 'none') return new Map()
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('campaign_posts')
      .select('post_id, campaign_id, campaigns(id, name)')
      .eq('workspace_id', workspaceId)
      .in('post_id', [...postIds])
      .limit(MEMBERSHIP_LIMIT)

    if (error || !data) return null

    const byPost = new Map<string, Array<{ id: string; name: string }>>()
    for (const row of data) {
      const record = row as Record<string, unknown>
      const postId = record.post_id
      // PostgREST returns an embedded to-one either as an object or, on some
      // shapes, as a one-element array. Both are read; neither is assumed.
      const embedded = Array.isArray(record.campaigns) ? record.campaigns[0] : record.campaigns
      if (typeof postId !== 'string' || typeof embedded !== 'object' || embedded === null) continue
      const campaign = embedded as Record<string, unknown>
      if (typeof campaign.id !== 'string' || typeof campaign.name !== 'string') continue
      const list = byPost.get(postId) ?? []
      list.push({ id: campaign.id, name: campaign.name })
      byPost.set(postId, list)
    }
    return byPost
  } catch {
    return null
  }
}

/**
 * Posts NOT already in this campaign — what the "Add posts" picker may offer.
 *
 * Excluding the members client-side rather than with a `not.in` filter: the
 * member list is already in hand from `readCampaignPosts`, and a second
 * negated query would be a second chance for the two to disagree about
 * membership on the same screen.
 */
export type AddablePostsRead =
  | {
      status: 'ok'
      posts: Array<Pick<Post, 'id' | 'title' | 'status' | 'channels'>>
      /**
       * The read hit `LIST_LIMIT` — there are posts this picker is not offering.
       *
       * Carried because the picker's empty message is "every post you have is
       * already in this campaign", and that sentence is FALSE the moment a cap
       * hid the non-members. `lib/posts/read.ts` exports its own limit for this
       * exact reason: "the list screen must be able to SAY it is capped — a
       * truncated list rendered as if it were the whole set is a lie about the
       * workspace's contents."
       */
      capped: boolean
    }
  | { status: 'unreadable' }

export async function readAddablePosts(excludeIds: readonly string[]): Promise<AddablePostsRead> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, status, channels')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }

    const exclude = new Set(excludeIds)
    const shape = PostSchema.pick({ id: true, title: true, status: true, channels: true })
    return {
      status: 'ok',
      // Measured on the ROWS RETURNED, before the member filter. Checking the
      // filtered length would report "not capped" whenever the cap happened to
      // be full of members, which is the case the warning exists for.
      capped: data.length >= LIST_LIMIT,
      posts: data.flatMap((row) => {
        const parsed = shape.safeParse(row)
        if (!parsed.success || exclude.has(parsed.data.id)) return []
        return [parsed.data]
      }),
    }
  } catch {
    return { status: 'unreadable' }
  }
}
