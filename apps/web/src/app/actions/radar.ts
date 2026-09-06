'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { ChannelSchema, PostInsertSchema, toChannelSet, type Channel } from '@sahoda/shared'

import { generateVariants } from '@/app/actions/posts-ai'
import { reportServerError } from '@/lib/observability/report'
import { briefFromChange } from '@/lib/radar/brief'
import { normalizeUrl } from '@/lib/radar/locator'
import { radarStore } from '@/lib/radar/read'
import type { AddCompetitorState, DraftFromChangeState, ReadNowState } from '@/lib/radar/state'
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
 * A Radar draft says it came from Radar.
 *
 * ── THE NOTE THIS REPLACES WAS TRUE WHEN WRITTEN AND IS NOT NOW ──────────────
 * It read "`posts.origin` CANNOT SAY 'radar'", cited `check (origin in
 * ('manual', 'plan_week'))` from migration 20260718000004, and stored a Radar
 * draft as `'manual'` — stating plainly that a later query asking "which posts
 * did a person write by hand" would count these.
 *
 * The column has been widened TWICE since: `20260822030000_playbooks.sql` added
 * `'playbook'`, and `20260822090000_posts_origin_radar.sql` added `'radar'`.
 * MEASURED against production 2026-08-23, the live constraint is
 * `check (origin = any (array['manual','plan_week','playbook','radar']))` — so
 * both the branch and the deployed database admit it, and the comment justifying
 * `'manual'` was pointing at a constraint that no longer exists.
 *
 * That is the more dangerous half of a stale comment: it did not merely go out of
 * date, it argued convincingly for the wrong value, so a reader checking WHY the
 * code writes 'manual' found a citation and stopped looking.
 *
 * Nothing needs backfilling. All five Radar tables are empty in production as of
 * this date, so no post has ever been written by this path.
 *
 * ── AND check-constraints.ts DOES NOT COVER THIS, WHICH I ASSUMED IT DID ─────
 * That guard reads `.eq()`, `.in()` and raw SQL. This is an object PROPERTY on
 * an `.insert({ ... })`, resolved through a scalar const — three things it does
 * not scan, and `resolveConstArrays` handles array consts only. MEASURED: with
 * this set to 'competitor', a value `posts.origin` cannot hold, the whole guard
 * stayed green.
 *
 * So the pin is `radar-origin.test.ts` beside it, which reads the admissible set
 * out of the migrations and requires this literal to be a member.
 */
const RADAR_POST_ORIGIN = 'radar' as const

function isKind(value: unknown): value is CompetitorKind {
  return value === 'website' || value === 'instagram' || value === 'google_business'
}

/**
 * The store's OWN refusals: sentences it writes for the customer, which pass
 * through unchanged. Everything else the store throws is built by interpolating
 * what PostgREST said (`Could not add that competitor: relation "x" does not
 * exist`), and that text is for the server log, never the screen.
 *
 * Matched by phrase rather than by a code because `lib/radar/store.ts` throws
 * plain `Error`s; a typed error carrying a code is the better shape and is owed
 * there. Until then the safe default is the one below: an unrecognised sentence
 * is treated as raw, so a new interpolating throw cannot reach a customer.
 */
const STORE_REFUSALS: readonly RegExp[] = [
  /not collecting/i,
  /only an owner or an editor/i,
  /could not read that address/i,
  /cannot watch/i,
]

function isStoreRefusal(cause: unknown): cause is Error {
  return cause instanceof Error && STORE_REFUSALS.some((pattern) => pattern.test(cause.message))
}

/** Third person, and each says what is true of the watch list afterwards. */
const ADD_FAILED = 'Sahoda could not add that business to your watch list. The list is unchanged.'
const REMOVE_FAILED =
  'Sahoda could not stop watching that business. It is still on your watch list.'
const DRAFT_NOT_STARTED = 'Sahoda could not read your Radar just now, so no draft was started.'
const DRAFT_REFUSED = 'Could not start a draft from that change.'
const DRAFT_UNFINISHED = 'Sahoda started the draft but could not finish it. Find it in your posts.'
const NOT_WATCHING = 'That business is not on your watch list, so Sahoda did not read it.'
const NOTHING_TO_READ =
  'Sahoda has no address on file for that business, so there was nothing to read.'
