import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * WHAT THE BRAND BRAIN SCREEN PROMISES, HELD TO WHAT READS THE BRAND BRAIN.
 *
 * ── THE SENTENCE THIS EXISTS TO STOP COMING BACK ─────────────────────────────
 * Four surfaces said "every caption, campaign and reply is written from these
 * fields". MEASURED on 2026-08-30: no mesh task writes a reply — the eight are
 * listed in `packages/shared/src/mesh/tasks.ts` and none of them is one — and
 * the inbox's `draftReply` never calls the mesh at all, it inserts the text a
 * person typed. A campaign is a folder of posts with no generation step of its
 * own. So two thirds of a three-part promise named things the Brand Brain does
 * not reach.
 *
 * ── WHY THIS SCANS THE SOURCE RATHER THAN RENDERING ──────────────────────────
 * The claim is spread over four files, two of which are branches that render
 * only for a workspace with no brain and one of which is a page. Rendering all
 * four costs four fixtures and would still miss the fifth copy of the sentence
 * somebody adds next. The defect being guarded is a SENTENCE, present in the
 * source whether or not a fixture reaches it.
 *
 * ── WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────
 * It pins the CLAIM, never the wording: rewrite these sentences freely. What it
 * refuses is a promise that the brain shapes a reply or a campaign, because
 * nothing in the product makes that true. The companion assertion in
 * `packages/mesh` fails if a fifth task starts reading the brain, which is the
 * day this copy would need widening again.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads four NAMED files, so a fifth copy of the promise in a file this list
 * does not carry passes untouched. It matches on the source text, so a sentence
 * assembled from a template literal, split across an interpolation, or built by
 * joining fragments reads as absent. And copy that does not live in source at
 * all, a string from the database or from a tour definition, is outside it
 * entirely.
 */

const ROOT = join(__dirname, '../../')

const SURFACES = [
  'components/brain/confidence-card.tsx',
  'components/brain/brain-sections.tsx',
  'app/(app)/brain/page.tsx',
]

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('the Brand Brain screen does not promise what the brain cannot reach', () => {
  it.each(SURFACES)('%s claims no reply is written from the brain', (rel) => {
    const source = read(rel)

    // The exact defect: a sentence naming "reply" among the things written from
    // these fields. Case-insensitive, because the claim is the claim whatever
    // the capital letter — and narrow enough that ordinary uses of the word
    // elsewhere on a brain screen would not trip it.
    expect(source).not.toMatch(/written from these fields[^"]*repl/i)
    expect(source).not.toMatch(/repl(y|ies)[^."]{0,40}(is|are) written from/i)
    expect(source).not.toMatch(/caption, campaign and reply/i)
  })

  it('names at least one thing the brain genuinely does reach', () => {
    // The other half of the guard, and the reason this is not just a banned-word
    // list: a sentence can be made harmless by saying nothing, and that would be
    // a worse screen than the overclaiming one. Every surface must still tell the
    // reader what these fields are for.
    for (const rel of SURFACES) {
      expect(read(rel)).toMatch(/caption/i)
    }
  })
})
