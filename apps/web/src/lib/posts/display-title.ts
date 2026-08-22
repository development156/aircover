/**
 * What a post card calls a post.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `title` is optional everywhere it is written — the composer's "Name this post"
 * field is never required, and nothing that drafts a post fills it in. So a real
 * workspace ends up with a list of rows all reading "Untitled post", including
 * two drafts whose bodies differ. The list stops identifying anything.
 *
 * The row already holds the answer: the body's first line is what the author
 * wrote first, and it is the only text on the row that distinguishes one draft
 * from another. So a card falls back to it — and says WHICH of the three cases
 * it is in, because a derived heading is the post's own words and must not be
 * styled like the placeholder that means "we have nothing".
 *
 * Nothing here writes to `posts.title`. A derived heading is a rendering
 * decision, re-derived on every read; naming the post stays the author's.
 */

const TITLE_MAX_CHARS = 60

export type TitleSource = 'given' | 'derived' | 'none'

export interface DisplayTitle {
  readonly text: string
  /**
   * `given` — the author named it. `derived` — the body's first line.
   * `none` — the row has neither, and the placeholder is the honest answer.
   */
  readonly source: TitleSource
}

/**
 * The first non-blank line of the body, capped by CODE POINT.
 *
 * Code points, not UTF-16 units — the same reason `excerptOf` gives: a plain
 * `.slice()` cuts an emoji between its surrogates and renders a replacement
 * character.
 */
export function firstLineOf(body: string | null): string | null {
  const line = (body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return null
  const chars = Array.from(line)
  if (chars.length <= TITLE_MAX_CHARS) return line
  return `${chars.slice(0, TITLE_MAX_CHARS).join('').trimEnd()}…`
}

/**
 * Everything after the line `firstLineOf` took, so a card never prints it twice.
 *
 * Returns `''` — not `null` — for a body whose only line was promoted. The two
 * are different facts: `null` means there was no body at all, `''` means the
 * body is entirely in the heading. A caller that collapses them prints "No
 * content written yet." over a post that has content.
 */
export function bodyAfterFirstLine(body: string | null): string | null {
  const lines = (body ?? '').split('\n')
  const at = lines.findIndex((l) => l.trim().length > 0)
  return at < 0 ? null : lines.slice(at + 1).join('\n')
}

export function displayTitleOf(post: { title: string | null; body: string | null }): DisplayTitle {
  const given = post.title?.trim()
  if (given) return { text: given, source: 'given' }
  const derived = firstLineOf(post.body)
  if (derived) return { text: derived, source: 'derived' }
  return { text: 'Untitled post', source: 'none' }
}
