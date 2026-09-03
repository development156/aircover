import { describe, expect, it } from 'vitest'

import type { AnnouncedPost } from './dispatch-due'
import type { AutopilotHistoryRow } from './history-copy'
import type { CandidateRow } from './store'
import {
  toAnnouncedPost,
  toCandidateRow,
  toHistoryRow,
  type AnnouncedPostShape,
  type CandidateRowShape,
  type HistoryRowShape,
} from './row-mappers'

/**
 * THE MAPPERS' SHAPES MUST STAY ASSIGNABLE TO WHAT THE DECISIONS TAKE.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `row-mappers.ts` deliberately imports nothing from the decision modules: it
 * is read by `packages/db`'s pglite suite, whose tsconfig has no `@/` alias, and
 * an import chain reaching `@/lib/brand/autopilot-floor` breaks
 * `@sahoda/db#typecheck`. The cost of that independence is a second declaration
 * of each shape, and a second declaration drifts.
 *
 * This is the check that stops it, and it lives in apps/web where the alias
 * resolves. The assignments below are compile-time assertions — if a mapper's
 * shape stops matching what a decision takes, THIS FILE fails to typecheck,
 * which is louder and earlier than a test failing at runtime.
 */

describe('the mapper shapes and the decision types have not drifted', () => {
  it('an AnnouncedPostShape is an AnnouncedPost', () => {
    const mapped = toAnnouncedPost({
      post_id: 'p',
      variant_id: 'v',
      channel: 'x',
      account_id: 'a',
      dispatch_after: '2026-08-29T10:00:00.000Z',
    })
    // The assertion is the assignment. TypeScript rejects it if the shapes
    // diverge, and the runtime expectation below only proves it ran.
    const asDecision: AnnouncedPost = mapped
    expect(asDecision.postId).toBe('p')
  })

  it('a HistoryRowShape is an AutopilotHistoryRow', () => {
    const mapped = toHistoryRow({
      decision: 'announced',
      refusal_reason: null,
      dispatch_after: '2026-08-29T10:30:00.000Z',
      created_at: '2026-08-29T10:00:00.000Z',
      actor: 'autopilot',
    })
    const asDecision: AutopilotHistoryRow = mapped
    expect(asDecision.actor).toBe('autopilot')
  })

  it('a CandidateRowShape is a CandidateRow', () => {
    const mapped = toCandidateRow({
      post_id: 'p',
      variant_id: 'v',
      channel: 'x',
      body: 'hello',
      last_error: null,
      account_id: 'a',
      brief_id: null,
      cycle_id: null,
    })
    const asDecision: CandidateRow = mapped
    expect(asDecision.accountId).toBe('a')
  })

  it('and the reverse holds, so neither side may quietly gain a field', () => {
    // One direction alone would let a decision type add a required field that
    // no mapper produces, and every row would then be missing it at runtime
    // while the types looked satisfied.
    const fromDecision: AnnouncedPostShape = {
      postId: 'p',
      variantId: 'v',
      channel: 'x',
      accountId: 'a',
      dispatchAfter: new Date(),
    } satisfies AnnouncedPost
    expect(fromDecision.channel).toBe('x')

    const history: HistoryRowShape = {
      decision: 'cancelled',
      refusalReason: null,
      dispatchAfter: null,
      createdAt: new Date(),
      actor: 'person',
    } satisfies AutopilotHistoryRow
    expect(history.actor).toBe('person')

    const candidate: CandidateRowShape = {
      postId: 'p',
      variantId: 'v',
      channel: 'x',
      body: 'b',
      lastError: null,
      accountId: 'a',
      briefId: null,
      cycleId: null,
    } satisfies CandidateRow
    expect(candidate.body).toBe('b')
  })
})
