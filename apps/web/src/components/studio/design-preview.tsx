import {
  composeScene,
  describeComposeFailure,
  presetById,
  renderSvg,
  slotLabelOf,
  templateById,
  type DesignPage,
  type Palette,
} from '@sahoda/shared'

/**
 * A DESIGN, DRAWN INLINE, FOR NOTHING.
 *
 * ── THIS IS WHY THE RENDERER IS A PURE FUNCTION RETURNING A STRING ──────────
 * `renderSvg` produces the same characters here as it does on the server before
 * `sharp` turns them into a PNG. So a preview is not an approximation of the
 * export and not a second implementation kept in step by a test: it is the
 * export, at a different size, with no network request and no engine
 * downloaded. On a mid-range phone over metered data that is the whole
 * argument for the architecture.
 *
 * ── `dangerouslySetInnerHTML` IS SAFE HERE, AND THE REASON IS SPECIFIC ──────
 * Not because the data is trusted — the words are typed by a customer. Because
 * `renderSvg` is the only thing that builds this string, it XML-escapes every
 * value a person can influence, it whitelists `text-anchor`, and it refuses any
 * `<image>` href that is not a `data:` URI. `svg.test.ts` asserts each of those
 * and each has been watched fail. Passing a string built anywhere else through
 * this prop would not be safe, and nothing else does.
 *
 * ── A DESIGN THAT WILL NOT COMPOSE SHOWS WHY, NOT A BLANK BOX ───────────────
 * `composeScene` refuses when a line is too long or a picture is missing. That
 * refusal names the slot, so the card can say which box to fix rather than
 * leaving a person staring at an empty frame wondering what they did.
 */
export function DesignPreview({
  templateId,
  page,
  presetId,
  palette,
  images,
  className,
}: {
  templateId: string
  page: DesignPage
  presetId: string
  palette: Palette
  images?: Readonly<Record<string, string>>
  className?: string
}) {
  const template = templateById(templateId)
  const preset = presetById(presetId)

  if (template === null || preset === null) {
    return (
      <div
        className={`surface-ring flex items-center justify-center rounded-card bg-s2 p-4 ${className ?? ''}`}
      >
        <p className="type-sm text-center text-muted">
          This design uses a layout Sahoda no longer offers, so it cannot be shown.
        </p>
      </div>
    )
  }

  const composed = composeScene(template, page, {
    width: preset.width,
    height: preset.height,
    palette,
    ...(images === undefined ? {} : { images }),
  })

  if (!composed.ok) {
    return (
      <div
        className={`surface-ring flex items-center justify-center rounded-card bg-s2 p-4 ${className ?? ''}`}
        style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
      >
        <p className="type-sm text-center text-muted">
          {describeComposeFailure(composed.failure, (key) => slotLabelOf(template, key))}
        </p>
      </div>
    )
  }

  const svg = renderSvg(composed.scene)
  if (svg === null) {
    return (
      <div
        className={`surface-ring flex items-center justify-center rounded-card bg-s2 p-4 ${className ?? ''}`}
        style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
      >
        <p className="type-sm text-center text-muted">This design could not be drawn.</p>
      </div>
    )
  }

  return (
    <div
      className={`surface-ring overflow-hidden rounded-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${className ?? ''}`}
      style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
      // See the header: this string is built only by `renderSvg`, which escapes
      // every customer value and refuses every remote reference.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
