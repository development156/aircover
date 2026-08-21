'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { PostInsertSchema, toChannelSet, type Channel } from '@sahoda/shared'

import { generateVariants } from '@/app/actions/posts-ai'
import { briefFromChange } from '@/lib/radar/brief'
import { radarStore } from '@/lib/radar/read'
import type { AddCompetitorState, DraftFromChangeState } from '@/lib/radar/state'
import type { CompetitorKind, RadarChange } from '@/lib/radar/types'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

/**
 * RADAR'S WRITES.
 *
 * ── THE DRAFT PATH REUSES `generateVariants` RATHER THAN REIMPLEMENTING IT ───
 * That action already owns the hard part: the HOLD/DEBIT/RELEASE dance, the
 * lost-acknowledgement branch where a charge cannot be confirmed, the object-ref
 * that stops a retry replaying a spent hold. A second copy of that logic living
 * here would be a second place for money to go wrong, and the two would drift.
 *
 * So this action does only what is Radar's own: turn an observation into a
 * brief, write the draft row, and hand the paid step to the code that has always
 * done it.
 *
 * ── WHICH MEANS THE ROW EXISTS BEFORE THE CHARGE, ON PURPOSE ────────────────
 * If generation is refused for want of credits, the customer keeps a draft
 * containing the brief and is charged NOTHING. That is the better failure: the
 * observation is not lost, and the work to recover it is a click rather than
 * finding the change again in a feed that has moved on.
 */

/** FSD M9 caps a scan at one competitor per week; the price is per scan. */
const RADAR_CHANGE_REVALIDATE = '/radar'

/**
 * `posts.origin` CANNOT SAY 'radar', AND THIS IS THE HONEST NOTE ABOUT IT.
 *
 * The column is `check (origin in ('manual', 'plan_week'))` — migration
 * 20260718000004. Widening it is a schema change, applied migrations are
 * immutable, and this lane does not write migrations. So a Radar draft is stored
 * as `'manual'`, which is WRONG IN ONE SPECIFIC WAY worth stating rather than
 * burying: a future query asking "which posts did a person write by hand" will
 * count these.
 *
 * It is not papered over in the UI — the draft's own title names the competitor
 * and the move it answers, so the provenance is legible to the reader even though
 * the column cannot carry it. Recorded in apps/web/REQUESTS.md as a change owed
 * to whoever owns packages/db.
 */
const ORIGIN_UNTIL_RADAR_EXISTS = 'manual' as const

function isKind(value: unknown): value is CompetitorKind {
  return value === 'website' || value === 'instagram' || value === 'google_business'
}

/**
 * A public address, or a refusal.
 *
 * Rejects anything that is not http(s). A `javascript:` or `data:` value entered
 * here would be stored and later rendered as a link, and the collector would be
 * handed a scheme it has no business fetching.
 */
function normalizeUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.toString()
}

export async function addCompetitor(
  name: unknown,
  url: unknown,
  kind: unknown,
): Promise<AddCompetitorState> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, reason: 'failed', message: 'Sign in to change your watch list.' }
  }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, reason: 'failed', message: ws.message }

  if (typeof name !== 'string' || name.trim().length === 0) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Give this business a name you will recognise.',
    }
  }
  if (typeof url !== 'string') {
    return { ok: false, reason: 'invalid', message: 'Paste the public web address to watch.' }
  }
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'That is not a web address Radar can read. It must start with http:// or https://.',
    }
  }
  if (!isKind(kind)) {
    return { ok: false, reason: 'invalid', message: 'Pick what kind of page this is.' }
  }

  try {
    const added = await radarStore().add(ws.workspace.id, {
      name: name.trim(),
      url: normalized,
      kind,
    })
    revalidatePath(RADAR_CHANGE_REVALIDATE)
    return { ok: true, competitorId: added.id }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not add that business.'
    // The "not collecting yet" case is its OWN reason rather than a generic
    // failure: it is the expected state of an unshipped collector, and telling
    // someone to try again would be advice that cannot work.
    if (message.includes('not collecting')) {
      return { ok: false, reason: 'not-collecting', message }
    }
    return { ok: false, reason: 'failed', message }
  }
}

export async function removeCompetitor(competitorId: unknown): Promise<{ ok: boolean }> {
  const { userId } = await auth()
  if (!userId) return { ok: false }
  if (typeof competitorId !== 'string' || competitorId.length === 0) return { ok: false }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false }

  await radarStore().remove(ws.workspace.id, competitorId)
  revalidatePath(RADAR_CHANGE_REVALIDATE)
  return { ok: true }
}

