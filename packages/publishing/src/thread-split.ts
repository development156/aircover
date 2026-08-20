/**
 * ONE BODY, SPLIT INTO THE POSTS X WILL ACTUALLY PUBLISH.
 *
 * ── WHY SPLITTING AND NOT A SEGMENT EDITOR ───────────────────────────────────
 * A thread could have been built as a list of separately-authored boxes. It is
 * not, and the reason is the one rule this product does not bend: ONE BODY PER
 * CHANNEL. The X version has a body; a thread is what that body LOOKS LIKE when
 * it is longer than 280 characters. Nothing new is authored and nothing new is
 * stored.
 *
 * That choice pays for itself immediately, in the place docs/31 §6.2 said threads
 * could not go:
 *
 *   **THE REFUSAL GATE ALREADY READS EVERY SEGMENT.** The gate checks
 *   `publishedTextOf(formatForPlatform(spec, draft))` — the whole formatted body
 *   including the hashtag tail. Every segment is a SUBSTRING of that string, so a
 *   red line written into segment three was in front of the classifier all along.
 *   Had segments been authored separately they would have been new text the gate
 *   never saw, which is exactly the blocker §6.2 described. `thread-split.test.ts`
 *   asserts the covering property rather than assuming it, and
 *   `runPublishPost.test.ts` puts a banned line in the LAST segment and requires
 *   the gate to block.
 *
 * ── WHAT ZERNIO MEASURED, AND WHAT IT DID NOT ────────────────────────────────
 * MEASURED 2026-08-20 against `POST /v1/tools/validate/post` (docs/32 §4.1):
 *
 *   · A 400-character SEGMENT passes their dry run. Zernio does NOT apply X's 280
 *     per segment — so if we do not, nobody does, and X refuses the publish.
 *   · The root `content` IS still measured against 280, even though their own
 *     spec says it "is NOT published" when `threadItems` is present. So the long
 *     body cannot be parked at the root: it has to be a segment-sized string.
 *     Sending `threadItems[0].content` there is valid and is what this builds.
 *   · An empty or non-string segment `content` is refused by name.
 *
 * ── NO IMPORTS, AND THAT IS STRUCTURAL ───────────────────────────────────────
 * Like `format-vocabulary`, this is reachable from the browser leaf
 * `@sahoda/publishing/format`, which a `'use client'` component imports. The
 * limit arrives as a NUMBER rather than as a `PlatformSpec` so that nothing here
 * has to reach for the Constraint Engine at all. Effective-length rules that need
 * the engine — X's flat 23-character weight for a link — belong to the caller,
 * which is why `threadLimitFor` is a separate export that takes the number it
 * needs and no more.
 */

/**
 * Code points, not UTF-16 units.
 *
 * `'👍'.length` is 2 and X counts it as 1... actually as 2, but an emoji built
 * from a ZWJ sequence is counted very differently again, and no counter outside
 * X gets every case right. The engine has always counted code points
 * (`Array.from(body).length` in `charCountFor`) and this MUST agree with it: two
 * counters that disagree produce a preview showing four segments and a publish
 * producing five.
 */
export function countCodePoints(text: string): number {
  return Array.from(text).length
}

/**
 * How much room a segment really has, once the channel's flat link weight is paid.
 *
 * ── THE 23 IS NOT THE URL'S LENGTH ───────────────────────────────────────────
 * `charCountFor` adds a flat 23 for a variant with a link ON TOP of the URL's own
 * characters, which is stricter than X — X substitutes 23 for the whole URL. That
 * over-strictness is the frozen engine's and this deliberately inherits it rather
 * than inventing a second, laxer count: a segment that fits here fits on X, and
 * the reverse would be a preview that promises a publish X refuses.
 *
 * `hasLink` is a property of the WHOLE variant, not of one segment — the frozen
 * `VariantDraft` has nowhere to say which segment holds the link. So the weight
 * is charged to EVERY segment, which is the conservative reading and the only one
 * available without changing a frozen type. Recorded rather than hidden: it costs
 * a link-bearing thread 23 characters per segment it does not really owe.
 */
export function threadLimitFor(maxChars: number, hasLink: boolean, linkWeight: number): number {
  return hasLink ? maxChars - linkWeight : maxChars
}

/**
 * Where a break is allowed to fall, best first. Each is tried across the window.
 *
 * ── A MATCH HAS TWO HALVES AND CONFLATING THEM DELETED PUNCTUATION ───────────
 * The sentence pattern matches the full stop AND the space after it. The full
 * stop belongs to the segment that ends; the space belongs to nobody. Cutting at
 * `match.index` for both dropped every terminal `.`, `!` and `?` in the thread —
 * "Open today. Come by." published as "Open today" / "Come by". It was NOT caught
 * by "does every segment fit", because a shorter segment fits fine; it was caught
 * by the covering-property test, which is why that test is written as a property
 * over many bodies rather than as one example.
 *
 * So each entry keeps its non-whitespace head and discards its whitespace tail.
 */
