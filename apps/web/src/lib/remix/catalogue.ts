import { CONSTRAINTS, type Channel, type RemixKind } from '@sahoda/shared'
import { defaultFormatFor, formatsFor, type PostFormat } from '@sahoda/publishing/format'

/**
 * WHAT REMIX CAN ACTUALLY MAKE — and, beside it, what it cannot and why.
 *
 * ── EVERY DERIVATIVE NAMES A CHANNEL AND A FORMAT THAT EXIST ─────────────────
 * The roadmap drawing offered six outputs: posts, a carousel outline, a reel
 * script, an email, a blog outline and a WhatsApp broadcast. Four of those six
 * cannot be produced by this codebase today, and shipping them as buttons would
 * be the fake-success state this product refuses. So this file has two halves
 * and they are the same length on purpose:
 *
 *   BUILT     — four kinds, each backed by a mesh task that exists, targeting a
 *               channel from `ChannelSchema` at a format `formatsFor` offers.
 *   MISSING   — six things, each naming the ONE thing it needs, by name.
 *
 * The format list is not restated here. It is DERIVED per channel from
 * `formatsFor`, which is itself derived from the frozen Constraint Engine — so a
 * channel that gains a video mime, or a format the vocabulary widens to include,
 * changes what Remix offers with nothing here to remember.
 *
 * ── THE MESH CONTRACT IS FROZEN AT rewrite | shorten | hookify ───────────────
 * `CaptionRewriteInputSchema.instruction` is those three strings and nothing
 * else, and `content_variants` is the only other task a derivative could use.
 * That is the whole budget, and the four built kinds spend it exactly:
 *
 *   adaptation → content_variants   short → shorten
 *   hook       → hookify            thread → rewrite, then the existing splitter
 *
 * A fifth kind would need a fifth task. `MISSING` below is where those are
 * written down, with the task name the mesh would have to gain.
 */

/**
 * ── ONE KIND IS ONE MODEL CALL, AND THAT IS WHAT THE MONEY IS MADE OF ───────
 * None of the four tasks takes a channel. `content_variants` takes a channel
 * LIST and answers for all of them in one call; `caption_rewrite`'s input is
 * `{text, instruction, selection?}` and has no channel field at all — the mesh
 * contract is frozen, so a per-channel `shorten` is not something this code can
 * ask for even if it wanted to.
 *
 * So a kind costs ONE call however many channels it covers, and adding a
 * channel adds a draft rather than a credit. `lib/remix/cost.ts` prices it that
 * way and the screen says so out loud, because a trim control whose numbers do
 * not move when you use it is a control that lies.
 */

/** Every channel the product publishes to. Read from the enum, never listed. */
export const REMIX_CHANNELS: readonly Channel[] = ['x', 'gbp', 'linkedin', 'instagram']

export interface RemixKindSpec {
  readonly kind: RemixKind
  /** What the person picking it sees. */
  readonly label: string
  /** One sentence on what this derivative IS. Present tense, no promises. */
  readonly what: string
  /**
   * The mesh task, named as the mesh names it. Read by the runner through
   * `MESH_TASK_ACTION`, so the price key and the task cannot drift apart.
   */
  readonly meshTask: 'content_variants' | 'caption_rewrite'
}

/**
 * The four kinds, in the order they are offered.
 *
 * `adaptation` first because it is the one everybody wants; `thread` last
 * because it is the one channel-specific one.
 */
export const REMIX_KINDS: readonly RemixKindSpec[] = [
  {
    kind: 'adaptation',
    label: 'One post per channel',
    what: 'The same idea said the way each channel wants to hear it, inside its own limits.',
    meshTask: 'content_variants',
  },
  {
    kind: 'short',
    label: 'A short version',
    what: 'Tighter, for the channels and the readers that will not sit through the long one.',
    meshTask: 'caption_rewrite',
  },
  {
    // NAMED FOR WHAT hookify DOES. The directive is "rework the opening into a
    // strong, scroll-stopping hook; KEEP THE REST INTACT" — a whole post with a
    // new opening, not a standalone one-line hook. The drawing promised "three
    // short hooks"; that would have been a name the task does not deliver.
    kind: 'hook',
    label: 'A version that opens harder',
    what: 'The same post with its first line rewritten to stop a thumb. The rest is untouched.',
    meshTask: 'caption_rewrite',
  },
  {
    kind: 'thread',
    label: 'An X thread',
    what: 'The long argument split across posts, at X’s real limit, in order.',
    meshTask: 'caption_rewrite',
  },
]

