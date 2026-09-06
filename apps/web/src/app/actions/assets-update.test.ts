import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fakeSupabase, freshState } from '@/lib/assets/fake-supabase.test-helper'

/**
 * `updateAsset` — the two editable fields, and what may not reach the row.
 *
 * Whitespace is trimmed, an emptied field becomes null rather than an empty
 * string, a field the caller did not mention is not touched, and a patch that
 * mentions nothing is refused rather than turned into an empty update that
 * would still bump `updated_at`.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ supabase: null as unknown }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => state.supabase }))

const { updateAsset } = await import('./assets')

const row = (over: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: WORKSPACE,
  storage_path: `${WORKSPACE}/assets/33333333-3333-4333-8333-333333333333.png`,
  kind: 'image',
  mime: 'image/png',
  bytes: 1000,
  width: 1200,
  height: 800,
  alt: null,
  title: 'shopfront.png',
  created_by: 'user_abc',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
})

let fake = freshState()

beforeEach(() => {
  fake = freshState()
  state.supabase = fakeSupabase(fake)
  fake.answers.assets = [{ data: row() }]
})

const patchSent = () => fake.calls.find((call) => call.method === 'update')?.args[0]

describe('updateAsset', () => {
  test('trims both fields and writes only what was mentioned', async () => {
    const result = await updateAsset('a', { title: '  Shopfront  ' })

    expect(result.ok).toBe(true)
    expect(patchSent()).toEqual({ title: 'Shopfront' })
  })

  test('an emptied field is stored as null, not as an empty string', async () => {
    await updateAsset('a', { alt: '   ' })

    expect(patchSent()).toEqual({ alt: null })
  })

  test('a title longer than the limit is cut, not refused', async () => {
    await updateAsset('a', { title: 'x'.repeat(500) })

    const sent = patchSent() as { title: string }
    expect(sent.title.length).toBeLessThan(500)
  })

  test('a patch that mentions nothing is refused before any write', async () => {
    const result = await updateAsset('a', {})

    expect(result.ok).toBe(false)
    expect(fake.calls.filter((call) => call.method === 'update')).toEqual([])
  })

  test('a row that is not there is a refusal, not a silent success', async () => {
    fake.answers.assets = [{ data: null }]

    const result = await updateAsset('missing', { title: 'x' })

    expect(result.ok).toBe(false)
  })
})
