import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BrandMemoryPayloadSchema,
  CONSTRAINTS,
  validateVariant,
  type Channel,
} from '@sahoda/shared'
import { hasLedgerEnv, hasRlsEnv } from './helpers/env'
import { serviceClient, anonClient } from './helpers/db'
import { runSeed } from '../seeds/demo/index'
import { destroySeed } from '../seeds/demo/destroy'
import { DEMO_MARKER, demoOwnerId } from '../seeds/demo/context'

/**
 * The seed writes to the LIVE shared dev project, so this suite must never touch the real
 * demo workspace. It runs under a throwaway `--namespace`, which gives it a disjoint id
 * space (ids.ts hashes the namespace into every uuid), a disjoint workspace/site slug, a
 * disjoint owner id, and therefore a teardown that cannot reach the real demo's rows.
 */
describe.skipIf(!hasLedgerEnv || !hasRlsEnv)('seeds/demo — Chai & Chapters', () => {
  const namespace = `demo-test-${Date.now()}`
  const ownerId = demoOwnerId(namespace)

  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  let workspaceId = ''

  /** Tables the seed is expected to populate — used for the idempotency comparison. */
  const SEEDED_TABLES = [
    'workspace_members',
    'workspace_themes',
    'subscriptions',
    'tour_progress',
    'brand_memory',
    'memory_events',
    'posts',
    'post_variants',
    'post_media',
    'post_publish_logs',
    'planner_events',
    'sites',
    'site_pages',
    'site_sections',
    'leads',
    'connections',
    'credit_ledger',
    'audit_logs',
    'ai_provider_logs',
  ] as const

  async function countRows(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const table of SEEDED_TABLES) {
      const { count, error } = await svc()
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
      if (error) throw new Error(`count ${table}: ${error.message}`)
      counts[table] = count ?? 0
    }
    return counts
  }

  beforeAll(async () => {
    const summary = await runSeed({ namespace, quiet: true })
    workspaceId = summary.workspaceId
  })

  /** Overwrite just the demo marker, preserving the rest of `settings` (incl. seeded_at). */
  async function setMarker(value: string): Promise<void> {
    const { data } = await svc()
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .maybeSingle()
    if (!data) return
    const settings = { ...(data.settings as Record<string, unknown>), demo_seed: value }
    await svc().from('workspaces').update({ settings }).eq('id', workspaceId)
  }

  /**
   * The teardown REPAIRS the marker before destroying, rather than just swallowing a
   * failure. The marker-mismatch test below deliberately breaks the marker, and destroy —
   * correctly — refuses to delete a workspace without it. So a failure between the break
   * and the repair would leave a workspace that the destroy command cannot remove (no
   * marker) and that sweepStaleFixtures cannot collect either (its `created_by` is
   * `demo_seed_…`, which PREFIX_SHAPE rejects by design). That is the "eight stranded
   * workspaces" failure tests/helpers/sweep.ts exists to end, walking back in through a
   * door the sweep is forbidden to open. Writing the marker here is safe: `workspaceId` is
   * uuidv5-derived from this suite's throwaway namespace, so it can only ever name this
   * suite's own workspace.
   */
  afterAll(async () => {
    if (!workspaceId) return
    await setMarker(DEMO_MARKER).catch(() => undefined)
    await destroySeed({ namespace, quiet: true }).catch(() => undefined)
  })

  /**
   * Exact counts, not `> 0`. These are the numbers seeds/demo/README.md advertises, so
   * pinning them here is what keeps the README from quietly becoming fiction — a module
   * that drops a row still seeds "something" and would pass a non-empty check.
   *
   * `workspace_members` is 1 because SEED_DEMO_MEMBER_IDS is unset in test runs; it scales
   * with that list, so it is derived rather than literal. `tour_progress` is 0 and does NOT
   * scale: the seed writes no tour state at all and deletes any it finds (see
   * `pruneFabricatedTours`), so a non-zero count here means the fabricated completions are
   * back.
   */
  it('seeds exactly the rows its README advertises', async () => {
    const memberCount =
      1 + (process.env.SEED_DEMO_MEMBER_IDS ?? '').split(',').filter(Boolean).length
    const expected: Record<string, number> = {
      workspace_members: memberCount,
      workspace_themes: 1,
      subscriptions: 1,
      tour_progress: 0,
      brand_memory: 2,
      memory_events: 2,
      posts: 8,
      post_variants: 17,
      post_media: 2,
      post_publish_logs: 6,
      planner_events: 9,
      sites: 1,
      site_pages: 2,
      site_sections: 9,
      leads: 3,
      connections: 2,
      credit_ledger: 22,
      audit_logs: 10,
      ai_provider_logs: 7,
    }
    expect(await countRows()).toEqual(expected)
  })

  it('marks the workspace unmistakably as demo data', async () => {
    const { data, error } = await svc()
      .from('workspaces')
      .select('name, slug, created_by, settings')
      .eq('id', workspaceId)
      .single()
    expect(error).toBeNull()
    expect(data!.settings).toMatchObject({ demo: true, demo_seed: DEMO_MARKER })
    expect(data!.created_by).toBe(ownerId)
    // Never `user_`-prefixed, or tests/helpers/sweep.ts could collect the real demo.
    expect(ownerId.startsWith('user_')).toBe(false)
  })

  it('is idempotent — a second run changes no row and no id', async () => {
    const before = await countRows()
    const { data: idsBefore } = await svc()
      .from('posts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .order('id')

    const summary = await runSeed({ namespace, quiet: true })
    expect(summary.workspaceId).toBe(workspaceId)

    const after = await countRows()
    expect(after).toEqual(before)

    const { data: idsAfter } = await svc()
      .from('posts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .order('id')
    expect(idsAfter).toEqual(idsBefore)
  })

  /**
   * The clock is pinned to the first seeding, and this is the assertion that holds it there.
   *
   * Counts and ids alone do not catch a drifting clock. With a fresh `new Date()` per run,
   * the mutable tables re-date themselves while the four append-only tables stay frozen at
   * run one (they are `do nothing` — `app.block_mutations` rejects UPDATE at trigger depth
   * 1). A re-seed a month later would leave a post claiming it published 3 days ago while
   * its own publish log, its audit row, and its wallet debit all still sat 33 days back —
   * with every count and every id identical, so the seed would report success.
   *
   * A month-boundary re-run is also what would double-apply the monthly grant, because
   * `periodKey(ctx.now)` feeds the grant's idempotency key.
   */
  it('moves no timestamp on a re-run — the clock is pinned to the first seeding', async () => {
    const read = async () => {
      const { data: workspace } = await svc()
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()
      const { data: posts } = await svc()
        .from('posts')
        .select('id, scheduled_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('id')
      const { data: ledger } = await svc()
        .from('credit_ledger')
        .select('idempotency_key, created_at')
        .eq('workspace_id', workspaceId)
        .order('seq')
      return {
        seededAt: (workspace!.settings as { seeded_at?: string }).seeded_at,
        posts,
        ledger,
      }
    }

    const before = await read()
    expect(before.seededAt, 'seeded_at anchors the pinned clock').toBeTruthy()

    await runSeed({ namespace, quiet: true })

    const after = await read()
    expect(after.seededAt, 'seeded_at must be written once and never move').toBe(before.seededAt)
    expect(after.posts, 'post timestamps must not re-date on a re-run').toEqual(before.posts)
    expect(after.ledger, 'a re-run must replay every entry, never mint a new one').toEqual(
      before.ledger,
    )
  })

  it('leaves a correct credit balance with no open holds', async () => {
    const { data: balance, error } = await svc()
      .from('credit_balances')
      .select('balance_total, balance_held')
      .eq('workspace_id', workspaceId)
      .single()
    expect(error).toBeNull()
    expect(balance!.balance_held).toBe(0)
    expect(balance!.balance_total).toBeGreaterThan(0)

    // The ledger is the authority: the newest entry's balance_after is available credits,
    // which must equal total - held. A drift here means a direct write bypassed the fn.
    const { data: latest } = await svc()
      .from('credit_ledger')
      .select('balance_after')
      .eq('workspace_id', workspaceId)
      .order('seq', { ascending: false })
      .limit(1)
      .single()
    expect(latest!.balance_after).toBe(balance!.balance_total - balance!.balance_held)

    // The released HOLD must have cost the user nothing: its RELEASE settles it and no
    // DEBIT ever references it. This is the "users never pay for failures" rule on screen.
    const { data: holds } = await svc()
      .from('credit_ledger')
      .select('id, entry_type')
      .eq('workspace_id', workspaceId)
      .eq('entry_type', 'HOLD')
    const { data: settlements } = await svc()
      .from('credit_ledger')
      .select('settles_entry_id, entry_type')
      .eq('workspace_id', workspaceId)
      .not('settles_entry_id', 'is', null)
    expect(holds!.length).toBeGreaterThan(0)
    // every hold is settled exactly once
    const settledIds = settlements!.map((s) => s.settles_entry_id)
    expect(new Set(settledIds).size).toBe(settledIds.length)
    expect(settledIds.sort()).toEqual(holds!.map((h) => h.id).sort())
    expect(settlements!.some((s) => s.entry_type === 'RELEASE')).toBe(true)
  })

  it('stores exactly one active brand memory that parses the frozen shared contract', async () => {
    const { data, error } = await svc()
      .from('brand_memory')
      .select('version, status, payload')
      .eq('workspace_id', workspaceId)
      .order('version')
    expect(error).toBeNull()
    expect(data!.filter((row) => row.status === 'active')).toHaveLength(1)
    for (const row of data!) {
      expect(() => BrandMemoryPayloadSchema.parse(row.payload)).not.toThrow()
    }
  })

  it('stores no post variant that violates its own platform spec', async () => {
    const { data, error } = await svc()
      .from('post_variants')
      .select('post_id, channel, body, char_count, extras')
      .eq('workspace_id', workspaceId)
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)

    for (const variant of data!) {
      const spec = CONSTRAINTS[variant.channel as Channel]
      const hashtags = (variant.extras as { hashtags?: string[] } | null)?.hashtags
      const { violations, charCount } = validateVariant(spec, { body: variant.body, hashtags })
      expect(violations, `${variant.channel} variant of ${variant.post_id}`).toEqual([])
      expect(variant.char_count).toBe(charCount)
    }
  })

  it('never publishes a variant on a channel the product cannot publish to', async () => {
    const { data } = await svc()
      .from('post_variants')
      .select('channel, publish_status')
      .eq('workspace_id', workspaceId)
    for (const variant of data!) {
      if (!CONSTRAINTS[variant.channel as Channel].publishable) {
        expect(variant.publish_status).not.toBe('published')
      }
    }
    // Nothing here was really published, so every log must say so.
    const { data: logs } = await svc()
      .from('post_publish_logs')
      .select('mode')
      .eq('workspace_id', workspaceId)
    expect(logs!.every((log) => log.mode === 'fixture')).toBe(true)
  })

  /**
   * The green "Published" chip in `apps/web` is driven by `posts.status`, and the app's own
   * publish action refuses to write that value off a fixture run because it "would be a
   * fabricated success state". Nothing in this workspace has ever been published anywhere,
   * so no post may carry it either.
   */
  it('claims no post is published, because none of them are', async () => {
    const { data, error } = await svc()
      .from('posts')
      .select('title, status')
      .eq('workspace_id', workspaceId)
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.filter((post) => post.status === 'published')).toEqual([])
  })

  /**
   * Every publish artifact must carry the fixture adapter's own shape — `fixture-…` ids and
   * `fixture://` permalinks. The regression this pins is specific: these columns used to
   * hold `https://x.com/chaiandchapters/status/demo-x-1963444`, a URL indistinguishable
   * from a real post for content that has never left this database.
   */
  it('writes only fixture-shaped publish ids and permalinks', async () => {
    const [variants, logs] = await Promise.all([
      svc()
        .from('post_variants')
        .select('channel, platform_post_id, permalink')
        .eq('workspace_id', workspaceId),
      svc()
        .from('post_publish_logs')
        .select('channel, platform_post_id, permalink')
        .eq('workspace_id', workspaceId),
    ])

    const rows = [...variants.data!, ...logs.data!].filter((row) => row.permalink !== null)
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      expect(row.permalink).toBe(`fixture://${row.channel}/${row.platform_post_id}`)
      expect(row.platform_post_id!.startsWith('fixture-')).toBe(true)
      // The thing that must never come back: an http(s) URL on a simulated publish.
      expect(row.permalink!).not.toMatch(/^https?:/)
    }
  })

  it('plants no OAuth token for its demo connections', async () => {
    const { data: connections } = await svc()
      .from('connections')
      .select('id')
      .eq('workspace_id', workspaceId)
    expect(connections!.length).toBeGreaterThan(0)

    const { count } = await svc()
      .from('connection_secrets')
      .select('*', { count: 'exact', head: true })
      .in(
        'connection_id',
        connections!.map((c) => c.id),
      )
    expect(count).toBe(0)
  })

  it('is invisible to a signed-out client', async () => {
    const anon = anonClient()
    for (const table of ['workspaces', 'posts', 'credit_ledger', 'leads'] as const) {
      const column = table === 'workspaces' ? 'id' : 'workspace_id'
      const { data } = await anon.from(table).select('*').eq(column, workspaceId)
      expect(data ?? [], `anon must not read ${table}`).toHaveLength(0)
    }
  })

  it('refuses to destroy a workspace that is not marked as demo data', async () => {
    await setMarker('sahoda:not-a-demo')
    try {
      await expect(destroySeed({ namespace, quiet: true })).rejects.toThrow()

      const { data } = await svc().from('workspaces').select('id').eq('id', workspaceId).single()
      expect(data!.id, 'the workspace must survive a refused destroy').toBe(workspaceId)

      // The refusal must be total, not partial: a teardown that deleted the children and
      // then balked at the parent would be worse than one that never started.
      const { count } = await svc()
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
      expect(count, 'a refused destroy must delete nothing at all').toBe(8)
    } finally {
      // Always restore, even if an assertion above threw — see the afterAll comment for
      // what an unrepaired marker strands on a shared dev database.
      await setMarker(DEMO_MARKER)
    }
  })

  it('deletes the workspace and its owner profile in one command', async () => {
    const result = await destroySeed({ namespace, quiet: true })
    expect(result.deleted).toBe(true)

    const { data: workspace } = await svc()
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .maybeSingle()
    expect(workspace).toBeNull()

    // users_profile has no workspace_id and no FK, so the cascade does not reach it.
    const { data: profile } = await svc()
      .from('users_profile')
      .select('user_id')
      .eq('user_id', ownerId)
      .maybeSingle()
    expect(profile).toBeNull()

    // the cascade cleared the tenant tables, including the append-only ones
    for (const table of ['posts', 'credit_ledger', 'post_publish_logs', 'audit_logs'] as const) {
      const { count } = await svc()
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
      expect(count, `${table} should be gone`).toBe(0)
    }
  })
})

