import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { ResolveInputSchema, type MeshContext, type ResolveInput } from '@sahoda/shared'
import { createMesh } from './mesh'
import { brandGuidelinesTask } from './tasks/brand-guidelines'

/**
 * Live intake measurement (2026-08-12). Skipped by default — like smoke.live.test.ts,
 * this makes REAL model calls and costs real provider tokens.
 *
 * The question: every model-resolved Brand Brain in the database reads
 * `signal_lock: 'weak'`, and every one of their notes blames the intake. Is that
 * true, or is the model simply reluctant to claim confidence?
 *
 * One resolve cannot answer that, because the stored Brains were produced weeks
 * ago by an unknown model version. So this runs three arms against ONE brand on
 * ONE day with ONE model, and the arms differ only in what the intake carries:
 *
 *   A  name + category            — what sparkToResolveInput sent before today
 *   B  A + website + instagram    — what forwarding the dropped fields alone buys
 *   C  B + description            — the founder's own words in source.one_liner
 *
 * A vs C separates intake from model. B vs C separates a URL STRING (which the
 * model cannot fetch — it is worth about its domain name) from real prose, and so
 * decides whether doc 18 §5's crawl step is required or merely nice.
 *
 * The brand is Chai & Chapters, whose stored Brain (workspace ai-s-workspace-5,
 * v1, resolved, weak) was resolved from name + category alone. The description in
 * arm C is not invented here: it is drawn from the SAME brand's hand-written Brain
 * (chai-and-chapters-demo v2, source='manual', signal_lock='strong') — words a
 * human wrote in this system. The website and handle ARE placeholders; that does
 * not weaken arm B, because a real URL is equally unfetchable to the model.
 *
 * Nothing here writes brand_memory. It resolves and prints; persisting would mint
 * a version over a live Brain.
 *
 *   set -a; source .env; set +a
 *   BRAIN_INTAKE_LIVE=1 BRAIN_INTAKE_OUT=/tmp/arms.json \
 *     npx vitest run --config vitest.live.config.ts src/brand-intake.live.test.ts
 *
 * Result of the 2026-08-12 run (claude-sonnet-5, $0.103 for the three calls):
 *   A weak · B weak · C moderate. Forwarding the website and handle moved
 *   nothing — a URL is unfetchable and worth about its domain name. The lock
 *   moved only when real prose arrived.
 */
const LIVE = process.env.BRAIN_INTAKE_LIVE === '1'

/** The workspace whose stored Brain is the "before". Telemetry rows land here. */
const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'

const NAME = 'Chai & Chapters'
const CATEGORY = 'Retail — books & specialty café'
const WEBSITE = 'https://chaiandchapters.in'
const INSTAGRAM = '@chaiandchapters'
const DESCRIPTION =
  'A two-room bookshop off a Buxi Bazaar side street in Cuttack where Odia poetry sits at ' +
  'eye level and the reading room upstairs is never rushed. Our readers are Ravenshaw ' +
  'students, school teachers and people who grew up on Odia poetry and now mostly buy ' +
  'English fiction. Odia titles are hard to find in the city and the online sellers do not ' +
  'stock them at all. Book club is Saturday 5pm upstairs; pakhala from May; a seat costs nothing.'

const ARMS: ReadonlyArray<{ arm: string; input: ResolveInput }> = [
  {
    arm: 'A  name+category',
    input: ResolveInputSchema.parse({ source: { name: NAME, category: CATEGORY } }),
  },
  {
    arm: 'B  +website+instagram',
    input: ResolveInputSchema.parse({
      source: { name: NAME, category: CATEGORY, website: WEBSITE, instagram: INSTAGRAM },
    }),
  },
  {
    arm: 'C  +description',
    input: ResolveInputSchema.parse({
      source: {
        name: NAME,
        category: CATEGORY,
        website: WEBSITE,
        instagram: INSTAGRAM,
        one_liner: DESCRIPTION,
      },
    }),
  },
]

describe.runIf(LIVE)('brand intake measurement', () => {
  it('resolves the same brand at three intake depths and records the payloads', async () => {
    const mesh = createMesh()
    const out: unknown[] = []

    for (const { arm, input } of ARMS) {
      const traceId = `brain-intake-${process.pid}-${process.hrtime.bigint()}`
      const ctx: MeshContext = { workspaceId: WORKSPACE_ID, traceId, creditsCharged: 0 }

      const result = await mesh.runTask(brandGuidelinesTask.def, input, ctx)

      out.push({
        arm,
        traceId,
        ok: result.ok,
        // A demo fallback is flagged at runtime and is NOT a resolve — record it
        // rather than reading its canned 'moderate' lock as a measurement.
        fallback: (result as { fallback?: boolean }).fallback === true,
        usage: result.usage,
        input,
        payload: result.ok ? result.data : result.error,
      })
    }

    // The vitest reporter swallows console output on a passing run, so the
    // measurement is written where it can be read and diffed.
    const path = process.env.BRAIN_INTAKE_OUT
    if (path) writeFileSync(path, JSON.stringify(out, null, 2))
  }, 180_000)
})
