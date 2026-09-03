import { describe, it, expect } from 'vitest'
import { CaptionRewriteInputSchema, type MeshContext } from '@sahoda/shared'
import type { FetchLike } from './providers/types'
import { createMesh } from './mesh'
import { captionRewriteTask } from './tasks/caption-rewrite'

const env: Record<string, string | undefined> = {
  OPENROUTER_API_KEY_RESEARCH: 'or-research',
  OPENROUTER_API_KEY_TEXT: 'or-text',
  OPENROUTER_API_KEY_IMAGE: 'or-image',
  OPENAI_API_KEY: 'oai',
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
}

interface Recorded {
  url: string
  init: RequestInit
}

/** Routes chat-completions vs the ai_provider_logs insert; records every call. */
function router(): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init })
    if (url.includes('/rest/v1/ai_provider_logs')) {
      return new Response(null, { status: 201 })
    }
    if (url.includes('/rest/v1/knowledge_current_chunks')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    // chat completion
    return new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '{"text":"Rewritten ☕"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fetchImpl, calls }
}

const ctx: MeshContext = {
  workspaceId: '11111111-1111-1111-1111-111111111111',
  traceId: 'trace-mesh',
  creditsCharged: 1,
}

describe('createMesh (wired end-to-end)', () => {
  it('runs a task through routing → provider → engine → telemetry with a fake transport', async () => {
    // No `calls` here: the two tests below assert the routing key and the
    // telemetry row off the same recorder. This one is about the result.
    const { fetchImpl } = router()
    const mesh = createMesh({ env, fetchImpl })
    const input = CaptionRewriteInputSchema.parse({ text: 'come by', instruction: 'rewrite' })

    const result = await mesh.runTask(captionRewriteTask.def, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ text: 'Rewritten ☕' })
  })

  it('selects the TEXT OpenRouter key for the economy tier', async () => {
    const { fetchImpl, calls } = router()
    const mesh = createMesh({ env, fetchImpl })
    const input = CaptionRewriteInputSchema.parse({ text: 'come by', instruction: 'rewrite' })

    await mesh.runTask(captionRewriteTask.def, input, ctx)

    const chatCall = calls.find((c) => c.url.includes('openrouter.ai'))
    expect(chatCall).toBeDefined()
    const headers = chatCall!.init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer or-text')
  })

  it('writes exactly one ai_provider_logs row with status ok', async () => {
    const { fetchImpl, calls } = router()
    const mesh = createMesh({ env, fetchImpl })
    const input = CaptionRewriteInputSchema.parse({ text: 'come by', instruction: 'rewrite' })

    await mesh.runTask(captionRewriteTask.def, input, ctx)

    const logCalls = calls.filter((c) => c.url.includes('/rest/v1/ai_provider_logs'))
    expect(logCalls).toHaveLength(1)
    const row = JSON.parse(logCalls[0]!.init.body as string)
    expect(row.task).toBe('caption_rewrite')
    expect(row.tier).toBe('economy')
    expect(row.provider).toBe('openrouter')
    expect(row.status).toBe('ok')
    expect(row.trace_id).toBe('trace-mesh')
  })

  it('rejects an unknown task with a typed validation error', async () => {
    const { fetchImpl } = router()
    const mesh = createMesh({ env, fetchImpl })
    const fakeDef = { ...captionRewriteTask.def, name: 'not_a_task' }

    const result = await mesh.runTask(fakeDef, { text: 'x', instruction: 'rewrite' }, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
  })
  it('reads the knowledge library for a grounded task, scoped to the workspace', async () => {
    // THE WIRING, which every other knowledge test is blind to: the provider and
    // the engine can both be right while `createMesh` never hands one to the
    // other, and the feature is then a well-tested unit nothing calls.
    const { fetchImpl, calls } = router()
    const mesh = createMesh({ env, fetchImpl })
    const input = CaptionRewriteInputSchema.parse({ text: 'come by', instruction: 'rewrite' })

    await mesh.runTask(captionRewriteTask.def, input, ctx)

    const read = calls.find((c) => c.url.includes('/rest/v1/knowledge_current_chunks'))
    expect(read, 'createMesh did not give the runner a knowledgeContext').toBeDefined()
    expect(read!.url).toContain(`workspace_id=eq.${ctx.workspaceId}`)
  })
})
