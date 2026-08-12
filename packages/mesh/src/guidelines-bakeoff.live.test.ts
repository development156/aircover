import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BrandMemoryPayloadSchema, ResolveInputSchema } from '@sahoda/shared'
import { brandGuidelinesTask } from './tasks/brand-guidelines'

/**
 * LIVE bake-off for `brand_guidelines` — the RESOLVE, not the extraction.
 *
 * This is the call the user waits on after answering, p50 19.1s in production.
 * It is a different job from `brand_extract`: strict output schema, three
 * fixed-length arrays, and a `signal_lock` judgement. A model can be excellent
 * at pulling facts out of a page and still be bad at this.
 *
 * n=3. Scored on schema pass rate FIRST — a resolve that fails its schema twice
 * falls back to the demo payload, which is the worst outcome in the product.
 */
const LIVE = process.env.GL_LIVE === '1'
const KEY = process.env.OPENROUTER_API_KEY_TEXT ?? process.env.OPENROUTER_API_KEY_RESEARCH ?? ''
const RUNS = Number(process.env.GL_N ?? 3)

const MODELS = [
  'anthropic/claude-sonnet-5',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-mini',
]

const INPUT = ResolveInputSchema.parse({
  source: {
    name: 'Rolling Pin Bakehouse',
    one_liner: 'A neighbourhood sourdough bakery in Koramangala, Bengaluru.',
    category: 'bakery',
    mission: 'Bread made with three ingredients and thirty-six hours.',
  },
  customer: {
    description: 'Parents doing the weekly shop who want bread without emulsifiers.',
    pain: 'Paying bakery prices for supermarket bread.',
    fear: 'Being sold something ordinary at a premium.',
    desired_identity: 'Someone who found the good place first.',
  },
  taboo: {
    avoid_topics: 'health benefit claims',
    legal_red_lines: 'never sell day-old bread as fresh',
  },
})

describe.skipIf(!LIVE)('brand_guidelines bake-off', () => {
  it('scores each model n times', async () => {
    const rows = []
    for (const model of MODELS) {
      const runs = []
      for (let i = 0; i < RUNS; i += 1) {
        const messages = brandGuidelinesTask.buildMessages(INPUT, {
          workspaceId: 'gl',
          traceId: 'gl',
          userId: 'gl',
        })
        const t = Date.now()
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            max_tokens: Number(process.env.GL_MAXTOK ?? 4096),
            response_format: { type: 'json_object' },
          }),
        })
        const b = (await r.json()) as {
          choices?: { message?: { content?: string } }[]
          usage?: { cost?: number; completion_tokens?: number }
        }
        let parsed: unknown = null
        try {
          parsed = JSON.parse(
            String(b?.choices?.[0]?.message?.content ?? '')
              .replace(/^```(?:json)?|```$/g, '')
              .trim(),
          )
        } catch {
          /* schema fail */
        }
        const check = parsed ? BrandMemoryPayloadSchema.safeParse(parsed) : null
        runs.push({
          ok: check?.success ?? false,
          ms: Date.now() - t,
          cost: b?.usage?.cost ?? 0,
          lock: check?.success ? check.data.alignment.signal_lock : null,
          redLines: check?.success ? check.data.taboo.red_lines : [],
          banned: check?.success ? check.data.voice.banned_phrases.length : 0,
          issue: check && !check.success ? check.error.issues[0]?.path.join('.') : null,
        })
      }
      const ok = runs.filter((r) => r.ok)
      rows.push({
        model,
        okN: `${ok.length}/${runs.length}`,
        msAvg: Math.round(runs.reduce((s, r) => s + r.ms, 0) / runs.length),
        costAvg: runs.reduce((s, r) => s + r.cost, 0) / runs.length,
        locks: ok.map((r) => r.lock),
        redLines: ok[0]?.redLines ?? [],
        issues: runs.filter((r) => !r.ok).map((r) => r.issue),
      })
    }
    writeFileSync(process.env.GL_OUT!, JSON.stringify(rows, null, 2))
    expect(rows.length).toBe(MODELS.length)
  }, 3_600_000)
})
