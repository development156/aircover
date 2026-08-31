/**
 * PUTTING A PICTURE ON THE CLIPBOARD.
 *
 * ── WHY IT IS NOT ONE LINE ──────────────────────────────────────────────────
 * Browsers accept exactly ONE image type on the clipboard: `image/png`. Our
 * pictures are whatever the model returned, which `sniffImage` proves is a PNG,
 * a JPEG or a WebP, so a naive copy silently fails on most of them. The bytes
 * are re-encoded through a canvas when they are not already a PNG, and passed
 * straight through when they are: transcoding a PNG to a PNG is a decode and an
 * encode of a picture that was already correct.
 *
 * ── AND IT CHECKS BEFORE IT TRIES ───────────────────────────────────────────
 * `navigator.clipboard.write` and `ClipboardItem` do not exist outside a secure
 * context, and reading `.write` on undefined throws rather than returning false.
 * Checking first is what lets the caller say something true instead of showing a
 * failure that looks like the picture was the problem.
 *
 * Never throws. Returns a reason the caller can turn into a sentence.
 */

export type CopyImageResult = 'copied' | 'unsupported' | 'failed'

/** Whether this browser, in this context, can be handed a picture at all. */
export function canCopyImage(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator?.clipboard?.write === 'function'
  )
}

export async function copyImageToClipboard(url: string): Promise<CopyImageResult> {
  if (!canCopyImage()) return 'unsupported'

  let objectUrl: string | null = null
  try {
    const response = await fetch(url)
    if (!response.ok) return 'failed'
    const original = await response.blob()

    // Already the one type a clipboard takes. Re-encoding it would decode and
    // encode a picture that was already correct, for nothing.
    const png =
      original.type === 'image/png'
        ? original
        : await transcodeToPng(original, (u) => {
            objectUrl = u
          })
    if (png === null) return 'failed'

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return 'copied'
  } catch {
    return 'failed'
  } finally {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
  }
}

/** Decode and re-encode as PNG. Null when the browser cannot do either half. */
async function transcodeToPng(blob: Blob, keep: (objectUrl: string) => void): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(blob)
  keep(objectUrl)

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => resolve(null)
    element.src = objectUrl
  })
  if (image === null) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  ctx.drawImage(image, 0, 0)

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
}
