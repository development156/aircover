/**
 * THE SENTENCES BESIDE THE "MEASURE NOW" BUTTON, AND THE ARITHMETIC UNDER THEM.
 *
 * Pure, and separate from `measure-run.ts` for two reasons. The first is the one
 * this codebase applies everywhere: a refusal that can only be checked with a
 * network round trip is a refusal nobody checks. The second is a boundary — the
 * button is a client component, and `measure-run.ts` is `server-only`, so the
 * type both sides share has to live somewhere neither of them owns.
 *
 * ── THE THIRD STATE IS THE ONE THAT MATTERS ──────────────────────────────────
 * "Not measured yet" is a claim about the reader's workspace. Printing it
 * because Upstash refused a GET would be that claim built out of a failed
 * request, which is the same defect as an unreadable list rendered as an empty
 * one. So `unknown` gets its own sentence and never borrows `never`'s.
 */

export type MeasureRun =
  /** Read successfully, and it holds a stamp. */
  | { kind: 'at'; atMs: number }
  /** Read successfully, and there is no stamp: this workspace has never asked. */
  | { kind: 'never' }
  /** Not read at all. Nothing may be claimed about the workspace from this. */
  | { kind: 'unknown' }

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** "3 minutes", "2 hours", "4 days" — always plural-correct, never a bare number. */
export function roughlyAgo(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < MINUTE_MS) return 'less than a minute'
  const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  if (clamped < HOUR_MS) return unit(Math.floor(clamped / MINUTE_MS), 'minute')
  if (clamped < DAY_MS) return unit(Math.floor(clamped / HOUR_MS), 'hour')
  return unit(Math.floor(clamped / DAY_MS), 'day')
}

/**
 * What the line beside the button says.
 *
 * It is about the ASKING, not about the figures: a pass that ran a minute ago
 * can be showing readings the platform took yesterday. The report prints the
 * reading date separately for exactly that reason.
 */
export function measuredAgoSentence(run: MeasureRun, nowMs: number): string {
  if (run.kind === 'never') return 'Not measured yet'
  if (run.kind === 'unknown') return 'Sahoda cannot say when this was last measured'
  return `Measured ${roughlyAgo(nowMs - run.atMs)} ago`
}

/**
 * Milliseconds still to wait, or 0 when a pass may run.
 *
 * `unknown` returns 0. That is a deliberate fail-open and it matches
 * `lib/ops/rate-limit.ts`: this is abuse control on a free, read-only pass, not
 * authorisation, and refusing every customer because a cache is unreachable
 * would be the worse trade. The atomic guard in the action is the one that stops
 * two clicks racing.
 */
export function cooldownRemainingMs(run: MeasureRun, nowMs: number, cooldownMs: number): number {
  if (run.kind !== 'at') return 0
  const elapsed = nowMs - run.atMs
  // A stamp from the future is a clock disagreement, not a licence to block for
  // ten minutes. Treated as "just now", which is the conservative reading.
  if (elapsed < 0) return cooldownMs
  return elapsed >= cooldownMs ? 0 : cooldownMs - elapsed
}

/** What a refused click is told. Names the wait, because "try later" is not a remedy. */
export function cooldownSentence(remainingMs: number): string {
  return `Sahoda already measured this recently. It can look again in ${roughlyAgo(remainingMs)}.`
}
