'use client'

import { useState } from 'react'
import { CONSTRAINTS, normalizeHashtags, type Channel } from '@sahoda/shared'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { NotBuiltYet } from './not-built-yet'

export interface HashtagFieldProps {
  channel: Channel
  label: string
  hashtags: string[] | undefined
  onChange: (hashtags: string[] | undefined) => void
}

/**
 * The hashtags for ONE channel — a box that has never existed.
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
export function HashtagField({ channel, label, hashtags, onChange }: HashtagFieldProps) {
  const spec = CONSTRAINTS[channel]
  /**
   * What the writer is typing, kept separately from the stored list.
   *
   * Round-tripping every keystroke through `normalizeHashtags` would fight the
   * writer: typing a space to start the next tag would re-render the box with
   * the space stripped, and a duplicate would vanish mid-word. So the raw text
   * is local and the normalised list is what is stored.
   */
  const [raw, setRaw] = useState(() => (hashtags ?? []).join(' '))
  const tags = normalizeHashtags(raw.split(/[\s,]+/))
  const over = spec.maxHashtags !== undefined && tags.length > spec.maxHashtags

  // Google Business posts are local business updates. `formatForPlatform`
  // deliberately drops hashtags for gbp, so a box here would collect text that
  // is thrown away before it reaches Google — a dead end with extra steps.
  if (channel === 'gbp') {
    return (
      <NotBuiltYet>
        Hashtags do nothing on a Google Business post, so Sahoda leaves them off this one.
      </NotBuiltYet>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={`hashtags-${channel}`}>Hashtags</Label>
        {spec.maxHashtags !== undefined ? (
          <span
            className={over ? 'text-[12px] font-semibold text-danger' : 'text-[12px] text-muted'}
          >
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
        placeholder="#chai #pune"
        onChange={(event) => {
          setRaw(event.target.value)
          const next = normalizeHashtags(event.target.value.split(/[\s,]+/))
          // `undefined`, not `[]`, when the box is empty: the stored shape has
          // always meant "this channel has no tags" by absence, and writing an
          // empty array would change what every reader of `extras` sees.
          onChange(next.length === 0 ? undefined : next)
        }}
      />
      <p className="text-[12.5px] text-muted">
        {tags.length === 0
          ? `They are published at the end of the ${label} copy, and count towards its limit.`
          : `Published at the end, and already counted in the ${label} limit above.`}
      </p>
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