const READ_FAILED = 'Sahoda could not run that read. Nothing was charged.'
const SHORT_BALANCE =
  'Your balance is short of what a read costs, so Sahoda did not read them. Nothing was charged.'
const CAPPED =
  'Sahoda has reached its own reading limit for today. Nothing was charged, and the weekly scan will pick this up.'
const COULD_NOT_READ = 'Sahoda could not read their page just now. Nothing was charged.'
const SOMETHING_MOVED = 'Sahoda read them just now and something moved. It is in What changed.'
const NOTHING_MOVED = 'Sahoda read them just now. Their page is the same as at the last read.'
const FIRST_READ =
  'Sahoda read them just now. This is the first read, so there is nothing to compare it against yet.'

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
    if (isStoreRefusal(cause)) {
      // The "not collecting yet" case is its OWN reason rather than a generic
      // failure: it is the expected state of an unshipped collector, and telling
      // someone to try again would be advice that cannot work.
      if (/not collecting/i.test(cause.message)) {
        return { ok: false, reason: 'not-collecting', message: cause.message }
      }
      return { ok: false, reason: 'failed', message: cause.message }
    }
    reportServerError(cause, { action: 'addCompetitor', workspaceId: ws.workspace.id })
    return { ok: false, reason: 'failed', message: ADD_FAILED }
  }
}

/**
 * Stop watching a business.
 *
 * RETURNS A MESSAGE ON EVERY REFUSAL, and the reason is that `addCompetitor`
 * already did and this did not — the asymmetry was the defect. The store throws
 * for any Supabase error that is not a missing table, and with no catch here that
 * throw left the server action entirely: Next renders its generic error boundary,
 * which reads as a broken app rather than as "that did not delete".
 *
 * The bare `{ ok: false }` was the other half of it. A caller cannot tell "you are
 * signed out" from "the delete failed" from "there is no workspace", so the only
 * thing it could do with a refusal was ignore it — which `watch-list.tsx` duly did.
 */
export async function removeCompetitor(
  competitorId: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { userId } = await auth()
  if (!userId) return { ok: false, message: 'Sign in to change your watch list.' }
  if (typeof competitorId !== 'string' || competitorId.length === 0) {
    return { ok: false, message: 'That business is no longer on your watch list.' }
  }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  try {
    await radarStore().remove(ws.workspace.id, competitorId)
  } catch (cause) {
    if (isStoreRefusal(cause)) return { ok: false, message: cause.message }
    reportServerError(cause, { action: 'removeCompetitor', workspaceId: ws.workspace.id })
    return { ok: false, message: REMOVE_FAILED }
  }
  revalidatePath(RADAR_CHANGE_REVALIDATE)
  return { ok: true }
}

/**
 * READ ONE BUSINESS NOW.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * MEASURED against production on 2026-09-06: Radar had produced ZERO changes
 * ever. One cron pass had run, on 31 August. A feature whose first answer
 * arrives next Monday is a feature nobody ever sees work, and a customer who
 * adds a competitor and is shown nothing for six days cannot tell an empty
 * result from a broken one.
 *
 * ── IT RUNS THE CRON'S RUNNER, NOT A SECOND ONE ─────────────────────────────
 * `readCompetitorNow` in `@sahoda/jobs/radar` is `runRadarPass` with `only`
 * set. Same cheap-check ladder, same `app.radar_begin_fetch` cap, same
 * SSRF-guarded transport for the competitor's own URL, same ledger. A private
 * copy of any of that would be a second place for money and for a socket to go
 * wrong.
 *
 * ── TWO GATES, AND NEITHER IS DECORATION ────────────────────────────────────
 *   1. HERE, on the CALLER'S session client: is this competitor on your watch
 *      list? RLS answers that honestly because `competitor_subscriptions` is
 *      where tenancy lives.
 *   2. IN THE RUNNER, on the service-role pool: the source query is joined to
 *      the same subscription, and the subscriber list is filtered to this
 *      workspace before anybody is charged. `run.only.test.ts` proves a source
 *      the caller does not watch is never fetched.
 *
 * The registry is SHARED, so a competitor id is not a secret and the first
 * gate alone would be a check that a determined caller simply does not make.
 *
 * ── WHAT IT COSTS, AND WHY PRESSING IT TWICE IS SAFE ────────────────────────
 * `creditCost('radar_scan')`, charged by the same `chargeSubscribers` the cron
 * uses, against the object ref (competitor, ISO week, workspace). A second read
 * in a week already paid for REPLAYS those ledger keys: the page is fetched
 * again and no further money moves. So the button shows the price before the
 * spend and cannot be used to run up a bill.
 *
 * ── THE IMPORT IS DYNAMIC ON PURPOSE ────────────────────────────────────────
 * `@sahoda/jobs/radar` pulls `pg`, the ledger and both providers. This module
 * is imported by client components for its other actions, and a static import
 * would put that graph in every route that offers an add form.
 */