/** Find one change across the feed. The store returns days, not an index. */
async function findChange(workspaceId: string, changeId: string): Promise<RadarChange | null> {
  const snapshot = await radarStore().read(workspaceId)
  for (const day of snapshot.days) {
    const found = day.changes.find((c) => c.id === changeId)
    if (found) return found
  }
  return null
}

/**
 * Turn one observed change into a draft, then adapt it per channel.
 *
 * EVERY OUTPUT IS A DRAFT. `status: 'draft'` is written here and there is no
 * branch that schedules or publishes — the Autonomy Dial's L3 does not ship, and
 * a Radar signal is the last input that should be allowed to reach a live send
 * without a person reading it first.
 */
export async function draftFromRadarChange(
  changeId: unknown,
  channels: unknown,
): Promise<DraftFromChangeState> {
  const { userId } = await auth()
  if (!userId) {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'Sign in to draft a response.',
    }
  }

  const ws = await workspaceForWrite()
  if (!ws.ok) {
    return { ok: false, insufficient: false, postId: null, message: ws.message }
  }
  const workspace = ws.workspace

  if (typeof changeId !== 'string') {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'That change is no longer on your Radar.',
    }
  }

  // A SET. `channels` crosses a server-action boundary as `unknown`, so a
  // hand-rolled call with ['x','x','x'] would ask the model for three X variants
  // against one flat charge — the duplicate-channel defect this repo has already
  // shipped three times. Deduped HERE, before anything reads it.
  const requested = toChannelSet(
    (Array.isArray(channels) ? channels : []).filter(
      (c): c is Channel =>
        typeof c === 'string' && ['x', 'gbp', 'linkedin', 'instagram'].includes(c),
    ),
  )
  if (requested.length === 0) {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'Pick at least one channel to write for.',
    }
  }

  const change = await findChange(workspace.id, changeId)
  if (!change) {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'That change is no longer on your Radar.',
    }
  }

  const brief = briefFromChange(change, change.reading?.brandBasis ?? null)

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('posts')
    .insert(
      PostInsertSchema.parse({
        workspace_id: workspace.id,
        title: brief.title,
        body: brief.body,
        status: 'draft',
        channels: [...requested],
        origin: ORIGIN_UNTIL_RADAR_EXISTS,
        created_by: userId,
      }),
    )
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'Could not start a draft from that change.',
    }
  }
  const postId = data.id as string

  // The ONLY paid step, and it owns its own ledger entry end to end.
  const generated = await generateVariants(postId, [...requested])
  revalidatePath(RADAR_CHANGE_REVALIDATE)
  revalidatePath('/posts')

  if (!generated.ok) {
    if (generated.insufficient) {
      // `postId` is deliberately NOT surfaced on this arm: the shortfall message
      // is about money, and offering a link to a draft in the same breath buries
      // the one thing the reader has to act on. The draft is still there, and
      // /posts is where they will meet it.
      return {
        ok: false,
        insufficient: true,
        required: generated.required,
        available: generated.available,
      }
    }
    return { ok: false, insufficient: false, postId, message: generated.message }
  }

  return {
    ok: true,
    postId,
    variants: generated.variants.length,
    creditsCharged: generated.creditsCharged,
  }
}

/**
 * Which channels this workspace can actually be written for.
 *
 * `status = 'active'`, WHICH IS NOT WHAT THE LOOP QUERIES, and the difference is
 * not cosmetic. `connections.status` is
 * `check (status in ('active','expired','revoked','error'))` — migration
 * 20260718000005 — and `upsert_connection` writes `'active'` on every successful
 * OAuth return. There is no migration anywhere that adds `'connected'`.
 *
 * So `lib/loop/read.ts:97` and `app/actions/loop-cycle.ts:82`, which both filter
 * `.eq('status', 'connected')`, match NOTHING and always will. MEASURED here: an
 * insert of `status: 'connected'` is rejected outright by the constraint, which
 * is how this was found. That belongs to the Loop's lane to fix and to re-run its
 * own tests against — it is recorded in apps/web/REQUESTS.md rather than changed
 * from here, because turning a permanently-empty list into a populated one is a
 * behaviour change in someone else's feature.
 *
 * `lib/connections/read.ts` and `lib/audience/page-data.ts` already use
 * `'active'`. This follows them.
 */
export async function connectedChannels(): Promise<readonly Channel[]> {
  const workspace = await getActiveWorkspace()
  if (!workspace) return []
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('connections')
    .select('platform')
    .eq('workspace_id', workspace.id)
    .eq('status', 'active')
  return toChannelSet(
    (data ?? [])
      .map((r) => r.platform as Channel)
      .filter((p): p is Channel => ['x', 'gbp', 'linkedin', 'instagram'].includes(p)),
  )
}
