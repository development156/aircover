import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE APPROVAL IS AN AGREEMENT TO A NUMBER, NOT A BUTTON PRESS.
 *
 * `batch-preview.test.tsx` proves the figure on the button is the figure SENT.
 * This proves the other half: that the server re-prices from the rows and
 * refuses when the two disagree. Neither half is worth much alone — a screen
 * that sends its number to a server that ignores it has a contract in name only.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  derivatives: [] as Array<Record<string, unknown>>,
  batch: null as Record<string, unknown> | null,
  approvals: [] as Array<{ approvedCredits: number }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: WS_ID } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/posts/read', () => ({ getPost: async () => null }))
vi.mock('@/lib/remix/store', () => ({
  readDerivatives: async () => state.derivatives,
  readBatch: async () => state.batch,
  approveBatch: async (input: { approvedCredits: number }) => {
    state.approvals.push({ approvedCredits: input.approvedCredits })
    return true
  },
  setIncluded: async () => true,
  createBatch: async () => null,
}))

import { approveRemixBatch } from './remix'
import { previewBatch } from '@/lib/remix/cost'

function derivative(id: string, kind: string): Record<string, unknown> {
  return {
    id,
    workspace_id: WS_ID,
    batch_id: BATCH_ID,
    kind,
    channel: 'x',
    format: 'text',
    included: true,
    status: 'pending',
    post_id: null,
    failure: null,
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
  }
}

const DERIVATIVES = [derivative('d1', 'adaptation'), derivative('d2', 'short')]
const TOTAL = previewBatch(DERIVATIVES as never).totalCredits

beforeEach(() => {
  state.derivatives = DERIVATIVES
  state.batch = null
  state.approvals = []
})

describe('approveRemixBatch', () => {
  test('records the total when the screen and the rows agree', async () => {
    const result = await approveRemixBatch(BATCH_ID, TOTAL)
    expect(result).toEqual({ ok: true, approvedCredits: TOTAL })
    expect(state.approvals).toEqual([{ approvedCredits: TOTAL }])
  })

  test('REFUSES when the screen quoted less than the rows price', async () => {
    // The case that matters: a trim still in flight, or one whose write failed.
    // The button said less; the rows say more. Approving the higher figure would
    // charge a number nobody saw.
    const result = await approveRemixBatch(BATCH_ID, TOTAL - 1)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/approve it again/i)
    expect(state.approvals).toEqual([])
  })

  test('REFUSES when the screen quoted more than the rows price', async () => {
    const result = await approveRemixBatch(BATCH_ID, TOTAL + 1)
    expect(result.ok).toBe(false)
    expect(state.approvals).toEqual([])
  })

  test('REFUSES a figure that is not a number at all', async () => {
    // It arrives as `unknown` across the server-action boundary, so a
    // hand-rolled call sends whatever it likes.
    for (const bad of [null, undefined, '21', {}, NaN]) {
      const result = await approveRemixBatch(BATCH_ID, bad)
      expect(result.ok, String(bad)).toBe(false)
    }
    expect(state.approvals).toEqual([])
  })

  test('refuses a batch with everything trimmed out, before pricing anything', async () => {
    state.derivatives = DERIVATIVES.map((d) => ({ ...d, included: false }))
    const result = await approveRemixBatch(BATCH_ID, previewBatch([]).totalCredits)
    expect(result.ok).toBe(false)
    expect(state.approvals).toEqual([])
  })
})
