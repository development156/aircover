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
 * Run it (never in CI) with real credentials on PATH, e.g.:
 *   set -a; source .env; set +a
 *   MESH_LIVE_SMOKE=1 pnpm --filter @sahoda/mesh test src/smoke.live.test.ts
 */
const LIVE = process.env.MESH_LIVE_SMOKE === '1'

describe.runIf(LIVE)('mesh live smoke', () => {
  it('makes a real economy-tier call and writes a real ai_provider_logs row', async () => {
    const mesh = createMesh() // real env, real fetch
    const traceId = `mesh-smoke-${process.pid}-${process.hrtime.bigint()}`
    const ctx: MeshContext = {
      workspaceId: '00000000-0000-0000-0000-000000000000',
      traceId,
      creditsCharged: 0,
    }
    const input = CaptionRewriteInputSchema.parse({
      text: 'come by our shop this weekend',
      instruction: 'shorten',
    })

    const result = await mesh.runTask(captionRewriteTask.def, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(typeof result.data.text).toBe('string')
    expect(result.usage?.provider).toBeTruthy()

    // Read the telemetry row back via PostgREST to prove it persisted.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const res = await fetch(
      `${url}/rest/v1/ai_provider_logs?trace_id=eq.${encodeURIComponent(traceId)}&select=status,provider,task`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } },
    )
    expect(res.ok).toBe(true)
    const rows = (await res.json()) as Array<{ status: string; task: string }>
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]!.task).toBe('caption_rewrite')
  }, 30_000)
})