/**
 * The format a kind declares on a given channel — or null when that channel
 * cannot carry it.
 *
 * `thread` is the only kind with a channel of its own, and it is not tabulated
 * here either: `formatsFor` is asked whether the channel offers `thread`, which
 * is true for exactly the channels `CHANNEL_FORMATS` names. A second list would
 * go stale the day X stopped being the only one.
 *
 * The other three take the channel's OPENING format — `text` where a channel can
 * publish words alone, `image` where it cannot. That is `defaultFormatFor`, the
 * same function the composer uses when the writer adds a channel card, so a
 * Remix draft and a hand-written draft are the same kind of row.
 */
export function formatForKind(kind: RemixKind, channel: Channel): PostFormat | null {
  const spec = CONSTRAINTS[channel]
  const offered = formatsFor(spec)
  if (kind === 'thread') return offered.includes('thread') ? 'thread' : null
  const opening = defaultFormatFor(spec)
  return offered.includes(opening) ? opening : null
}

/** Which channels a kind can actually be produced for. Derived, never listed. */
export function channelsForKind(kind: RemixKind): Channel[] {
  return REMIX_CHANNELS.filter((channel) => formatForKind(kind, channel) !== null)
}

/**
 * Does this derivative need a photo attached before it can go out?
 *
 * Remix writes WORDS. A channel that cannot publish words alone — Instagram is
 * the only one — gets a draft at `image`, which is exactly the state
 * `generateVariants` already produces for it today. Saying so on the screen is
 * the difference between a draft and a dead end.
 */
export function needsAPhoto(kind: RemixKind, channel: Channel): boolean {
  const format = formatForKind(kind, channel)
  return format !== null && format !== 'text' && format !== 'thread'
}

export interface MissingKind {
  /** What the roadmap drawing promised. Kept verbatim so nothing quietly vanishes. */
  readonly label: string
  /**
   * What the customer reads, after the page's "Needs ". A capability that has
   * to exist first, in their words: no task names, no file names, no dashes.
   * `catalogue.test.ts` scans every one for all three.
   */
  readonly needs: string
  /**
   * INTERNAL. The mesh task that would have to exist first, named as the mesh
   * would name it, or null where what is missing is not a task. Never rendered:
   * it is here so the "a missing entry naming a task the mesh already has"
   * guard has something exact to read.
   */
  readonly meshTask: string | null
}

/**
 * WHAT REMIX STILL CANNOT MAKE, and the one thing each one needs.
 *
 * Every entry here was on the roadmap screen as a card. None of them is dropped
 * — a promise that disappears is worse than one that is still outstanding —
 * and none of them is a button.
 *
 * ── THE ENGINEERING FACTS, KEPT OUT OF THE CUSTOMER'S SENTENCE ───────────────
 *   carousel  needs a mesh task `carousel_outline` (none returns slides), and
 *             the carousel format needs two or more photos to publish.
 *   reel      needs a mesh task `video_script`; `pricing.config.json` already
 *             prices it. No channel in the Constraint Engine declares a video
 *             mime, so nothing could publish the result either.
 *   quote     `image_generate` exists and writes one picture for one post;
 *             binding it to a derivative inside a batch is the work.
 *   email     no channel. `ChannelSchema` is x | gbp | linkedin | instagram.
 *   blog      needs a mesh task `seo_article`; priced, not written. And there
 *             is no surface to publish an article to.
 *   whatsapp  no channel, same enum.
 */
export const MISSING_KINDS: readonly MissingKind[] = [
  {
    label: 'A carousel outline',
    needs:
      'Sahoda to learn how to write slides, which it cannot do yet. A carousel also needs two ' +
      'or more photos before it can be published, so an outline in words could not go out as ' +
      'one even once it was written.',
    meshTask: 'carousel_outline',
  },
  {
    label: 'A reel script',
    needs:
      'Sahoda to learn how to write for video. The price of a reel script is already set and ' +
      'the writing is not built yet. Sahoda also cannot publish a video to any of its four ' +
      'channels, so nothing could carry the result.',
    meshTask: 'video_script',
  },
  {
    label: 'A quote card',
    needs:
      'the picture maker joined to a batch. Sahoda can already make one picture for one post. ' +
      'Making pictures as part of a batch is the work still to do.',
    meshTask: null,
  },
  {
    label: 'An email',
    needs: 'somewhere to send it. Sahoda publishes to four channels and email is not one.',
    meshTask: null,
  },
  {
    label: 'A blog outline',
    needs:
      'Sahoda to learn how to write a long article, and somewhere to put it. The price of one ' +
      'is already set, the writing is not built yet, and Sahoda has no blog to publish to.',
    meshTask: 'seo_article',
  },
  {
    label: 'A WhatsApp broadcast',
    needs: 'WhatsApp as a channel. It is not one of the four.',
    meshTask: null,
  },
]
