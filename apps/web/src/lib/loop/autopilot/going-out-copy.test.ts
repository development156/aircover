import { describe, expect, it } from 'vitest'

import { GOING_OUT_UNREADABLE, goingOutView } from './going-out-copy'

/**
 * The three nothings, and the claims each one is allowed to make.
 *
 * Every assertion here checks the CLAIM, not the wording. Rewrite any sentence
 * freely; what must not change is which state says what, and above all that no
 * state tells a reader something could go out when nothing can.
 */

const post = { channel: 'x' as const }

describe('when no channel is armed', () => {
  const v = goingOutView({ armed: [], waiting: [] })

  it('says the SETUP is the reason, not that the queue is empty', () => {
    expect(v.state).toBe('not-armed')
    // "Nothing is waiting to go out" implies something COULD go out. It cannot.
    expect(v.sentence).not.toMatch(/waiting/i)
    expect(v.sentence.toLowerCase()).toContain('on its own')
  })

  it('offers the one action that would change the answer', () => {
    expect(v.remedy).not.toBeNull()
    expect(v.remedy!.toLowerCase()).toContain('on its own')
  })

  it('reports zero rather than hiding the count', () => {
    expect(v.count).toBe(0)
  })

  it('stays in this state even if rows somehow exist, because the setup is the fact', () => {
    // Defensive: a stale row from a channel since disarmed must not make the
    // screen claim autopilot is running.
    expect(goingOutView({ armed: [], waiting: [post] }).state).toBe('not-armed')
  })
})

describe('when a channel is armed and nothing is due', () => {
  const v = goingOutView({ armed: ['x'], waiting: [] })

  it('is the only state that earns a plain "nothing waiting"', () => {
    expect(v.state).toBe('armed-idle')
    expect(v.sentence.toLowerCase()).toContain('nothing')
  })

  it('offers NO remedy, because there is nothing to do and a reload cannot help', () => {
    expect(v.remedy).toBeNull()
  })
})

describe('when posts are in the window', () => {
  it('counts one as one, in words rather than a bare numeral', () => {
    const v = goingOutView({ armed: ['x'], waiting: [post] })
    expect(v.state).toBe('waiting')
    expect(v.count).toBe(1)
    expect(v.sentence).toMatch(/^one post/i)
    expect(v.sentence).not.toMatch(/\b1 post/)
  })

  it('counts many with the numeral and the plural', () => {
    const v = goingOutView({ armed: ['x'], waiting: [post, post, post] })
    expect(v.count).toBe(3)
    expect(v.sentence).toContain('3 posts')
  })

  it('tells the reader they can stop them', () => {
    const v = goingOutView({ armed: ['x'], waiting: [post] })
    expect(v.remedy).not.toBeNull()
    expect(v.remedy!.toLowerCase()).toContain('stop')
  })
})

describe('when the read could not answer', () => {
  const v = GOING_OUT_UNREADABLE

  it('says Sahoda could not look, never that nothing is waiting', () => {
    expect(v.state).toBe('unreadable')
    // The whole defect: a failed read that reads as an empty queue is the
    // product asserting something about the customer's posts on the strength
    // of a query that never answered.
    expect(v.sentence).not.toMatch(/nothing is waiting/i)
    expect(v.sentence.toLowerCase()).toContain('could not')
  })

  it('answers the question the reader actually has: did something go out', () => {
    expect(v.remedy).not.toBeNull()
    expect(v.remedy!.toLowerCase()).toContain('nothing was sent')
  })

  it('reports zero without implying it measured zero', () => {
    expect(v.count).toBe(0)
    expect(v.sentence).not.toMatch(/\b0\b|\bno posts\b/i)
  })
})

describe('what no state is allowed to claim', () => {
  const all = [
    GOING_OUT_UNREADABLE,
    goingOutView({ armed: [], waiting: [] }),
    goingOutView({ armed: ['x'], waiting: [] }),
    goingOutView({ armed: ['x'], waiting: [post, post] }),
  ]

  it('never says a post WILL be published, because autopilot does not publish', () => {
    // It hands a post to the publishing path, which has its own refusals.
    // `dispatched` is not a claim about a platform and this copy must not be
    // the place that turns it into one.
    for (const v of all) {
      const text = `${v.sentence} ${v.remedy ?? ''}`.toLowerCase()
      expect(text).not.toMatch(/will be published|will publish|has been published/)
    }
  })

  it('never promises the window is still open', () => {
    for (const v of all) {
      const text = `${v.sentence} ${v.remedy ?? ''}`.toLowerCase()
      expect(text).not.toMatch(/you still have|time remaining|minutes left/)
    }
  })

  it('never offers a remedy in the one state where nothing can be done', () => {
    expect(goingOutView({ armed: ['x'], waiting: [] }).remedy).toBeNull()
  })

  it('gives every state a sentence, so no reader gets an empty panel', () => {
    for (const v of all) expect(v.sentence.trim().length).toBeGreaterThan(0)
  })
})