export async function readCompetitorNow(competitorId: unknown): Promise<ReadNowState> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'failed', message: 'Sign in to read a business.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, reason: 'failed', message: ws.message }

  if (typeof competitorId !== 'string' || competitorId.length === 0) {
    return { ok: false, reason: 'not-watching', message: NOT_WATCHING }
  }

  // GATE ONE. Read as the signed-in member, so RLS is what answers.
  try {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('competitor_subscriptions')
      .select('competitor_id')
      .eq('workspace_id', ws.workspace.id)
      .eq('competitor_id', competitorId)
      .maybeSingle()
    if (error) {
      reportServerError(error, { action: 'readCompetitorNow', workspaceId: ws.workspace.id })
      return { ok: false, reason: 'failed', message: READ_FAILED }
    }
    if (!data) return { ok: false, reason: 'not-watching', message: NOT_WATCHING }
  } catch (cause) {
    reportServerError(cause, { action: 'readCompetitorNow', workspaceId: ws.workspace.id })
    return { ok: false, reason: 'failed', message: READ_FAILED }
  }

  try {
    const { readCompetitorNow: runRead } = await import('@sahoda/jobs/radar')
    const report = await runRead({ competitorId, workspaceId: ws.workspace.id })
    // Revalidated on EVERY outcome, refusals included: a wallet that is short
    // is a fact the page's own credit figures should show on the next paint.
    revalidatePath(RADAR_CHANGE_REVALIDATE)
    return describeRead(report)
  } catch (cause) {
    reportServerError(cause, { action: 'readCompetitorNow', workspaceId: ws.workspace.id })
    return { ok: false, reason: 'failed', message: READ_FAILED }
  }
}

/** The shape of a pass report, as this action reads it. */
interface ReadReport {
  considered: number
  unchanged: number
  changed: number
  couldNotCheck: number
  refused: ReadonlyArray<{ sourceId: string; reason: string }>
  changesWritten: number
  credits: { debited: number; unpaid: number }
}

/**
 * ONE PASS REPORT, TURNED INTO ONE SENTENCE — and the order is the point.
 *
 * A refusal is checked BEFORE a success, because a pass that refused one source
 * and read nothing still returns zeroes everywhere else, and "nothing changed"
 * is the one thing this screen may never say about a read that did not happen.
 * Each branch states what is true of the money as well as of the page: FSD M9
 * promises "a page that will not load is skipped and not charged", and a
 * sentence that reports the failure without the charge leaves the reader to
 * wonder.
 */
