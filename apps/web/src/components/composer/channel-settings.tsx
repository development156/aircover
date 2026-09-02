'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import { cn } from '@/lib/utils'
import type { VariantExtras } from '@/lib/posts/variant-extras'

/**
 * THE PER-CHANNEL SETTINGS, FOLDED AWAY UNTIL THEY ARE WANTED.
 *
 * ── THE COUNT THIS EXISTS TO BRING DOWN ──────────────────────────────────────
 * A version card for a channel nobody has typed into still rendered ten separate
 * blocks: heading, state, editor, meter, hashtags with its help line, the rewrite
 * affordance, the kind of post with its own help line, the channel's extras, the
 * relink control and a Save button with a note beside it. At four channels that is
 * roughly forty controls competing at once for a writer who has not finished their
 * first sentence.
 *
 * Every one of those blocks is individually correct and its own comment argues for
 * it. That is precisely the founder's verdict on v4 repeating itself: "every one an
 * individually defensible decision nobody weighed against its neighbours."
 * Hierarchy is the only property that cannot be checked one element at a time.
 *
 * ── WHY THESE SIX AND NOT THE EDITOR OR THE KIND OF POST ─────────────────────
 * What folds away is what a writer sets ONCE and rarely: Google's button and its
 * topic, the poll, the first comment, the co-author and the AI label. What stays
 * out is what they touch every time: the words, the meter, the hashtags, and the
 * kind of post, which changes the media rules on the card and so has to be visible
 * where its consequences are.
 *
 * ── AND IT NEVER HIDES SOMETHING THAT IS SET ─────────────────────────────────
 * A fold that swallows a poll somebody built would be worse than the noise it
 * removes. So it opens itself whenever any of these carries a value, and the
 * summary names what is set even when closed. The writer decides after that: once
 * they open or close it by hand, their choice stands.
 *
 * ── A `<details>`, NOT A HAND-BUILT ACCORDION ────────────────────────────────
 * It is keyboard-operable, announced as a disclosure, and findable by the
 * browser's own in-page search when closed. A div with an onClick is none of
 * those. The product register's rule is earned familiarity: standard affordances
 * for standard tasks.
 *
 * THIS IS NOT A TAB STRIP AND NOT A WIZARD STEP. Every channel's card, editor and
 * meter stay on the page together, which is the one thing this product does that
 * its competitors do not. Only the settings inside a card fold.
 */

export interface ChannelSettingsProps {
  channel: Channel
  format: PostFormat | null
  extras: VariantExtras
  children: React.ReactNode
}

/**
 * The names of the settings carrying a value, in the words the card uses.
 *
 * Read off `extras` rather than tracked separately, so a value that arrives from a
 * generated variant counts the same as one somebody typed. `hashtags` is
 * deliberately absent: it has its own always-visible field on the card, and naming
 * it here would report it in two places.
 */
export function settingsInUse(
  channel: Channel,
  format: PostFormat | null,
  extras: VariantExtras,
): string[] {
  const names: string[] = []
  if (extras.gbpCta !== undefined && extras.gbpCta !== '') names.push('Button')
  if (extras.gbpTopic !== undefined) names.push('Kind of Google post')
  if (extras.poll !== undefined) names.push('Poll')
  if (extras.firstComment !== undefined && extras.firstComment !== '') names.push('First comment')
  // Not `!== undefined`: emptying the box stores an empty array rather than
  // removing the key, and an empty list of co-authors is nobody.
  if ((extras.collaborators ?? []).length > 0) names.push('Co-author')
  if (extras.aiGenerated === true) names.push('AI label')
  // `format` is not reported here. It has its own visible control, and the one
  // thing this summary must not do is repeat what is already on the card.
  void channel
  void format
  return names
}

export function ChannelSettings({ channel, format, extras, children }: ChannelSettingsProps) {
  const inUse = settingsInUse(channel, format, extras)
  /**
   * Null until the writer opens or closes it themselves, and their choice wins
   * from then on. Before that the fold answers to the content: anything set and it
   * is open, because a setting nobody can see is worse than a card that is tall.
   */
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? inUse.length > 0

  return (
    <details
      open={open}
      data-channel-settings={channel}
      onToggle={(event) => setChosen(event.currentTarget.open)}
      // A nested surface takes a SMALLER radius than the card holding it —
      // docs/37 §5. `bg-s2` rather than `bg-s1`, because `--s1` IS `--canvas` and
      // a panel painted in the canvas colour separates nothing from it.
      className="narrow:col-span-2 rounded-sm bg-s2 surface-ring-firm"
    >
      <summary
        // `list-none` plus the marker rule removes the browser's default triangle
        // in both engines; the chevron below is the one that rotates.
        className="type-sm marker:hidden flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-[550] text-ink transition-micro outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)] max-narrow:min-h-[44px]"
      >
        <ChevronRight
          size={14}
          aria-hidden
          className={cn('shrink-0 text-muted transition-micro', open && 'rotate-90')}
        />
        <span>More settings</span>
        {/* What is set, named while the fold is shut. Without this the summary
            would be a lid over state the writer cannot see, which is the defect
            the fold was supposed to remove rather than create. */}
        {inUse.length > 0 ? (
          <span className="type-meta truncate text-muted">{inUse.join(', ')}</span>
        ) : null}
      </summary>

      <div className="grid gap-3 px-3 pt-1 pb-3 narrow:grid-cols-2">{children}</div>
    </details>
  )
}
