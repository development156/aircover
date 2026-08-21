import { describe, it, expect } from 'vitest'
import type {
  FormattedContent,
  PublishAdapter,
  PublishPostPayload,
  PublishRequest,
  RuleSet,
} from '@sahoda/shared'

import {
  runPublishPost,
  type PublishJobContext,
  type PublishPostDeps,
  type PublishVariant,
} from './runPublishPost'

/**
 * THE MIDDLE LINK OF THE GOOGLE BUTTON, which had no test.
 *
 * ── WHY THIS ONE NEEDED ITS OWN FILE ─────────────────────────────────────────
 * Both ENDS of the chain were covered — `platform-data.test.ts` proves the
 * builder emits `callToAction`, and `adapters/zernio.test.ts` proves it reaches
 * the wire body — and the three lines between them were not. Those three lines
 * are the whole reason the control was dead for weeks: `formatForPlatform` is
 * frozen and takes a draft with no CTA on it, so `ctaType` and `ctaUrl` — two
 * fields the frozen `FormattedContent` gbp arm has always DECLARED — could only
 * ever be filled by something spreading them in afterwards. Nothing did.
 *
 * A chain proved at both ends and not in the middle is exactly how a control
 * comes to collect an answer nothing acts on.
 */

const payload: PublishPostPayload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: '33333333-3333-4333-8333-333333333333',
  variantId: '44444444-4444-4444-8444-444444444444',
  channel: 'gbp',
  scheduledAt: '2026-08-20T10:00:00.000Z',
}

const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_cta' }

const RULE_SET: RuleSet = {
  ruleSetVersion: 'regime-_floor@2026.08',
  packs: [{ id: 'regime-_floor', version: '2026.08' }],
  rules: [],
  regime: { value: 'consumer', locale: 'IN', basis: 'default' },
}

/** Captures the FormattedContent the adapter is actually handed. */
function capturingDeps(variant: PublishVariant): {
  deps: PublishPostDeps
  seen: () => FormattedContent | null
} {
  let seen: FormattedContent | null = null
  const adapter: PublishAdapter = {
    channel: 'gbp',
    publish: async (req: PublishRequest) => {
      seen = req.content
      return {
        platformPostId: 'accounts/1/localPosts/2',
        permalink: 'https://g.example/p/1',
        publishedAt: '2026-08-20T10:00:01.000Z',
        mode: 'live' as const,
      }
    },
  }

  return {
    deps: {
      mode: 'live',
      loadVariant: async () => variant,
      resolveConnection: async () => ({
        connectionId: '55555555-5555-4555-8555-555555555555',
        externalAccountId: '6a75caf7d0fe733d1afcc1f4',
        accessToken: 'token',
        viaZernio: true,
      }),
      adapterFor: () => adapter,
      writeLog: async () => {},
      markVariant: async () => {},
      // 0, so neither the platform's per-day cap nor the X ration fires and this
      // file keeps testing the one thing it is about: the FormattedContent a GBP
      // call-to-action hands the adapter. The caps have their own coverage in
      // runPublishPost.test.ts, which is where a 0 here would be a hole.
      countLiveSends: async () => 0,
      gate: {
        check: async () => ({
          decision: 'pass' as const,
          findings: [],
          ruleSet: RULE_SET,
          brandVersion: 2,
          checks: { hard: 'ran' as const, classifier: 'ran' as const },
          classifierModel: 'test-model',
        }),
      },
    } as PublishPostDeps,
    seen: () => seen,
  }
}

const variantWith = (over: Partial<PublishVariant> = {}): PublishVariant => ({
  variantId: payload.variantId,
  body: 'Open till nine tonight.',
  media: [],
  ...over,
})

describe('the Google button reaches the adapter', () => {
  it('puts the stored CTA onto the formatted content', async () => {
    const { deps, seen } = capturingDeps(
      variantWith({ cta: { type: 'ORDER', url: 'https://chai.example/order' } }),
    )
    const outcome = await runPublishPost(payload, ctx, deps)
    expect(outcome.status).toBe('succeeded')

    const content = seen()
    expect(content?.channel).toBe('gbp')
    // The two fields the frozen contract declares and the frozen formatter
    // cannot fill. Before this they were `undefined` on every publish.
    expect(content).toMatchObject({ ctaType: 'ORDER', ctaUrl: 'https://chai.example/order' })
  })

  it('leaves the content alone when there is no button', async () => {
    // The ordinary Google post. `undefined`, not an empty string — the adapter
    // reads presence, and `''` would be a button with no type.
    const { deps, seen } = capturingDeps(variantWith())
    await runPublishPost(payload, ctx, deps)
    const content = seen() as Record<string, unknown> | null
    expect(content?.ctaType).toBeUndefined()
    expect(content?.ctaUrl).toBeUndefined()
  })

  it('does not touch the words the formatter produced', async () => {
    // A spread, not a replacement: the summary is still the engine's.
    const { deps, seen } = capturingDeps(
      variantWith({
        hashtags: ['#chai'],
        cta: { type: 'BOOK', url: 'https://chai.example' },
      }),
    )
    await runPublishPost(payload, ctx, deps)
    const content = seen()
    // GBP is the one channel whose hashtags `formatForPlatform` drops, so the
    // summary is the bare body — proving the spread ran over the FORMATTER's
    // output rather than over something this file assembled.
    expect(content).toMatchObject({ summary: 'Open till nine tonight.' })
  })
})
