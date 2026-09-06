/**
 * What `measureNow()` answers with.
 *
 * Here rather than in the action, because a `'use server'` module may export
 * only async functions — Next enforces it at BUILD time and nothing before it
 * does (`app/actions/use-server-exports.test.ts` carries the story). The button
 * is a client component and needs the shape, so it lives in a file both sides
 * may import.
 */
export interface MeasureNowState {
  ok: boolean
  /** One sentence for the reader. Always present, on both arms. */
  message: string
  /** Posts the platforms answered about. Absent on every refusal. */
  measured?: number
  /** New readings stored. Zero is a real, healthy answer on a repeat pass. */
  written?: number
}
