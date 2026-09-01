import type { PostMedia } from '@sahoda/shared'

/**
 * Which of THREE answers the posts page got when it asked about photos.
 *
 * ── WHY THIS IS A MODULE AND NOT A COMPARISON IN THE PAGE ────────────────────
 * It was `mediaByPost === null`, written inline in a server component that no
 * test renders — `/posts` is an async component doing five reads, and there is
 * no page-level test anywhere in this repository. MEASURED: replacing that
 * comparison with a flat `false` — which silences the "couldn't check" line and
 * makes a FAILED read render identically to a page whose posts have no photos —
 * left all 972 tests in `src/components/posts` and `src/app` green.
 *
 * That is the exact confusion `media-peek.tsx` was written to prevent, one
 * level upstream, unguarded. It has already happened once at this seam: the
 * first version of `listPostMedia` returned an empty Map on failure and the
 * page could not tell the two apart at all. Moving the decision into a pure
 * function is what makes it testable, the same move `lib/inbox/emptiness.ts`
 * made for the eight kinds of nothing on the inbox.
 *
 * ── THE THREE ANSWERS, AND WHY NONE MAY COLLAPSE INTO ANOTHER ────────────────
 *
 *   unreadable   we asked and the read failed   say so once, for the page
 *   none         we asked; no post has a photo  say nothing at all
 *   some         we asked; here they are        the thumbnails
 *
 * `unreadable` and `none` are the pair that matters. Both render a page with no
 * thumbnails on it, and only one of them is a page where a writer can safely
 * conclude their post has no photo attached. Getting that wrong costs somebody
 * a duplicate upload of something already on the post.
 *
 * `none` and `some` are separated only so the caller cannot ask "is it not
 * unreadable" and get a boolean that answers a different question later.
 */
export type MediaReadState = 'unreadable' | 'none' | 'some'

/**
 * @param byPost What `listPostMedia` returned: a map, or `null` for a failed
 *   read. The null is the whole point — it is the only thing that distinguishes
 *   a failure from an honest empty, which is why `listPostMedia` returns
 *   `Map | null` rather than an empty map.
 */
export function mediaReadState(byPost: Map<string, PostMedia[]> | null): MediaReadState {
  if (byPost === null) return 'unreadable'
  // A map of empty arrays is still "no photos": the read succeeded and the
  // answer was nothing, which is a real answer and not a failure.
  for (const rows of byPost.values()) {
    if (rows.length > 0) return 'some'
  }
  return 'none'
}

/** Whether the page must say it could not check. The one caller-facing verb. */
export function mustSayPhotosUnreadable(byPost: Map<string, PostMedia[]> | null): boolean {
  return mediaReadState(byPost) === 'unreadable'
}
