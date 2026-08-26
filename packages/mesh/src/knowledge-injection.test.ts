import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import { createMeshRunner, type MeshTaskSpec } from './engine'
import type { KnowledgeContextProvider } from './knowledge-context'
import type { ChatMessage, ChatRequest, ChatResponse, Provider } from './providers/types'

/**
 * THE SEAM, not the retrieval. `knowledge-context.test.ts` proves the passages
 * are the right ones and fenced; this proves they reach the provider, that a task
 * which did not ask for them does not pay for a read, and that a library outage
 * cannot fail a paid action.
 */

const OutSchema = z.object({ ok: z.boolean() })
type Out = z.infer<typeof OutSchema>
interface In {
  body: string
}

const def: MeshTaskDef<In, Out> = {
  name: 'test_task',
  tier: 'economy',
  inputSchema: z.object({ body: z.string() }),
  outputSchema: OutSchema,
  maxTokens: 64,
}

function capturingProvider(): { provider: Provider; seen: ChatRequest[] } {
  const seen: ChatRequest[] = []
  return {
    seen,
    provider: {
      name: 'cap',
      async chat(req: ChatRequest): Promise<ChatResponse> {
        seen.push(req)
        return {
          text: '{"ok":true}',
          usage: { provider: 'cap', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
        }
      },
    },
  }
}

const knowledgeMsg: ChatMessage = { role: 'system', content: 'KNOWLEDGE LIBRARY block' }

const grounded: MeshTaskSpec<In, Out> = {
  def,
  buildMessages: (input, _ctx, brand, knowledge) => [
    { role: 'system', content: 'sys' },
    ...(brand ? [brand] : []),
    ...(knowledge ? [knowledge] : []),
    { role: 'user', content: input.body },
  ],
  knowledgeQuery: (input) => input.body,
}

const ctx: MeshContext = { workspaceId: 'ws', traceId: 't' }

function runnerWith(knowledgeContext: KnowledgeContextProvider | undefined, provider: Provider) {
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
    knowledgeContext,
  })
}

describe('engine knowledge injection', () => {
  it('puts the retrieved passages in front of the provider', async () => {
    const { provider, seen } = capturingProvider()
    const r = await runnerWith({ get: async () => knowledgeMsg }, provider).run(
      grounded,
      { body: 'what does the tasting cost' },
      ctx,
    )

    expect(r.ok).toBe(true)
    expect(seen[0]!.messages.some((m) => m.content.includes('KNOWLEDGE LIBRARY'))).toBe(true)
  })

  it('retrieves against the task’s own brief and the caller’s workspace', async () => {
    const asked: Array<[string, string]> = []
    const { provider } = capturingProvider()
    await runnerWith(
      {
        get: async (workspaceId, brief) => {
          asked.push([workspaceId, brief])
          return null
        },
      },
      provider,
    ).run(grounded, { body: 'the tasting menu' }, ctx)

    expect(asked).toEqual([['ws', 'the tasting menu']])
  })

  it('sends nothing extra when the library has no matching passage', async () => {
    const { provider, seen } = capturingProvider()
    await runnerWith({ get: async () => null }, provider).run(grounded, { body: 'x' }, ctx)

    expect(seen[0]!.messages.some((m) => m.content.includes('KNOWLEDGE'))).toBe(false)
    expect(seen[0]!.messages).toHaveLength(2)
  })

  it('still produces the caption when the library read throws', async () => {
    // Grounding is best-effort. A knowledge outage that failed a paid action
    // would charge somebody a credit for our database being down.
    const failing: KnowledgeContextProvider = {
      get: async () => {
        throw new Error('down')
      },
    }
    const { provider, seen } = capturingProvider()
    const r = await runnerWith(failing, provider).run(grounded, { body: 'x' }, ctx)

    expect(r.ok).toBe(true)
    expect(seen[0]!.messages.some((m) => m.content.includes('KNOWLEDGE'))).toBe(false)
  })

  it('does not read the library for a task that did not declare a query', async () => {
    // gate_classify is the case this protects: its own header says the checker
    // must not read what the post was written from. A read it never asked for is
    // also a database call on every one of those calls.
    let called = false
    const spy: KnowledgeContextProvider = {
      get: async () => {
        called = true
        return knowledgeMsg
      },
    }
    const ungrounded: MeshTaskSpec<In, Out> = { ...grounded, knowledgeQuery: undefined }
    const { provider } = capturingProvider()
    await runnerWith(spy, provider).run(ungrounded, { body: 'x' }, ctx)

    expect(called).toBe(false)
  })
})
