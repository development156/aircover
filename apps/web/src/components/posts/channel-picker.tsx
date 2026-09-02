'use client'

import { Check } from 'lucide-react'
import {
  ChannelSchema,
  CONSTRAINTS,
  toChannelSet,
  type Channel,
  type ChannelSet,
} from '@sahoda/shared'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { isOfferedForConnect } from '@/lib/connections/offer'

import { ChannelMark } from './channel-mark'
import { CHANNEL_LABELS } from './channel-label'

export interface ChannelPickerProps {
  selected: ChannelSet
  onChange: (channels: ChannelSet) => void
  disabled?: boolean
  /**
   * Channels with a live connection. A channel is still SELECTABLE without one —
   * drafting ahead of connecting is legitimate — but it is labelled, so the
   * decision is made with the fact visible rather than discovered at publish.
   */
  connected?: ReadonlySet<Channel>
  /** Hide the "Channels" label when the surrounding layout already says it. */
  hideLabel?: boolean
}

/**
 * Channel multi-select over the four `ChannelSchema` values. Selection order is
 * preserved from the schema so the tab strip does not reshuffle on every toggle.
 *
 * ── ONE PICKER, TWO SCREENS ──────────────────────────────────────────────────
 * The composer and the week planner ask the same question, so they use the same
 * control. The deleted create flow had a THIRD — a grid of tiles with the same
 * job and its own selection rules — and `data-channel-tile` is kept here so the
 * specs written against that grid keep pointing at the thing they mean.
 *
 * ── THE SELECTED STATE IS A WASH, NOT A FILL, AND THAT IS THE WHOLE POINT ────
 * This row previously painted the selected chip solid INK, on the reasoning
 * recorded in docs/26 §1.5: four chips sit here at once, so a solid ORANGE
 * selected state would paint up to four oranges on one screen. That reasoning
 * still holds and is not being overturned. What changed is that the state is
 * now carried by `--t50` (orange at 6%) plus a `--t300` ring plus a solid check
 * dot, and a wash is not a fill: `accent-budget.spec.ts` excludes `--brand-wash`
 * and `--brand-tint` by name because both "composite to a pale surface far
 * outside the saturation floor, and both are grounds rather than fills". So the
 * screen still has exactly ONE solid brand fill and it is the primary button
 * (docs/37 §16), while the chip finally reads as active rather than as inverted.
 *
 * IT SURVIVES GREYSCALE, which is the rule that actually binds here (docs/37 §9:
 * state is carried by fill weight, glyph and label, never by hue alone). Two
 * channels do the work with the colour removed: the ring goes 1px → 1.5px and
 * from `--line` to a materially darker value, and the check dot only exists when
 * the chip is on.
 */
export function ChannelPicker({
  selected,
  onChange,
  disabled,
  connected,
  hideLabel = false,
}: ChannelPickerProps) {
  function toggle(channel: Channel) {
    const next = selected.includes(channel)
      ? selected.filter((item) => item !== channel)
      : ChannelSchema.options.filter((item) => item === channel || selected.includes(item))
    // This is the ONE place the app builds a channel list from scratch rather than
    // reading one off a row, so it is where the set has to be re-established. Both
    // branches happen to be distinct already — they filter a distinct list — but
    // saying so through `toChannelSet` is what keeps `onChange` typed as a set all
    // the way to `savePost`, instead of a raw array re-entering at the picker.
    onChange(toChannelSet(next))
  }

  /**
   * The channels this picker OFFERS, which is not every channel the product
   * supports.
   *
   * ── REPORTED FROM THE SCREEN, AND IT IS THE SECOND HALF OF AN OLD FIX ──────
   * `/connections` stopped offering Telegram, TikTok and Slack. This picker
   * kept mapping over the whole `ChannelSchema`, so the composer went on
   * offering Telegram as somewhere a post could go — for an account nobody can
   * connect. Both screens ask "where should this go?" and only one of them had
   * been told the answer had changed.
   *
   * ── AND IT WITHHOLDS FROM THE OFFER ONLY, NEVER FROM A CHOICE ALREADY MADE ─
   * A post that already carries Telegram keeps its chip and can still be
   * unticked. Dropping it would silently rewrite somebody's saved post the
   * moment they opened it: the chip would vanish while the row still said
   * telegram, and the next save would write a set the person never chose. That
   * is the same rule `/connections` follows for a channel a workspace already
   * linked, stated in `offer.ts` — govern the offer, not what exists.
   *
   * So take an id out of `HIDDEN_FROM_OFFER` and its chip comes straight back
   * here too, with no change to this file.
   */
  const offered = ChannelSchema.options.filter(
    (channel) => isOfferedForConnect(channel) || selected.includes(channel),
  )

  return (
    <div className="space-y-2" data-guide="post-channels">
      {hideLabel ? null : <Label>Channels</Label>}
      <div className="flex flex-wrap gap-1.5">
        {offered.map((channel) => {
          const isOn = selected.includes(channel)
          return (
            <button
              key={channel}
              type="button"
              disabled={disabled}
              aria-pressed={isOn}
              data-channel-tile={channel}
              onClick={() => toggle(channel)}
              className={cn(
                // Pill, INSET RING not a border — a border makes toggling one
                // chip reflow the whole row. The kit's 28px was too tight to
                // hold a mark, a label and a state dot without them touching;
                // 36px is the same control rhythm as the rest of the card.
                'inline-flex h-9 items-center gap-2 rounded-pill py-0 pr-chip pl-chip-mark type-chip transition-micro max-narrow:h-11',
                'disabled:pointer-events-none disabled:opacity-45',
                isOn
                  ? // `--t50` is 6% orange, so in DARK it composites to very
                    // nearly the card itself and the chip would read as off.
                    // `dark:bg-s2` is the surface swap docs/37 §2.4 requires
                    // wherever a tint carries meaning in dark; the ring is the
                    // same `--t300` in both themes and is what stays orange.
                    'bg-tint-50 text-ink shadow-[inset_0_0_0_1.5px_var(--t300)] dark:bg-s2'
                  : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:bg-s2 hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
              )}
            >
              <ChannelMark channel={channel} size={18} />
              {CHANNEL_LABELS[channel]}
              {/* The one place a SOLID brand fill is spent in this row, and it
                  is 16x16. It is the greyscale-safe half of the state: the dot
                  is present or absent, which no amount of desaturation can
                  flatten. `--pfg` is BLACK, never white — docs/37 §2.4. */}
              {isOn ? (
                <span
                  aria-hidden
                  // The hook `channel-picker.test.tsx` asserts on. The point of
                  // the assertion is that this element EXISTS only when the chip
                  // is on, which is the half of the state a greyscale rendering
                  // still carries. A class assertion would pass on a dot painted
                  // in the ground colour.
                  data-state-mark="selected"
                  className="grid size-4 shrink-0 place-items-center rounded-pill bg-primary text-primary-foreground"
                >
                  <Check size={11} strokeWidth={3} />
                </span>
              ) : null}
              {/* Only on a channel that is both picked and unconnected: an
                  unpicked one is not a promise anybody has made yet. */}
              {connected !== undefined && isOn && !connected.has(channel) ? (
                <span className="type-meta text-muted">not connected</span>
              ) : null}
              {!CONSTRAINTS[channel].publishable ? (
                <span className="type-meta text-muted">preview only</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {selected.length === 0 ? (
        <p className="type-sm text-muted">
          Pick at least one channel before generating variants or previewing a publish.
        </p>
      ) : null}
    </div>
  )
}
