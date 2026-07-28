import 'server-only'

import { cache } from 'react'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import {
  OpsChangelogEntrySchema,
  OpsQaRunSchema,
  OpsQaArtifactSchema,
  OpsRoadmapItemSchema,
  OpsSessionSchema,
  OpsCreditRequestSchema,
  OpsAdminSchema,
  OpsBetaApplicationSchema,
  OpsTaskSchema,
  type OpsChangelogEntry,
  type OpsQaRun,
  type OpsQaArtifact,
  type OpsRoadmapItem,
  type OpsSession,
  type OpsTask,
  type OpsCreditRequest,
  type OpsAdmin,
  type OpsBetaApplication,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Reads for the `/admin` console.
 *
 * All of them go through the caller's own Clerk JWT, so `app.is_ops_admin()`
 * decides what comes back — the same policy that makes `requireOpsAdmin()`
 * authoritative. There is no service-role client here and there must never be
 * one: `lib/ops/service-rpc.ts` is the single service-role surface in this app
 * and it exposes exactly one RPC.
 *
 * Every read answers two-way — `ok` or `unreadable` — and never an empty array
 * on failure. An empty board and a board we could not read look identical to a
 * caller that collapses them, and they mean opposite things: one is "no work",
 * the other is "we do not know". The console says which.
 */

export type OpsRead<T> = { status: 'ok'; data: T } | { status: 'unreadable'; eventId?: string }

/** The suites the gates strip covers (doc 13 §12), in the order it shows them. */
export const GATE_SUITES = ['typecheck', 'lint', 'unit', 'rls', 'smoke'] as const
export type GateSuite = (typeof GATE_SUITES)[number]

/**
 * How many recent runs to scan when reducing to "latest per suite".
 *
 * PostgREST has no DISTINCT ON, so the newest-per-suite is derived in JS from a
 * bounded window. 300 is comfortably more than five suites' worth of recency —
 * a full gate writes three rows — but it IS a window, so a suite that has not
 * run in the last 300 rows reads as "never run" rather than stale-green. That
 * is the safe direction: doc 13 §12 shows age next to every chip.
 */
const GATE_SCAN_LIMIT = 300

function unreadable(scope: string, error: unknown): { status: 'unreadable'; eventId?: string } {
  // Swallowed for the viewer, never for us — a console that quietly renders
  // "no data" over a broken read is the failure mode this whole panel exists
  // to make impossible.
  const eventId = Sentry.captureException(error, { tags: { ops_read: scope } })
  return { status: 'unreadable', eventId }
}

async function readAll<T>(
  scope: string,
  schema: z.ZodType<T>,
  query: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<OpsRead<T>> {
  try {
    const { data, error } = await query()
    if (error) return unreadable(scope, error)

    // Parsed as a whole rather than row-by-row with the bad ones dropped.
    // Silently discarding rows that no longer match the contract would show a
    // shorter board and call it the board.
    const parsed = schema.safeParse(data)
    if (!parsed.success) return unreadable(scope, parsed.error)

    return { status: 'ok', data: parsed.data }
  } catch (error) {
    return unreadable(scope, error)
  }
}

/** Every roadmap item, all stages. 39 rows today; the card slices by stage. */
export const readRoadmapItems = cache(async (): Promise<OpsRead<OpsRoadmapItem[]>> => {
  const supabase = createServerSupabase()
  return readAll('roadmap_items', z.array(OpsRoadmapItemSchema), () =>
    supabase.from('ops_roadmap_items').select('*').order('sort', { ascending: true }),
  )
})

/** Live board cards. Archived rows are excluded — they are history, not work. */
export const readTasks = cache(async (): Promise<OpsRead<OpsTask[]>> => {
  const supabase = createServerSupabase()
  return readAll('tasks', z.array(OpsTaskSchema), () =>
    supabase
      .from('ops_tasks')
      .select('*')
      .eq('archived', false)
      .order('sort', { ascending: true })
      .limit(2000),
  )
})

/**
 * Changelog entries, newest first. Bounded — the rail shows recent history, and
 * the full record belongs in an export rather than in one scrolling column.
 */
export const readChangelog = cache(async (): Promise<OpsRead<OpsChangelogEntry[]>> => {
  const supabase = createServerSupabase()
  return readAll('changelog', z.array(OpsChangelogEntrySchema), () =>
    supabase.from('ops_changelog').select('*').order('seq', { ascending: false }).limit(100),
  )
})

/**
 * Recent QA runs across every suite, newest first — the board's QA dots and,
 * later, the QA console feed. Bounded: the dot only needs the newest run per
 * card, and an unbounded select would grow without limit as hooks fire.
 */
export const readRecentQaRuns = cache(async (): Promise<OpsRead<OpsQaRun[]>> => {
  const supabase = createServerSupabase()
  return readAll('qa_runs', z.array(OpsQaRunSchema), () =>
    supabase.from('ops_qa_runs').select('*').order('started_at', { ascending: false }).limit(500),
  )
})

/**
 * Recent sessions, newest heartbeat first.
 *
 * A window rather than "the working one": deciding what counts as live is
 * `pulseOf`'s job, and it needs the runners-up to answer "idle since when".
 */
export const readSessions = cache(async (): Promise<OpsRead<OpsSession[]>> => {
  const supabase = createServerSupabase()
  return readAll('sessions', z.array(OpsSessionSchema), () =>
    supabase
      .from('ops_sessions')
      .select('*')
      .order('last_heartbeat_at', { ascending: false })
      .limit(20),
  )
})

/**
 * The newest run for each gate suite, or null where a suite has never run.
 *
 * `null` is deliberately not "green". A suite nobody has run is not a suite
 * that passed, and the gates strip renders the two differently.
 */
export const readGateRuns = cache(
  async (): Promise<OpsRead<Record<GateSuite, OpsQaRun | null>>> => {
    const supabase = createServerSupabase()
    const runs = await readAll('gate_runs', z.array(OpsQaRunSchema), () =>
      supabase
        .from('ops_qa_runs')
        .select('*')
        .in('suite', [...GATE_SUITES])
        .order('started_at', { ascending: false })
        .limit(GATE_SCAN_LIMIT),
    )
    if (runs.status !== 'ok') return runs

    const latest = Object.fromEntries(GATE_SUITES.map((suite) => [suite, null])) as Record<
      GateSuite,
      OpsQaRun | null
    >
    for (const run of runs.data) {
      const suite = run.suite as GateSuite
      if (suite in latest && latest[suite] === null) latest[suite] = run
    }

    return { status: 'ok', data: latest }
  },
)

/**
 * Credit requests, newest first.
 *
 * `otp_hash` is absent from OpsCreditRequestSchema on purpose, and selecting *
 * would therefore fail the parse if the column ever came back — which is the
 * point. A hashed one-time code has no business travelling to a browser, so the
 * columns are named rather than starred.
 */
export const readCreditRequests = cache(async (): Promise<OpsRead<OpsCreditRequest[]>> => {
  const supabase = createServerSupabase()
  return readAll('credit_requests', z.array(OpsCreditRequestSchema), () =>
    supabase
      .from('ops_credit_requests')
      .select(
        'id,workspace_id,workspace_label,amount,reason,requested_by,approver_id,attempts,' +
          'self_approved,status,denied_reason,ledger_idempotency_key,decided_at,created_at,updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(50),
  )
})

/** Every seat, for the team screen and the approver picker. */
export const readOpsAdmins = cache(async (): Promise<OpsRead<OpsAdmin[]>> => {
  const supabase = createServerSupabase()
  return readAll('ops_admins', z.array(OpsAdminSchema), () =>
    supabase.from('ops_admins').select('*').order('email', { ascending: true }),
  )
})

/** The applications inbox, newest first. */
export const readApplications = cache(async (): Promise<OpsRead<OpsBetaApplication[]>> => {
  const supabase = createServerSupabase()
  return readAll('beta_applications', z.array(OpsBetaApplicationSchema), () =>
    supabase
      .from('ops_beta_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
  )
})

/**
 * The caller's own open draft, if they left one behind (doc 13 §11).
 *
 * Scoped to `actor` as well as `status`, and that is not belt-and-braces: RLS on
 * `ops_qa_runs` admits every ops admin to every row, because the console is a
 * shared record. So "the open draft" without an actor filter would hand one
 * person another's half-written notes — and `ops_qa_draft_save` would then
 * refuse every autosave against it, leaving them typing into a form that can
 * never save.
 *
 * Not `cache`d across requests on purpose: this is the one read whose staleness
 * a person would notice immediately, because they are the one who changed it.
 */
export async function readMyOpenQaDraft(actor: string): Promise<OpsRead<OpsQaRun | null>> {
  const supabase = createServerSupabase()
  return readAll('qa_open_draft', OpsQaRunSchema.nullable(), () =>
    supabase
      .from('ops_qa_runs')
      .select('*')
      .eq('status', 'running')
      .eq('kind', 'manual')
      .ilike('actor', actor)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
}

/** Artifact rows for one run. Paths only — the URLs are signed separately. */
export async function readQaArtifacts(runId: string): Promise<OpsRead<OpsQaArtifact[]>> {
  const supabase = createServerSupabase()
  return readAll('qa_artifacts', z.array(OpsQaArtifactSchema), () =>
    supabase
      .from('ops_qa_artifacts')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true }),
  )
}

/**
 * Signed READ urls for thumbnails. §3: private bucket, 10-minute TTL.
 *
 * Returns a map rather than an array so a path that fails to sign simply has no
 * entry, and the caller renders a placeholder for that one instead of losing
 * the whole strip.
 */
export async function signQaArtifactViews(
  paths: readonly string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}

  const supabase = createServerSupabase()
  const { data, error } = await supabase.storage
    .from('qa-artifacts')
    .createSignedUrls([...paths], 600)

  if (error || !data) return {}

  const urls: Record<string, string> = {}
  for (const entry of data) {
    if (entry.signedUrl && entry.path) urls[entry.path] = entry.signedUrl
  }
  return urls
}
