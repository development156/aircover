'use client'

import { useRef } from 'react'
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
/**
 * The channels this picker offers.
 *
 * ── OFFERING A CHANNEL NOBODY CAN CONNECT IS AN IMPOSSIBLE REMEDY ────────────
 * `/connections` stopped offering telegram, and this picker kept listing it — so
 * a writer could pick Telegram, have a version generated for it, and then find
 * nothing on the connections screen to link an account with. That is the shape
 * `no-impossible-remedy.spec.ts` forbids: a control inviting an action that
 * cannot be completed.
 *
 * Derived from the same set `/connections` filters on, not restated. A second
 * literal here is how the two screens drifted apart in the first place.
 *
 * ── BUT THAT SET WITHHOLDS AN ADVERTISEMENT, NOT A CAPABILITY ────────────────
 * Filtering on it alone was WRONG, and an adversarial pass caught it. Telegram
 * is a real `Channel`: `constraints.ts` marks it publishable, the connect
 * surface exists (`telegram-connect.tsx`), and `groups.ts` says in as many words
 * that the offer rule "does NOT gate `linked`". So a workspace that has ALREADY
 * linked a Telegram account could still publish there, still saw its tile under
 * "Your channels" — and could not choose it when writing a post. A capability
 * they hold, withheld by a rule about what to advertise.
 *
 * Three ways in, and each answers a different question:
 *
 *   offered     we are advertising it        → the ordinary case
 *   connected   this workspace HOLDS it      → a capability, never withheld
 *   selected    this post already targets it → a choice already made
 *
 * ── AND THE THIRD ONE IS REMEMBERED, NOT READ LIVE ───────────────────────────
 * Reading `selected` on every render made deselection a ONE-WAY DOOR: untick a
 * withdrawn channel and the chip vanishes on the next render, so a writer who
 * mis-clicked could not put it back without reloading. The set is captured when
 * the picker mounts and only grows, so a chip that has been on screen stays on
 * screen for as long as the writer is looking at it.
 */
export function offeredChannels(
  everSelected: ReadonlySet<Channel>,
  connected?: ReadonlySet<Channel>,
): readonly Channel[] {
  return ChannelSchema.options.filter(
    (channel) =>
      isOfferedForConnect(channel) || connected?.has(channel) === true || everSelected.has(channel),
  )
}

export function ChannelPicker({
  selected,
  onChange,
  disabled,
  connected,
  hideLabel = false,
}: ChannelPickerProps) {
  /**
   * Every channel that has been selected while this picker has been on screen.
   *
   * A ref, not state: it only ever grows and nothing renders differently the
   * moment it changes, so re-rendering on a write would be work for nothing.
   * Seeded from the post's own channels so an existing Telegram version is
   * visible on the first paint rather than after the first click.
   */
  const everSelected = useRef<Set<Channel>>(new Set(selected))
  for (const channel of selected) everSelected.current.add(channel)

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

  return (
    <div className="space-y-2" data-guide="post-channels">
      {hideLabel ? null : <Label>Channels</Label>}
      <div className="flex flex-wrap gap-1.5">
        {offeredChannels(everSelected.current, connected).map((channel) => {
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
                'inline-flex h-9 items-center gap-2 rounded-full py-0 pr-chip pl-chip-mark type-chip transition-micro max-narrow:h-11',
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
                  className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
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
