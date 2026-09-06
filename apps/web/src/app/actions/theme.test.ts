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
  /** Highest existing theme version for the workspace; null = never themed. */
  latestVersion: null as number | null,
  /**
   * Rows still `status: 'active'` AFTER the supersede update.
   *
   * Non-empty means the archive did not land. RLS denies an UPDATE by making
   * the row invisible, not by raising, so PostgREST returns no error and this
   * is the ONLY way the action can tell.
   */
  activeAfterSupersede: [] as Array<{ id: string }>,
  verifyError: null as { code: string; message: string } | null,
  // Inlined, not WS_ID: vi.hoisted runs before the module consts initialize.
  workspace: { id: '22222222-2222-4222-8222-222222222222' } as { id: string } | null,
  userId: 'user_abc' as string | null,
  calls: {
    inserted: [] as Array<Record<string, unknown>>,
    updates: [] as UpdateCall[],
    /**
     * Every SELECT chain, with the `.eq()` filters it accumulated. Recorded so
     * a read on a workspace-scoped table can be asserted to BE scoped — the
     * version lookup once was not, and nothing observable failed.
     */
    selects: [] as Array<{ table: string; eqs: Array<[string, unknown]> }>,
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve(state.workspace)
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        state.calls.inserted.push({ ...row, __table: table })
        return Promise.resolve({ error: state.insertError })
      },
      // Two shapes share this: the version lookup
      // (.select().order().limit().maybeSingle()) and the postcondition check
      // (.select().eq().eq().limit() — awaited directly, no maybeSingle).
      select: () => {
        const call = { table, eqs: [] as Array<[string, unknown]> }
        state.calls.selects.push(call)
        const chain = {
          order: () => chain,
          limit: () => chain,
          eq: (col: string, val: unknown) => {
            call.eqs.push([col, val])
            return chain
          },
          maybeSingle: () =>
            Promise.resolve({
              data: state.latestVersion === null ? null : { version: state.latestVersion },
              error: null,
            }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: state.activeAfterSupersede,
              error: state.verifyError,
            }).then(resolve),
        }
        return chain
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
const { revalidatePath } = await import('next/cache')

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
  state.latestVersion = null
  state.activeAfterSupersede = []
  state.verifyError = null
  state.workspace = { id: WS_ID }
  state.userId = 'user_abc'
  state.calls = { inserted: [], updates: [], selects: [] }
  vi.mocked(revalidatePath).mockClear()
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

  test('scopes the version lookup to this workspace, not to everything RLS allows', async () => {
    /**
     * A LATENT DEFECT WITH NO SYMPTOM, which is why it needs a test rather than
     * a comment. The version read carried no `workspace_id` filter, so it took
     * the highest version across every workspace the caller can see. That never
     * produced a visible failure: UNIQUE is (workspace_id, version), and a
     * global max is always at least this workspace's max, so the derived value
     * stayed unique and every insert succeeded.
     *
     * Nothing in the result, the row, or the database would ever have shown it.
     * The only observable is the query itself — so the query is what is
     * asserted. A member of two workspaces would otherwise have themed their
     * second workspace at the first one's version number.
     */
    await saveWorkspaceTheme(COLORS)

    const versionRead = state.calls.selects.find((s) => s.table === 'workspace_themes')
    expect(versionRead).toBeDefined()
    expect(versionRead?.eqs).toContainEqual(['workspace_id', WS_ID])
  })

  /**
   * Every column that is NOT NULL with NO default in `workspace_themes`.
   * Omitting one fails the real insert while a hand-written mock happily
   * accepts it — which is exactly what happened: the first cut left out
   * `version` and every live Finish silently toasted "could not save".
   * Derived from the schema, so this stays the DB's contract, not my guess.
   */
  test('supplies every NOT NULL column that has no database default', async () => {
    await saveWorkspaceTheme(COLORS)

    const row = state.calls.inserted[0] ?? {}
    for (const column of ['workspace_id', 'version', 'tokens', 'source', 'status']) {
      expect(row[column], `missing NOT NULL column '${column}'`).toBeDefined()
      expect(row[column], `null NOT NULL column '${column}'`).not.toBeNull()
    }
  })

  test('takes the next version, respecting UNIQUE (workspace_id, version)', async () => {
    state.latestVersion = 7

    await saveWorkspaceTheme(COLORS)

    expect(state.calls.inserted[0]?.version).toBe(8)
  })

  test('starts at version 1 for a workspace that has never had a theme', async () => {
    state.latestVersion = null

    await saveWorkspaceTheme(COLORS)

    expect(state.calls.inserted[0]?.version).toBe(1)
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

  test('refuses when the supersede silently affected no rows', async () => {
    // THE BUG THIS PINS, and it is not hypothetical: the action branched on
    // `supersedeError` alone. RLS denies an UPDATE by making the row invisible
    // — zero rows affected, NO error — so a denied archive read as a successful
    // one and the insert below added a SECOND active row. That is exactly the
    // "two active rows, reader picks one arbitrarily" state the archive-first
    // ordering exists to prevent. (INSERT is different: its WITH CHECK raises.)
    //
    // The sibling test below asserts the update was CALLED with the right
    // filters, which stayed green through all of it — a call is not an outcome.
    state.activeAfterSupersede = [{ id: 'still-active' }]

    const result = await saveWorkspaceTheme(COLORS)

    expect(result.ok).toBe(false)
    // And critically: nothing was written on top of the un-archived row.
    expect(state.calls.inserted).toHaveLength(0)
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

    // RETARGETED: `message.length > 0` is true for almost any string,
    // including a stray Postgres error or a stack trace — it does not pin
    // the sentence the caller actually sees, or prove the DB write it must
    // not be credited with. Assert the exact refusal copy and that nothing
    // downstream treated this as a successful save.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Could not save your theme. Try again.')
    expect(revalidatePath).not.toHaveBeenCalled()
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
