import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import { createMeshRunner, type MeshTaskSpec } from '../engine'
import { createOpenRouterProvider } from './openrouter'
import { createOpenAIProvider } from './openai'
import { ProviderCallError, type ChatRequest, type FetchLike, type Provider } from './types'

/**
 * THE DEFAULT SILENTLY BILLS.
 *
 * OpenRouter's documented behaviour with no engine specified is: try the model's
 * native file support, then fall back to `mistral-ocr` at $2 per 1,000 pages. So
 * "we didn't set it" is not neutral — it is a purchase nobody authorised. These
 * tests assert the engine on the wire, and then assert the harder thing: that a
 * FALLBACK cannot smuggle the same document to a provider with no file-parser
 * plugin, where it would parse as native input tokens instead.
 */

function capture(): { fetchImpl: FetchLike; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const fetchImpl: FetchLike = async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    return new Response(
      JSON.stringify({
        model: 'm',
        choices: [
          {
            message: {
              content: '{"ok":true}',
              annotations: [{ type: 'file', file: { hash: 'h1', name: 'brand.pdf' } }],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fetchImpl, bodies }
}

const FILE = { filename: 'brand.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0x' }

describe('PDF engine is explicit on the wire', () => {
  it('sends plugins[file-parser].pdf.engine = cloudflare-ai, the free one', async () => {
    const { fetchImpl, bodies } = capture()
    const provider = createOpenRouterProvider('k', fetchImpl)

    await provider.chat({
      model: 'm',
      maxTokens: 64,
      pdfEngine: 'cloudflare-ai',
      messages: [{ role: 'user', content: 'read this', files: [FILE] }],
    })

    const plugins = bodies[0]!.plugins as Array<{ id: string; pdf: { engine: string } }>
    expect(plugins).toHaveLength(1)
    expect(plugins[0]!.id).toBe('file-parser')
    expect(plugins[0]!.pdf.engine).toBe('cloudflare-ai')
    // Never mistral-ocr by accident — that is the $2/1k-pages arm.
    expect(JSON.stringify(bodies[0])).not.toContain('mistral-ocr')
  })

  it('sends no plugins block at all on an ordinary text call', async () => {
    const { fetchImpl, bodies } = capture()
    await createOpenRouterProvider('k', fetchImpl).chat({
      model: 'm',
      maxTokens: 64,
      messages: [{ role: 'user', content: 'no file here' }],
    })
    expect(bodies[0]!.plugins).toBeUndefined()
  })

  it('encodes the file as a content part and returns the parse annotation', async () => {
    const { fetchImpl, bodies } = capture()
    const res = await createOpenRouterProvider('k', fetchImpl).chat({
      model: 'm',
      maxTokens: 64,
      pdfEngine: 'cloudflare-ai',
      messages: [{ role: 'user', content: 'read', files: [FILE] }],
    })

    const messages = bodies[0]!.messages as Array<{ content: Array<Record<string, unknown>> }>
    const parts = messages[0]!.content
    expect(parts.some((p) => p.type === 'text')).toBe(true)
    const filePart = parts.find((p) => p.type === 'file') as { file: Record<string, string> }
    expect(filePart.file.filename).toBe('brand.pdf')
    expect(filePart.file.file_data).toMatch(/^data:application\/pdf;base64,/)
    // The hash is what makes a re-resolve free instead of a second parse.
    expect(res.annotations?.[0]?.file.hash).toBe('h1')
  })

  it('replays a prior annotation so the same brand book is not parsed twice', async () => {
    const { fetchImpl, bodies } = capture()
    const prior = [{ type: 'file' as const, file: { hash: 'h1', name: 'brand.pdf' } }]

    await createOpenRouterProvider('k', fetchImpl).chat({
      model: 'm',
      maxTokens: 64,
      pdfEngine: 'cloudflare-ai',
      messages: [{ role: 'user', content: 'again', files: [FILE], annotations: prior }],
    })

    const messages = bodies[0]!.messages as Array<Record<string, unknown>>
    expect(JSON.stringify(messages[0]!.annotations)).toContain('h1')
  })
})

describe('a file never reaches a provider that cannot price it', () => {
  it('OpenAI refuses a file rather than parsing it as native input tokens', async () => {
    const { fetchImpl } = capture()
    const openai = createOpenAIProvider('k', fetchImpl)
    expect(openai.supportsFiles).toBeUndefined()

    await expect(
      openai.chat({
        model: 'm',
        maxTokens: 64,
        messages: [{ role: 'user', content: 'read', files: [FILE] }],
      }),
    ).rejects.toThrow(ProviderCallError)
  })

  it('the runner drops incapable providers from the chain instead of falling back to them', async () => {
    const OutSchema = z.object({ ok: z.boolean() })
    const def: MeshTaskDef<{ x: number }, { ok: boolean }> = {
      name: 'test_task',
      tier: 'standard',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: OutSchema,
      maxTokens: 64,
    }
    const spec: MeshTaskSpec<{ x: number }, { ok: boolean }> = {
      def,
      buildMessages: () => [{ role: 'user', content: 'read', files: [FILE] }],
    }

    // Primary is file-capable and fails; fallback is not file-capable.
    const seenByFallback: ChatRequest[] = []
    const primary: Provider = {
      name: 'primary',
      supportsFiles: true,
      async chat() {
        throw new ProviderCallError('primary', 429, 'rate limited')
      },
    }
    const fallback: Provider = {
      name: 'fallback',
      async chat(req) {
        seenByFallback.push(req)
        return {
          text: '{"ok":true}',
          usage: { provider: 'fallback', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
        }
      },
    }

    const runner = createMeshRunner({
      planAttempts: () => [
        { provider: primary, model: 'm' },
        { provider: fallback, model: 'm' },
      ],
      logSink: { write: async () => {} },
      now: () => 0,
      price: () => 0,
    })

    const result = await runner.run(spec, { x: 1 }, {
      workspaceId: 'ws',
      traceId: 't',
    } as MeshContext)

    // The document was never handed to a provider that would bill it natively.
    expect(seenByFallback).toEqual([])
    expect(result.ok).toBe(false)
  })
})
