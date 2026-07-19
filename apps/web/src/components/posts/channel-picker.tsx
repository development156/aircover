'use client'

import { Check } from 'lucide-react'
import { ChannelSchema, CONSTRAINTS, type Channel } from '@sahoda/shared'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { CHANNEL_LABELS } from './channel-label'

export interface ChannelPickerProps {
  selected: Channel[]
  onChange: (channels: Channel[]) => void
  disabled?: boolean
}

/**
 * Channel multi-select over the four `ChannelSchema` values. Selection order is
 * preserved from the schema so the tab strip does not reshuffle on every toggle.
 */
export function ChannelPicker({ selected, onChange, disabled }: ChannelPickerProps) {
  function toggle(channel: Channel) {
    const next = selected.includes(channel)
      ? selected.filter((item) => item !== channel)
      : ChannelSchema.options.filter((item) => item === channel || selected.includes(item))
    onChange(next)
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
                'flex items-center gap-1.5 rounded-pill border px-3 py-[7px] text-[13px] font-semibold transition-micro',
                'disabled:pointer-events-none disabled:opacity-45',
                isOn
                  ? // dark: tint-50 stays warm-light while --acc flips to Orange300
                    'border-tint-300 bg-tint-50 text-accent dark:bg-s2'
                  : 'border-line bg-bg text-muted hover:border-faint hover:text-ink',
              )}
            >
              {isOn ? <Check size={13} aria-hidden /> : null}
              {CHANNEL_LABELS[channel]}
              {!CONSTRAINTS[channel].publishable ? (
                <span className="text-[11px] font-normal opacity-70">preview only</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {selected.length === 0 ? (
        <p className="text-[12.5px] text-faint">
          Pick at least one channel before generating variants or previewing a publish.
        </p>
      ) : null}
    </div>
  )
}
