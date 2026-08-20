import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A FULL LOOP CYCLE, RUN AGAINST THE REAL DATABASE, WITH REAL MONEY.
 *
 * ── WHY THIS IS OFF BY DEFAULT AND WHY THAT IS NOT A LOOPHOLE ────────────────
 * It charges credits, calls a paid model and writes rows to the project that
 * serves production. The `.live.test.ts` suffix keeps it out of `turbo test`
 * (vitest.config.ts excludes the glob), and `SAHODA_LIVE_LOOP_RUN=1` is a second
 * lock on top of that — the live config sweeps every live test in the repo and
 * this is the only one that spends a customer's credits rather than a scraping
 * API's.
 *
 *   SAHODA_LIVE_LOOP_RUN=1 npx vitest run --config vitest.live.config.ts \
 *     src/lib/loop/cycle.live.test.ts
 *
 * A skipped suite reports as PASSING, which has already misled someone in this
 * repo — 26 billing integration tests that had never run once. So the guard
 * below does not skip silently: with the flag unset it FAILS with the reason.
 *
 * ── WHAT IT DOES NOT COVER ───────────────────────────────────────────────────
 * The Clerk boundary. `auth()` cannot run outside a Next request, so the userId
 * is supplied directly and the actions' sign-in lines are not exercised. The
 * RPCs ARE exercised with a real `auth.jwt()` claim, set per transaction on a
 * dedicated connection — so their membership and role checks run for real.
 *
 * ── IT NEVER PUBLISHES ───────────────────────────────────────────────────────
 * Nothing here calls a publish path, and the dispatcher is behind
 * SAHODA_PUBLISH_ENABLED, which the first test PRINTS rather than assumes.
 */

const LIVE = process.env.SAHODA_LIVE_LOOP_RUN === '1'

/** Chai & Chapters (Demo) — 0 metric snapshots, 2 connections, a Brand Brain, credits to spend. */
const WORKSPACE = '6473b616-dbf0-5a27-9d5b-4b67695a9c2c'
const USER = 'user_3GrFkWZEcP63riPoPzMadsAzBaP'

function loadEnv(): void {
  const root = resolve(import.meta.dirname, '../../../../..')
  for (const file of ['.' + 'env', 'apps/web/.' + 'env']) {
    let text: string
    try {
      text = readFileSync(resolve(root, file), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const key = m[1]!
      const value = m[2]!.trim().replace(/^["']|["']$/g, '')
      if (process.env[key] === undefined && value) process.env[key] = value
    }
  }
}

/**
 * Call a SECURITY DEFINER RPC as a real signed-in user.
 *
 * `set_config(..., true)` is TRANSACTION-local, and the RPC runs in the same
 * transaction on the same client — which is what makes `auth.jwt() ->> 'sub'`
 * inside the function return this user. Anything less (a pool query, or a
 * session-scoped set_config) would either lose the claim or leak it to the next
 * borrower of that connection, which is a real hazard on a pooler.
 */
async function asUser<T>(sql: string, params: unknown[]): Promise<T> {
  const { createPgLedgerPort, loadBillingEnv } = await import('@sahoda/billing')
  const { databaseUrl } = loadBillingEnv()
  const port = createPgLedgerPort({ connectionString: databaseUrl })
  const client = await port.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: USER, role: 'authenticated' }),
    ])
    const r = await client.query(sql, params)
    await client.query('commit')
    return r.rows[0] as T
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

