import type { ReactNode } from 'react'
import { ImageIcon, Lock, Minus, Plus, Stamp } from 'lucide-react'

import { ComposerPill } from '@/components/studio/composer-pill'
import { COMING_SOON_COUNT } from '@/components/studio/composer-not-built'
import { MAX_TRIES_PER_PRESS } from '@/lib/studio/modes'
import type { ComposerOpenPanel } from '@/components/studio/composer-panels'

/**
 * ROW 2: ONE CONTROL SHAPE FOR EVERY PILL.
 *
 * Match, a divider, then Model, Approach and Size — each a bare value with a
 * caret, opening the fieldset it summarises (`composer-panels.tsx`). The
 * count is a −/+ a person reads at a glance rather than another door. The
 * logo pill is the same shape again, and "N more" names what is designed and
 * not built without pretending it is a door too.
 */
export function ComposerChips({
  pickedCount,
  modelLabel,
  approachLabel,
  sizeLabel,
  count,
  stampEnabled,
  openPanel,
  onTogglePanel,
  onStepCount,
  extraControls,
}: {
  pickedCount: number
  modelLabel: string
  approachLabel: string
  sizeLabel: string
  count: number
  stampEnabled: boolean
  openPanel: ComposerOpenPanel
  onTogglePanel: (panel: Exclude<ComposerOpenPanel, null>) => void
  onStepCount: (next: number) => void
  extraControls?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-guide="studio-chips">
      <ComposerPill
        icon={<ImageIcon className="size-[14px]" aria-hidden />}
        label="Match"
        axisLabel={pickedCount === 0 ? 'Match, none picked' : `Match, ${pickedCount} picked`}
        onClick={() => onTogglePanel('match')}
        expanded={openPanel === 'match'}
        controls="studio-panel-match"
      />

      <span aria-hidden className="mx-1 h-[20px] w-px bg-line" />

      <ComposerPill
        label={modelLabel}
        axisLabel={`Model, ${modelLabel}`}
        onClick={() => onTogglePanel('model')}
        expanded={openPanel === 'model'}
        controls="studio-panel-model"
        caret
      />
      <ComposerPill
        label={approachLabel}
        axisLabel={`Approach, ${approachLabel}`}
        onClick={() => onTogglePanel('approach')}
        expanded={openPanel === 'approach'}
        controls="studio-panel-approach"
        caret
      />
      <ComposerPill
        label={sizeLabel}
        axisLabel={`Size, ${sizeLabel}`}
        onClick={() => onTogglePanel('size')}
        expanded={openPanel === 'size'}
        controls="studio-panel-size"
        caret
      />

      <div
        role="group"
        aria-label="How many pictures this press makes"
        className="surface-ring flex h-control items-center gap-0.5 rounded-pill bg-s2 px-1"
        data-guide="studio-count"
      >
        <button
          type="button"
          aria-label="Fewer pictures this press"
          disabled={count <= 1}
          onClick={() => onStepCount(Math.max(1, count - 1))}
          className="flex size-[26px] items-center justify-center rounded-full text-muted transition-micro hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
        >
          <Minus className="size-[13px]" aria-hidden />
        </button>
        <span className="num type-sm w-[16px] text-center font-[550]" aria-hidden>
          {count}
        </span>
        <button
          type="button"
          aria-label="More pictures this press"
          disabled={count >= MAX_TRIES_PER_PRESS}
          onClick={() => onStepCount(Math.min(MAX_TRIES_PER_PRESS, count + 1))}
          className="flex size-[26px] items-center justify-center rounded-full text-muted transition-micro hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
        >
          <Plus className="size-[13px]" aria-hidden />
        </button>
      </div>

      <ComposerPill
        icon={<Stamp className="size-[14px]" aria-hidden />}
        label={stampEnabled ? 'Logo on' : 'Logo off'}
        axisLabel={`Logo, ${stampEnabled ? 'on' : 'off'}`}
        onClick={() => onTogglePanel('logo')}
        expanded={openPanel === 'logo'}
        controls="studio-panel-logo"
        caret
      />

      <div className="grow" />

      <span className="flex items-center gap-1.5 type-sm text-muted">
        <Lock className="size-[12px]" aria-hidden />
        <span className="num">{COMING_SOON_COUNT}</span> more
      </span>

      {extraControls}
    </div>
  )
}
