import { CONSTRAINTS, type Channel, type PostMedia } from '@sahoda/shared'
import { refuseFormat, refuseFormatMedia, type PostFormat } from '@sahoda/publishing/format'

import { hasLink } from '@/lib/posts/detect-link'
import { meterFor, withFormat } from '@/lib/posts/counters'
import { asThread, previewThread, type ThreadPreview } from '@/lib/posts/thread-preview'

/**
 * EVERY VERDICT ON ONE CHANNEL'S VERSION, ASKED IN THE ORDER THE PUBLISHER ASKS
 * THEM.
 *
 * Extracted from `version-card.tsx` so the card is a card. Nothing here counts a
 * character or decides a rule: `meterFor` is the frozen Constraint Engine in
 * `@sahoda/shared`, so the meter a writer watches and the rule the adapter
 * enforces cannot drift.
 */
export interface VersionVerdict {
  meter: ReturnType<typeof meterFor>
  /** Null for every version that is not a thread — an absent plan cannot be rendered by accident. */
  thread: ThreadPreview | null
}

export function versionVerdict(
  channel: Channel,
  body: string,
  hashtags: string[] | undefined,
  format: PostFormat | null,
  /**
   * The ROWS, not a count, and that is the fix for a real fake-green: attach a
   * landscape photo while the card says "One photo" (legal — it is inside
   * Instagram's feed range), then change the card to "A story". Attach-time
   * validation has already run and never runs again, so the card stayed green on
   * a payload Instagram refuses. `post_media` carries `width` and `height`, so
   * the answer was one component away the whole time.
   *
   * Publishing genuinely cannot make this check — `PublishRequestMedia` has no
   * pixels — which is exactly why the editor must not be the only place it could
   * have been made and wasn't.
   */
  media: readonly PostMedia[],
  /**
   * Whether the keyword tail wears brackets. Threaded through because it changes
   * the LENGTH of what publishes — `[chai] [pune]` is four characters longer
   * than `chai pune` — so a meter that ignored it would read short on every post
   * whose writer unticked the box.
   */
  keywordBrackets = true,
): VersionVerdict {
  const spec = CONSTRAINTS[channel]

  /**
   * THE FORMAT'S SHAPE RULE, RE-RUN WHENEVER THE FORMAT CHANGES.
   *
   * `decideAttach` checks a file against the format in force AT ATTACH TIME.
   * Changing the format afterwards changes the rule, and nothing re-ran it. This
   * scores the files already on the post against the format on THIS card, so the
   * verdict follows the choice rather than the upload.
   *
   * First offender only: four cards each listing the same three bad photos is
   * the wall of text docs/27 §1 is about, and one sentence is enough to send the
   * writer to the media well.
   */
  const shapeRefusal =
    media
      .map((row) =>
        refuseFormatMedia(spec, format, {
          ...(row.width === null ? {} : { width: row.width }),
          ...(row.height === null ? {} : { height: row.height }),
        }),
      )
      .find((refusal) => refusal !== null) ?? null

  const draft = {
    body,
    hashtags,
    hasLink: hasLink(body),
    mediaCount: media.length,
    keywordBrackets,
  }
  const thread = previewThread(channel, draft, format === 'thread')

  /**
   * `asThread` is OUTERMOST because it is the one that removes a rule rather
   * than adding one: for a thread the whole-body character limit is the wrong
   * question, and it must come out after everything that could have added to it.
   * It removes exactly MAX_CHARS and nothing else, the same single swap
   * `runPublishPost` makes — so a thread with too many hashtags is still red.
   */
  const meter = asThread(
    withFormat(
      withFormat(meterFor(channel, draft), refuseFormat(spec, format, media.length)),
      shapeRefusal,
    ),
    thread,
  )

  return { meter, thread }
}
