import { describe, it, expect } from 'vitest'
import { CaptionRewriteInputSchema, type MeshContext } from '@sahoda/shared'
import { createMesh } from './mesh'
import { captionRewriteTask } from './tasks/caption-rewrite'

/**
 * Live merge-checkpoint smoke (ruling #4). Skipped by default; everything else in
 * the suite is mock-first. Runs ONE real cheapest-tier call, proving:
 *   - real OpenRouter auth with the TEXT cost-isolated key (economy → TEXT),
 *   - the workload→key selection wired end-to-end, and
 *   - a real ai_provider_logs row lands for this trace.
 *
 * A throwaway workspace is created first (and cleaned up) because ai_provider_logs
 * carries a NOT NULL workspace_id → workspaces FK. SUPABASE_URL is normalized to its
 * origin so a path-bearing value can't 404 the PostgREST calls (PGRST125).
 *
 * Run it (never in CI) with real credentials on PATH, e.g.:
 *   set -a; source .env; set +a
 *   MESH_LIVE_SMOKE=1 pnpm --filter @sahoda/mesh test src/smoke.live.test.ts
 */
const LIVE = process.env.MESH_LIVE_SMOKE === '1'

describe.runIf(LIVE)('mesh live smoke', () => {
  it('makes a real economy-tier call and writes a real ai_provider_logs row', async () => {
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const svc = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }

    // Throwaway workspace so the ai_provider_logs FK holds; cascade-deleted at the end.
    const wsRes = await fetch(`${base}/rest/v1/workspaces`, {
      method: 'POST',
      headers: { ...svc, prefer: 'return=representation' },
      body: JSON.stringify({
        name: 'mesh-smoke',
        slug: `mesh-smoke-${process.pid}-${Date.now()}`,
        created_by: 'mesh-smoke',
      }),
    })
    expect(wsRes.ok).toBe(true)
    const created = (await wsRes.json()) as Array<{ id: string }>
    const ws = created[0]
    if (!ws) throw new Error('smoke: workspace was not created')

    try {
      const mesh = createMesh() // real env, real fetch
      const traceId = `mesh-smoke-${process.pid}-${process.hrtime.bigint()}`
      const ctx: MeshContext = { workspaceId: ws.id, traceId, creditsCharged: 0 }
      const input = CaptionRewriteInputSchema.parse({
        text: 'come by our shop this weekend',
        instruction: 'shorten',
      })

      const result = await mesh.runTask(captionRewriteTask.def, input, ctx)

      expect(result.ok).toBe(true)
      if (result.ok) expect(typeof result.data.text).toBe('string')
      expect(result.usage?.provider).toBeTruthy()

      // Read the telemetry row back via PostgREST to prove it persisted.
      const res = await fetch(
        `${base}/rest/v1/ai_provider_logs?trace_id=eq.${encodeURIComponent(traceId)}&select=status,provider,task`,
        { headers: { apikey: key, authorization: `Bearer ${key}` } },
      )
      expect(res.ok).toBe(true)
      const rows = (await res.json()) as Array<{ status: string; task: string }>
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.task).toBe('caption_rewrite')
    } finally {
      await fetch(`${base}/rest/v1/workspaces?id=eq.${ws.id}`, { method: 'DELETE', headers: svc })
    }
  }, 30_000)
})
