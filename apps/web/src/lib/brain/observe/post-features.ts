/**
 * WHAT A CAPTION IS, AS NUMBERS — the join key between text and outcome.
 *
 * ── WHY THESE ARE DERIVED AND NOT STORED ─────────────────────────────────────
 * docs/55 step 3 says "content attributes at publish time", meaning a column
 * written when a post goes out. Deriving them from the caption instead is
 * strictly better here and the reason is arithmetic: there are 165 posts in
 * production and 5 published ones. A stored attribute starts empty and becomes
 * useful only for posts published after it ships, so the first comparison would
 * be possible some months from now. A derived one works on every post that
 * already exists, today.
 *
 * It also cannot drift. A stored feature and the text it describes are two
 * facts that must be kept in step by whoever edits the caption next; a derived
 * one is the same fact read twice.
 *
 * ── THE COST, STATED ─────────────────────────────────────────────────────────
 * These describe the caption AS IT STANDS, not as it was published. A caption
 * edited after publication changes its own history here. `readPublishedPosts`
 * already accepts exactly this trade for `tone_drift`, which measures current
 * text too, so this is the codebase's existing call rather than a new one. If
 * that ever becomes wrong it becomes wrong for both at once.
 */

/** Everything about a caption that is a number rather than a meaning. */
export interface PostFeatures {
  /** Characters, trimmed. The one attribute every post has. */
  length: number
  /**
   * Whether the first sentence asks something.
   *
   * MEASURED in production 2026-08-26: 0 of 53 stored captions open with a
   * question. Extracted anyway because it is the attribute docs/53's first
   * moment is written around, and because a feature that matches nothing today
   * is how you find out that nobody is trying it.
   */
  opensWithQuestion: boolean
  /** How many hashtags the caption carries. */
  hashtagCount: number
}

/**
 * A question OPENER, not a question anywhere.
 *
 * The claim being built on this is about how a caption starts, so a `?` in the
 * last line does not count. The first sentence is everything up to the first
 * terminator; if that run contains a `?` the caption opens by asking.
 */
export function opensWithQuestion(body: string): boolean {
  const firstSentence = body.trim().split(/(?<=[.!?])\s/)[0] ?? ''
  return firstSentence.includes('?')
}

/**
 * Hashtags, counted once each.
 *
 * `#` inside a word (`c#`, a colour like `#fff`) is not a hashtag, so the match
 * requires a boundary before it and a letter first. Deduplicated because
 * repeating a tag is a typo rather than two tags.
 */
export function hashtagCount(body: string): number {
  const matches = body.match(/(?:^|\s)#[A-Za-z][\w]*/g) ?? []
  return new Set(matches.map((m) => m.trim().toLowerCase())).size
}

export function featuresOf(body: string): PostFeatures {
  return {
    length: body.trim().length,
    opensWithQuestion: opensWithQuestion(body),
    hashtagCount: hashtagCount(body),
  }
}
