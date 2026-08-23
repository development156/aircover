import type { OpsQaRun } from '@sahoda/shared'

import { GATE_SUITES, type GateSuite } from '@/lib/ops/read'

/**
 * "What we cannot yet prove" (SL-062 §1) — the gap between *the tests pass* and
 * *we tested it*.
 *
 * WHY THIS LINE EXISTS. A reader who sees a QA console with green chips
 * concludes the product is tested. What the green currently proves is that the
 * suites which RAN passed — and five of the repo's packages have no test runner
 * wired up at all, so a hundred test files have never executed once, while two
 * of the five gate suites have never been run here either. None of that is a
 * failure. It is an absence, and an absence rendered as silence reads as a
 * pass. This says it out loud instead.
 *
 * TWO SOURCES, LABELLED DIFFERENTLY:
 *  - DERIVED — a gate suite with no run recorded. Recomputed every render, so
 *    it disappears by itself the moment that suite runs.
 *  - RECORDED — a transcription of something a person established on a date,
 *    the same honest-constant pattern as `alpha-gate.ts`. It carries its source
 *    and its card, and it goes stale unless somebody edits it. When the card it
 *    names is closed, DELETE the entry — do not leave it asserting a gap that
 *    has since been filled.
 */

export type ProofSource = 'derived' | 'recorded'

export interface UnprovenClaim {
  key: string
  source: ProofSource
  /** What is not proven, in a stakeholder's words. */
  what: string
  /** Where the claim comes from, so a reader can check it. */
  from: string
}

/**
 * Transcribed 2026-08-01. EDIT THIS when a card below closes; delete the entry
 * rather than letting it keep asserting a gap that has been filled.
 */
export const RECORDED_UNPROVEN: readonly UnprovenClaim[] = [
  {
    key: 'unrun-packages',
    source: 'recorded',
    what: 'Five parts of the codebase, including the one that handles payments, have no test runner wired up, so about 100 test files have never executed once.',
    from: 'SL-050, found 2026-07-30',
  },
  {
    key: 'middleware-unproven',
    source: 'recorded',
    what: 'The tests covering which pages require signing in read the source code rather than visiting a running server. They were green on the day that gate shipped broken.',
    from: 'SL-059, found 2026-07-31',
  },
  {
    key: 'never-walked',
    source: 'recorded',
    what: 'Four things this console is meant to do have only ever been proven by automated tests, never by a person clicking through them.',
    from: 'SL-040, blocked since 2026-07-27',
  },
]

const SUITE_WORDS: Record<GateSuite, string> = {
  typecheck: 'the type checks',
  lint: 'the code-style checks',
  unit: 'the unit tests',
  rls: 'the database access-control tests',
  smoke: 'the end-to-end smoke tests',
}

/**
 * The derived half: gate suites with no run on record.
 *
 * A suite that has never run is NOT a suite that passed — `readGateRuns` is
 * careful to return null rather than an optimistic green, and this is where
 * that null becomes a sentence.
 */
export function unrunSuites(gates: Record<GateSuite, OpsQaRun | null>): UnprovenClaim[] {
  return GATE_SUITES.filter((suite) => gates[suite] === null).map((suite) => ({
    key: `unrun:${suite}`,
    source: 'derived' as const,
    what: `We have no record of ${SUITE_WORDS[suite]} ever running here.`,
    from: 'no run recorded',
  }))
}

/**
 * Both halves, derived first — the derived ones are live and therefore the more
 * urgent read, and they vanish on their own when the gap closes.
 *
 * `gates` may be null when the QA feed could not be read. That does NOT produce
 * an empty list: an unreadable feed is itself something we cannot prove, and
 * returning only the recorded half would quietly shorten the list.
 */
export function cannotProve(
  gates: Record<GateSuite, OpsQaRun | null> | null,
  recorded: readonly UnprovenClaim[] = RECORDED_UNPROVEN,
): UnprovenClaim[] {
  const derived = gates
    ? unrunSuites(gates)
    : [
        {
          key: 'gates-unreadable',
          source: 'derived' as const,
          what: 'We could not read the test record just now, so nothing on this page can vouch for what has been checked.',
          from: 'read failed',
        },
      ]

  return [...derived, ...recorded]
}
