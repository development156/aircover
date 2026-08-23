import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The three inbox list pages are `async` server components that call
 * `readConversations()`, so neither vitest project can render them. The copy they
 * hand down is only reachable as SOURCE — which is enough, because what is being
 * guarded is a sentence, not a behaviour.
 *
 * Paths resolve from `import.meta.url`, never `process.cwd()`, so the directory
 * the run starts in does not matter.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const SPATIAL = /beside this one|panel beside|pane beside|next to this|to the (right|left)/i

describe('the inbox list pane never points the reader at another pane', () => {
  test.each([
    ['/inbox', '../../app/(app)/inbox/page.tsx'],
    ['/inbox/comments', '../../app/(app)/inbox/comments/page.tsx'],
    ['/inbox/reviews', '../../app/(app)/inbox/reviews/page.tsx'],
  ])('%s states no fact about where the other panes are', (_route, rel) => {
    expect(read(rel)).not.toMatch(SPATIAL)
  })

  /**
   * ── WHAT THIS TEST USED TO GUARD, AND WHY IT NOW GUARDS MORE ───────────────
   * It pinned the three `showList:true` sentences by exact text — "No
   * conversations yet.", "No posts have comments yet.", "Nothing to show for
   * the accounts we asked." — so that the two ternary branches could not
   * collapse into one and tell a workspace nobody asked about that we had asked.
   *
   * The ternary is gone, and with it the hazard: the list pane no longer says
   * anything about presence or absence in EITHER branch. It names what the
   * column will hold, in the future tense, with Sahoda as the subject. So the
   * property worth guarding is no longer "these two sentences differ" but the
   * strictly stronger "this pane makes no absence claim at all" — which is what
   * the sweep below asserts, and which the old pinning could not have caught,
   * because every sentence it pinned WAS an absence claim.
   *
   * A guard is not being loosened here. The old one could pass while the list
   * pane and the thread pane gave two different reasons for one nothing, and
   * MEASURED at 1440 on 2026-08-23, that is exactly what /inbox did.
   */
  const ABSENCE_CLAIM =
    /\bno (conversations|comments|reviews|posts)\b|\bnothing (read|to show)\b|\bnone yet\b/i

  test.each([
    ['/inbox', '../../app/(app)/inbox/page.tsx'],
    ['/inbox/comments', '../../app/(app)/inbox/comments/page.tsx'],
    ['/inbox/reviews', '../../app/(app)/inbox/reviews/page.tsx'],
  ])('%s hands the list pane a purpose line, never an absence claim', (_route, rel) => {
    const source = read(rel)
    const line = /waitingLine="([^"]+)"/.exec(source)
    // The prop must actually be passed. Without this the regex below matches
    // nothing and the test reports green on a page that stopped rendering a
    // list pane at all.
    expect(line, `${rel} passes no waitingLine`).not.toBeNull()
    expect(line?.[1]).not.toMatch(ABSENCE_CLAIM)
    // And the old prop name must not come back with the old sentence behind it.
    expect(source).not.toMatch(/emptyLine=/)
  })

  test.each([
    ['/inbox', '../../app/(app)/inbox/page.tsx'],
    ['/inbox/comments', '../../app/(app)/inbox/comments/page.tsx'],
    ['/inbox/reviews', '../../app/(app)/inbox/reviews/page.tsx'],
  ])('%s still gives its list pane a sentence of its OWN', (_route, rel) => {
    // Three surfaces, three different columns. One shared line would make the
    // shell say the same thing three times, which is the failure one level up
    // from the one above.
    const mine = /waitingLine="([^"]+)"/.exec(read(rel))?.[1]
    const others = [
      '../../app/(app)/inbox/page.tsx',
      '../../app/(app)/inbox/comments/page.tsx',
      '../../app/(app)/inbox/reviews/page.tsx',
    ]
      .filter((other) => other !== rel)
      .map((other) => /waitingLine="([^"]+)"/.exec(read(other))?.[1])
    expect(others).not.toContain(mine)
  })
})
