import { modelById } from '@/lib/studio/models'
import type { CanvasPicture } from '@/lib/studio/canvas'

/**
 * FACTS, NOT CLAIMS. Every row is something the row itself recorded, never a
 * guess dressed as one: a model id the catalogue no longer carries reads as
 * "an earlier model" rather than "None", because the picture WAS drawn by
 * something and saying so is true even after that model is retired.
 */
export function ViewerDetails({
  picture,
  modelId,
}: {
  picture: CanvasPicture
  modelId: string | null
}) {
  const modelLabel = modelId === null ? null : (modelById(modelId)?.label ?? 'An earlier model')

  return (
    <div className="flex flex-col gap-2" data-guide="studio-viewer-details">
      <span className="type-eyebrow text-muted">Details</span>
      <Row label="Model" value={modelLabel ?? '—'} />
      <Row
        label="Size"
        value={
          picture.width === null || picture.height === null
            ? '—'
            : `${picture.width} × ${picture.height} pixels`
        }
      />
      <Row label="Made" value={picture.madeAgo ?? '—'} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="type-sm text-muted">{label}</span>
      <span className="num type-sm text-right text-ink">{value}</span>
    </div>
  )
}
