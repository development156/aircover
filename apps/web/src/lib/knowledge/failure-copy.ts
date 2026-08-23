/**
 * What a failed document says, in words a shop owner can act on.
 *
 * ── THE RULE THIS FILE INHERITS ──────────────────────────────────────────────
 * `lib/onboarding/door-transport-failure.ts` was written because one sentence —
 * "We could not read that" — was being used for four faults, three of which
 * never opened the document at all. Telling somebody their menu is unreadable
 * when the fault was an expired session is a confident answer to a question
 * nobody asked, and it is worse than vague because they will act on it.
 *
 * Same rule here, and the same two halves:
 *
 *   MUST NOT: assert anything about the file or page unless Sahoda actually
 *             opened it and looked.
 *   MUST:     name what happened, and offer the remedy that matches it.
 *
 * ── WHY THE SENTENCE IS STORED AND NOT DERIVED AT RENDER ────────────────────
 * `knowledge_documents.failure_detail` holds the text, written when the failure
 * happened. A failure keeps its explanation even after the code that produced it
 * has been rewritten — and a document that failed in March still says what
 * Sahoda believed in March rather than being retro-fitted with today's wording.
 */

/** The codes `knowledge_documents.failure_code` accepts. One sentence each. */
export type KnowledgeFailureCode =
  | 'no_text'
  | 'too_large'
  | 'unreadable'
  | 'fetch_refused'
  | 'fetch_failed'
  | 'not_supported'
  | 'interrupted'

export interface KnowledgeFailure {
  /** Shown as the reason. Complete sentences, no jargon, no error codes. */
  message: string
  /**
   * True when trying the SAME source again is the sensible next move.
   *
   * False where a retry just fails again — a scanned PDF will be a scanned PDF
   * tomorrow — and offering one would waste the owner's time and imply Sahoda
   * was merely unlucky.
   */
  retryable: boolean
}

/**
 * `extra` carries the one figure a message needs, when it needs one.
 * A sentence that says "too big" without saying by how much leaves the reader
 * to guess, and a guess about their own file is exactly what this avoids.
 */
export function knowledgeFailure(
  code: KnowledgeFailureCode,
  extra: { passages?: number; limit?: number } = {},
): KnowledgeFailure {
  switch (code) {
    case 'no_text':
      return {
        message:
          'Sahoda opened this and found almost no text — the words are probably part of the design rather than typed into it. A menu exported as a picture reads this way. Try a version you can select text in, or paste the text yourself.',
        retryable: false,
      }
    case 'too_large':
      return {
        message:
          extra.passages && extra.limit
            ? `This is far longer than Sahoda stores in one go — about ${extra.passages.toLocaleString('en-IN')} passages against a limit of ${extra.limit.toLocaleString('en-IN')}. Nothing was saved, because storing half a document and calling it read would be worse. Split it into sections and add them separately.`
            : 'This is far longer than Sahoda stores in one go. Nothing was saved, because storing half a document and calling it read would be worse. Split it into sections and add them separately.',
        retryable: false,
      }
    case 'unreadable':
      return {
        message:
          'This file did not open as a PDF. It may be damaged, or it may be something else with a .pdf name on it. Nothing was saved.',
        retryable: false,
      }
    case 'fetch_refused':
      return {
        message:
          'Sahoda will not fetch that address. It points somewhere private rather than to a page on the open web — a home network, or a machine only this server can see. Check the link and try a public page.',
        retryable: false,
      }
    case 'fetch_failed':
      return {
        message:
          'The page did not answer. Sahoda cannot say whether it is usable, because it never arrived. Nothing was saved. Try again.',
        retryable: true,
      }
    case 'not_supported':
      return {
        message:
          'Sahoda cannot read this kind of file yet. PDFs, plain text and a web page all work. Nothing was saved.',
        retryable: false,
      }
    /**
     * ── THE ONE THAT IS OUR FAULT, AND SAYS SO ────────────────────────────────
     * Nothing sets this at the moment it happens: a process that is killed
     * mid-parse — a platform timeout, a deploy, an out-of-memory — does not run
     * a `finally`. So it is DERIVED on read, by `staleIndexing` below, and this
     * sentence is what that derivation says.
     */
    case 'interrupted':
      return {
        message:
          'Sahoda stopped part-way through reading this and cannot say whether it is usable. That is a fault at our end, not with your file. Nothing was saved and nothing was charged — read it again.',
        retryable: true,
      }
  }
}

/**
 * How long a document may sit at `indexing` before it is read as interrupted.
 *
 * DERIVED, not guessed. The route that does the reading declares
 * `maxDuration = 120`, which is the platform's hard stop: after two minutes the
 * work is not slow, it is gone. Five minutes is that bound with room for a clock
 * difference and a queued retry, and the largest ingestion measured against the
 * real project — 2,000 passages, a 2.1 MB payload — committed in 1.9 seconds, so
 * nothing legitimate is anywhere near this.
 *
 * WHY A DERIVED RULE AT ALL: `start_knowledge_indexing` sets the state and only
 * a completed run clears it. Without this, a killed process leaves a document
 * reading "Processing" forever, with no way back — which is a dead end on a
 * screen, and the one thing this feature may not have.
 */
export const STALE_INDEXING_MS = 5 * 60 * 1000

/**
 * True when a document claiming to be mid-read cannot still be being read.
 *
 * `now` is a parameter so this is testable without touching the clock.
 */
export function staleIndexing(
  status: string,
  updatedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (status !== 'indexing' || !updatedAt) return false
  const started = Date.parse(updatedAt)
  if (Number.isNaN(started)) return false
  return now - started > STALE_INDEXING_MS
}