const BREAKPOINTS: readonly RegExp[] = [
  // A blank line — the writer's own paragraph break, and the only one they chose.
  /\n\s*\n/g,
  // The end of a sentence, including the closing quote or bracket that follows it.
  /[.!?…]["'”’)\]]*\s+/g,
  // A single newline.
  /\n/g,
  // Any whitespace — a word boundary.
  /\s+/g,
]

/** How much of a breakpoint match belongs to the segment ENDING at it. */
function keptLength(match: string): number {
  const trailing = /\s+$/.exec(match)
  return match.length - (trailing === null ? 0 : trailing[0].length)
}

/**
 * A regex offset is UTF-16; this file slices CODE POINTS. Convert, always.
 *
 * ── THE SECOND BUG THE COVERING TEST FOUND ──────────────────────────────────
 * `RegExpExecArray.index` counts UTF-16 units, and every astral character — an
 * emoji, a ZWJ family sequence, most of the rarer scripts — is two of them and
 * one code point. Using that offset directly against the code-point array cuts
 * one position further right for every astral character earlier in the window, so
 * a body reading "…family 👨‍👩‍👧‍👦 and more text…" published as "…and mor text…".
 * A letter, silently deleted, on a post that goes to a real audience.
 *
 * It cannot be caught by a length assertion — the segment is one character
 * SHORTER, which passes every "does it fit" check there is.
 */
function codePointIndex(text: string, utf16Index: number): number {
  return Array.from(text.slice(0, utf16Index)).length
}

/**
 * Split `text` into segments that each fit within `limit` code points.
 *
 * Deterministic, and total: EVERY input returns segments, including a single
 * unbroken 4,000-character word, which is hard-cut because the alternative is a
 * loop that never terminates or a thread that silently loses its tail.
 *
 * The empty string returns `[]` and not `['']` — Zernio refuses a segment whose
 * content is empty (MEASURED, docs/32 §4.1), so producing one would build a
 * payload we know to be invalid.
 */
export function splitIntoThread(text: string, limit: number): string[] {
  if (limit < 1) return []
  const trimmed = text.trim()
  if (trimmed === '') return []

  const segments: string[] = []
  let rest = trimmed

  while (rest !== '') {
    if (countCodePoints(rest) <= limit) {
      segments.push(rest)
      break
    }

    // The window is `limit + 1` code points so a break sitting exactly ON the
    // boundary is still a candidate: text[limit] being a space means the first
    // `limit` characters are a whole segment with nothing spilling over.
    const chars = Array.from(rest)
    const window = chars.slice(0, limit + 1).join('')

    let cut = -1
    let resumeAt = -1
    for (const pattern of BREAKPOINTS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      let best = -1
      let bestEnd = -1
      // The LAST candidate in the window, not the first: a segment should carry as
      // much as it legally can, or a 280-character limit produces a thread of
      // one-sentence tweets.
      while ((match = pattern.exec(window)) !== null) {
        const end = codePointIndex(window, match.index + keptLength(match[0]))
        // A break that keeps nothing would emit an empty segment and never advance.
        if (end === 0) continue
        best = end
        bestEnd = codePointIndex(window, match.index + match[0].length)
      }
      if (best > 0) {
        cut = best
        resumeAt = bestEnd
        break
      }
    }

    if (cut < 0) {
      // Nothing to break on inside the window: one very long token. Hard-cut it
      // at the limit. This is the case that makes the function total.
      cut = limit
      resumeAt = limit
    }

    // `cut`/`resumeAt` index the WINDOW, which is a code-point slice of `rest` —
    // so they must be applied to the code-point array, never to the string. On a
    // body containing an astral character (an emoji, most scripts' rarer letters)
    // a string slice at the same index lands mid-surrogate-pair and produces a
    // lone surrogate: a segment ending in U+FFFD on screen and on the platform.
    const head = chars.slice(0, cut).join('').trim()
    if (head !== '') segments.push(head)
    rest = chars.slice(resumeAt).join('').trim()
  }

  return segments
}

/** A segment together with what it costs, for a preview that shows both. */
export interface ThreadSegment {
  /** 1-based, because it is shown to a person as "3 of 7". */
  index: number
  text: string
  chars: number
  /** Over the per-segment limit. Only reachable for an unbreakable token. */
  overLimit: boolean
}

/**
 * The split, annotated for display.
 *
 * `overLimit` can only be true where `splitIntoThread` hard-cut an unbreakable
 * token, and even then the cut keeps it AT the limit — so it is a belt-and-braces
 * flag that the preview reads and the refusal re-derives independently. If it is
 * ever true, something changed in the splitter and the writer should be told
 * rather than have a thread refused at publish time by a rule they never saw.
 */
export function describeThread(text: string, limit: number): ThreadSegment[] {
  return splitIntoThread(text, limit).map((segment, i) => {
    const chars = countCodePoints(segment)
    return { index: i + 1, text: segment, chars, overLimit: chars > limit }
  })
}
