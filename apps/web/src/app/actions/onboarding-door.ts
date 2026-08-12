'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { brandExtractTask, createMesh, type Mesh } from '@sahoda/mesh'
import { openSite, quarantineCorpus } from '@sahoda/research'

import { declaredColors } from '@/lib/brand/declared-colors'
import { openUploadDoor, type ExtractRunner } from '@/lib/brand/url-door'
import { MAX_PDF_BYTES, pickDoor, precedenceNote, type DoorKind } from '@/lib/onboarding/door'
import { reportServerError } from '@/lib/observability/report'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Screen 2's server half: read whatever came through the door.
 *
 * NOTHING HERE TOUCHES THE LEDGER, and that rule is unchanged: reading a page or
 * a document is the product working out who someone is, and we charge for output
 * only. What DID change is that the PDF arm now costs us a model call —
 * `openUploadDoor` runs `brand_extract` — so "free" here means free to the
 * customer, not free to us. The URL arm still calls no model at all:
 * `@sahoda/research` acquires and quarantines and never runs inference.
 *
 * The text it returns is meant to be SHOWN to the user before it is used. A
 * crawl reads whatever the site says, an extraction reads whatever the document
 * says, and the only reliable check on "is this actually your business?" is the
 * person whose business it is.
 */

// 'use server' modules may export only async functions — this stays module-private.
let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

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

/**
 * Extracted fields, rendered as the text the reveal shows and the resolve reads.
 *
 * `openUploadDoor` returns structure where the old PDF parser returned prose, so
 * something has to bridge them. Showing `channel.key — value` lines is better
 * than the raw page text it replaces: the user sees what we UNDERSTOOD, not what
 * we scraped, and a wrong reading is obvious at a glance instead of buried in
 * forty pages.
 *
 * Nothing is laundered by the flattening. Every field arrives `confirmed: false`
 * (`ExtractedFieldSchema` pins the literal, so the model cannot claim otherwise),
 * and the brain this text goes on to produce is saved by a resolve, which stamps
 * every field `confirmed: false, source: model` in `field_meta`. The old warning
 * on `applyExtractedFields` — that extracted text becomes indistinguishable from
 * founder prose once it is inside `ResolveInput` — is answered there rather than
 * here.
 */
function fieldsAsText(fields: readonly { channel: string; key: string; value: string }[]): string {
  return fields.map((f) => `${f.channel}.${f.key}: ${f.value}`).join('\n')
}

export async function readDoor(_prev: DoorState | null, formData: FormData): Promise<DoorState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to continue.' }

    const file = formData.get('pdf')
    const pdf = file instanceof File && file.size > 0 ? file : null
    const url = String(formData.get('url') ?? '')
    const sentence = String(formData.get('sentence') ?? '')

    // STAGE LOG. The door the precedence rule PICKED, beside what actually
    // arrived — a PDF that was chosen in the browser but did not reach the
    // request shows up here as pdf:null with kind:'url' or 'sentence'.
    const choice = pickDoor({ pdfName: pdf?.name ?? null, url, sentence })
    console.log(
      '[door] picked',
      JSON.stringify({
        kind: choice.kind,
        hasPdfPart: pdf !== null,
        pdfBytes: pdf?.size ?? 0,
        hasUrl: url.trim().length > 0,
        hasSentence: sentence.trim().length > 0,
      }),
    )
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

      const workspace = await getActiveWorkspace()
      if (!workspace) return { ok: false, message: 'Create a workspace first.' }

      // STAGE LOG. Reported before any model call, so a request that never
      // carried a file is distinguishable from one whose extraction came back
      // empty — the two produce the same screen and need different fixes.
      console.log(
        '[door.upload] received',
        JSON.stringify({ filename: pdf.name, bytes: pdf.size, type: pdf.type }),
      )

      const dataUrl = `data:application/pdf;base64,${Buffer.from(await pdf.arrayBuffer()).toString('base64')}`
      const door = await openUploadDoor({ filename: pdf.name, dataUrl }, pdf.name, {
        extract: extractRunner(),
        ctx: { workspaceId: workspace.id, traceId: randomUUID(), userId },
      })
      // Each arm of the taxonomy is a different sentence to the founder — a
      // scanned book and an oversized one need different things back.
      if (!door.ok) {
        console.log('[door.upload] refused', JSON.stringify({ reason: door.reason }))
        return { ok: false, message: door.message }
      }

      return {
        ok: true,
        kind: 'pdf',
        text: fieldsAsText(door.fields),
        label: choice.label,
        // A PDF carries no reliable name and no declared colour. Saying so by
        // returning empties is better than guessing at either.
        foundName: '',
        colors: [],
        note,
      }
    }

    if (choice.kind === 'url') {
      // The landing page's markup, captured before turndown discards it. Only
      // tier 1 supplies it; a site read by a later tier simply has no colours.
      let landingHtml = ''
      const site = await openSite(choice.url, {
        direct: { timeoutMs: 20_000, onLandingHtml: (html) => (landingHtml ||= html) },
      })

      if (!site.outcome.ok) {
        // `unreachable`, `js_only`, `thin`, `invalid_url`, `crawler_error` — the
        // crawl already writes the right sentence for each, and every one of
        // them routes the user to typing something instead.
        return { ok: false, message: site.outcome.message }
      }

      return {
        ok: true,
        kind: 'url',
        // QUARANTINED, which the old hand-rolled path was not. The corpus is
        // customer-supplied text on its way into a model prompt, and this is the
        // wrapper that says so: evidence, not instructions.
        text: quarantineCorpus(site.outcome.pages),
        label: choice.label,
        foundName: site.outcome.pages[0]?.title ?? '',
        colors: landingHtml ? declaredColors(landingHtml) : [],
        note,
      }
    }

    return { ok: false, message: 'We could not read that — type a sentence instead.' }
  } catch (error) {
    reportServerError(error, { action: 'readDoor' })
    return { ok: false, message: 'We could not read that — type a sentence instead.' }
  }
}

/** Just enough of the mesh for `openUploadDoor` to run one extraction. */
function extractRunner(): ExtractRunner {
  return {
    async run(extractInput, extractCtx) {
      const r = await getMesh().runTask(
        brandExtractTask.def,
        extractInput as Parameters<typeof brandExtractTask.buildMessages>[0],
        extractCtx,
      )
      if (!r.ok) return { ok: false }
      return {
        ok: true,
        data: r.data,
        ...((r as { annotations?: unknown[] }).annotations
          ? { annotations: (r as { annotations?: unknown[] }).annotations }
          : {}),
      }
    },
  }
}
