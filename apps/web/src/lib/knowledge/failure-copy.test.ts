import { describe, expect, it } from 'vitest'

import { knowledgeFailure, staleIndexing, STALE_INDEXING_MS } from './failure-copy'
import type { KnowledgeFailureCode } from './failure-copy'

const CODES: KnowledgeFailureCode[] = [
  'no_text',
  'too_large',
  'unreadable',
  'fetch_refused',
  'fetch_failed',
  'not_supported',
  'interrupted',
]

/**
 * THE DERIVED "STOPPED" STATE IS THE ONLY THING BETWEEN A KILLED PARSE AND
 * "PROCESSING" FOREVER.
 *
 * `start_knowledge_indexing` sets `indexing` and only a completed run clears it.
 * A process killed mid-parse — a platform timeout, a deploy, an out-of-memory —
 * runs no `finally`, so nothing is alive to record the failure. The state is
 * therefore derived on READ, and this is the derivation.
 *
 * It was written with a `now` parameter "so this is testable without touching
 * the clock", and then not tested. That is the shape of a guard nobody has
 * watched: the parameter proves an intention, not a behaviour.
 */
describe('deriving the interrupted state', () => {
  const start = Date.parse('2026-08-22T03:00:00.000Z')

  it('is not stale while the read could still be running', () => {
    expect(staleIndexing('indexing', new Date(start).toISOString(), start + 1_000)).toBe(false)
    // One millisecond inside the threshold is still inside it.
    expect(
      staleIndexing('indexing', new Date(start).toISOString(), start + STALE_INDEXING_MS - 1),
    ).toBe(false)
  })

  it('is stale once the platform would have killed it', () => {
    expect(
      staleIndexing('indexing', new Date(start).toISOString(), start + STALE_INDEXING_MS + 1),
    ).toBe(true)
  })

  it('never fires on a state that is not `indexing`', () => {
    // A failed document is already explained and an indexed one is finished.
    // Marking either "stopped" because its `updated_at` is old would relabel
    // every document in the library the day after it was added.
    const ancient = new Date(start).toISOString()
    for (const status of ['pending', 'indexed', 'failed', 'interrupted']) {
      expect(staleIndexing(status, ancient, start + STALE_INDEXING_MS * 1000), status).toBe(false)
    }
  })

  it('reads an absent or unparseable timestamp as NOT stale', () => {
    // The cautious direction. "Stopped" offers a retry and says Sahoda broke;
    // claiming that from a timestamp we could not read would be inventing a
    // fault. A document that genuinely is stuck shows "Reading" until a
    // readable timestamp says otherwise.
    expect(staleIndexing('indexing', null)).toBe(false)
    expect(staleIndexing('indexing', 'not a date', start)).toBe(false)
    expect(staleIndexing('indexing', '', start)).toBe(false)
  })

  it('is derived from the route ceiling, not from a round number', () => {
    // `maxDuration = 120` is the platform's hard stop, so after two minutes the
    // work is gone rather than slow. Five minutes is that bound with room for a
    // clock difference — and far above the largest ingestion measured against
    // the real project (2,000 passages, 2.1 MB, 1.9s).
    expect(STALE_INDEXING_MS).toBeGreaterThan(120_000)
  })
})

describe('every failure says what happened and what to do', () => {
  it('has a sentence for all seven codes, and none of them is a code', () => {
    for (const code of CODES) {
      const { message } = knowledgeFailure(code)
      expect(message.length, code).toBeGreaterThan(40)
      // No jargon leaking into a shop owner's screen.
      expect(message, code).not.toContain('_')
      expect(message, code).not.toMatch(/\b(null|undefined|error code|HTTP)\b/i)
      // A complete sentence, not a fragment.
      expect(message.trim().endsWith('.'), code).toBe(true)
    }
  })

  it('offers a retry only where a retry could work', () => {
    // A scanned PDF will be a scanned PDF tomorrow; offering "try again" wastes
    // the owner's time and implies Sahoda was merely unlucky.
    expect(knowledgeFailure('fetch_failed').retryable).toBe(true)
    expect(knowledgeFailure('interrupted').retryable).toBe(true)
    for (const code of [
      'no_text',
      'too_large',
      'unreadable',
      'fetch_refused',
      'not_supported',
    ] as const) {
      expect(knowledgeFailure(code).retryable, code).toBe(false)
    }
  })

  it('names the size when it has one, and stays honest when it does not', () => {
    const withFigure = knowledgeFailure('too_large', { passages: 2500, limit: 2000 })
    expect(withFigure.message).toContain('2,500')
    expect(withFigure.message).toContain('2,000')
    // Without the numbers it must not invent them.
    const without = knowledgeFailure('too_large')
    expect(without.message).not.toMatch(/\d/)
  })

  it('says whose fault it was, where that is knowable', () => {
    // `interrupted` is OUR fault and the sentence says so, rather than leaving
    // the owner to conclude their file is bad.
    expect(knowledgeFailure('interrupted').message).toMatch(/our end/i)
    // `fetch_failed` makes no claim about the page, because Sahoda never saw it.
    expect(knowledgeFailure('fetch_failed').message).toMatch(/never arrived/i)
  })
})
