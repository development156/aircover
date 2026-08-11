import { z } from 'zod'

import { ChannelSchema, type Channel } from '../enums'

/**
 * `posts.channels` is a Postgres `text[]` with no unique constraint, and EVERY
 * consumer reads it as a set — counting it to pick singular or plural wording,
 * rendering it as the list of channel names, keying React children by channel.
 * The column cannot hold that promise on its own, and three separate defects
 * shipped in two days because nothing made it keep it:
 *
 *   1. `scheduleGapNote` derived "is any channel still connected" from
 *      `unconnectedNames.length >= totalChannels`, which is false for
 *      `['linkedin','linkedin']` — the picker promised a post would go out when
 *      nothing could receive it.
 *   2. The fix moved the bug: the NAME LIST was still undeduped, so the warning
 *      read "LinkedIn and LinkedIn aren't connected" — two accounts named where
 *      one is broken, on a plural verb the count had no right to.
 *   3. `PublishNow` derived its live rail from the raw list while only the
 *      warning went through the deduped one, so a repeated CONNECTED channel
 *      rendered two identical Publish buttons under one React key.
 *
 * Each fix closed one consumer while a sibling kept reading the raw array. So
 * the dedupe now happens ONCE, here, at the row boundary — and the result is a
 * distinct TYPE, so a consumer that wants a set cannot be handed a raw array by
 * a caller who forgot.
 *
 * ── WHY A BRANDED ARRAY AND NOT `ReadonlySet<Channel>` ───────────────────────
 * A `Set` would make this unbreakable, and that is precisely the problem: there
 * would be no way to prove the guard works, because deleting the dedupe from a
 * `Set` is a type error rather than an observable failure. A branded array keeps
 * the guarantee falsifiable — `packages/shared/src/db/channel-set.test.ts` and
 * the consumer tests fail the moment `toChannelSet` stops deduplicating.
 *
 * It is also the shape the rest of the system already speaks. The write path
 * round-trips through arrays (`PostUpdateSchema` → PostgREST, and the editor's
 * autosave compares drafts positionally), and `Post` crosses the server/client
 * boundary into `post-editor.tsx`. A `Set` would need converting at both, and a
 * second representation is how defect #3 survived the fix for #2.
 */

declare const CHANNEL_SET: unique symbol

/**
 * A post's channels as a set: DISTINCT, in first-seen order, readonly.
 *
 * Assignable to `readonly Channel[]`, so any consumer that only reads is
 * unchanged. Nothing is assignable to IT except `toChannelSet`'s output — that
 * asymmetry is the whole point.
 *
 * First-seen order rather than sorted: the order is the writer's own pick order,
 * and it is what the chips, the tab strip and the "reconnect these" sentence all
 * render. Sorting here would reshuffle the tab strip on every toggle.
 */
export type ChannelSet = readonly Channel[] & { readonly [CHANNEL_SET]: true }

/**
 * The ONLY way to make a `ChannelSet`. Deduplicates, preserving first-seen order.
 *
 * Deliberately the single implementation: two hand-rolled `[...new Set(x)]` calls
 * are two things that can drift, and drift is the mechanism behind every defect
 * above. Removing the `new Set` here must break tests — see the mutation note in
 * `channel-set.test.ts`.
 */
export function toChannelSet(channels: Iterable<Channel>): ChannelSet {
  // The one cast in the system. `CHANNEL_SET` is a phantom property that exists
  // only in the type, so no plain array is comparable to the branded type and
  // TS requires the widening step. Every other module gets its `ChannelSet` from
  // here, which is what makes the brand mean something.
  return [...new Set(channels)] as unknown as ChannelSet
}

/** A post with no channels picked yet. */
export const EMPTY_CHANNEL_SET: ChannelSet = toChannelSet([])

/**
 * Narrow a set and keep it one. A subset cannot contain a duplicate the superset
 * did not, so this is the identity on the dedupe — it exists because `Array.filter`
 * returns a plain `Channel[]` and would silently drop the guarantee at exactly the
 * places that need it most.
 *
 * `PublishNow` is the case in point: it filters its channels down to the live rail
 * and then splits THAT into a button list and a warning. Both halves must still be
 * reading one distinct list, and before this they were not.
 */
export function filterChannelSet(
  channels: ChannelSet,
  keep: (channel: Channel) => boolean,
): ChannelSet {
  return toChannelSet(channels.filter(keep))
}

/**
 * The row boundary. Every `posts.channels` read and write parses through this,
 * so a duplicate in the column is collapsed before any consumer can see it — and
 * a duplicate on the way IN is never written in the first place.
 */
export const ChannelSetSchema = z.array(ChannelSchema).transform(toChannelSet)
