import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('./store', () => ({ readWorkspaceIds: vi.fn() }))
vi.mock('./tick', () => ({ runWorkspaceAutopilotTick: vi.fn() }))
vi.mock('@sahoda/jobs/publish', () => ({ publishPostDeps: vi.fn() }))

import { publishPostDeps } from '@sahoda/jobs/publish'
import { readWorkspaceIds } from './store'
import { runWorkspaceAutopilotTick } from './tick'
import { runAllAutopilotTicks } from './tick-all'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * Both the workspace scan and the per-workspace tick are mocked, so this proves
 * the FAN-OUT: that one failure does not strand the rest, that totals add up,
 * and that the gate handed down refuses. It does not prove any workspace is
 * really ticked.
 */

const EMPTY = {
  announced: 0,
  refused: 0,
  refusalsByReason: {},
  dispatched: 0,
  cancelled: 0,
  waiting: 0,
  publishFailed: 0,
}

const PASS = {
  decision: 'pass',
  findings: [],
  ruleSet: { rules: [], version: 1 },
  brandVersion: 3,
  checks: { hard: 'ran', classifier: 'ran' },
}

/** The gate the publish path builds. Each test bends one thing about it. */
const check = vi.fn()

/** Drives the `gateFor` the tick was handed, for one candidate row. */
async function askTheGate(row = { postId: 'p1', variantId: 'v1', channel: 'x', body: 'the body' }) {
  await runAllAutopilotTicks(new Date())
  const deps = vi.mocked(runWorkspaceAutopilotTick).mock.calls[0]?.[0]
  return deps!.gateFor(row as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  check.mockResolvedValue(PASS)
  vi.mocked(publishPostDeps).mockReturnValue({ gate: { check } } as never)
  vi.mocked(readWorkspaceIds).mockResolvedValue(['ws-1', 'ws-2'])
  vi.mocked(runWorkspaceAutopilotTick).mockResolvedValue(EMPTY)
})

describe('the fan-out', () => {
  it('ticks every armed workspace', async () => {
    const r = await runAllAutopilotTicks(new Date())
    expect(r.workspaces).toBe(2)
    expect(runWorkspaceAutopilotTick).toHaveBeenCalledTimes(2)
  })

  it('does nothing at all when no workspace is armed', async () => {
    vi.mocked(readWorkspaceIds).mockResolvedValue([])
    const r = await runAllAutopilotTicks(new Date())
    expect(r.workspaces).toBe(0)
    expect(runWorkspaceAutopilotTick).not.toHaveBeenCalled()
  })

  it('sums the reports rather than reporting the last one', async () => {
    vi.mocked(runWorkspaceAutopilotTick)
      .mockResolvedValueOnce({ ...EMPTY, announced: 2, dispatched: 1 })
      .mockResolvedValueOnce({ ...EMPTY, announced: 3, refused: 4 })
    const r = await runAllAutopilotTicks(new Date())
    expect(r).toMatchObject({ announced: 5, dispatched: 1, refused: 4 })
  })
})

describe('one workspace failing never strands the rest', () => {
  it('carries on, and NAMES the workspace that failed', async () => {
    vi.mocked(runWorkspaceAutopilotTick)
      .mockRejectedValueOnce(new Error('pool exhausted'))
      .mockResolvedValueOnce({ ...EMPTY, announced: 1 })
    const r = await runAllAutopilotTicks(new Date())
    expect(r.failed).toEqual(['ws-1'])
    // The second workspace still ran. A poison row stranding every later
    // customer is the failure mode the sweeps already guard against.
    expect(r.announced).toBe(1)
  })

  it('copies no error text into the report, because a database message can carry a connection string', async () => {
    vi.mocked(runWorkspaceAutopilotTick).mockRejectedValue(
      new Error('connect ECONNREFUSED postgresql://user:secret@host/db'),
    )
    const r = await runAllAutopilotTicks(new Date())
    expect(JSON.stringify(r)).not.toMatch(/secret|postgresql/)
  })
})

