import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

/**
 * The console's bulk confirm sends the version it read.
 *
 * Two overlapping confirms each read the whole payload and each write the
 * whole thing back; without the RPC's compare-and-set the later writer stamps
 * provenance against a stale base and silently reverts the earlier
 * confirmation to a guess. `resolve_brand_memory` has taken
 * `p_expected_version` since 2026-08-12; nothing on the hand-edit paths sent it.
 */
const saveBrandMemory = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({ brainRead: null as unknown }))

vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory }))
vi.mock('@/lib/brand/read-brain', () => ({ readBrain: () => Promise.resolve(state.brainRead) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { confirmBrainFields } = await import('./brain-resolve-fields')

beforeEach(() => {
  vi.clearAllMocks()
  state.brainRead = {
    status: 'ok',
    active: DEMO_FALLBACK_PAYLOAD,
    version: 7,
    provenance: new Map(),
    meta: undefined,
  }
  saveBrandMemory.mockResolvedValue({ ok: true, version: 8, replayed: false })
})

describe('confirmBrainFields', () => {
  test('writes once, naming every path and the version it read', async () => {
    const result = await confirmBrainFields(['voice.descriptor', 'hook.core_promise'])

    expect(result).toEqual({ ok: true, version: 8, confirmed: 2 })
    expect(saveBrandMemory).toHaveBeenCalledTimes(1)
    expect(saveBrandMemory).toHaveBeenCalledWith(
      DEMO_FALLBACK_PAYLOAD,
      'manual',
      ['voice.descriptor', 'hook.core_promise'],
      null,
      { expectedVersion: 7 },
    )
  })

  test('a version conflict comes back as the server’s reload sentence', async () => {
    saveBrandMemory.mockResolvedValue({
      ok: false,
      message: 'The Brand Brain changed while you were editing. Reload and try again.',
    })

    const result = await confirmBrainFields(['voice.descriptor'])

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/reload/i) })
  })
})
