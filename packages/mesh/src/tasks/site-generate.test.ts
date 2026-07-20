import { describe, it, expect } from 'vitest'
import type { MeshContext } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { siteGenerateTask, SiteGenerateInputSchema } from './site-generate'

const input = SiteGenerateInputSchema.parse({
  name: 'Chai & Chapters',
  goal: 'leads',
  pages: 1,
  prompt: 'a cosy neighbourhood bookshop-café',
})
const ctx: MeshContext = { workspaceId: '11111111-1111-1111-1111-111111111111', traceId: 't' }

function fixedProvider(script: string[]): Provider {
  let i = 0
  return {
    name: 'fake',
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      return {
        text: script[i++] ?? '',
        usage: { provider: 'fake', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
      }
    },
  }
}

function runnerFor(provider: Provider) {
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
  })
}

const validOut = JSON.stringify({
  pages: [
    {
      path: '/',
      title: 'Home',
      seo: { description: 'A neighbourhood bookshop-café.' },
      sections: [
        { kind: 'hero', content: { headline: 'Chai & Chapters' } },
        { kind: 'contact', content: {} },
      ],
    },
  ],
})
const badKind = JSON.stringify({
  pages: [{ path: '/', title: 'Home', sections: [{ kind: 'banner', content: {} }] }],
})

describe('siteGenerateTask', () => {
  it('is the premium-tier, brand-grounded site_generate task', () => {
    expect(siteGenerateTask.def.name).toBe('site_generate')
    expect(siteGenerateTask.def.tier).toBe('premium')
    expect(siteGenerateTask.def.cachePrefix).toBe('brand_context')
    expect(siteGenerateTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('puts the system contract first, the brand block next, the payload last', () => {
    const brand = { role: 'system' as const, content: 'BRAND', cache: true }
    const messages = siteGenerateTask.buildMessages(input, ctx, brand)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]).toBe(brand)
    const last = messages.at(-1)!
    expect(last.role).toBe('user')
    expect(last.content).toContain('Chai & Chapters')
  })

  // The renderer paints the Brand Skin primary onto ONE thing: the CTA
  // (`renderCta` → `.cta { background: var(--p) }`). It returns '' when
  // `ctaLabel` is absent, and the prompt never asked for one — so every
  // generated site shipped with no element using a brand colour at all.
  // Verified live 2026-07-20: the tokens were correctly injected into :root and
  // nothing on the page consumed them.
  it('asks for a CTA label, the only element that carries the brand colour', () => {
    const system = siteGenerateTask.buildMessages(input, ctx)[0]!.content

    expect(system).toContain('ctaLabel')
  })

  it('does not ask for a ctaHref — there is no real address to link to yet', () => {
    // Sites deploy is deferred; a fabricated href would ship a dead link.
    // `renderCta` renders label-without-href as an inert, brand-tinted pill.
    const system = siteGenerateTask.buildMessages(input, ctx)[0]!.content

    expect(system).not.toContain('ctaHref')
  })

  it('resolves a valid page/section tree', async () => {
    const result = await runnerFor(fixedProvider([validOut])).run(siteGenerateTask, input, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pages[0]!.sections.map((s) => s.kind)).toEqual(['hero', 'contact'])
    }
  })

  it('rejects an unknown section kind, then a double failure → typed error', async () => {
    const result = await runnerFor(fixedProvider([badKind, badKind])).run(
      siteGenerateTask,
      input,
      ctx,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })
})
