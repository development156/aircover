import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `generateSite` charges 100 credits for one model call plus a three-table
 * insert. Pinned here: inserts INSIDE the hold (failure → released → "not
 * charged" true), the mid-way cleanup (site row deleted when pages/sections
 * fail), fresh objectRef, and the lost-ack revalidate. The normalize/toRows
 * pipeline is the REAL @sahoda/sites code — only I/O seams are mocked.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const SITE_ID = '66666666-6666-4666-8666-666666666666'

interface WithCreditsConfig {
  workspaceId: string
  action: string
  objectRef: string
}

const state = vi.hoisted(() => ({
  meshResult: null as
    { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } } | null,
  siteInsert: {
    data: { id: '66666666-6666-4666-8666-666666666666' } as { id: string } | null,
    error: null as { code: string } | null,
  },
  pagesInsert: {
    data: null as Array<{ id: string; path: string }> | null,
    error: null as { code: string } | null,
  },
  sectionsInsert: {
    data: null as Array<{ id: string }> | null,
    error: null as { code: string } | null,
  },
  insufficient: false,
  lostAck: false,
  deleteThrows: false,
  /** `loadBillingEnv` throws its fail-fast error (SUPABASE_DB_URL unset on the deployment). */
  billingEnvMissing: false,
  /** `createMesh` throws its fail-fast error (a mesh key unset on the deployment). */
  meshEnvMissing: false,
  calls: {
    configs: [] as WithCreditsConfig[],
    siteRows: [] as Array<Record<string, unknown>>,
    pageRows: [] as Array<Record<string, unknown>>,
    sectionRows: [] as Array<Record<string, unknown>>,
    siteDeletes: [] as string[],
    meshRuns: 0,
  },
}))

const GOOD_OUTPUT = {
  pages: [
    {
      path: '/',
      title: 'Home',
      sections: [{ kind: 'hero', content: { headline: 'Bright smiles' } }],
    },
  ],
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => {
    if (state.billingEnvMissing) {
      throw new Error('@sahoda/billing: missing required env — SUPABASE_DB_URL')
    }
    return { databaseUrl: 'postgres://test' }
  },
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () => async (config: WithCreditsConfig, callback: (ctx: unknown) => Promise<unknown>) => {
      state.calls.configs.push(config)
      if (state.insufficient) {
        return {
          ok: false,
          error: { code: 'CREDIT_INSUFFICIENT', details: { required: 100, available: 7 } },
        }
      }
      try {
        await callback({ actionType: config.action, creditsCharged: 100 })
        // The lost-ack error deliberately wears a config-prefixed message: the
        // action's `!delivered` guard must keep the unconfirmed-charge warning
        // in front of it. Deleting that guard turns this into the config copy
        // and fails the lost-ack test below.
        if (state.lostAck) {
          return {
            ok: false,
            error: {
              code: 'PROVIDER_ERROR',
              message: '@sahoda/billing: missing required env — SUPABASE_DB_URL',
            },
          }
        }
        return { ok: true, data: { balanceAfter: 400 } }
      } catch (thrown) {
        // Real withCredits RELEASES the hold and carries `messageOf(runErr)`.
        const message = thrown instanceof Error ? thrown.message : String(thrown)
        return { ok: false, error: { code: 'PROVIDER_ERROR', message } }
      }
    },
}))

vi.mock('@sahoda/mesh', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sahoda/mesh')>()
  return {
    ...original,
    createMesh: () => {
      if (state.meshEnvMissing) {
        throw new Error('@sahoda/mesh: missing required env var(s): OPENAI_API_KEY')
      }
      return {
        runTask: () => {
          state.calls.meshRuns += 1
          return Promise.resolve(state.meshResult)
        },
      }
    },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
        if (table === 'sites') {
          state.calls.siteRows.push(rows as Record<string, unknown>)
          return { select: () => ({ single: () => Promise.resolve(state.siteInsert) }) }
        }
        if (table === 'site_pages') {
          state.calls.pageRows.push(...(rows as Array<Record<string, unknown>>))
          const data =
            state.pagesInsert.error === null
              ? (state.pagesInsert.data ??
                (rows as Array<Record<string, unknown>>).map((r, i) => ({
                  id: `77777777-7777-4777-8777-77777777777${i}`,
                  path: r.path as string,
                })))
              : null
          return { select: () => Promise.resolve({ data, error: state.pagesInsert.error }) }
        }
        state.calls.sectionRows.push(...(rows as Array<Record<string, unknown>>))
        const data =
          state.sectionsInsert.error === null
            ? (state.sectionsInsert.data ??
              (rows as Array<Record<string, unknown>>).map((_, i) => ({ id: `s${i}` })))
            : null
        return { select: () => Promise.resolve({ data, error: state.sectionsInsert.error }) }
      },
      delete: () => ({
        eq: (_col: string, id: string) => {
          state.calls.siteDeletes.push(id)
          if (state.deleteThrows) return Promise.reject(new Error('delete died'))
          return Promise.resolve({ data: null, error: null })
        },
      }),
    }),
  }),
}))

const { generateSite } = await import('./site-generate')

