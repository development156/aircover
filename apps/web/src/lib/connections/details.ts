import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import type { DetailRow } from '@/components/connections/channel-details'
import { READINESS_LABEL, asChannel, type CatalogueEntry } from '@/lib/connections/catalogue'

/**
 * THE FACTS BEHIND A CHANNEL, ASSEMBLED IN ONE PLACE AND MEASURED NOWHERE ELSE.
 *
 * ── WHY THIS IS A PURE FUNCTION AND NOT JSX ──────────────────────────────────
 * Every row here is a CLAIM about what Sahoda will and will not do with somebody's
 * account: how long a post can be, how many photos it will take, how many a day it
 * will send. Those are the numbers a shop owner plans around, and a wrong one is
 * not a cosmetic defect — it is a promise the publish step then breaks. Keeping the
 * assembly in a function means the claims can be asserted directly, without a
 * render, and `details.test.ts` does exactly that.
 *
 * ── AND EVERY NUMBER IS READ FROM THE ENGINE THAT ENFORCES IT ────────────────
 * `CONSTRAINTS` is the single declarative source the editor validates against and
 * the adapters format from. Restating "Instagram allows 2,200 characters" here as
 * a literal would create a second copy that drifts the first time a platform moves
 * its limit — and the copy on THIS screen would be the one nobody thought to
 * update, because it looks like marketing text rather than a constraint.
 */

/** `image/jpeg` and `image/png` are not words. This is what a person calls them. */
function mediaWords(mimes: readonly string[] | undefined): string | null {
  if (!mimes || mimes.length === 0) return null
  const names = new Set<string>()
  for (const mime of mimes) {
    if (mime === 'image/gif') names.add('GIFs')
    else if (mime.startsWith('image/')) names.add('photos')
    else if (mime.startsWith('video/')) names.add('video')
  }
  const list = [...names]
  const last = list[list.length - 1]
  if (last === undefined) return null
  if (list.length === 1) return last
  return `${list.slice(0, -1).join(', ')} and ${last}`
}

/** What the readiness rung MEANS, rather than what it is called. */
function readinessDetail(entry: CatalogueEntry): string {
  switch (entry.readiness) {
    case 'publishes-today':
      return 'A post from Sahoda has reached this platform and appeared on it.'
    case 'built-not-proven':
      // The exact claim, kept narrow. "It might not work" would be vaguer than the
      // truth: the code is there and has run, it has just never reached the
      // platform for real, and that is a checkable statement.
      return 'Sahoda can send to this platform, and no post has yet been proven to arrive.'
    case 'not-built':
      return 'Sahoda cannot post here yet. Connecting it is not possible.'
  }
}

export interface ChannelDetailContent {
  label: string
  blurb: string
  rows: DetailRow[]
  note?: string
}

/**
 * Everything the details panel shows for one channel.
 *
 * `connectedCount` comes from the caller because it is a fact about the CUSTOMER
 * and this module knows only about the product. Passing it in keeps the two kinds
 * of claim apart, which is the same split `catalogue.ts` and `health.ts` already
 * make and the reason the tile has a divider through the middle of it.
 */
export function channelDetailContent(
  entry: CatalogueEntry,
  connectedCount: number,
): ChannelDetailContent {
  const rows: DetailRow[] = [
    { term: READINESS_LABEL[entry.readiness], detail: readinessDetail(entry) },
  ]

  const channel = asChannel(entry.id)

  if (channel === null) {
    // A planned channel. NO limits row, and that is deliberate: `CONSTRAINTS` has
    // no entry to read, and inventing a plausible one would put a number on the
    // screen that no engine enforces — the fabricated-figure failure this project
    // has hit before. It also has no slot row: nothing can be connected, so there
    // is nothing to count and "0 accounts connected" would read as a state the
    // customer could change.
    return {
      label: entry.label,
      blurb: entry.blurb,
      rows,
      note: 'Sahoda will say what this channel can carry once it can post here. Nothing is guessed in advance.',
    }
  }

  rows.push(slotRow(connectedCount))

  const spec = CONSTRAINTS[channel as Channel]

  rows.push({
    term: 'Longest post',
    detail: `${spec.maxChars.toLocaleString('en-IN')} characters.`,
  })

  const media = mediaWords(spec.mediaTypes)
  if (media && spec.maxMediaCount) {
    rows.push({
      term: 'Photos and video',
      detail:
        `Up to ${spec.maxMediaCount} ${spec.maxMediaCount === 1 ? 'file' : 'files'} per post, ` +
        `${spec.maxMediaMB} MB each. ${capitalise(media)}.` +
        // Stated because it changes whether a post can be written at all, not just
        // whether it is allowed. Instagram refuses a caption with no picture, and
        // an editor that showed green on one is how that was found.
        (spec.requiresMedia ? ' A post here must include one.' : ''),
    })
  }

  if (spec.maxHashtags) {
    rows.push({ term: 'Hashtags', detail: `Up to ${spec.maxHashtags} per post.` })
  }

  if (spec.perDayCap) {
    rows.push({
      term: 'Posts per day',
      detail: `${spec.perDayCap} to this channel.`,
    })
  }

  rows.push({
    term: 'How long the link lasts',
    // 60 days with no auto-refresh and no proactive warning from anyone (doc 13
    // §2.5). Said here because the alternative is a customer learning it from a
    // post that silently stopped going out.
    detail: 'About 60 days, then it needs reconnecting. Each account shows its own days left.',
  })

  return {
    label: entry.label,
    blurb: entry.blurb,
    rows,
    note:
      entry.readiness === 'built-not-proven'
        ? 'Sahoda has not yet seen a post from here arrive on the platform. Connecting works; the first live post is the proof.'
        : undefined,
  }
}

/**
 * The slot row, which is the whole reason this panel exists on a screen about
 * limits: it is where "a plan sells slots, and a slot holds one account" is said
 * in full, next to how many this channel is using.
 */
function slotRow(connectedCount: number): DetailRow {
  if (connectedCount === 0) {
    return {
      term: 'Slots used here',
      detail: 'None. Connecting an account uses one slot from your plan.',
    }
  }
  return {
    term: 'Slots used here',
    detail:
      connectedCount === 1
        ? '1 account, using 1 slot. You can connect more of them while your plan has room.'
        : `${connectedCount} accounts, using ${connectedCount} slots. Each one counts separately.`,
  }
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
