import type { Rung } from '@/components/ui/badge'
import { knowledgeFailure } from './failure-copy'
import type { KnowledgeDocument, ShownStatus } from './store'

/**
 * What a document's state LOOKS like, and what it says.
 *
 * ── FIVE STATES, AND WHY "PROCESSING" IS ONE OF THEM ────────────────────────
 * A 40-page PDF takes seconds to parse and the owner may reload in the middle of
 * it. Without a real `indexing` state the screen has to choose between calling
 * an unfinished document failed and calling it indexed, and both are lies. So it
 * is a stored state, and it is shown as one.
 *
 * `interrupted` is the fifth and it is DERIVED rather than stored, because
 * nothing can store it: a process killed mid-parse does not run a `finally`. See
 * `staleIndexing`.
 *
 * ── THE RUNG IS URGENCY, NOT QUALITY ────────────────────────────────────────
 * `components/ui/badge.tsx` is explicit: the ladder ranks how much a thing NEEDS
 * YOU. A failed document needs the owner now (`urgent`); an indexed one needs
 * nothing at all (`calm`), however good an outcome that is. Mapping "good" to
 * `calm` and "bad" to `urgent` gets the same answer here by accident, and would
 * stop doing so the moment a state is added.
 */

export interface StatusView {
  rung: Rung
  /** The word on the badge. Never abbreviated — the ladder's own rule. */
  label: string
  /**
   * The sentence under the title, in the owner's terms.
   *
   * `null` where the row already says everything — an indexed document's
   * passage count is a fact and does not need a sentence explaining it.
   */
  detail: string | null
  /** True when "Read it again" is a real remedy rather than a wasted click. */
  retryable: boolean
}

export function statusView(document: KnowledgeDocument): StatusView {
  const status: ShownStatus = document.shownStatus

  if (status === 'indexed') {
    return { rung: 'calm', label: 'Indexed', detail: null, retryable: false }
  }

  if (status === 'pending') {
    return {
      rung: 'pending',
      label: 'Waiting',
      detail: 'Sahoda has this and has not started reading it yet.',
      retryable: true,
    }
  }

  if (status === 'indexing') {
    return {
      rung: 'active',
      label: 'Reading',
      detail: 'Sahoda is reading this now. It takes a few seconds.',
      retryable: false,
    }
  }

  if (status === 'interrupted') {
    const { message, retryable } = knowledgeFailure('interrupted')
    return { rung: 'urgent', label: 'Stopped', detail: message, retryable }
  }

  /**
   * FAILED. The sentence comes from the STORED `failure_detail`, written when
   * the failure happened, and falls back to the register only when the row has
   * none. That fallback matters: a document that failed before the column was
   * filled must not render a red badge with no reason beside it, which is a
   * dead end wearing a warning.
   */
  const stored = document.failure_detail?.trim()
  if (stored) {
    return {
      rung: 'urgent',
      label: 'Could not read',
      detail: stored,
      retryable: document.failure_code
        ? knowledgeFailure(document.failure_code).retryable
        : // No code, so no way to know whether a retry helps. Offering one is
          // the safer wrong answer: the worst case is a click that fails again,
          // against a dead end with no way forward at all.
          true,
    }
  }

  return {
    rung: 'urgent',
    label: 'Could not read',
    detail: document.failure_code
      ? knowledgeFailure(document.failure_code).message
      : 'Sahoda could not read this and did not record why. Try reading it again.',
    retryable: true,
  }
}

/** "PDF" · "Web page" · "Typed" — what door it came through, for the row. */
export function sourceLabel(kind: KnowledgeDocument['source_kind']): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'url') return 'Web page'
  return 'Typed'
}

/**
 * The passage count, as a phrase.
 *
 * Only for an INDEXED document. A failed one has a `chunk_count` from its last
 * successful read or a zero from never having had one, and printing either
 * beside "Could not read" invites the reader to believe something is stored that
 * they can search — which for a first-time failure is nothing at all.
 */
export function passagePhrase(document: KnowledgeDocument): string | null {
  if (document.status !== 'indexed') return null
  const n = document.chunk_count
  return `${n.toLocaleString('en-IN')} ${n === 1 ? 'passage' : 'passages'}`
}