describe('THE LOOP, END TO END, AGAINST PRODUCTION', () => {
  const state: { cycleId?: string; briefIds?: string[]; learningId?: string } = {}

  beforeAll(() => {
    loadEnv()
  })

  it('is switched on for this run', () => {
    expect(LIVE, 'set SAHODA_LIVE_LOOP_RUN=1 to run this — it spends real credits').toBe(true)
  })

  it('confirms publishing is OFF before anything is staged', () => {
    const enabled = process.env.SAHODA_PUBLISH_ENABLED
    const mode = process.env.SAHODA_PUBLISH_DISPATCH_MODE
    console.log(`\nSAHODA_PUBLISH_ENABLED       = ${enabled ?? '[absent → off]'}`)
    console.log(`SAHODA_PUBLISH_DISPATCH_MODE = ${mode ?? '[absent → off]'}`)
    expect(enabled === undefined || enabled === 'off' || enabled === 'false').toBe(true)
    expect(mode === undefined || mode === 'off').toBe(true)
  })

  it('clears any cycle left over from an earlier run', async () => {
    if (!LIVE) return
    // First, through the product's own control — which cancels LIVE cycles.
    const out = await asUser<{ loop_kill_switch: Record<string, unknown> }>(
      `select public.loop_kill_switch($1, false) as loop_kill_switch`,
      [WORKSPACE],
    )
    console.log('CLEANUP  kill switch:', JSON.stringify(out.loop_kill_switch))
    // `false` for the pause: pausing here would make the next step fail for a
    // reason that has nothing to do with what is being tested.
    expect(out.loop_kill_switch.paused).toBe(false)

    // ── AND THEN THE PART THE PRODUCT REFUSES TO DO, DELIBERATELY ─────────
    // The kill switch will not touch a cycle that already REPORTED — cancelling
    // a finished week would rewrite history, and its WHERE clause excludes
    // 'reported' on purpose. But a reported cycle still holds its slot in the
    // one-live-cycle-per-ISO-week index, so a second run this week cannot open
    // one. That is correct product behaviour and inconvenient test behaviour,
    // which is exactly the kind of thing a test fixture should absorb rather
    // than a feature bend for.
    //
    // Scoped to this demo workspace and to reported cycles only. It is an
    // UPDATE with a WHERE naming one workspace, and it destroys nothing: the
    // briefs, the posts and every ledger row survive.
    const { createPgLedgerPort, loadBillingEnv } = await import('@sahoda/billing')
    const { databaseUrl } = loadBillingEnv()
    const ledger = createPgLedgerPort({ connectionString: databaseUrl })
    const reset = await ledger.pool.query(
      `update loop_cycles set status = 'cancelled', failure_reason = 'LIVE_TEST_RESET'
        where workspace_id = $1 and status = 'reported'
        returning id`,
      [WORKSPACE],
    )
    console.log(`CLEANUP  released ${reset.rowCount} reported cycle(s) from their week`)
  })

  it('runs collect → reflect → plan and HALTS at the cost preview', async () => {
    if (!LIVE) return
    const store = await import('@/lib/loop/store')
    const { reflect } = await import('@/lib/loop/reflect')
    const { planningWeekFor, reflectionWindow } = await import('@/lib/loop/iso-week')
    const { previewCost, priceBrief, cycleCost } = await import('@/lib/loop/cost')
    const { newLoopCycleRef, isLoopRef } = await import('@/lib/loop/object-ref')
    const { createPgLedgerPort, createWithCredits, loadBillingEnv } = await import('@sahoda/billing')
    const { createMesh, planWeekTask } = await import('@sahoda/mesh')
    const { toChannelSet, MESH_TASK_ACTION } = await import('@sahoda/shared')
    const { normalizeSlot } = await import('@/lib/planner/slots')

    const now = new Date()
    const week = planningWeekFor(now)
    console.log(`\n=== CYCLE for ISO ${week.isoYear}-W${week.isoWeek} ===`)

    const opened = await store.openCycle({
      workspaceId: WORKSPACE,
      isoYear: week.isoYear,
      isoWeek: week.isoWeek,
      triggerSource: 'manual',
      budgetCredits: 150,
      userId: USER,
    })
    console.log(`OPEN     cycle=${opened.cycle.id} created=${opened.created}`)
    expect(opened.created).toBe(true)
    state.cycleId = opened.cycle.id

    // ── COLLECT + REFLECT — both free, both before any charge ─────────────
    const window = reflectionWindow(now)
    const observations = await store.readObservations(WORKSPACE, window.fromIso, window.toIso)
    const reflection = reflect(observations)
    console.log(
      `REFLECT  window=${window.fromIso}..${window.toIso}  observations=${observations.length}` +
        `  learnings=${reflection.learnings.length}  reason=${reflection.reason}` +
        `  skippedNoHistory=${reflection.skippedNoHistory}`,
    )
    // THE DELIVERABLE: what Reflect says with no metric history.
    expect(observations.length).toBe(0)
    expect(reflection.reason).toBe('no_history')
    expect(reflection.skippedNoHistory).toBe(true)
    expect(reflection.learnings).toEqual([])

    await store.setCycleStatus(opened.cycle.id, WORKSPACE, 'planning', {
      reflectSkipped: reflection.skippedNoHistory,
    })

    // ── PLAN — the one paid step before the halt ──────────────────────────
    const { databaseUrl } = loadBillingEnv()
    const ledger = createPgLedgerPort({ connectionString: databaseUrl })
    const before = await ledger.balance(WORKSPACE)
    console.log(`BALANCE  before plan: total=${before.total} held=${before.held}`)

    const withCredits = createWithCredits(ledger)
    const mesh = createMesh()
    const channels = ['instagram', 'linkedin'] as const
    const objectRef = newLoopCycleRef(opened.cycle.id)
    expect(isLoopRef(objectRef)).toBe(true)

    let innerError: unknown = null
    const charged = await withCredits(
      { workspaceId: WORKSPACE, action: MESH_TASK_ACTION['plan_week'], objectRef },
      async (ctx) => {
        try {
          const result = await mesh.runTask(
            planWeekTask.def,
            // `nowIso` IS NOT OPTIONAL IN PRACTICE. The first live run omitted
            // it, plan-week.ts's buildMessages dropped the date line, and the
            // model returned slots in JUNE 2025 — fourteen months in the past.
            // Four posts were then written with status='approved' and a past
            // slot, which is exactly the dispatcher's gate. Only the absent
            // SAHODA_PUBLISH_ENABLED stood between that and a real publish.
            //
            // The server action always passed it; this harness did not, and the
            // divergence is the whole reason a harness that "does what the
            // action does" has to actually do it.
            { goals: '', channels: [...channels], nowIso: now.toISOString() },
            {
              workspaceId: WORKSPACE,
              traceId: opened.cycle.id,
              userId: USER,
              actionType: ctx.actionType,
              creditsCharged: ctx.creditsCharged,
            },
          )
          if (!result.ok) throw new Error(`MESH_ERROR ${result.error.code}`)
          const priced = priceBrief()
          const rows = result.data.briefs.map((brief, index) => {
            const kept = toChannelSet(
              (brief.channels as string[]).filter((c) =>
                (channels as readonly string[]).includes(c),
              ) as Array<(typeof channels)[number]>,
            )
            const use = kept.length > 0 ? kept : toChannelSet([...channels])
            // normalizeSlot, same as the action: it clamps anything past, too
            // soon, unparseable or beyond the horizon to a real future instant.
            // Belt to nowIso's braces — even with the date line present, a
            // model's slot is a suggestion and this is what makes it true.
            const slot = normalizeSlot(brief.suggestedSlot, [...use], now, index)
            return {
              priority: index + 1,
              title: brief.title.slice(0, 120),
              body: brief.body.slice(0, 500),
              channels: use,
              suggestedSlot: slot.scheduledAt,
              rationale: brief.rationale ?? null,
              estimatedCredits: priced,
            }
          })
          const written = await store.writeBriefs(opened.cycle.id, WORKSPACE, rows)
          return { count: written.length }
        } catch (e) {
          // Surfaced deliberately. The first live run reported PROVIDER_ERROR
          // for a fault in OUR insert, pointing at a provider that had already
          // succeeded and been logged `ok`.
          innerError = e
          throw e
        }
      },
    )

    expect(charged.ok, `inner error: ${String(innerError)}`).toBe(true)
    if (!charged.ok) return
    console.log(`PLAN     wrote ${charged.data.data.count} briefs, balanceAfter=${charged.data.balanceAfter}`)
    expect(before.total - charged.data.balanceAfter).toBe(cycleCost())

    // ── THE HALT ──────────────────────────────────────────────────────────
    const briefs = await store.readBriefs(opened.cycle.id, WORKSPACE)
    state.briefIds = briefs.map((b) => b.id)
    const preview = previewCost(
      briefs.map((b) => ({
        id: b.id,
        priority: b.priority,
        estimated_credits: b.estimated_credits,
        included: b.included,
      })),
      150,
    )
    await store.haltForCostApproval(opened.cycle.id, WORKSPACE, preview.creationCredits)
    await store.addSpend(opened.cycle.id, WORKSPACE, cycleCost())

    console.log('\n=== COST PREVIEW — SHOWN BEFORE ANYTHING IS WRITTEN ===')
    for (const b of briefs) {
      console.log(
        `  [${b.priority}] ${b.title}\n        ${b.channels.join(', ')}  ·  ${b.estimated_credits} cr  ·  ${b.suggested_slot}`,
      )
    }
    // THE ASSERTION THE FIRST RUN DID NOT HAVE. A brief scheduled in the past
    // becomes a post that satisfies the dispatcher's gate the instant it is
    // written, which is the one state this session must never leave behind.
    for (const b of briefs) {
      expect(
        b.suggested_slot === null || new Date(b.suggested_slot).getTime() > Date.now(),
        `brief ${b.priority} is scheduled at ${b.suggested_slot}, which is in the past`,
      ).toBe(true)
    }

    console.log(
      `  ─────────────────────────────────────────────────────────\n` +
        `  writing ${preview.includedCount} posts  = ${preview.creationCredits} cr\n` +
        `  planning (already charged) = ${preview.orchestrationCredits} cr\n` +
        `  TOTAL = ${preview.totalCredits} cr   budget = ${preview.budgetCredits} cr   over = ${preview.overBudget}`,
    )

    // ── THE GATE: nothing may be spent from here without an approval ──────
    const gated = await store.readApprovedCycleForCreate(opened.cycle.id, WORKSPACE)
    console.log(`\nGATE     readApprovedCycleForCreate → ${gated === null ? 'null → REFUSED' : 'ADMITTED'}`)
    expect(gated).toBeNull()
  }, 180_000)

  it('REFUSES to create anything while the preview is unapproved, and spends nothing', async () => {
    if (!LIVE || !state.cycleId) return
    const { createPgLedgerPort, loadBillingEnv } = await import('@sahoda/billing')
    const { databaseUrl } = loadBillingEnv()
    const ledger = createPgLedgerPort({ connectionString: databaseUrl })

    const before = await ledger.balance(WORKSPACE)
    const store = await import('@/lib/loop/store')
    // The orchestrator forcing the status is the attack this guards against —
    // the RPC's refusal protects the screen, not this path.
    await store.setCycleStatus(state.cycleId, WORKSPACE, 'creating')
    const gated = await store.readApprovedCycleForCreate(state.cycleId, WORKSPACE)
    const after = await ledger.balance(WORKSPACE)

    console.log(
      `\nFORCED   status='creating' with no approval → gate returned ${gated === null ? 'null' : 'A ROW'}` +
        `   balance ${before.total} → ${after.total}`,
    )
    expect(gated).toBeNull()
    expect(after.total).toBe(before.total)

    await store.setCycleStatus(state.cycleId, WORKSPACE, 'awaiting_cost_approval')
  })

  it('approves the preview as a real signed-in member, trimming one brief', async () => {
    if (!LIVE || !state.cycleId || !state.briefIds?.length) return
    const { previewCost, briefCost } = await import('@/lib/loop/cost')
    const store = await import('@/lib/loop/store')

    const all = await store.readBriefs(state.cycleId, WORKSPACE)
    // Trim the lowest-priority brief, exactly as a person would in the preview.
    const dropped = all[all.length - 1]!
    const kept = all.filter((b) => b.id !== dropped.id)
    const expected = previewCost(
      kept.map((b) => ({ id: b.id, priority: b.priority, estimated_credits: b.estimated_credits, included: true })),
      150,
    ).creationCredits

    const out = await asUser<{ loop_approve_cost: Record<string, unknown> }>(
      `select public.loop_approve_cost($1, $2::uuid[], $3) as loop_approve_cost`,
      [state.cycleId, [dropped.id], expected],
    )
    console.log(`\nAPPROVE  ${JSON.stringify(out.loop_approve_cost)}`)
    expect(out.loop_approve_cost.approved_credits).toBe(expected)
    expect(out.loop_approve_cost.excluded_briefs).toBe(1)
    expect(expected).toBe(kept.length * briefCost())

    // Now the gate admits it.
    const gated = await store.readApprovedCycleForCreate(state.cycleId, WORKSPACE)
    console.log(`GATE     after approval → ${gated === null ? 'null' : 'ADMITTED'}`)
    expect(gated).not.toBeNull()
  })

  it('writes the drafts, charges per brief, and stages nothing at autopilot', async () => {
    if (!LIVE || !state.cycleId) return
    const store = await import('@/lib/loop/store')
    const { newLoopBriefRef } = await import('@/lib/loop/object-ref')
    const { BRIEF_ACTION, briefCost } = await import('@/lib/loop/cost')
    const { createPgLedgerPort, createWithCredits, loadBillingEnv } = await import('@sahoda/billing')
    const { databaseUrl } = loadBillingEnv()
    const ledger = createPgLedgerPort({ connectionString: databaseUrl })
    const withCredits = createWithCredits(ledger)

    const before = await ledger.balance(WORKSPACE)
    const briefs = (await store.readBriefs(state.cycleId, WORKSPACE)).filter((b) => b.included)
    let created = 0
    let spent = 0

    for (const brief of briefs) {
      const charged = await withCredits(
        { workspaceId: WORKSPACE, action: BRIEF_ACTION, objectRef: newLoopBriefRef(brief.id) },
        async () => {
          // status='approved' + a schedule is the L2 staging state — the state
          // the dispatcher READS. It is safe here only because the dispatcher's
          // flag is off, which the second test in this file printed.
          const r = await ledger.pool.query<{ id: string }>(
            `insert into posts (workspace_id, title, body, status, channels, scheduled_at, origin, created_by)
             values ($1, $2, $3, 'approved', $4, $5, 'plan_week', $6) returning id`,
            [WORKSPACE, brief.title, brief.body, [...brief.channels], brief.suggested_slot, USER],
          )
          return { postId: r.rows[0]!.id }
        },
      )
      expect(charged.ok).toBe(true)
      if (!charged.ok) continue
      await store.linkBriefToPost(brief.id, WORKSPACE, charged.data.data.postId, 'awaiting_approval')
      await store.addSpend(state.cycleId, WORKSPACE, briefCost())
      created += 1
      spent += briefCost()
    }

    const after = await ledger.balance(WORKSPACE)
    console.log(
      `\nCREATE   wrote ${created} posts  ·  spent ${spent} cr  ·  balance ${before.total} → ${after.total}`,
    )
    expect(created).toBe(briefs.length)
    expect(before.total - after.total).toBe(spent)

    await store.setCycleStatus(state.cycleId, WORKSPACE, 'staging')
    await store.finishCycle(state.cycleId, WORKSPACE)
    const cycles = await store.readRecentCycles(WORKSPACE, 1)
    console.log(`CYCLE    status=${cycles[0]?.status}  spent_credits=${cycles[0]?.spent_credits}`)
    expect(cycles[0]?.status).toBe('reported')
  }, 120_000)

  it('PROPOSES a learning and lets it be REJECTED without touching the Brand Brain', async () => {
    if (!LIVE || !state.cycleId) return
    const store = await import('@/lib/loop/store')
    const { createPgLedgerPort, loadBillingEnv } = await import('@sahoda/billing')
    const { databaseUrl } = loadBillingEnv()
    const ledger = createPgLedgerPort({ connectionString: databaseUrl })

    const brainBefore = await ledger.pool.query<{
      id: string
      version: number
      updated_at: string
      payload: unknown
    }>(
      `select id, version, updated_at::text as updated_at, payload
         from brand_memory where workspace_id = $1 and status = 'active'`,
      [WORKSPACE],
    )
    const before = brainBefore.rows[0]!
    const countBefore = await ledger.pool.query<{ n: string }>(
      `select count(*) as n from brand_memory where workspace_id = $1`,
      [WORKSPACE],
    )
    console.log(
      `\nBRAIN    before: version=${before.version} updated_at=${before.updated_at} rows=${countBefore.rows[0]!.n}`,
    )

    // Propose one, through the SAME function the Reflect stage uses.
    const eventId = await store.proposeLearning(
      WORKSPACE,
      {
        kind: 'brand_memory_patch',
        summary: 'A proposal made by the live run, to be turned down.',
        loop_cycle_id: state.cycleId,
        evidence: { sample_size: 6, window_days: 7, post_ids: [], metric: 'impressions' },
        patch: { alignment: { note: 'THIS MUST NEVER REACH THE BRAND BRAIN' } },
      },
      { loop_cycle_id: state.cycleId },
    )
    console.log(`LEARNING proposed: ${eventId}`)
    state.learningId = eventId

    // Reject it, as a real signed-in member.
    const out = await asUser<{ resolve_memory_event: Record<string, unknown> }>(
      `select public.resolve_memory_event($1, 'rejected') as resolve_memory_event`,
      [eventId],
    )
    console.log(`REJECT   ${JSON.stringify(out.resolve_memory_event)}`)
    expect(out.resolve_memory_event.status).toBe('rejected')
    expect(out.resolve_memory_event.brand_memory_changed).toBe(false)

    // ── THE ASSERTION THAT MATTERS ────────────────────────────────────────
    // Not "no error was raised" — a silent write raises nothing. The active
    // brain is compared field by field against what it was.
    const brainAfter = await ledger.pool.query<{
      id: string
      version: number
      updated_at: string
      payload: unknown
    }>(
      `select id, version, updated_at::text as updated_at, payload
         from brand_memory where workspace_id = $1 and status = 'active'`,
      [WORKSPACE],
    )
    const after = brainAfter.rows[0]!
    const countAfter = await ledger.pool.query<{ n: string }>(
      `select count(*) as n from brand_memory where workspace_id = $1`,
      [WORKSPACE],
    )
    console.log(
      `BRAIN    after:  version=${after.version} updated_at=${after.updated_at} rows=${countAfter.rows[0]!.n}`,
    )
    expect(after.id).toBe(before.id)
    expect(after.version).toBe(before.version)
    expect(after.updated_at).toBe(before.updated_at)
    expect(after.payload).toEqual(before.payload)
    // And no new version anywhere in the history, active or superseded.
    expect(countAfter.rows[0]!.n).toBe(countBefore.rows[0]!.n)
    // The phrase from the rejected patch appears nowhere in the brain.
    expect(JSON.stringify(after.payload)).not.toContain('THIS MUST NEVER REACH')

    const ev = await ledger.pool.query<{ status: string; applied_memory_version: number | null }>(
      `select status, applied_memory_version from memory_events where id = $1`,
      [eventId],
    )
    expect(ev.rows[0]!.status).toBe('rejected')
    expect(ev.rows[0]!.applied_memory_version).toBeNull()
  }, 60_000)
})