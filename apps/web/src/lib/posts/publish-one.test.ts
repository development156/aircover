import { describe, expect, test, vi } from 'vitest'

import { publishEach, publishOne, type FetchLike } from './publish-one'

/**
 * THE REFUSALS NOBODY COULD REACH.
 *
 * This logic lived inside `PublishNow`'s `run()` — a React transition with a
 * router and four pieces of state around it — and had no test of any kind. Three
 * of its branches exist to REFUSE a success the server appeared to report, and
 * an unexercised refusal is a refusal nobody knows still works. Publishing is
 * the one irreversible act in this product; a false "Live on Instagram" is the
 * worst sentence it can print.
 */

/** A fetch that answers with one body, and records what it was asked. */
function answering(body: unknown, init: { ok?: boolean } = {}): FetchLike {
  return vi.fn(async () =>
    Promise.resolve({
      ok: init.ok ?? true,
      json: async () => Promise.resolve(body),
    }),
  ) as unknown as FetchLike
}

describe('publishOne — what counts as published', () => {
  test('a real permalink is a real publish', async () => {
    const result = await publishOne(
      'p1',
      'linkedin',
      answering({ ok: true, permalink: 'https://linkedin.test/1' }),
    )

    expect(result).toEqual({
      ok: true,
      channel: 'linkedin',
      permalink: 'https://linkedin.test/1',
      alreadyPublished: false,
    })
  })

  test('carries alreadyPublished through, because the two are different sentences', async () => {
    const result = await publishOne(
      'p1',
      'x',
      answering({ ok: true, permalink: 'https://x.test/1', alreadyPublished: true }),
    )

    expect(result).toMatchObject({ ok: true, alreadyPublished: true })
  })

  test('a FIXTURE response is refused, however successful it looks', async () => {
    // The worst branch. The body says ok, carries a permalink, and would render
    // as "Live on Instagram" with a working-looking link — for a post that never
    // left the building. Reachable whenever the rail is misconfigured.
    const result = await publishOne(
      'p1',
      'instagram',
      answering({ ok: true, mode: 'fixture', permalink: 'https://example.test/fake' }),
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/isn’t switched on/i)
    expect(result.ok === false && result.message).toMatch(/Instagram/)
  })

  test('a fixture:// permalink is refused even when the body forgot to say mode', async () => {
    // The already-published branch of the route used to answer with no `mode`
    // at all, so a row whose only "publish" was the fixture rail passed the
    // check above and rendered as "Already live on X" in green, with no link.
    // The permalink itself says it is a simulation; that is enough to refuse.
    const result = await publishOne(
      'p1',
      'x',
      answering({ ok: true, alreadyPublished: true, permalink: 'fixture://x/1' }),
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/isn’t switched on/i)
    expect(result.ok === false && result.message).toMatch(/\bX\b/)
  })

  test('a success with NO permalink is not reported as live', async () => {
    // Instagram returns 201 with `status: processing` and no URL, and Meta may
    // still fail the post afterwards. The claim made instead is exact: accepted,
    // no link yet.
    const result = await publishOne('p1', 'instagram', answering({ ok: true }))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/hasn’t given us a link yet/i)
  })

  test('an EMPTY permalink string is treated the same as a missing one', async () => {
    // `!body.permalink` and `body.permalink === undefined` are not the same
    // test, and the empty string is the one that slips between them.
    const result = await publishOne('p1', 'x', answering({ ok: true, permalink: '' }))

    // RETARGETED: a bare `.ok` check passes identically whether the empty
    // string took the same "no link yet" branch as a missing permalink, or
    // `publishOne` threw on the empty string and some unrelated catch
    // produced a DIFFERENT ok:false. Assert the specific sentence, which is
    // exactly the sibling test's claim above — that the two are the same case.
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/hasn’t given us a link yet/i)
    expect(result.ok === false && result.message).toMatch(/\bX\b/)
  })

  test('a 200 whose BODY says not-ok is a failure, and the body’s words are kept', async () => {
    // The route reports refusals in the body, so the HTTP status is not the
    // verdict. Its message is more specific than anything written here.
    const result = await publishOne(
      'p1',
      'x',
      answering({ ok: false, message: 'That account lost its permission.' }),
    )

    expect(result).toEqual({
      ok: false,
      channel: 'x',
      message: 'That account lost its permission.',
    })
  })

  test('a non-2xx with no message still names the channel', async () => {
    const result = await publishOne('p1', 'gbp', answering({}, { ok: false }))

    expect(result.ok === false && result.message).toMatch(/Google Business Profile/)
  })

  test('a network throw is a failure, not an exception the caller must catch', async () => {
    const boom = vi.fn(async () => Promise.reject(new Error('offline'))) as unknown as FetchLike

    const result = await publishOne('p1', 'linkedin', boom)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/couldn’t reach the server/i)
    expect(result.ok === false && result.message).toMatch(/LinkedIn/)
  })

  test('posts the channel in the body, to the post’s own route', async () => {
    const spy = answering({ ok: true, permalink: 'https://x.test/1' })
    await publishOne('post-42', 'x', spy)

    expect(spy).toHaveBeenCalledWith(
      '/api/posts/post-42/publish',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ channel: 'x' }) }),
    )
  })
})

describe('publishEach — one failure must not cancel the rest', () => {
  test('a failure in the middle still attempts every channel after it', async () => {
    // THE ONE THAT MATTERS. These are separate accounts: LinkedIn being down
    // says nothing about X. An early return here would silently drop a channel
    // the reader was told, in the confirm panel, that this would reach.
    const byChannel: Record<string, unknown> = {
      instagram: { ok: true, permalink: 'https://ig.test/1' },
      linkedin: { ok: false, message: 'LinkedIn refused it.' },
      x: { ok: true, permalink: 'https://x.test/1' },
    }
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const { channel } = JSON.parse(init.body) as { channel: string }
      return Promise.resolve({ ok: true, json: async () => Promise.resolve(byChannel[channel]) })
    }) as unknown as FetchLike

    const results = await publishEach('p1', ['instagram', 'linkedin', 'x'], fetchImpl)

    expect(results).toHaveLength(3)
    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(results.map((r) => r.channel)).toEqual(['instagram', 'linkedin', 'x'])
  })

  test('keeps the order it was given, which is the order the reader was shown', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const { channel } = JSON.parse(init.body) as { channel: string }
      return Promise.resolve({
        ok: true,
        json: async () => Promise.resolve({ ok: true, permalink: `https://t.test/${channel}` }),
      })
    }) as unknown as FetchLike

    const results = await publishEach('p1', ['x', 'instagram'], fetchImpl)

    expect(results.map((r) => r.channel)).toEqual(['x', 'instagram'])
  })

  test('sends them one at a time, not all at once', async () => {
    // Sequential for the same reason `saveAll` is: each publish writes back to
    // the same post row, and concurrent writes make a refusal impossible to
    // attribute to a channel.
    let inFlight = 0
    let maxInFlight = 0
    const fetchImpl = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return { ok: true, json: async () => Promise.resolve({ ok: true, permalink: 'https://t/1' }) }
    }) as unknown as FetchLike

    await publishEach('p1', ['x', 'instagram', 'linkedin'], fetchImpl)

    expect(maxInFlight).toBe(1)
  })

  test('no channels means no calls and no results', async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike

    expect(await publishEach('p1', [], fetchImpl)).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
