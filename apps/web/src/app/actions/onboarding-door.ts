'use server'

import { auth } from '@clerk/nextjs/server'

import { pickDoor, precedenceNote, type DoorKind } from '@/lib/onboarding/door'
import { fetchSite } from '@/lib/onboarding/fetch-site'
import { gateText, MAX_PDF_BYTES, pdfText } from '@/lib/onboarding/pdf-text'
import { declaredColors, htmlToText, pageTitle } from '@/lib/onboarding/site-text'
import { reportServerError } from '@/lib/observability/report'

/**
 * Screen 2's server half: read whatever came through the door.
 *
 * FREE, always. Nothing here calls a model and nothing here touches the ledger.
 * Reading a PDF or a page is the product working out who someone is, and the
 * rule is that we never charge for that — only for output.
 *
 * The text it returns is meant to be SHOWN to the user before it is used. Both
 * document paths can fail quietly and plausibly (see `pdf-text.ts`), and the
 * only reliable check on "is this actually your business?" is the person whose
 * business it is.
 */

export type DoorState =
  | {
      ok: true
      kind: DoorKind
      /** What we read. Show it back before resolving from it. */
      text: string
      /** How we will refer to the door in copy: a filename, a hostname. */
      label: string
      /** A name found in the source, if any — a page title. */
      foundName: string
      /** Colours the site declares about itself, as oklch(). May be empty. */
      colors: string[]
      /** Why another filled input was ignored. Null when nothing was. */
      note: string | null
    }
  | { ok: false; message: string }

export async function readDoor(_prev: DoorState | null, formData: FormData): Promise<DoorState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to continue.' }

    const file = formData.get('pdf')
    const pdf = file instanceof File && file.size > 0 ? file : null
    const url = String(formData.get('url') ?? '')
    const sentence = String(formData.get('sentence') ?? '')

    const choice = pickDoor({ pdfName: pdf?.name ?? null, url, sentence })
    const note = precedenceNote(choice)

    if (choice.kind === 'none') {
      return {
        ok: false,
        message: 'Give us one thing to read — a link, a PDF, or a sentence about what you do.',
      }
    }

    if (choice.kind === 'sentence') {
      // No gate: a sentence someone typed about themselves is short by design,
      // and it is the fallback every other failure points at. Gating it would
      // leave a user with no way through at all.
      return {
        ok: true,
        kind: 'sentence',
        text: choice.sentence,
        label: choice.label,
        foundName: '',
        colors: [],
        note,
      }
    }

    if (choice.kind === 'pdf' && pdf) {
      // Checked before reading the bytes into memory, not after.
      if (pdf.size > MAX_PDF_BYTES) {
        return {
          ok: false,
          message: `That PDF is over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB — upload a shorter one, or type a sentence instead.`,
        }
      }
      const extracted = pdfText(new Uint8Array(await pdf.arrayBuffer()))
      if (!extracted.ok) return { ok: false, message: extracted.reason }

      return {
        ok: true,
        kind: 'pdf',
        text: extracted.text,
        label: choice.label,
        // A PDF carries no reliable name and no declared colour. Saying so by
        // returning empties is better than guessing at either.
        foundName: '',
        colors: [],
        note,
      }
    }

    if (choice.kind === 'url') {
      const page = await fetchSite(choice.url)
      if (!page.ok) return { ok: false, message: page.reason }

      const gated = gateText(htmlToText(page.html), 'page')
      if (!gated.ok) return { ok: false, message: gated.reason }

      return {
        ok: true,
        kind: 'url',
        text: gated.text,
        label: choice.label,
        foundName: pageTitle(page.html),
        colors: declaredColors(page.html),
        note,
      }
    }

    return { ok: false, message: 'We could not read that — type a sentence instead.' }
  } catch (error) {
    reportServerError(error, { action: 'readDoor' })
    return { ok: false, message: 'We could not read that — type a sentence instead.' }
  }
}