/**
 * The month-rollover mutation, isolated because it seeds with a backdated clock.
 *
 * The suite above re-runs the seed seconds after the first run, which cannot distinguish a
 * pinned clock from a fresh one: both land on the same IST day, so every `at(now, -3, …)`
 * timestamp and every `periodKey(now)` agree by coincidence. This test removes the
 * coincidence. It seeds with an explicit clock 40 days back, then re-runs with NO clock so
 * the seed must recover the original instant from `settings->>'seeded_at'` on its own.
 *
 * Unpinned, the re-run computes a different `periodKey`, which is a different
 * `monthlyGrantKey` and a different `campaign_plan` debit label — both NEW idempotency
 * keys. A second 1500-credit GRANT and a second 25-credit DEBIT apply, `assertBalance`
 * disagrees with the figure derived from PLAN_CATALOG + PRICING, and the whole seed rolls
 * back. That is a seed which works all month and then breaks permanently, blaming pricing
 * drift for a clock rollover.
 */
describe.skipIf(!hasLedgerEnv || !hasRlsEnv)('seeds/demo — clock pinning across a month', () => {
  const namespace = `demo-clock-${Date.now()}`
  const FORTY_DAYS_MS = 40 * 24 * 60 * 60 * 1000
  const backdated = new Date(Date.now() - FORTY_DAYS_MS)

  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  afterAll(async () => {
    await destroySeed({ namespace, quiet: true }).catch(() => undefined)
  })

  it('replays the monthly grant instead of minting a second one', async () => {
    const first = await runSeed({ namespace, now: backdated, quiet: true })
    expect(first.workspaceId).toBeTruthy()

    const grants = async () => {
      const { data } = await svc()
        .from('credit_ledger')
        .select('idempotency_key, amount')
        .eq('workspace_id', first.workspaceId)
        .eq('action_type', 'monthly_grant')
      return data ?? []
    }

    const before = await grants()
    expect(before, 'the first seeding grants exactly once').toHaveLength(1)

    // No `now` — the seed has to recover the backdated instant from the workspace itself.
    const second = await runSeed({ namespace, quiet: true })

    expect(await grants(), 'a re-run must replay the grant, never mint a second').toHaveLength(1)
    expect(second.balanceTotal, 'balance must not move on a re-run').toBe(first.balanceTotal)
    expect(second.balanceHeld).toBe(0)
  })
})
