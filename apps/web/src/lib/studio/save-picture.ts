import { downloadName, type CanvasPicture } from './canvas'

/**
 * SAVING A PICTURE TO SOMEBODY'S COMPUTER.
 *
 * ── WHY THIS FETCHES BYTES INSTEAD OF LINKING ───────────────────────────────
 * The href is a short-lived signed URL on the storage host, and `<a download>`
 * is IGNORED cross-origin: the browser navigates to the picture instead of
 * saving it, which loses the person their screen and gives them no file. So the
 * bytes are fetched, wrapped in an object URL on this origin, and saved under a
 * name they will recognise later.
 *
 * ── AND A FAILURE IS A FAILURE ──────────────────────────────────────────────
 * It never falls back to opening the picture in a tab. Somebody who pressed Save
 * and got a new tab has to work out for themselves that nothing was saved, which
 * is a fake success and worse than the honest refusal the caller shows instead.
 *
 * Lives here rather than in the viewer because two places offer Save now, and a
 * second copy of this reasoning is a second place for it to drift.
 */
export async function savePicture(picture: CanvasPicture): Promise<boolean> {
  let objectUrl: string | null = null
  try {
    const response = await fetch(picture.url)
    if (!response.ok) return false
    const blob = await response.blob()
    objectUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = objectUrl
    link.download = downloadName(picture)
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  } catch {
    return false
  } finally {
    // Revoked either way. An object URL that is never revoked holds the whole
    // picture in memory for as long as the tab lives.
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
  }
}
