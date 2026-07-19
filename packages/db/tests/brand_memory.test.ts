import { describe, it, expect, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ResolveBrandMemoryResultSchema, type BrandMemoryPayload } from '@sahoda/shared'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'
import { brandPayload, withSection } from './helpers/brand'

// public.resolve_brand_memory is the ONE client-reachable write into brand_memory
// (the table carries a read-only tenant policy). Exercised over PostgREST with
// minted member JWTs — the exact path apps/web's Finish step will use.
describe.skipIf(!hasRlsEnv)('public.resolve_brand_memory', () => {
  // lazy: creating the client at collection time would throw before skipIf applies
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const workspaces: string[] = []
  let seq = 0

  type Args = {
    workspaceId: string | null
    payload?: unknown
    source?: string | null
    expectedVersion?: number
  }

  async function resolve(sub: string, args: Args) {
    const params: Record<string, unknown> = { p_workspace_id: args.workspaceId }
    if ('payload' in args) params.p_payload = args.payload
    if ('source' in args) params.p_source = args.source
    if ('expectedVersion' in args) params.p_expected_version = args.expectedVersion
    return userClient(sub).rpc('resolve_brand_memory', params)
  }

  /** A workspace whose sole member is `sub` with the given role. */
  async function freshWorkspace(role = 'owner'): Promise<{ ws: string; sub: string }> {
    const tag = `${role}_${seq++}_${run}`
    const sub = `user_brain_${tag}`
    const w = await svc()
      .from('workspaces')
      .insert({ name: `Brain ${tag}`, slug: `brain-${tag}`, created_by: sub })
      .select('id')
      .single()
    expect(w.error).toBeNull()
    const ws = w.data!.id as string
    workspaces.push(ws)
    const m = await svc().from('workspace_members').insert({ workspace_id: ws, user_id: sub, role })
    expect(m.error).toBeNull()
    return { ws, sub }
  }

  /** Ground truth read with the service client — never trust the RPC's own echo. */
  async function rows(ws: string) {
    const { data, error } = await svc()
      .from('brand_memory')
      .select('id, version, status, source, payload, created_by')
      .eq('workspace_id', ws)
      .order('version')
    expect(error).toBeNull()
    return data as Array<{
      id: string
      version: number
      status: string
      source: string
      payload: BrandMemoryPayload
      created_by: string | null
    }>
  }

  afterAll(async () => {
    for (const id of [...new Set(workspaces)]) {
      await svc().from('workspaces').delete().eq('id', id) // cascades brand_memory
    }
  })

  // ── happy path ────────────────────────────────────────────────────────────
  it('persists v1 as active, attributed to the caller, in the frozen envelope shape', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('v1')

    const { data, error } = await resolve(sub, { workspaceId: ws, payload })
    expect(error).toBeNull()

    // the envelope must parse as the shared contract wt-web will consume
    const result = ResolveBrandMemoryResultSchema.parse(data)
    expect(result.version).toBe(1)
    expect(result.replayed).toBe(false)
    expect(result.brand_memory.version).toBe(1)
    expect(result.brand_memory.status).toBe('active')
    expect(result.brand_memory.source).toBe('resolved')
    expect(result.brand_memory.created_by).toBe(sub)
    expect(result.brand_memory.workspace_id).toBe(ws)
    expect(result.brand_memory.payload).toEqual(payload)

    const stored = await rows(ws)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ version: 1, status: 'active', created_by: sub })
  })

  it('the member can read their own brain back through RLS (t_select)', async () => {
    const { ws, sub } = await freshWorkspace()
    await resolve(sub, { workspaceId: ws, payload: brandPayload('read') })

    const { data, error } = await userClient(sub)
      .from('brand_memory')
      .select('version, status')
      .eq('workspace_id', ws)
    expect(error).toBeNull()
    expect(data).toEqual([{ version: 1, status: 'active' }])
  })

  // ── versioning / supersede ────────────────────────────────────────────────
  it('a second distinct payload supersedes v1 and lands as active v2', async () => {
    const { ws, sub } = await freshWorkspace()
    await resolve(sub, { workspaceId: ws, payload: brandPayload('first') })
    const second = await resolve(sub, { workspaceId: ws, payload: brandPayload('second') })
    expect(second.error).toBeNull()
    expect(second.data.version).toBe(2)
    expect(second.data.replayed).toBe(false)

    const stored = await rows(ws)
    expect(stored.map((r) => [r.version, r.status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ])
    expect(stored.filter((r) => r.status === 'active')).toHaveLength(1)
  })

  it('both versions stay readable by the member after a supersede', async () => {
    const { ws, sub } = await freshWorkspace()
    await resolve(sub, { workspaceId: ws, payload: brandPayload('a') })
    await resolve(sub, { workspaceId: ws, payload: brandPayload('b') })

    const { data, error } = await userClient(sub)
      .from('brand_memory')
      .select('version, status')
      .eq('workspace_id', ws)
      .order('version')
    expect(error).toBeNull()
    expect(data).toEqual([
      { version: 1, status: 'superseded' },
      { version: 2, status: 'active' },
    ])
  })

  it('revert = a new version: P → Q → P leaves three versions with P active', async () => {
    const { ws, sub } = await freshWorkspace()
    const p = brandPayload('P')
    const q = brandPayload('Q')
    await resolve(sub, { workspaceId: ws, payload: p })
    await resolve(sub, { workspaceId: ws, payload: q })
    const back = await resolve(sub, { workspaceId: ws, payload: p })
    expect(back.error).toBeNull()
    expect(back.data.version).toBe(3)
    expect(back.data.replayed).toBe(false)

    const stored = await rows(ws)
    expect(stored).toHaveLength(3)
    expect(stored[2]).toMatchObject({ version: 3, status: 'active' })
    expect(stored[2]!.payload).toEqual(p)
  })

  it('version numbering skips over draft rows (max is taken across all statuses)', async () => {
    const { ws, sub } = await freshWorkspace()
    const seeded = await svc()
      .from('brand_memory')
      .insert({
        workspace_id: ws,
        version: 5,
        status: 'draft',
        payload: brandPayload('draft'),
        source: 'manual',
      })
    expect(seeded.error).toBeNull()

    const { data, error } = await resolve(sub, { workspaceId: ws, payload: brandPayload('after') })
    expect(error).toBeNull()
    expect(data.version).toBe(6) // an active-only max() would collide on (workspace_id, version)

    // the supersede must leave the draft alone — a future revert/calibration writer depends on it
    expect((await rows(ws)).map((r) => [r.version, r.status])).toEqual([
      [5, 'draft'],
      [6, 'active'],
    ])
  })

  it('version counters are per workspace, never global', async () => {
    const a = await freshWorkspace()
    const b = await freshWorkspace()
    for (const t of ['1', '2', '3']) {
      await resolve(a.sub, { workspaceId: a.ws, payload: brandPayload(t) })
    }
    const first = await resolve(b.sub, { workspaceId: b.ws, payload: brandPayload('b-first') })
    expect(first.error).toBeNull()
    expect(first.data.version).toBe(1)
  })

  // ── idempotency ───────────────────────────────────────────────────────────
  it('re-submitting the active payload replays it — no version burned', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('same')
    const first = await resolve(sub, { workspaceId: ws, payload })
    const second = await resolve(sub, { workspaceId: ws, payload })

    expect(second.error).toBeNull()
    expect(second.data.replayed).toBe(true)
    // the replay must carry a REAL version, not null
    expect(second.data.version).toBe(1)
    expect(second.data.version).toBe(second.data.brand_memory.version)
    expect(second.data.brand_memory.id).toBe(first.data.brand_memory.id)
    expect(await rows(ws)).toHaveLength(1)
  })

  it('upgrading away from a system fallback mints a version even on identical content', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('fallback')
    await resolve(sub, { workspaceId: ws, payload, source: 'system' })

    const upgraded = await resolve(sub, { workspaceId: ws, payload, source: 'resolved' })
    expect(upgraded.error).toBeNull()
    expect(upgraded.data.replayed).toBe(false)
    expect(upgraded.data.version).toBe(2)
    expect(upgraded.data.brand_memory.source).toBe('resolved')
  })

  it('a genuine brain is never relabelled downward by an identical resubmit', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('genuine')
    await resolve(sub, { workspaceId: ws, payload, source: 'resolved' })

    for (const source of ['system', 'manual']) {
      const again = await resolve(sub, { workspaceId: ws, payload, source })
      expect(again.error).toBeNull()
      expect(again.data.replayed).toBe(true)
      expect(again.data.brand_memory.source).toBe('resolved')
    }
    expect(await rows(ws)).toHaveLength(1)
  })

  // ── concurrency ───────────────────────────────────────────────────────────
  it('four concurrent distinct resolves produce contiguous versions and one active row', async () => {
    const { ws, sub } = await freshWorkspace()
    const results = await Promise.all(
      ['w', 'x', 'y', 'z'].map((t) => resolve(sub, { workspaceId: ws, payload: brandPayload(t) })),
    )
    for (const r of results) {
      expect(r.error).toBeNull() // a raw 23505 would surface here
    }
    const stored = await rows(ws)
    expect(stored.map((r) => r.version)).toEqual([1, 2, 3, 4])
    expect(stored.filter((r) => r.status === 'active')).toHaveLength(1)
  })

  it('four concurrent identical resolves collapse to a single version', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('rage-click')
    const results = await Promise.all(
      Array.from({ length: 4 }, () => resolve(sub, { workspaceId: ws, payload })),
    )
    for (const r of results) expect(r.error).toBeNull()
    expect(results.filter((r) => r.data.replayed === false)).toHaveLength(1)
    expect(await rows(ws)).toHaveLength(1)
  })

  it('a stale expected_version is refused instead of silently overwriting', async () => {
    const { ws, sub } = await freshWorkspace()
    await resolve(sub, { workspaceId: ws, payload: brandPayload('v1') })
    await resolve(sub, { workspaceId: ws, payload: brandPayload('v2') })

    const stale = await resolve(sub, {
      workspaceId: ws,
      payload: brandPayload('from-a-stale-tab'),
      expectedVersion: 1,
    })
    expect(stale.data).toBeNull()
    expect(stale.error!.message).toContain('VERSION_CONFLICT')

    const stored = await rows(ws)
    expect(stored).toHaveLength(2)
    expect(stored[1]).toMatchObject({ version: 2, status: 'active' })
  })

  it('expected_version 0 is the honest "no brain yet" assertion', async () => {
    const { ws, sub } = await freshWorkspace()
    const ok = await resolve(sub, {
      workspaceId: ws,
      payload: brandPayload('first'),
      expectedVersion: 0,
    })
    expect(ok.error).toBeNull()
    expect(ok.data.version).toBe(1)

    const again = await resolve(sub, {
      workspaceId: ws,
      payload: brandPayload('second'),
      expectedVersion: 0,
    })
    expect(again.error!.message).toContain('VERSION_CONFLICT')
  })

  it('the precondition beats idempotency: a stale expected_version conflicts even on a replay', async () => {
    const { ws, sub } = await freshWorkspace()
    const payload = brandPayload('cas-vs-replay')
    await resolve(sub, { workspaceId: ws, payload })

    // same payload that is already active, but the caller believes there is no brain yet
    const { error } = await resolve(sub, { workspaceId: ws, payload, expectedVersion: 0 })
    expect(error!.message).toContain('VERSION_CONFLICT')

    // ...and omitting the precondition replays it instead
    const replay = await resolve(sub, { workspaceId: ws, payload })
    expect(replay.error).toBeNull()
    expect(replay.data.replayed).toBe(true)
  })

  // ── authorization ─────────────────────────────────────────────────────────
  it('owner, editor and approver may all write the brain', async () => {
    for (const role of ['owner', 'editor', 'approver']) {
      const { ws, sub } = await freshWorkspace(role)
      const { data, error } = await resolve(sub, { workspaceId: ws, payload: brandPayload(role) })
      expect(error, `role ${role} should be allowed`).toBeNull()
      expect(data.version).toBe(1)
    }
  })

  it('a viewer is refused and writes nothing', async () => {
    const { ws, sub } = await freshWorkspace('viewer')
    const { data, error } = await resolve(sub, { workspaceId: ws, payload: brandPayload('nope') })
    expect(data).toBeNull()
    expect(error!.message).toContain('FORBIDDEN_ROLE')
    expect(await rows(ws)).toHaveLength(0)
  })

  it("cross-tenant: a member of B cannot write — or disturb — tenant A's brain", async () => {
    const a = await freshWorkspace()
    const b = await freshWorkspace()
    await resolve(a.sub, { workspaceId: a.ws, payload: brandPayload('A-secret') })
    const before = await rows(a.ws)

    const attack = await resolve(b.sub, { workspaceId: a.ws, payload: brandPayload('B-injected') })
    expect(attack.data).toBeNull()
    expect(attack.error!.message).toContain('NOT_A_MEMBER')

    // an error-string assertion alone would be vacuous — pin A's actual state
    expect(await rows(a.ws)).toEqual(before)

    // and B still cannot read A's brain through RLS
    const peek = await userClient(b.sub).from('brand_memory').select('id').eq('workspace_id', a.ws)
    expect(peek.error).toBeNull()
    expect(peek.data).toHaveLength(0)
  })

  it('a non-member cannot distinguish a real workspace from a nonexistent one', async () => {
    const a = await freshWorkspace()
    const b = await freshWorkspace()
    const real = await resolve(b.sub, { workspaceId: a.ws, payload: brandPayload('probe') })
    const ghost = await resolve(b.sub, {
      workspaceId: '00000000-0000-4000-8000-000000000000',
      payload: brandPayload('probe'),
    })
    // identical message ⇒ no existence oracle for workspace enumeration
    expect(real.error!.message).toBe(ghost.error!.message)
  })

  it('signed-out anon is denied at the permission layer, not inside the function', async () => {
    const { ws } = await freshWorkspace()
    const { error } = await anonClient().rpc('resolve_brand_memory', {
      p_workspace_id: ws,
      p_payload: brandPayload('anon'),
    })
    // 42501 = EXECUTE denied. If this ever surfaces AUTH_REQUIRED instead, the
    // grant boundary is gone and only the in-function JWT check is left standing.
    expect(error).toBeTruthy()
    expect(error!.code).toBe('42501')
    expect(error!.message).not.toContain('AUTH_REQUIRED')
    expect(await rows(ws)).toHaveLength(0)
  })

  it('a token that carries no subject is refused as AUTH_REQUIRED, not as a non-member', async () => {
    const { ws } = await freshWorkspace()
    // holds the EXECUTE grant (role: authenticated) but has no identity to act as.
    // Without the in-function guard this would fall through to NOT_A_MEMBER and the
    // identity check would be dead code nobody notices.
    const { data, error } = await resolve('', { workspaceId: ws, payload: brandPayload('nosub') })
    expect(data).toBeNull()
    expect(error!.message).toContain('AUTH_REQUIRED')
    expect(await rows(ws)).toHaveLength(0)
  })

  // ── argument guards ───────────────────────────────────────────────────────
  it('an explicit null payload is a typed refusal, not a constraint violation', async () => {
    const { ws, sub } = await freshWorkspace()
    const { data, error } = await resolve(sub, { workspaceId: ws, payload: null })
    expect(data).toBeNull()
    expect(error!.message).toContain('INVALID_PAYLOAD')
    // a NULL-permeable guard would leak the raw not-null / check violation instead
    expect(['23502', '23514', '22023']).not.toContain(error!.code)
  })

  it('an explicit null source falls back to resolved (only omission takes the default)', async () => {
    const { ws, sub } = await freshWorkspace()
    const { data, error } = await resolve(sub, {
      workspaceId: ws,
      payload: brandPayload('nullsrc'),
      source: null,
    })
    expect(error).toBeNull()
    expect(data.brand_memory.source).toBe('resolved')
  })

  it('rejects a source outside the frozen vocabulary, case-sensitively', async () => {
    const { ws, sub } = await freshWorkspace()
    for (const source of ['draft', 'RESOLVED', '']) {
      const { error } = await resolve(sub, {
        workspaceId: ws,
        payload: brandPayload('src'),
        source,
      })
      expect(error!.message, `source ${JSON.stringify(source)}`).toContain('INVALID_SOURCE')
    }
    expect(await rows(ws)).toHaveLength(0)
  })

  it('rejects a null workspace id', async () => {
    const { sub } = await freshWorkspace()
    const { error } = await resolve(sub, { workspaceId: null, payload: brandPayload('nows') })
    expect(error!.message).toContain('INVALID_WORKSPACE')
  })

  it('rejects a payload missing any of the six sections', async () => {
    const { ws, sub } = await freshWorkspace()
    const sections = ['voice', 'brand_persona', 'customer_persona', 'hook', 'taboo', 'alignment']
    for (const drop of sections) {
      const partial = { ...brandPayload('drop') } as Record<string, unknown>
      delete partial[drop]
      const { error } = await resolve(sub, { workspaceId: ws, payload: partial })
      expect(error!.message, `missing ${drop}`).toContain('INVALID_PAYLOAD')
    }
    for (const junk of [{}, [], 'a string', 42]) {
      const { error } = await resolve(sub, { workspaceId: ws, payload: junk })
      expect(error!.message, JSON.stringify(junk)).toContain('INVALID_PAYLOAD')
    }
    expect(await rows(ws)).toHaveLength(0)
  })

  it('rejects payloads that break the frozen zod shape (fixed arrays, signal_lock)', async () => {
    const { ws, sub } = await freshWorkspace()
    const base = brandPayload('shape')
    const bad: Array<[string, unknown]> = [
      ['sample_hooks of 2', withSection(base, 'hook', { sample_hooks: ['one', 'two'] })],
      [
        'signature_phrases of 4',
        withSection(base, 'voice', { signature_phrases: ['a', 'b', 'c', 'd'] }),
      ],
      [
        'core_values of 4',
        withSection(base, 'brand_persona', { core_values: ['a', 'b', 'c', 'd'] }),
      ],
      ['signature_phrases not an array', withSection(base, 'voice', { signature_phrases: 'one' })],
      ['sample_hooks not an array', withSection(base, 'hook', { sample_hooks: 'one' })],
      ['core_values not an array', withSection(base, 'brand_persona', { core_values: 'craft' })],
      ['banned_phrases not an array', withSection(base, 'voice', { banned_phrases: {} })],
      ['red_lines not an array', withSection(base, 'taboo', { red_lines: 'none' })],
      ['unknown signal_lock', withSection(base, 'alignment', { signal_lock: 'strongish' })],
      ['null signal_lock', withSection(base, 'alignment', { signal_lock: null })],
    ]
    for (const [label, payload] of bad) {
      const { error } = await resolve(sub, { workspaceId: ws, payload })
      expect(error, label).toBeTruthy()
      expect(error!.message, label).toContain('INVALID_PAYLOAD')
      // jsonb_array_length on a non-array would surface 22023 instead of a typed error
      expect(error!.code, label).not.toBe('22023')
    }
    expect(await rows(ws)).toHaveLength(0)
  })

  it('rejects an oversized brain and over-long open-ended lists', async () => {
    const { ws, sub } = await freshWorkspace()
    const base = brandPayload('big')

    // one 40 KB entry — over the byte ceiling, under the entry-count cap
    const huge = withSection(base, 'taboo', { red_lines: ['x'.repeat(40_000)] })
    expect((await resolve(sub, { workspaceId: ws, payload: huge })).error!.message).toContain(
      'INVALID_PAYLOAD',
    )

    // both open-ended lists are capped independently
    for (const [section, field] of [
      ['voice', 'banned_phrases'],
      ['taboo', 'red_lines'],
    ] as const) {
      const tooMany = withSection(base, section, {
        [field]: Array.from({ length: 41 }, (_, i) => `entry ${i}`),
      })
      const { error } = await resolve(sub, { workspaceId: ws, payload: tooMany })
      expect(error!.message, `41 × ${field}`).toContain('INVALID_PAYLOAD')
    }

    // the cap is an abuse ceiling, not a straitjacket — 40 entries still pass
    const atLimit = withSection(base, 'voice', {
      banned_phrases: Array.from({ length: 40 }, (_, i) => `phrase ${i}`),
    })
    expect((await resolve(sub, { workspaceId: ws, payload: atLimit })).error).toBeNull()
  })
})