function describeRead(report: ReadReport): ReadNowState {
  if (report.credits.unpaid > 0 || report.refused.some((r) => r.reason === 'CREDIT_INSUFFICIENT')) {
    return { ok: false, reason: 'insufficient', message: SHORT_BALANCE }
  }
  if (report.refused.some((r) => r.reason === 'DAILY_CAP' || r.reason === 'WORKSPACE_CAP')) {
    return { ok: false, reason: 'capped', message: CAPPED }
  }
  if (report.refused.some((r) => r.reason === 'NOT_SUBSCRIBED') || report.considered === 0) {
    // Either the subscription went away between the two gates, or this business
    // has no address on file to read. Both are "there was nothing to read",
    // which is not the same as a page that would not load.
    return { ok: false, reason: 'not-watching', message: NOTHING_TO_READ }
  }
  if (report.couldNotCheck > 0) {
    return { ok: true, outcome: 'could-not-read', message: COULD_NOT_READ }
  }
  if (report.changesWritten > 0) {
    return { ok: true, outcome: 'moved', message: SOMETHING_MOVED }
  }
  if (report.unchanged > 0) {
    return { ok: true, outcome: 'unchanged', message: NOTHING_MOVED }
  }
  // Read, and there was no earlier read to compare it against. Saying "nothing
  // changed" here would be a claim about a business Sahoda has seen once.
  return { ok: true, outcome: 'read', message: FIRST_READ }
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
  //
  // FILTERED THROUGH THE SCHEMA, not a literal restated here. This was
  // `['x','gbp','linkedin','instagram'].includes(c)`, which kept typechecking
  // after `facebook` and `telegram` joined `ChannelSchema` and silently refused
  // both as "no channel picked".
  const requested = toChannelSet(
    (Array.isArray(channels) ? channels : []).filter(
      (c): c is Channel => ChannelSchema.safeParse(c).success,
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

  // Everything from here reads or writes, and the client does
  // `setOutcome(await draftFromRadarChange(...))`: a rejection is not a state it
  // can render. Two catches rather than one, because "could not read your Radar"
  // and "could not start a draft" are different facts and each is only true on
  // its own path.
  let change: RadarChange | null
  try {
    change = await findChange(workspace.id, changeId)
  } catch (cause) {
    reportServerError(cause, { action: 'draftFromRadarChange', workspaceId: workspace.id })
    return { ok: false, insufficient: false, postId: null, message: DRAFT_NOT_STARTED }
  }
  if (!change) {
    return {
      ok: false,
      insufficient: false,
      postId: null,
      message: 'That change is no longer on your Radar.',
    }
  }

  // `postId` lives outside the try so the catch can say truthfully whether a
  // draft exists.
  let postId: string | null = null
  try {
    const brief = briefFromChange(change, change.reading?.brandBasis ?? null)

    // `safeParse`, because a refused row is a failure to START the draft, not a
    // failure to read the Radar, and the two get different sentences. The refusal
    // itself is logged whole: it names the field.
    const row = PostInsertSchema.safeParse({
      workspace_id: workspace.id,
      title: brief.title,
      body: brief.body,
      status: 'draft',
      channels: [...requested],
      origin: RADAR_POST_ORIGIN,
      created_by: userId,
    })
    if (!row.success) {
      reportServerError(row.error, { action: 'draftFromRadarChange', workspaceId: workspace.id })
      return { ok: false, insufficient: false, postId: null, message: DRAFT_REFUSED }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.from('posts').insert(row.data).select('id').single()

    if (error || !data) {
      if (error) {
        reportServerError(error, { action: 'draftFromRadarChange', workspaceId: workspace.id })
      }
      return { ok: false, insufficient: false, postId: null, message: DRAFT_REFUSED }
    }
    postId = data.id as string

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
  } catch (cause) {
    reportServerError(cause, { action: 'draftFromRadarChange', workspaceId: workspace.id })
    return {
      ok: false,
      insufficient: false,
      postId,
      message: postId === null ? DRAFT_REFUSED : DRAFT_UNFINISHED,
    }
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
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('connections')
      .select('platform')
      .eq('workspace_id', workspace.id)
      .eq('status', 'active')
    // An empty offer is what the caller renders either way, but a read that
    // FAILED must not pass as "nothing connected" in silence: it is logged with
    // the action named, so the two are told apart where somebody can act on it.
    if (error) {
      reportServerError(error, { action: 'connectedChannels', workspaceId: workspace.id })
      return []
    }
    return toChannelSet(
      (data ?? [])
        // ── FILTER THE STRING, THEN NARROW. NEVER THE OTHER WAY ROUND ────────
        // This was `.map((r) => r.platform as Channel)` followed by this filter.
        // The filter saved it, but the cast itself became a lie on 2026-08-26:
        // `connections.platform` can now hold `discord`, `tiktok` and six more
        // that are not `Channel` at all, and an `as` is precisely what the
        // compiler cannot check. Narrowing after the test costs nothing and
        // leaves no false statement for the next reader to trust.
        //
        // Through `ChannelSchema`, not a literal. The four-item literal that
        // stood here silently dropped `facebook` and `telegram` from Radar's
        // offer for a week after they became channels.
        .map((r) => r.platform as string)
        .filter((p): p is Channel => ChannelSchema.safeParse(p).success),
    )
  } catch (cause) {
    reportServerError(cause, { action: 'connectedChannels', workspaceId: workspace.id })
    return []
  }
}
