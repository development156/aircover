'use client'

import type { CropOfferView } from '@/lib/media/offer-state'
import type { FocalPoint } from '@/lib/media/crop-geometry'

/**
 * MOVING THE CROP. Two sliders, and only the ones that can actually move.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * "A default centre crop cuts heads off product photos and faces out of team
 * photos." It does. The crop opens on the busiest part of the picture — libvips
 * finds it — but a guess is a guess, and the person looking at the photograph
 * knows where the subject is. This is how they say so.
 *
 * ── A SLIDER FOR AN AXIS WITH NO FREEDOM IS A LIE ───────────────────────────
 * A 9:16 photo cropped to 0.75 keeps its full WIDTH: there is nothing to move
 * sideways. A control that moved and changed nothing would be worse than no
 * control — it would read as a broken one. So each axis is offered only when the
 * crop is genuinely narrower than the original on that axis, and the other is
 * simply absent.
 *
 * `<input type="range">` rather than a drag handle because it is keyboard
 * operable, arrow-key precise and touch-friendly for nothing. Pointing at the
 * photo is the fast path; this is the one that works for everybody.
 */
export function CropFocal({
  offer,
  focal,
  onChange,
  disabled,
}: {
  offer: CropOfferView
  focal: FocalPoint
  onChange: (focal: FocalPoint) => void
  disabled?: boolean
}) {
  const canMoveX = offer.size.width < offer.original.width
  const canMoveY = offer.size.height < offer.original.height

  if (!canMoveX && !canMoveY) {
    return (
      <p className="type-sm text-muted">
        This crop keeps the whole picture in both directions, so there is nothing to move.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {canMoveX ? (
        <Axis
          label="Move across"
          value={focal.x}
          disabled={disabled}
          onChange={(x) => onChange({ ...focal, x })}
        />
      ) : null}
      {canMoveY ? (
        <Axis
          label="Move up and down"
          value={focal.y}
          disabled={disabled}
          onChange={(y) => onChange({ ...focal, y })}
        />
      ) : null}
    </div>
  )
}

/** One axis. The percentage is shown because a slider with no readout is a guess. */
function Axis({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const percent = Math.round(value * 100)
  return (
    <label className="flex items-center gap-3 type-sm text-ink">
      <span className="w-[136px] shrink-0 max-narrow:w-[104px]">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        className="h-[6px] min-w-0 flex-1 cursor-pointer appearance-none rounded-pill bg-line accent-[var(--p)] disabled:cursor-not-allowed disabled:opacity-45"
      />
      <span className="w-[42px] shrink-0 text-right tabular-nums text-muted">{percent}%</span>
    </label>
  )
}
