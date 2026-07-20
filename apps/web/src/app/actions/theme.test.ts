import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `saveWorkspaceTheme` persists the Brand Skin the user accepted in onboarding.
 *
 * Before this action existed, "Theme applied" was decorative: the extracted
 * palette lived in React state, Finish saved only the brain, and
 * `workspace_themes` stayed empty — so every site preview rendered in stock
 * orange no matter what logo was uploaded. Pinned here:
 *  - the row is written with source 'extracted' + status 'active';
 *  - the previous active row is superseded, so exactly one theme is active;
 *  - the payload is a valid ThemeTokens (zod-parsed at the boundary);
 *  - a failure NEVER claims success (the onboarding Finish must stay honest).
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'

interface UpdateCall {
  table: string
  patch: Record<string, unknown>
  eqs: Array<[string, unknown]>
}

const state = vi.hoisted(() => ({
  insertError: null as { code: string; message: string } | null,
  updateError: null as { code: string; message: string } | null,
  // Inlined, not WS_ID: vi.hoisted runs before the module consts initialize.
  workspace: { id: '22222222-2222-4222-8222-222222222222' } as { id: string } | null,
  userId: 'user_abc' as string | null,
  calls: {
    inserted: [] as Array<Record<string, unknown>>,
    updates: [] as UpdateCall[],
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        state.calls.inserted.push({ ...row, __table: table })
        return Promise.resolve({ error: state.insertError })
      },
      update: (patch: Record<string, unknown>) => {
        const call: UpdateCall = { table, patch, eqs: [] }
        state.calls.updates.push(call)
        const chain = {
          eq: (col: string, val: unknown) => {
            call.eqs.push([col, val])
            return chain
          },
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ error: state.updateError }).then(resolve),
        }
        return chain
      },
    }),
  }),
}))

const { saveWorkspaceTheme } = await import('./theme')

/**
 * Two colors is enough for brandSkinVars to derive a full token set. These are
 * OKLCH strings because that is exactly what `extractPalette` emits
 * (`rgbToOklch` per bucket) — brandSkinVars parses OKLCH, never hex.
 * Approximate OKLCH for the deep teal / magenta test logo.
 */
const COLORS = ['oklch(0.42 0.06 210)', 'oklch(0.52 0.19 350)']

beforeEach(() => {
  state.insertError = null
  state.updateError = null
  state.workspace = { id: WS_ID }
  state.userId = 'user_abc'
  state.calls = { inserted: [], updates: [] }
})

describe('saveWorkspaceTheme', () => {
  test('writes an active, extracted theme row for the workspace', async () => {
    const result = await saveWorkspaceTheme(COLORS)

    expect(result).toEqual({ ok: true })
    const row = state.calls.inserted[0]
    expect(row).toBeDefined()
    expect(row?.__table).toBe('workspace_themes')
    expect(row?.workspace_id).toBe(WS_ID)
    expect(row?.source).toBe('extracted')
    expect(row?.status).toBe('active')
    expect(row?.created_by).toBe('user_abc')
  })

  test('the persisted tokens are a valid ThemeTokens payload', async () => {
    const { ThemeTokensSchema } = await import('@sahoda/shared')

    await saveWorkspaceTheme(COLORS)

    const tokens = state.calls.inserted[0]?.tokens
    expect(ThemeTokensSchema.safeParse(tokens).success).toBe(true)
  })

  test('the persisted primary derives from the uploaded logo, not the default orange', async () => {
    await saveWorkspaceTheme(COLORS)

    const tokens = state.calls.inserted[0]?.tokens as { primary: string }
    // The whole point of the feature: a teal logo must not persist as orange.
    // Sahoda orange sits near hue 40; the teal primary must land far from it.
    const hue = Number(/oklch\([^)]*\s([\d.]+)\)/.exec(tokens.primary)?.[1] ?? NaN)
    expect(Number.isNaN(hue)).toBe(false)
    expect(Math.abs(hue - 40)).toBeGreaterThan(60)
  })

  test('supersedes the previous active theme so exactly one stays active', async () => {
    await saveWorkspaceTheme(COLORS)

    const supersede = state.calls.updates.find((u) => u.table === 'workspace_themes')
    expect(supersede).toBeDefined()
    expect(supersede?.patch.status).toBe('archived')
    expect(supersede?.eqs).toContainEqual(['workspace_id', WS_ID])
    expect(supersede?.eqs).toContainEqual(['status', 'active'])
  })

  test('an insert failure reports failure — never a false "saved"', async () => {
    state.insertError = { code: '42501', message: 'denied' }

    const result = await saveWorkspaceTheme(COLORS)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0)
  })

  test('never leaks a raw postgres message to the caller', async () => {
    state.insertError = {
      code: '42501',
      message: 'permission denied for relation workspace_themes',
    }

    const result = await saveWorkspaceTheme(COLORS)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toMatch(/permission denied|relation|42501/i)
    }
  })

  test('refuses an empty palette instead of persisting a degenerate theme', async () => {
    const result = await saveWorkspaceTheme([])

    expect(result.ok).toBe(false)
    expect(state.calls.inserted).toHaveLength(0)
  })

  test('refuses non-string input from an untrusted caller', async () => {
    const result = await saveWorkspaceTheme(['oklch(0.42 0.06 210)', 42] as unknown as string[])

    expect(result.ok).toBe(false)
    expect(state.calls.inserted).toHaveLength(0)
  })

  test('requires a signed-in user and a workspace', async () => {
    state.userId = null
    expect((await saveWorkspaceTheme(COLORS)).ok).toBe(false)

    state.userId = 'user_abc'
    state.workspace = null
    expect((await saveWorkspaceTheme(COLORS)).ok).toBe(false)

    expect(state.calls.inserted).toHaveLength(0)
  })
})
