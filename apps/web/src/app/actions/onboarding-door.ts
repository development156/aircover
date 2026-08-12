'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { brandExtractTask, createMesh, type Mesh } from '@sahoda/mesh'
import { openSite, quarantineCorpus } from '@sahoda/research'

import { declaredColors } from '@/lib/brand/declared-colors'
import { openUploadDoor, type ExtractRunner } from '@/lib/brand/url-door'
import {
  MAX_PDF_BYTES,
  MIN_SENTENCE_CHARS,
  normaliseUrl,
  pickDoor,
  precedenceNote,
  type DoorKind,
} from '@/lib/onboarding/door'
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
      /** Why another filled input was ignored, or what we fell back from. */
      note: string | null
      /** True when a higher-precedence input failed and this one was used instead. */
      fellBack: boolean
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

/**
 * Read whatever came through the door — trying EVERY input that was filled, in
 * precedence order, until one works.
 *
 * THE BUG THIS FIXES. `pickDoor` chooses one winner and the old code read only
 * that one: a user who supplied a PDF *and* a website got "we could not read
 * that" when the PDF failed, while their website sat there unread. The three
 * inputs are independent, and a failure on the richest is no reason to ignore
 * the others — "we could not read X" and "we have nothing to read" are
 * different sentences and only one of them was true.
 *
 * Precedence still decides the ORDER (a document beats a site beats a
 * sentence), so a successful PDF is still preferred. Falling back is stated in
 * `note`, because silently reading something else is its own kind of lie.
 */
export async function readDoor(_prev: DoorState | null, formData: FormData): Promise<DoorState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to continue.' }

    const file = formData.get('pdf')
    const pdf = file instanceof File && file.size > 0 ? file : null
    const url = String(formData.get('url') ?? '')
    const sentence = String(formData.get('sentence') ?? '')
    const useOcr = String(formData.get('ocr') ?? '') === '1'

    const choice = pickDoor({ pdfName: pdf?.name ?? null, url, sentence })
    console.log(
      '[door] picked',
      JSON.stringify({
        kind: choice.kind,
        hasPdfPart: pdf !== null,
        pdfBytes: pdf?.size ?? 0,
        hasUrl: url.trim().length > 0,
        hasSentence: sentence.trim().length > 0,
        ocr: useOcr,
      }),
    )

    if (choice.kind === 'none') {
      return {
        ok: false,
        message: 'Give us one thing to read — a link, a PDF, or a sentence about what you do.',
      }
    }

    const note = precedenceNote(choice)
    const failures: string[] = []

    // ── 1. the document ──────────────────────────────────────────────────────
    if (pdf) {
      const attempt = await readPdf(pdf, useOcr)
      if (attempt.ok) return { ok: true, ...attempt.value, note, fellBack: false }
      failures.push(attempt.message)
    }

    // ── 2. the site ──────────────────────────────────────────────────────────
    const normalisedUrl = normaliseUrl(url)
    if (normalisedUrl) {
      const attempt = await readUrl(normalisedUrl)
      if (attempt.ok) {
        return {
          ok: true,
          ...attempt.value,
          note: pdf ? 'We could not read the PDF, so we read your website instead.' : note,
          fellBack: pdf !== null,
        }
      }
      failures.push(attempt.message)
    }

    // ── 3. their own words ───────────────────────────────────────────────────
    if (sentence.trim().length >= MIN_SENTENCE_CHARS) {
      return {
        ok: true,
        kind: 'sentence',
        text: sentence.trim(),
        label: 'what you told us',
        foundName: '',
        colors: [],
        note:
          pdf || normalisedUrl
            ? 'We could not read what you gave us, so we used your own words instead.'
            : note,
        fellBack: pdf !== null || normalisedUrl !== null,
      }
    }

    // Nothing worked. Report the FIRST failure — it is the one about the input
    // they most wanted us to read.
    return {
      ok: false,
      message: failures[0] ?? 'We could not read that — type a sentence instead.',
    }
  } catch (error) {
    reportServerError(error, { action: 'readDoor' })
    return { ok: false, message: 'We could not read that — type a sentence instead.' }
  }
}

type DoorSuccess = Extract<DoorState, { ok: true }>
type Attempt =
  | { ok: true; value: Omit<DoorSuccess, 'ok' | 'note' | 'fellBack'> }
  | { ok: false; message: string }

async function readPdf(pdf: File, useOcr: boolean): Promise<Attempt> {
  if (pdf.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      message: `That PDF is over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB — upload a shorter one, or type a sentence instead.`,
    }
  }

  const workspace = await getActiveWorkspace()
  if (!workspace) return { ok: false, message: 'Create a workspace first.' }

  console.log(
    '[door.upload] received',
    JSON.stringify({ filename: pdf.name, bytes: pdf.size, type: pdf.type, ocr: useOcr }),
  )

  const dataUrl = `data:application/pdf;base64,${Buffer.from(await pdf.arrayBuffer()).toString('base64')}`
  const door = await openUploadDoor(
    { filename: pdf.name, dataUrl, ...(useOcr ? { engine: 'mistral-ocr' as const } : {}) },
    pdf.name,
    {
      extract: extractRunner(),
      ctx: { workspaceId: workspace.id, traceId: randomUUID(), userId: '' },
    },
  )
  if (!door.ok) {
    console.log('[door.upload] refused', JSON.stringify({ reason: door.reason }))
    return { ok: false, message: door.message }
  }

  return {
    ok: true,
    value: {
      kind: 'pdf',
      text: fieldsAsText(door.fields),
      label: pdf.name,
      foundName: '',
      colors: [],
    },
  }
}

async function readUrl(url: string): Promise<Attempt> {
  let landingHtml = ''
  const site = await openSite(url, {
    direct: { timeoutMs: 20_000, onLandingHtml: (html) => (landingHtml ||= html) },
  })
  console.log(
    '[door.url] crawl',
    JSON.stringify({
      ok: site.outcome.ok,
      servedBy: site.servedBy,
      reason: site.outcome.ok ? null : site.outcome.reason,
      pages: site.outcome.ok ? site.outcome.pages.length : 0,
    }),
  )
  if (!site.outcome.ok) return { ok: false, message: site.outcome.message }

  return {
    ok: true,
    value: {
      kind: 'url',
      text: quarantineCorpus(site.outcome.pages),
      label: new URL(url).hostname,
      foundName: site.outcome.pages[0]?.title ?? '',
      colors: landingHtml ? declaredColors(landingHtml) : [],
    },
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
