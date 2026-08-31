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
import { readKeywordBrackets } from './store'

/**
 * THE MIDDLE LINK OF THE KEYWORD BRACKETS BOX, which had no test.
 *
 * ── THE SAME SHAPE AS THE GOOGLE BUTTON, FOUND THE SAME WAY ──────────────────
 * Both ENDS of this chain were covered and agreed. `keyword-format.test.ts`
 * proves `formatForPlatform` and `charCountFor` both honour a `keywordBrackets`
 * passed in by hand; `variant-extras.test.ts` proves the composer stores the
 * writer's choice. Between them, `loadVariant` did not read the field and
 * `PublishVariant` had nowhere to put it, so the publisher's draft never carried
 * it and `variant.keywordBrackets ?? true` defaulted every real send back to
 * brackets.
 *
 * What the writer was told, in the unticked state, is
 * `keyword-field.tsx`'s "Followers see the words on their own." They saw
 * `[chai] [pune]`.
 *
 * The second symptom is the one that bites hardest and only near a limit: the
 * live meter counted the SHORT tail while the publisher formatted and measured
 * the LONG one, so a caption the editor showed as fitting could be refused with
 * MAX_CHARS at publish. Two characters per keyword, every time.
 */

const payload: PublishPostPayload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: '33333333-3333-4333-8333-333333333333',
  variantId: '44444444-4444-4444-8444-444444444444',
  channel: 'x',
  scheduledAt: '2026-08-30T10:00:00.000Z',
}

const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_brackets' }

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
    channel: 'x',
    publish: async (req: PublishRequest) => {
      seen = req.content
      return {
        platformPostId: '1790000000000000000',
        permalink: 'https://x.example/p/1',
        publishedAt: '2026-08-30T10:00:01.000Z',
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
      // 0 so the per-day cap cannot fire and this file keeps testing the one
      // thing it is about. The caps have their own coverage.
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
  body: 'Monsoon chai.',
  media: [],
  ...over,
})

describe('the keyword brackets choice reaches the adapter', () => {
  it('publishes the bare words when the writer unticked the box', async () => {
    const { deps, seen } = capturingDeps(
      variantWith({ hashtags: ['chai', 'pune'], keywordBrackets: false }),
    )
    const outcome = await runPublishPost(payload, ctx, deps)
    expect(outcome.status).toBe('succeeded')

    // What the box's own label promises: "Followers see the words on their own."
    expect(seen()).toMatchObject({ text: 'Monsoon chai.\n\nchai pune' })
  })

  it('publishes brackets when the box is left ticked', async () => {
    const { deps, seen } = capturingDeps(
      variantWith({ hashtags: ['chai', 'pune'], keywordBrackets: true }),
    )
    await runPublishPost(payload, ctx, deps)
    expect(seen()).toMatchObject({ text: 'Monsoon chai.\n\n[chai] [pune]' })
  })

  it('publishes brackets when the variant states no choice', async () => {
    // ABSENT IS NOT FALSE. Every variant written before the box shipped has no
    // such key, and those must go on publishing exactly as they did.
    const { deps, seen } = capturingDeps(variantWith({ hashtags: ['chai', 'pune'] }))
    await runPublishPost(payload, ctx, deps)
    expect(seen()).toMatchObject({ text: 'Monsoon chai.\n\n[chai] [pune]' })
  })

  it('measures the caption it is about to send, not a different one', async () => {
    // The meter/publisher disagreement, pinned at the publisher's end. Two
    // characters per keyword: `[chai] [pune]` is four longer than `chai pune`.
    const { deps, seen } = capturingDeps(
      variantWith({ hashtags: ['chai', 'pune'], keywordBrackets: false }),
    )
    await runPublishPost(payload, ctx, deps)
    const caption = (seen() as { text: string }).text
    expect(caption).not.toContain('[')
    expect(caption.length).toBe('Monsoon chai.\n\nchai pune'.length)
  })
})

/**
 * `post_variants.extras` → `PublishVariant.keywordBrackets`, the step that was
 * missing. `extras` is one shared jsonb column several lanes write, so the
 * standing rule holds: a shape we do not recognise is a reason to IGNORE the
 * field, never to fail the publish.
 */
describe('readKeywordBrackets', () => {
  it('reads the writer’s choice off a real-looking row', () => {
    expect(readKeywordBrackets({ hashtags: ['chai'], keywordBrackets: false })).toBe(false)
    expect(readKeywordBrackets({ hashtags: ['chai'], keywordBrackets: true })).toBe(true)
  })

  it('is undefined when the row states no choice', () => {
    // Undefined, never false: absent means the writer never saw the box, and
    // `formatForPlatform` reads absence as brackets.
    expect(readKeywordBrackets({ hashtags: ['chai'] })).toBeUndefined()
    expect(readKeywordBrackets({})).toBeUndefined()
    expect(readKeywordBrackets(null)).toBeUndefined()
    expect(readKeywordBrackets('not an object')).toBeUndefined()
    expect(readKeywordBrackets([1, 2, 3])).toBeUndefined()
  })

  it('ignores a value that is not a boolean rather than failing the publish', () => {
    expect(readKeywordBrackets({ keywordBrackets: 'false' })).toBeUndefined()
    expect(readKeywordBrackets({ keywordBrackets: 0 })).toBeUndefined()
    expect(readKeywordBrackets({ keywordBrackets: null })).toBeUndefined()
  })
})
