import type { Channel } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'

/**
 * ONE PUBLISH CALL, AND EVERY WAY IT CAN FAIL, OUT OF THE COMPONENT.
 *
 * ── WHY THIS MOVED ───────────────────────────────────────────────────────────
 * This was thirty lines inside `PublishNow`'s `run()`, which is a React
 * component with a transition, a router and four pieces of state. Nothing could
 * test it. That matters more here than almost anywhere else in the product,
 * because three of its branches exist to REFUSE a success the server appeared to
 * report, and a refusal nobody exercises is a refusal nobody knows still works.
 *
 * It also has to run N times now rather than once. "Send now" reaches every
 * connected channel, and a loop needs a function.
 *
 * ── THE THREE REFUSALS, EACH ONE LOAD-BEARING ────────────────────────────────
 *  · `mode === 'fixture'`, or a `fixture://` permalink — the rail answered
 *    from a fixture, so nothing left the building. Reporting that as published
 *    is the single worst thing this code could do, and it is reachable whenever
 *    the rail is misconfigured. The permalink is checked as well as the mode
 *    because the route's already-published branch once answered with no `mode`
 *    at all, and the permalink is the one field that still knew.
 *  · no `permalink` — Instagram returns 201 with `status: processing` and no
 *    URL, and Meta may still fail the post afterwards. A success banner without
 *    a link is a claim the product cannot back.
 *  · `res.ok` but `body.ok !== true` — the route reports refusals in the body,
 *    so the HTTP status alone is not the verdict.
 *
 * Every message names its channel. These outcomes are rendered in a LIST now,
 * one row per channel, and "Publishing didn't go through" with no subject in a
 * list of four is a sentence the reader cannot act on.
 */

export interface PublishSuccess {
  ok: true
  channel: Channel
  permalink: string
  /** The row already carried a permalink: this press changed nothing. */
  alreadyPublished: boolean
}

export interface PublishFailure {
  ok: false
  channel: Channel
  message: string
}

export type PublishOutcome = PublishSuccess | PublishFailure

interface PublishBody {
  ok?: boolean
  message?: string
  permalink?: string
  mode?: string
  alreadyPublished?: boolean
}

/** Injectable so the tests drive every branch without a network. */
export type FetchLike = typeof fetch

export async function publishOne(
  postId: string,
  channel: Channel,
  fetchImpl: FetchLike = fetch,
): Promise<PublishOutcome> {
  const label = CHANNEL_LABELS[channel]
  let body: PublishBody

  try {
    const res = await fetchImpl(`/api/posts/${postId}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
    body = (await res.json()) as PublishBody
    if (!res.ok || body.ok !== true) {
      return {
        ok: false,
        channel,
        message: body.message ?? `${label} didn’t go through. Try again.`,
      }
    }
  } catch {
    return {
      ok: false,
      channel,
      message: `Sahoda couldn’t reach the server, so nothing went to ${label}.`,
    }
  }

  if (body.mode === 'fixture' || body.permalink?.startsWith('fixture://') === true) {
    return {
      ok: false,
      channel,
      message: `Publishing isn’t switched on for this workspace yet, so nothing went to ${label}.`,
    }
  }

  if (body.permalink === undefined || body.permalink === '') {
    return {
      ok: false,
      channel,
      // The claim is exact and it is not a failure: the post may well appear.
      // What Sahoda does not have is a link, and it will not pretend otherwise.
      message: `${label} accepted the post but hasn’t given us a link yet. Check back shortly.`,
    }
  }

  return {
    ok: true,
    channel,
    permalink: body.permalink,
    alreadyPublished: body.alreadyPublished === true,
  }
}

/**
 * Every channel, IN ORDER, each one waited for.
 *
 * Sequential rather than parallel, and for the same reason `saveAll` is: each
 * publish writes back to the same post row, and four concurrent writes make a
 * refusal impossible to attribute. It is also the order the reader was shown in
 * the confirm panel, so the results appear in the order they were promised.
 *
 * NOTHING SHORT-CIRCUITS. A failure on channel two must not cancel channels
 * three and four: they are separate accounts and one being down says nothing
 * about the others. Every channel gets its own attempt and its own verdict.
 */
export async function publishEach(
  postId: string,
  channels: readonly Channel[],
  fetchImpl: FetchLike = fetch,
): Promise<PublishOutcome[]> {
  const outcomes: PublishOutcome[] = []
  for (const channel of channels) {
    outcomes.push(await publishOne(postId, channel, fetchImpl))
  }
  return outcomes
}
