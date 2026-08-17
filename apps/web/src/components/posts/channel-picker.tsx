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
}

/**
 * Channel multi-select over the four `ChannelSchema` values. Selection order is
 * preserved from the schema so the tab strip does not reshuffle on every toggle.
 */
export function ChannelPicker({ selected, onChange, disabled, connected }: ChannelPickerProps) {
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
      <Label>Channels</Label>
      <div className="flex flex-wrap gap-1.5">
        {ChannelSchema.options.map((channel) => {
          const isOn = selected.includes(channel)
          return (
            <button
              key={channel}
              type="button"
              disabled={disabled}
              aria-pressed={isOn}
              onClick={() => toggle(channel)}
              className={cn(
                // The kit's `.sl-chip`: 28px, pill, INSET RING not a border —
                // a border makes toggling one chip reflow the whole row.
                // Selected is solid INK, not orange: this row shows four chips
                // at once and an orange selected state paints up to four
                // oranges on one screen (RETHEME.md §9).
                'inline-flex h-7 items-center gap-1.5 rounded-full px-[10px] text-[13px] font-[550] transition-micro max-narrow:h-11',
                'disabled:pointer-events-none disabled:opacity-45',
                isOn
                  ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                  : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
              )}
            >
              {isOn ? <Check size={13} aria-hidden /> : null}
              {CHANNEL_LABELS[channel]}
              {/* Only on a channel that is both picked and unconnected: an
                  unpicked one is not a promise anybody has made yet. */}
              {connected !== undefined && isOn && !connected.has(channel) ? (
                <span className="ml-1.5 text-[11px] font-semibold opacity-75">not connected</span>
              ) : null}
              {!CONSTRAINTS[channel].publishable ? (
                <span className="text-[11px] font-normal opacity-70">preview only</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {selected.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Pick at least one channel before generating variants or previewing a publish.
        </p>
      ) : null}
    </div>
  )
}
