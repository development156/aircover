import 'server-only'

import { captionRewriteTask, contentVariantsTask, type Mesh } from '@sahoda/mesh'
import {
  CONSTRAINTS,
  type CaptionRewriteInput,
  type Channel,
  type MeshContext,
  type RemixKind,
} from '@sahoda/shared'
import { segmentLimitFor, splitIntoThread } from '@sahoda/publishing/format'

import { filterVariants } from '@/lib/posts/filter-variants'

/**
 * ONE MESH CALL PER KIND, AND WHICH CALL IT IS.
 *
 * ── THE CONTRACT IS FROZEN, SO THIS IS THE WHOLE BUDGET ──────────────────────
 * `CaptionRewriteInputSchema.instruction` is `rewrite | shorten | hookify` and
 * `content_variants` is the only other task a derivative could use. Everything
 * Remix can make is made out of those four calls; everything it cannot make is
 * listed in `catalogue.ts` with the task name it would need.
 *
 * ── WHY `short` AND `hook` PRODUCE ONE BODY FOR EVERY CHANNEL ────────────────
 * `caption_rewrite` has no channel field. It cannot be told that X allows 280
 * characters and LinkedIn allows 3,000, so asking it four times would be four
 * paid calls for four near-identical answers — and it would be four charges for
 * one piece of work. One call, one body, and the per-channel rows are LINKED
 * variants (`post_variants.is_linked` defaults true), which is exactly what
 * "the same words everywhere" already means in this app.
 *
 * `adaptation` is the one kind that IS channel-aware, because
 * `content_variants` takes the channel list and answers per channel inside its
 * one call.
 */

/** What a kind produced: a body per channel, plus what it could not answer for. */
export interface ComposedBodies {
  /** channel → the words that channel's draft will carry. */
  readonly bodies: ReadonlyMap<Channel, string>
  /** Channels that were asked for and came back with nothing. Never blanked. */
  readonly missing: readonly Channel[]
}

/** Our own copy for a failure. Never a provider or mesh message. */
export const COMPOSE_FAILURE = {
  MESH_ERROR: 'The model could not complete this.',
  EMPTY: 'The model returned nothing usable.',
  NOT_A_THREAD: 'The rewrite came back short enough for one post, so it is not a thread.',
} as const

export type ComposeFailure = (typeof COMPOSE_FAILURE)[keyof typeof COMPOSE_FAILURE]

export class ComposeError extends Error {
  constructor(readonly reason: ComposeFailure) {
    // The MESSAGE is a sentinel the wrapper never shows; `reason` is the copy.
    super('COMPOSE_FAILED')
  }
}

const INSTRUCTION: Partial<Record<RemixKind, CaptionRewriteInput['instruction']>> = {
  short: 'shorten',
  hook: 'hookify',
  // A thread is the long argument written to be read in pieces, which is a
  // rewrite of the same length and meaning — the one directive `rewrite` names.
  thread: 'rewrite',
}

/**
 * Ask the mesh for one kind's words.
 *
 * THROWS a `ComposeError` on every failure path, and that is load-bearing:
 * `withCredits` RELEASES the hold when the wrapped callback throws, so a kind
 * that fails costs nothing. Returning a half-answer instead would settle the
 * DEBIT and charge for it.
 */
export async function composeKind(input: {
  mesh: Mesh
  kind: RemixKind
  sourceBody: string
  channels: readonly Channel[]
  ctx: MeshContext
}): Promise<ComposedBodies> {
  const { mesh, kind, sourceBody, channels, ctx } = input

  if (kind === 'adaptation') {
    const result = await mesh.runTask(
      contentVariantsTask.def,
      { body: sourceBody, channels: [...channels] },
      ctx,
    )
    if (!result.ok) throw new ComposeError(COMPOSE_FAILURE.MESH_ERROR)

    // `ContentVariantsOutputSchema` has no channel cross-check and no `.min()`,
    // so `{"variants": []}` parses clean. The same filter the composer uses is
    // what turns that into an honest answer rather than an empty success.
    const filtered = filterVariants(channels, result.data)
    if (filtered.variants.length === 0) throw new ComposeError(COMPOSE_FAILURE.EMPTY)

    const bodies = new Map<Channel, string>()
    for (const variant of filtered.variants) bodies.set(variant.channel, variant.body)
    return { bodies, missing: filtered.missing }
  }

  const instruction = INSTRUCTION[kind]
  if (!instruction) throw new ComposeError(COMPOSE_FAILURE.MESH_ERROR)

  const result = await mesh.runTask(captionRewriteTask.def, { text: sourceBody, instruction }, ctx)
  if (!result.ok) throw new ComposeError(COMPOSE_FAILURE.MESH_ERROR)
  const text = result.data.text.trim()
  if (text === '') throw new ComposeError(COMPOSE_FAILURE.EMPTY)

  // ── A THREAD HAS TO ACTUALLY BE ONE ────────────────────────────────────────
  // `format: 'thread'` is a claim about the row, and publishing holds a variant
  // to its declared format. A rewrite that fits in one post is a post, and
  // storing it as a thread would be a draft that says it is something it is not.
  // Refusing here RELEASES the hold, so the customer is not charged for it.
  if (kind === 'thread') {
    if (!isReallyAThread(text, channels)) throw new ComposeError(COMPOSE_FAILURE.NOT_A_THREAD)
  }

  const bodies = new Map<Channel, string>()
  for (const channel of channels) bodies.set(channel, text)
  return { bodies, missing: [] }
}

/**
 * Would this text publish as more than one post on the thread's channel?
 *
 * `segmentLimitFor` and `splitIntoThread` are the SAME two functions the publish
 * path uses — not a second count that happens to agree. `thread-plan.ts` says
 * why that matters in its own words: a flag set by one side and not the other is
 * how a preview showing five posts and a publish producing four come about.
 */
function isReallyAThread(text: string, channels: readonly Channel[]): boolean {
  return channels.some((channel) => {
    const spec = CONSTRAINTS[channel]
    return splitIntoThread(text, segmentLimitFor(spec, text)).length > 1
  })
}
