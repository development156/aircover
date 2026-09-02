import { beforeEach, describe, expect, test, vi } from 'vitest'

import { RemixReadError } from './read-error'

/**
 * WHAT /remix IS TOLD WHEN THE BATCH CANNOT BE READ.
 *
 * Three different nothings, kept apart on purpose:
 *   · the workspace has never remixed         → `{ status: 'ok', batch: null }`
 *   · the newest batch was read and is here    → `{ status: 'ok', batch }`
 *   · the database refused the read            → `{ status: 'unreadable' }`
 *
 * The third used to collapse into the first, and the screen offered the free
 * planner as if nothing had ever been made.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  batches: 'none' as 'none' | 'one' | 'unreadable',
  derivatives: 'some' as 'some' | 'unreadable',
}))

vi.mock('./store', () => ({
  listBatches: async () => {
    if (state.batches === 'unreadable') throw new RemixReadError('remix_batches')
    return state.batches === 'none' ? [] : [BATCH]
  },
  readDerivatives: async () => {
    if (state.derivatives === 'unreadable') throw new RemixReadError('remix_derivatives')
    return [DERIVATIVE]
  },
}))

import { REMIX_UNREADABLE_COPY, readCurrentBatch, readCurrentBatchOutcome } from './read'

const BATCH = {
  id: BATCH_ID,
  workspace_id: WS_ID,
  source_post_id: null,
  source_title: 'The long one',
  source_credit: null,
  status: 'planned' as const,
  approved_credits: null,
  approved_at: null,
  approved_by: null,
  created_by: 'user_abc',
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
}

const DERIVATIVE = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: WS_ID,
  batch_id: BATCH_ID,
  kind: 'short' as const,
  channel: 'x' as const,
  format: 'text',
  included: true,
  status: 'pending' as const,
  post_id: null,
  failure: null,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
}

beforeEach(() => {
  state.batches = 'none'
  state.derivatives = 'some'
})

describe('readCurrentBatchOutcome', () => {
  test('a workspace that never remixed is ok with no batch', async () => {
    await expect(readCurrentBatchOutcome(WS_ID)).resolves.toEqual({ status: 'ok', batch: null })
  })

  test('the newest batch comes back as a view, priced', async () => {
    state.batches = 'one'
    const outcome = await readCurrentBatchOutcome(WS_ID)
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.batch).toMatchObject({
      id: BATCH_ID,
      status: 'planned',
      sourceTitle: 'The long one',
      derivatives: [{ id: DERIVATIVE.id, kind: 'short', channel: 'x' }],
    })
    expect(outcome.batch?.cost.includedCount).toBe(1)
  })

  test('a refused batch read is UNREADABLE, never "no batch"', async () => {
    state.batches = 'unreadable'
    await expect(readCurrentBatchOutcome(WS_ID)).resolves.toEqual({ status: 'unreadable' })
  })

  test('a refused derivative read is UNREADABLE too, not a batch with no drafts', async () => {
    state.batches = 'one'
    state.derivatives = 'unreadable'
    await expect(readCurrentBatchOutcome(WS_ID)).resolves.toEqual({ status: 'unreadable' })
  })

  test('any other failure is not swallowed into a screen state', async () => {
    // Only a RemixReadError is the "could not read" outcome. A programming
    // error dressed as one would hide behind a sentence that blames the read.
    state.batches = 'one'
    vi.doMock('./store', () => ({
      listBatches: async () => {
        throw new TypeError('not a read failure')
      },
      readDerivatives: async () => [],
    }))
    vi.resetModules()
    const fresh = await import('./read')
    await expect(fresh.readCurrentBatchOutcome(WS_ID)).rejects.toBeInstanceOf(TypeError)
    vi.doUnmock('./store')
  })
})

describe('readCurrentBatch, the shape the page still imports', () => {
  test('an unreadable batch REACHES the page as a throw, never as null', async () => {
    // Until the page moves to `readCurrentBatchOutcome`, the honest outcome is
    // the route's error boundary, whose copy blames our side and offers a
    // retry. Returning null here would put the planner back on the screen.
    state.batches = 'unreadable'
    await expect(readCurrentBatch(WS_ID)).rejects.toBeInstanceOf(RemixReadError)
  })

  test('the ok outcomes are unchanged', async () => {
    await expect(readCurrentBatch(WS_ID)).resolves.toBeNull()
    state.batches = 'one'
    await expect(readCurrentBatch(WS_ID)).resolves.toMatchObject({ id: BATCH_ID })
  })
})

describe('the sentence the screen will say', () => {
  test('claims a failed read, in the third person, and never "no batches"', () => {
    expect(REMIX_UNREADABLE_COPY).toMatch(/sahoda could not read/i)
    expect(REMIX_UNREADABLE_COPY).toMatch(/remix batches/i)
    expect(REMIX_UNREADABLE_COPY).not.toMatch(/\bno batches\b/i)
    expect(REMIX_UNREADABLE_COPY).not.toMatch(/\b(I|we)\b/)
    expect(REMIX_UNREADABLE_COPY).not.toMatch(/—|–/)
  })
})
