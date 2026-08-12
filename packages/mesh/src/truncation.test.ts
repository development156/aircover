import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import { createMeshRunner, type MeshTaskSpec, type RepairEvent } from './engine'
import type { ChatRequest, ChatResponse, Provider } from './providers/types'

/**
 * A TRUNCATION MUST NOT BE REPAIRED.
 *
 * The repair replays the same request under the same budget, so a response cut
 * off at max_tokens is cut off again — a guaranteed second charge that cannot
 * succeed. Worse, `plan_week` pins exactly 5 briefs and three arrays are pinned
 * at exactly 3, so a truncated-then-repaired answer can PASS its schema while
 * holding less than the caller asked for.
 */
const Out = z.object({ ok: z.boolean() })
const def: MeshTaskDef<{ x: number }, { ok: boolean }> = {
  name: 'test_task',
  tier: 'standard',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: Out,
  maxTokens: 64,
}
const spec: MeshTaskSpec<{ x: number }, { ok: boolean }> = {
  def,
  buildMessages: () => [{ role: 'user', content: 'go' }],
}
const ctx: MeshContext = { workspaceId: 'ws', traceId: 't' }

function provider(responses: ChatResponse[]): { provider: Provider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = []
  let i = 0
  return {
    calls,
    provider: {
      name: 'p',
      async chat(req) {
        calls.push(req)
        return responses[Math.min(i++, responses.length - 1)]!
      },
    },
  }
}

const usage = { provider: 'p', model: 'm', tokensIn: 10, tokensOut: 64, cachedTokens: 0 }

function runner(p: Provider, logs: unknown[] = [], repairs: RepairEvent[] = []) {
  return createMeshRunner({
    planAttempts: () => [{ provider: p, model: 'm' }],
    logSink: { write: async (row) => void logs.push(row) },
    now: () => 0,
    price: () => 0,
    onRepair: (e) => repairs.push(e),
  })
}

describe('truncation', () => {
  it('fails loudly and never spends a second call', async () => {
    const logs: unknown[] = []
    const { provider: p, calls } = provider([{ text: '{"ok":tr', truncated: true, usage }])

    const result = await runner(p, logs).run(spec, { x: 1 }, ctx)

    expect(result.ok).toBe(false)
    if (result.ok) return
    // One call. A repair here is money spent to reproduce the same cut-off.
    expect(calls).toHaveLength(1)
    // The message names the number someone can change.
    expect(result.error.message).toMatch(/64-token ceiling for test_task/)
  })

  it('logs OUTPUT_TRUNCATED as an error, not as a success', async () => {
    const logs: Array<{ status?: string; error_code?: string | null }> = []
    const { provider: p } = provider([{ text: '{"ok":tr', truncated: true, usage }])

    await runner(p, logs as unknown[]).run(spec, { x: 1 }, ctx)

    expect(logs).toHaveLength(1)
    expect(logs[0]!.status).toBe('error')
    expect(logs[0]!.error_code).toBe('OUTPUT_TRUNCATED')
  })

  it('does NOT report a truncation as a repair — they need opposite fixes', async () => {
    const repairs: RepairEvent[] = []
    const { provider: p } = provider([{ text: '{"ok":tr', truncated: true, usage }])
    await runner(p, [], repairs).run(spec, { x: 1 }, ctx)
    expect(repairs).toEqual([])
  })

  it('still repairs ordinary bad JSON — this narrows the retry, it does not remove it', async () => {
    const repairs: RepairEvent[] = []
    const { provider: p, calls } = provider([
      { text: 'not json at all', usage },
      { text: '{"ok":true}', usage },
    ])

    const result = await runner(p, [], repairs).run(spec, { x: 1 }, ctx)

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(repairs).toHaveLength(1)
    expect(repairs[0]!.recovered).toBe(true)
  })
})