beforeEach(async () => {
  state.meshResult = { ok: true, data: GOOD_OUTPUT }
  state.siteInsert = { data: { id: SITE_ID }, error: null }
  state.pagesInsert = { data: null, error: null }
  state.sectionsInsert = { data: null, error: null }
  state.insufficient = false
  state.lostAck = false
  state.deleteThrows = false
  state.billingEnvMissing = false
  state.meshEnvMissing = false
  state.calls = {
    configs: [],
    siteRows: [],
    pageRows: [],
    sectionRows: [],
    siteDeletes: [],
    meshRuns: 0,
  }
  vi.mocked((await import('next/cache')).revalidatePath).mockClear()
})

describe('generateSite', () => {
  test('happy path: site + page + section rows land, charge reported', async () => {
    const result = await generateSite('Sharma Dental', 'More bookings')

    expect(result).toMatchObject({
      ok: true,
      siteId: SITE_ID,
      pages: 1,
      balanceAfter: 400,
      creditsCharged: 100,
    })
    expect(state.calls.siteRows).toHaveLength(1)
    expect(state.calls.pageRows).toHaveLength(1)
    expect(state.calls.sectionRows).toHaveLength(1)
    // Rows carry tenancy + provenance; slug is the random-suffixed draft slug.
    expect(state.calls.pageRows[0]?.workspace_id).toBe(WS_ID)
    expect(state.calls.siteRows[0]).toMatchObject({ workspace_id: WS_ID, created_by: 'user_abc' })
    expect(String((state.calls.siteRows[0] as { slug: string }).slug)).toMatch(
      /^sharma-dental-[0-9a-f]{6}$/,
    )
  })

  test('charges site_generate with a fresh server-minted ref each run', async () => {
    await generateSite('A', '')
    await generateSite('A', '')

    const [first, second] = state.calls.configs
    expect(first?.action).toBe('site_generate')
    expect(first?.objectRef).toMatch(new RegExp(`^${WS_ID}:site_generate:`))
    expect(first?.objectRef).not.toBe(second?.objectRef)
  })

  test('mesh failure: nothing inserted, "not charged" claimed, no provider text', async () => {
    state.meshResult = { ok: false, error: { code: 'PROVIDER_ERROR', message: 'provider text' } }

    const result = await generateSite('A', '')

    expect(state.calls.siteRows).toHaveLength(0)
    expect(result.ok).toBe(false)
    if (!result.ok && !result.insufficient) {
      expect(result.message).toContain('not charged')
      expect(result.message).not.toContain('provider text')
    }
  })

  test('pages insert failure: the site row is cleaned up and nothing is charged', async () => {
    state.pagesInsert = { data: null, error: { code: '42501' } }

    const result = await generateSite('A', '')

    expect(state.calls.siteDeletes).toEqual([SITE_ID])
    expect(result.ok).toBe(false)
    if (!result.ok && !result.insufficient) {
      expect(result.message).toContain('not charged')
    }
  })

  test('insufficient credits: exact shortfall, model never runs', async () => {
    state.insufficient = true

    const result = await generateSite('A', '')

    expect(result).toEqual({ ok: false, insufficient: true, required: 100, available: 7 })
    expect(state.calls.meshRuns).toBe(0)
  })

  test('lost ack: the site EXISTS, so /sites revalidates under the unconfirmed-charge warning', async () => {
    state.lostAck = true

    const result = await generateSite('A', '')

    // The narrowing guard cannot skip silently: this pins the exact arm first.
    expect(result).toMatchObject({ ok: false, insufficient: false })
    // The mock's lost-ack error wears a config-prefixed message on purpose:
    // delivered runs must keep the unconfirmed-charge warning even when the
    // failure LOOKS like a config error (pins the `!delivered` guard).
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/could not confirm/i)
      expect(result.message).not.toMatch(/not fully configured/i)
    }
    const { revalidatePath } = await import('next/cache')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/sites')
  })

  test('cleanup itself failing still releases the hold — the charge claim survives the worst cell', async () => {
    state.pagesInsert = { data: null, error: { code: '42501' } }
    state.deleteThrows = true

    const result = await generateSite('A', '')

    expect(result.ok).toBe(false)
    if (!result.ok && !result.insufficient) {
      // The orphan row is unpaid; "not charged" must stay true even when the
      // compensating delete dies too.
      expect(result.message).toContain('not charged')
    }
  })

  test('a blank name never reaches the ledger', async () => {
    const result = await generateSite('   ', '')

    expect(result.ok).toBe(false)
    expect(state.calls.configs).toHaveLength(0)
  })
})

describe('generateSite — deployment config failures', () => {
  // Both tests re-import the action: its billing/mesh singletons are memoized
  // module-level, so the already-imported instance would never re-run the env
  // loaders after earlier tests built them.

  test('missing billing env → honest config copy, cause logged server-side', async () => {
    state.billingEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    const fresh = await import('./site-generate')
    const result = await fresh.generateSite('Marigold', '')

    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'SUPABASE_DB_URL',
    )
    errorSpy.mockRestore()
  })

  test('missing mesh env inside the callback → hold released, honest config copy', async () => {
    state.meshEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    const fresh = await import('./site-generate')
    const result = await fresh.generateSite('Marigold', '')

    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      '@sahoda/mesh: missing required env',
    )
    errorSpy.mockRestore()
  })
})
