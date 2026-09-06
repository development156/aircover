'use client'

import { useState } from 'react'
import { CONSTRAINTS, normalizeKeywords, type Channel } from '@sahoda/shared'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseKeywordInput } from '@/lib/posts/keyword-input'

import { NotBuiltYet } from './not-built-yet'

export interface KeywordFieldProps {
  channel: Channel
  label: string
  /**
   * The stored list. Still `extras.hashtags` in the database and still named
   * that in the props, because renaming an untyped jsonb KEY would orphan every
   * production row that already carries one. Only the concept and the rendering
   * moved. See `normalizeKeywords`.
   */
  hashtags: string[] | undefined
  onChange: (hashtags: string[] | undefined) => void
  /** Whether the published tail wears brackets. Absent in storage means true. */
  brackets: boolean
  onBracketsChange: (brackets: boolean) => void
}

/**
 * The keywords for ONE channel.
 *
 * ── KEYWORDS, NOT HASHTAGS ───────────────────────────────────────────────────
 * Founder's ruling: "There are supposed to be keywords instead of hashtags in
 * the following format : [marketing]" (REQUESTS §34). The box, the placeholder,
 * the help text and the published tail all say `[marketing]` now.
 *
 * ── AND A KEYWORD MAY CONTAIN A SPACE ────────────────────────────────────────
 * That is what the brackets buy, and it is why this no longer splits on
 * whitespace. `#chai pune` is two hashtags; `[chai in pune]` is one keyword, and
 * it is what somebody searching actually types. `parseKeywordInput` separates on
 * commas, newlines and the brackets themselves.
 *
 * ── WHAT WAS MISSING ─────────────────────────────────────────────────────────
 * `extras.hashtags` is counted by the character meter, capped by
 * `spec.maxHashtags`, appended to the published body by `formatForPlatform`, and
 * carried all the way to the platform. The only thing that could ever put a value
 * in it was a generated variant. A writer could not type a hashtag anywhere in
 * this app — so Instagram's 30-tag limit was a rule about a field nobody could
 * fill, with a "Remove extra hashtags" fix-it button for a list they never wrote.
 *
 * ── ONE TEXT BOX, NOT A TAG WIDGET ───────────────────────────────────────────
 * People type hashtags the way they type them: `#chai #pune monsoon`. Splitting
 * on whitespace and commas and letting `normalizeHashtags` do the rest matches
 * that, needs no keyboard handling, and pastes correctly from anywhere. A chip
 * widget would be more to build and more to get wrong on a phone.
 *
 * ── AND THE NORMALISER IS THE ENGINE'S ───────────────────────────────────────
 * `normalizeHashtags` is exported from the frozen Constraint Engine and is what
 * the counter AND the formatter already use. Reimplementing "add the missing #,
 * drop duplicates" here is exactly how the number on screen and the string that
 * goes out would come to disagree — which they once did, for weeks.
 *
 * ── PER CHANNEL, BECAUSE THE RULES ARE ───────────────────────────────────────
 * Instagram caps at 30 and is where tags do most work; on Google Business they
 * do nothing at all and `formatForPlatform` drops them, which is why that card
 * says so rather than offering an empty promise.
 */
