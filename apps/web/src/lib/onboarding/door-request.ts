import { z } from 'zod'

import { MAX_PDF_BYTES } from '@/lib/onboarding/door'

/**
 * The door request at the boundary: what the route accepts before it spends.
 *
 * Kept pure (no `server-only`) so the two guards can be executed in a unit
 * test with a real `FormData`, and so the route stays the thin thing it is.
 */

export const MAX_URL_CHARS = 2048
export const MAX_SENTENCE_CHARS = 4000
/** The stage detail reads `Reading ${name}` back to the same customer; a name is not a payload. */
const MAX_FILENAME_CHARS = 200
/** Multipart framing and headers around three fields. Generous, and still ~1% of the PDF cap. */
const FORM_OVERHEAD_BYTES = 64 * 1024

/**
 * The most a door body may declare. Compared to `content-length` BEFORE
 * `request.formData()` runs, because that call buffers the whole multipart
 * body and a 6MB check that runs after it has already paid for the 6MB.
 */
export const MAX_DOOR_BODY_BYTES =
  MAX_PDF_BYTES + MAX_URL_CHARS + MAX_SENTENCE_CHARS + FORM_OVERHEAD_BYTES

const DoorFieldsSchema = z.object({
  url: z.string().max(MAX_URL_CHARS),
  sentence: z.string().max(MAX_SENTENCE_CHARS),
})

/**
 * The PDF, DESCRIBED and not yet copied. `read` is the one call that pulls the
 * bytes out of the request, and `read-door.ts` makes it only after the size
 * check has passed.
 */
export interface DoorPdf {
  name: string
  size: number
  read: () => Promise<ArrayBuffer>
}

export type DoorFormRead =
  | { ok: true; url: string; sentence: string; pdf: DoorPdf | null }
  | { ok: false; reason: 'invalid_input' }

/** True only for a declared length the route can refuse without reading a byte. */
export function bodyTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false
  const declared = Number(contentLength)
  return Number.isFinite(declared) && declared > MAX_DOOR_BODY_BYTES
}

function textField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export function parseDoorForm(form: FormData): DoorFormRead {
  const fields = DoorFieldsSchema.safeParse({
    url: textField(form, 'url'),
    sentence: textField(form, 'sentence'),
  })
  if (!fields.success) return { ok: false, reason: 'invalid_input' }

  const file = form.get('pdf')
  const pdf: DoorPdf | null =
    file instanceof File && file.size > 0
      ? {
          name: file.name.slice(0, MAX_FILENAME_CHARS),
          size: file.size,
          read: () => file.arrayBuffer(),
        }
      : null

  return { ok: true, url: fields.data.url, sentence: fields.data.sentence, pdf }
}
