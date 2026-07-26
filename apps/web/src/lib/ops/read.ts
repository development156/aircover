import 'server-only'

import { cache } from 'react'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import {
  OpsQaRunSchema,
  OpsRoadmapItemSchema,
  OpsSessionSchema,
  OpsTaskSchema,
  type OpsQaRun,
  type OpsRoadmapItem,
  type OpsSession,
  type OpsTask,
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