export function KeywordField({
  channel,
  label,
  hashtags,
  onChange,
  brackets,
  onBracketsChange,
}: KeywordFieldProps) {
  const spec = CONSTRAINTS[channel]
  /**
   * What the writer is typing, kept separately from the stored list.
   *
   * Round-tripping every keystroke through `normalizeHashtags` would fight the
   * writer: typing a space to start the next tag would re-render the box with
   * the space stripped, and a duplicate would vanish mid-word. So the raw text
   * is local and the normalised list is what is stored.
   */
  /**
   * ── THE BOX SHOWS WHAT WILL GO OUT ─────────────────────────────────────────
   * It used to always show brackets whatever was published, on the reasoning
   * that the line beneath states the published form separately. The founder read
   * that as the box and the post disagreeing: "when the box is tiked the square
   * bracket is applies on the above bar also". Right — a box that says `[cat]`
   * while a post says `cat` is two answers to one question.
   *
   * SETTLED ON BLUR, NOT ON EVERY KEYSTROKE. Rewriting the text as it is typed
   * moves the caret out from under the writer: `cat` would become `[c]at` on the
   * first character. So the raw text stays raw while the field has focus, and
   * takes its published shape the moment focus leaves or the tick box moves.
   */
  const settled = (list: readonly string[]): string =>
    // Space-separated with brackets, because `[chai in pune] [monsoon]` already
    // shows where each one ends. Comma-separated WITHOUT them, because
    // `chai in pune monsoon` does not, and the box has to be re-readable.
    brackets ? list.join(' ') : list.join(', ')

  const [raw, setRaw] = useState(() => settled(normalizeKeywords(hashtags, brackets)))
  const tags = normalizeKeywords(parseKeywordInput(raw))
  /** What actually goes out, which is the only string the reader needs pinned. */
  const published = normalizeKeywords(parseKeywordInput(raw), brackets)
  const over = spec.maxHashtags !== undefined && tags.length > spec.maxHashtags

  /**
   * Ticking the box rewrites the box, immediately.
   *
   * Derived-state-during-render rather than an effect: an effect would paint the
   * old form for a frame, and on the one control whose entire job is showing the
   * reader what publishes, a frame of the wrong answer is the defect.
   */
  const [syncedBrackets, setSyncedBrackets] = useState(brackets)
  if (brackets !== syncedBrackets) {
    setSyncedBrackets(brackets)
    setRaw(settled(published))
  }

  /**
   * ── THE STORED LIST CAN CHANGE FROM OUTSIDE THE BOX ────────────────────────
   * `raw` is seeded once at mount and then owned by the writer, which is right
   * for typing. But generation ("Adapt for N channels") writes keywords straight
   * into `extras.hashtags`, and MEASURED live the body updated while this box
   * stayed empty: the prop changed and `raw` never heard about it. Same
   * derived-state-during-render shape as the bracket sync above.
   *
   * Guarded so it never resets the caret on the writer's OWN edit: a keystroke
   * flows raw → onChange → parent → back as `hashtags`, so the incoming list
   * already equals what the box holds. Adopt only when it DIFFERS — an external
   * write like generation, or a restored draft.
   */
  const storedKey = JSON.stringify(normalizeKeywords(hashtags))
  const [syncedStored, setSyncedStored] = useState(storedKey)
  if (storedKey !== syncedStored) {
    setSyncedStored(storedKey)
    if (storedKey !== JSON.stringify(tags)) setRaw(settled(normalizeKeywords(hashtags, brackets)))
  }

  // Google Business posts are local business updates. `formatForPlatform`
  // deliberately drops the tail for gbp, so a box here would collect text that is
  // thrown away before it reaches Google — a dead end with extra steps.
  //
  // UNCHANGED BY THE KEYWORD RULING, and worth saying why: the tail is dropped
  // for GBP whatever shape it takes, so the sentence is still true. It is now
  // about keywords rather than hashtags because that is what the box holds.
  if (channel === 'gbp') {
    return (
      <NotBuiltYet>
        A keyword list does nothing on a Google Business post, so Sahoda leaves it off this one.
      </NotBuiltYet>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={`hashtags-${channel}`}>Keywords</Label>
        {spec.maxHashtags !== undefined ? (
          <span className={over ? 'type-meta font-semibold text-danger' : 'type-meta text-muted'}>
            <span className="tabular-nums">{tags.length}</span>
            <span className="sr-only"> of </span>
            <span aria-hidden> / </span>
            <span className="tabular-nums">{spec.maxHashtags}</span>
          </span>
        ) : null}
      </div>
      <Input
        id={`hashtags-${channel}`}
        data-hashtags={channel}
        value={raw}
        error={over}
        placeholder="chai in pune, monsoon specials"
        onChange={(event) => {
          setRaw(event.target.value)
          const next = normalizeKeywords(parseKeywordInput(event.target.value))
          // `undefined`, not `[]`, when the box is empty: the stored shape has
          // always meant "this channel has no tags" by absence, and writing an
          // empty array would change what every reader of `extras` sees.
          onChange(next.length === 0 ? undefined : next)
        }}
        onBlur={() => setRaw(settled(published))}
      />
      {/* SHOWS THE EXACT PUBLISHED FORM, because that is the whole question the
          founder's ruling raises. `[chai] [pune]` reaches the platform literally,
          so the reader sees the literal string before pressing Send rather than
          discovering it on a live account. Separated by commas as typed; shown in
          brackets as published. */}
      <p className="type-sm text-muted">
        {tags.length === 0
          ? `Separate them with commas. They are published at the end of the ${label} copy${brackets ? ' as [keyword]' : ''}, and count towards its limit.`
          : `Published at the end as ${published.join(' ')}, and already counted in the ${label} limit above.`}
      </p>

      {/* ── THE BRACKETS ARE A CHOICE ─────────────────────────────────────────
          Founder's ruling, REQUESTS §35. The original brief asked for the
          `[marketing]` format and never said whether it reaches the platform, so
          §34 shipped it literally and made the consequence visible. This is the
          answer: the writer decides, per channel, and the line above always
          states the exact string that will go out either way.

          Ticked is the DEFAULT and absence means ticked — every row written
          since §34 publishes with brackets, and making absence mean "off" would
          silently change what those posts put out. */}
      <label className="flex items-start gap-2 type-sm text-ink">
        <input
          type="checkbox"
          data-keyword-brackets={channel}
          checked={brackets}
          onChange={(event) => onBracketsChange(event.target.checked)}
          className="mt-icon-nudge size-4 shrink-0 accent-[var(--acc)]"
        />
        <span>
          Publish them in square brackets
          <span className="block type-meta text-muted">
            {brackets
              ? 'Followers see the brackets. Untick to publish the words on their own.'
              : 'Followers see the words on their own. Tick to publish them as [keyword].'}
          </span>
          {/* ── WHAT THE KEYWORDS DO, AND WHOSE CLAIM IT IS ──────────────────
              The founder asked for a line here saying this "helps in boosting
              the posts". Written as what is actually true rather than as that
              sentence: the BRACKETS boost nothing — they are punctuation, and
              no platform ranks on them. The KEYWORDS are the half that works,
              because a caption carrying the words somebody searches for is a
              caption search can match.

              No number, and no promise of reach. Sahoda measures neither, and
              "boosts your posts" is a figure no query produced. */}
          <span className="block type-meta text-muted">
            Keywords give people another way to find this post. The brackets only decide how they
            look.
          </span>
        </span>
      </label>
      {/* ── NO "cannot suggest hashtags" NOTE HERE, AND THAT IS DELIBERATE ──
          It was here, and MEASURED in a 1440 screenshot it printed the same
          paragraph on every version card — four identical apologies on one
          screen with four channels selected. docs/27 §1 counted six different
          ways of saying "nothing yet" on one screen and called it the problem;
          repeating ONE way six times is the same problem.

          It is said once, in the writing pane, alongside the other two AI
          things this screen cannot do. */}
    </div>
  )
}
