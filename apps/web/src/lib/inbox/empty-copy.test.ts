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

  // Anti-regression: the two ternary branches must stay two different sentences.
  // "Nothing to show for the accounts we asked." in front of a workspace nobody
  // asked about is the exact lie `lib/inbox/emptiness.ts` exists to prevent.
  test.each([
    ['../../app/(app)/inbox/page.tsx', 'No conversations yet.'],
    ['../../app/(app)/inbox/comments/page.tsx', 'No posts have comments yet.'],
    ['../../app/(app)/inbox/reviews/page.tsx', 'Nothing to show for the accounts we asked.'],
  ])('%s keeps its own showList:true sentence', (rel, sentence) => {
    expect(read(rel)).toContain(sentence)
  })
})