describe('the gate handed to each tick is the REAL one', () => {
  it('asks the same gate the publish path uses, with the body as it stands', async () => {
    const verdict = await askTheGate()

    expect(check).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      postId: 'p1',
      variantId: 'v1',
      channel: 'x',
      text: 'the body',
      jobRunId: 'autopilot:p1',
    })
    expect(verdict).toEqual(PASS)
  })

  it('names the run autopilot, not web and not cron', async () => {
    await askTheGate()
    const arg = check.mock.calls[0]![0] as { jobRunId: string }
    expect(arg.jobRunId).toMatch(/^autopilot:/)
  })

  it('builds the gate ONCE for the whole tick, not once per candidate', async () => {
    await runAllAutopilotTicks(new Date())

    // Drive the gate the way a real tick would: every workspace, several
    // candidates each. Asserting the count without CALLING gateFor was the
    // first version of this test and it could not fail — a build moved inside
    // the callback left it green, which is the whole defect it exists to catch.
    for (const call of vi.mocked(runWorkspaceAutopilotTick).mock.calls) {
      for (const id of ['p1', 'p2']) {
        await call[0].gateFor({ postId: id, variantId: 'v', channel: 'x', body: 'b' } as never)
      }
    }

    expect(check).toHaveBeenCalledTimes(4)
    // `publishPostDeps` opens a Zernio client and a pool. One per candidate
    // would be four connections for four checks that read one row and write one.
    expect(publishPostDeps).toHaveBeenCalledTimes(1)
  })

  it('REFUSES when no gate could be built, and says so rather than blaming the post', async () => {
    vi.mocked(publishPostDeps).mockImplementation(() => {
      throw new Error('missing configuration')
    })

    const verdict = (await askTheGate()) as { decision: string; checks: { classifier: string } }

    // A gate we could not build is not a gate that approves.
    expect(verdict.decision).toBe('hold')
    // 'unavailable', never 'skipped-no-rules': nothing was skipped, the check
    // could not be made at all, and those are different facts.
    expect(verdict.checks.classifier).toBe('unavailable')
  })

  it('reports gateUnavailable, because "no gate to ask" is not "the gate said no"', async () => {
    vi.mocked(publishPostDeps).mockImplementation(() => {
      throw new Error('missing configuration')
    })

    const r = await runAllAutopilotTicks(new Date())

    expect(r.gateUnavailable).toBe(true)
    // The tick still ran every workspace. A missing gate refuses posts; it does
    // not strand the fleet.
    expect(r.workspaces).toBe(2)
    expect(runWorkspaceAutopilotTick).toHaveBeenCalledTimes(2)
  })

  it('leaves gateUnavailable unset on the normal path', async () => {
    const r = await runAllAutopilotTicks(new Date())
    expect(r.gateUnavailable).toBeUndefined()
  })

  it('refuses rather than throwing when the gate itself throws', async () => {
    // The port says a gate MUST NOT THROW. This is the belt for the day one
    // does: one bad post must not lose a whole workspace's tick and be reported
    // as "the workspace failed".
    check.mockRejectedValue(new Error('the model went away'))

    const verdict = (await askTheGate()) as { decision: string }

    expect(verdict.decision).toBe('hold')
  })

  it('passes a real pass through, so the gate can actually let something out', async () => {
    // The counterpart to every refusal test. A gate that could only ever hold
    // would be indistinguishable from the stub this replaced.
    const verdict = (await askTheGate()) as { decision: string }
    expect(verdict.decision).toBe('pass')
  })
})

/**
 * ── THIS BLOCK WAS RETARGETED, AND HERE IS THE MOVE ──────────────────────────
 * It used to assert that the route was NOT in `vercel.json`, because at the time
 * registering it was an act nobody had taken. Its stated purpose was to fail
 * loudly if somebody registered it "and make them add the heartbeat schedule in
 * the same change".
 *
 * The route is registered now, so that exact assertion is gone. CLAUDE.md's
 * fifth copy rule says retarget rather than delete, and the claim it protected
 * survives the change — it just inverts. What mattered was never the absence of
 * a line in a JSON file: it was that A SCHEDULED JOB IS A MONITORED JOB, and
 * that the flag remains the thing standing between the schedule and unattended
 * publishing. Both are asserted below, and the second is now the only gate left.
 */
describe('what a registered schedule brings with it, asserted from the files themselves', () => {
  const routeSrc = readFileSync(
    resolve(import.meta.dirname, '../../../app/api/cron/autopilot/route.ts'),
    'utf8',
  )
  const vercel = readFileSync(resolve(import.meta.dirname, '../../../../vercel.json'), 'utf8')

  it('the route refuses unless SAHODA_AUTOPILOT_ENABLED is set', () => {
    expect(routeSrc).toContain('autopilotEnabled()')
    // And the refusal is distinguishable from a tick that found no work.
    expect(routeSrc).toMatch(/enabled: false/)
  })

  it('the schedule exists, so the flag is the ONLY thing left in front of it', () => {
    expect(vercel).toContain('/api/cron/autopilot')
  })

  it('the schedule came with a heartbeat, which is what makes it monitored', () => {
    // A job nobody watches is worse than no job: it fails quietly and the first
    // person to notice is a customer. `heartbeat.test.ts` separately asserts
    // that every registered cron has an entry in CRON_SCHEDULES, so these two
    // together mean a registered route cannot be unmonitored.
    expect(routeSrc).toContain("recordCronRun('autopilot')")
  })

  it('records the heartbeat BEFORE reading the flag, so "off" is not "stopped"', () => {
    // The heartbeat answers "did the schedule fire", which is true whether or
    // not the flag lets work happen. Recording it only on the enabled path
    // would make a switched-off autopilot look exactly like a schedule that
    // died, and those need opposite responses.
    expect(routeSrc.indexOf("recordCronRun('autopilot')")).toBeLessThan(
      routeSrc.indexOf('if (!autopilotEnabled())'),
    )
  })
})
