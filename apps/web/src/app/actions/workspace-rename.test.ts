import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `renameWorkspace` had no test of any kind until the 2026-09-07 settings
 * audit, and it was the one action on /settings with a live authorisation gap:
 * `workspaces` UPDATE is open to every member by RLS with no role predicate, so
 * a viewer could rename the workspace. This pins the application-side wall and
 * the two refusals the action already made (empty, over 80) plus the one it
 * must never unlearn: an UPDATE that matched no row is not a success.
 */

const maybeSingle = vi.fn()
const select = vi.fn(() => ({ maybeSingle }))
const eq = vi.fn(() => ({ select }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_1' })),
  currentUser: vi.fn(async () => null),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ from }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
const { getWorkspaceRole } = vi.hoisted(() => ({
  getWorkspaceRole: vi.fn(async (): Promise<string | null> => 'owner'),
}))
vi.mock('@/lib/workspace-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace-role')>()
  return { ...actual, getWorkspaceRole }
})

import { revalidatePath } from 'next/cache'

import { renameWorkspace } from './workspace'

const WS = '11111111-1111-4111-8111-111111111111'

describe('renameWorkspace', () => {
  beforeEach(() => {
    update.mockClear()
    maybeSingle.mockReset()
    maybeSingle.mockResolvedValue({ data: { name: 'Bakery' }, error: null })
    getWorkspaceRole.mockReset()
    getWorkspaceRole.mockResolvedValue('owner')
  })

  it('trims and stores the name, and refreshes the shell that shows it', async () => {
    vi.mocked(revalidatePath).mockClear()
    const result = await renameWorkspace(WS, '  Bakery  ')

    expect(result).toEqual({ ok: true, name: 'Bakery' })
    expect(update).toHaveBeenCalledWith({ name: 'Bakery' })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(
      expect.arrayContaining([['/settings'], ['/', 'layout']]),
    )
  })

  it('refuses an empty or whitespace-only name without writing', async () => {
    expect(await renameWorkspace(WS, '   ')).toEqual({
      ok: false,
      message: 'Give the workspace a name.',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a name over 80 characters without writing', async () => {
    const result = await renameWorkspace(WS, 'x'.repeat(81))

    expect(result).toEqual({ ok: false, message: 'Keep the name under 80 characters.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('an UPDATE that matched no row is a refusal, not a success', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await renameWorkspace(WS, 'Bakery')

    expect(result.ok).toBe(false)
  })

  it('REFUSES a viewer before any write is issued', async () => {
    getWorkspaceRole.mockResolvedValue('viewer')

    const result = await renameWorkspace(WS, 'Bakery')

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/owner|editor/i) })
    expect(update).not.toHaveBeenCalled()
  })

  it('REFUSES when the role cannot be established, and says that instead', async () => {
    getWorkspaceRole.mockResolvedValue(null)

    const result = await renameWorkspace(WS, 'Bakery')

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/could not confirm/i) })
    expect(update).not.toHaveBeenCalled()
  })
})
