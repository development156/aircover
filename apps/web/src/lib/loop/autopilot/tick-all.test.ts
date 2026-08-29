import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('./store', () => ({ readWorkspaceIds: vi.fn() }))
vi.mock('./tick', () => ({ runWorkspaceAutopilotTick: vi.fn() }))

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
  waiting: 0,
  publishFailed: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
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

describe('the gate handed to each tick FAILS CLOSED', () => {
  it('is a hold, never a pass — no real gate is wired yet', async () => {
    // The single line that decides whether this branch is a product that posts
    // unattended. A `pass` here, with a real armed workspace, would announce.
    await runAllAutopilotTicks(new Date())
    const passed = vi.mocked(runWorkspaceAutopilotTick).mock.calls[0]?.[0]
    const verdict = await passed?.gateFor({
      postId: 'p',
      variantId: 'v',
      channel: 'x',
      body: 'anything at all',
    })
    expect(verdict?.decision).toBe('hold')
  })
})

describe('the two gates in front of this, asserted from the files themselves', () => {
  const routeSrc = readFileSync(
    resolve(import.meta.dirname, '../../../app/api/cron/autopilot/route.ts'),
    'utf8',
  )

  it('the route refuses unless SAHODA_AUTOPILOT_ENABLED is set', () => {
    expect(routeSrc).toContain('autopilotEnabled()')
    // And the refusal is distinguishable from a tick that found no work.
    expect(routeSrc).toMatch(/enabled: false/)
  })

  it('the route is NOT registered in vercel.json, which is the second gate', () => {
    // Adding it there is a separate deliberate act. If somebody registers it,
    // this fails and they are made to read the header explaining what the two
    // gates are for — and to add the heartbeat schedule in the same change.
    const vercel = readFileSync(resolve(import.meta.dirname, '../../../../vercel.json'), 'utf8')
    expect(vercel).not.toContain('/api/cron/autopilot')
  })
})
