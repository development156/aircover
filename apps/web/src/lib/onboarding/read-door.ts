import 'server-only'

import { randomUUID } from 'node:crypto'
import { brandExtractTask, createMesh, type Mesh } from '@sahoda/mesh'
import { openSite, quarantineCorpus } from '@sahoda/research'

import { declaredColors } from '@/lib/brand/declared-colors'
import { openUploadDoor, type ExtractRunner } from '@/lib/brand/url-door'
import { MAX_PDF_BYTES, MIN_SENTENCE_CHARS, normaliseUrl } from '@/lib/onboarding/door'

/**
 * The door's reading half, with the network work overlapped and every stage
 * announced as it happens.
 *
 * TWO THINGS THIS FIXES, both measured.
 *
 * CONCURRENCY. The document and the site have nothing to do with each other,
 * and the old code awaited them in sequence — so a user who supplied both paid
 * the sum. Production p50 was brand_extract 26.3s and a tier-1 crawl on top;
 * run together the wall clock is the slower of the two, not the total.
 *
 * REAL EVENTS. `onStage` is called from the point in the code where the thing
 * actually happened — after the crawl returns, with the page count it returned;
 * after the free parser answers, with what it yielded. Nothing here is a timer
 * pretending to be progress, and no stage is announced before it is underway.
 */

export type StageName =
  | 'crawl.start'
  | 'crawl.done'
  | 'pdf.start'
  | 'pdf.free-done'
  | 'pdf.ocr-start'
  | 'pdf.done'
  | 'failed'

export interface Stage {
  stage: StageName
  /** One sentence, already written for a person. */
  detail: string
  /** Milliseconds since the read began. */
  ms: number
  /** Paid provider spend attributable to this stage, in USD. */
  costUsd?: number
}

export interface DoorRead {
  ok: true
  kind: 'pdf' | 'url' | 'sentence'
  text: string
  label: string
  foundName: string
  colors: string[]
  note: string | null
  fellBack: boolean
  /** Everything that happened, in order. Rendered after the fact as the receipt. */
  stages: Stage[]
  /** Total paid spend. Zero on the free path, and shown either way. */
  costUsd: number
}

export interface DoorFail {
  ok: false
  message: string
  stages: Stage[]
  costUsd: number
}

export interface ReadDoorInput {
  pdf: { name: string; size: number; bytes: ArrayBuffer } | null
  url: string
  sentence: string
  workspaceId: string
  userId: string
}

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

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

/**
 * `mistral-ocr` is $2 per 1,000 pages. We do not know the page count before
 * parsing, so the figure shown is an estimate for a short document and is
 * labelled as one wherever it is rendered.
 */
const OCR_USD_PER_PAGE = 0.002
const OCR_ASSUMED_PAGES = 3

function fieldsAsText(fields: readonly { channel: string; key: string; value: string }[]): string {
  return fields.map((f) => `${f.channel}.${f.key}: ${f.value}`).join('\n')
}

/**
 * ESCALATION IS AUTOMATIC, NEVER A QUESTION.
 *
 * A shop owner cannot be expected to know what an OCR engine is, and asking
 * them to pick one is asking them to debug our pipeline. So the free engine
 * runs first and, when it comes back with nothing, the paid one runs
 * immediately — and the spend is reported, never silent.
 *
 * "Nothing" is measured as ZERO usable fields, which is the only signal
 * available at this layer. Measured 2026-08-12: an image-only PDF returns 0
 * fields from cloudflare-ai and 8 from mistral-ocr, so this branch is the
 * difference between a door that works and one that blames the customer's file.
 */
async function readPdf(
  input: ReadDoorInput,
  pdf: NonNullable<ReadDoorInput['pdf']>,
  emit: (s: Omit<Stage, 'ms'>) => void,
): Promise<
  | { ok: true; text: string; label: string; costUsd: number }
  | { ok: false; message: string; costUsd: number }
> {
  if (pdf.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      costUsd: 0,
      message: `That PDF is over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB. Upload a shorter one, or tell us in your own words.`,
    }
  }

  emit({ stage: 'pdf.start', detail: `Reading ${pdf.name}` })
  const dataUrl = `data:application/pdf;base64,${Buffer.from(pdf.bytes).toString('base64')}`
  const ctx = { workspaceId: input.workspaceId, traceId: randomUUID(), userId: input.userId }

  const free = await openUploadDoor({ filename: pdf.name, dataUrl }, pdf.name, {
    extract: extractRunner(),
    ctx,
  })
  if (free.ok) {
    emit({ stage: 'pdf.free-done', detail: `Read ${free.fields.length} things from your document` })
    return { ok: true, text: fieldsAsText(free.fields), label: pdf.name, costUsd: 0 }
  }

  // Only `unreadable` means "the free parser found nothing" — a too-large or
  // not-a-PDF failure is not something a better engine fixes.
  if (free.reason !== 'unreadable') return { ok: false, message: free.message, costUsd: 0 }

  const estimate = OCR_USD_PER_PAGE * OCR_ASSUMED_PAGES
  emit({
    stage: 'pdf.ocr-start',
    detail: 'The free reader found no text, so it is switching to OCR, which reads pictures',
    costUsd: estimate,
  })

  const ocr = await openUploadDoor(
    { filename: pdf.name, dataUrl, engine: 'mistral-ocr' },
    pdf.name,
    { extract: extractRunner(), ctx },
  )
  if (!ocr.ok) return { ok: false, message: ocr.message, costUsd: estimate }

  emit({
    stage: 'pdf.done',
    detail: `OCR read ${ocr.fields.length} things from your document`,
    costUsd: estimate,
  })
  return { ok: true, text: fieldsAsText(ocr.fields), label: pdf.name, costUsd: estimate }
}

async function readSite(
  url: string,
  emit: (s: Omit<Stage, 'ms'>) => void,
): Promise<
  | { ok: true; text: string; label: string; foundName: string; colors: string[] }
  | { ok: false; message: string }
> {
  emit({ stage: 'crawl.start', detail: `Reading ${new URL(url).hostname}` })
  let landingHtml = ''
  const site = await openSite(url, {
    direct: { timeoutMs: 20_000, onLandingHtml: (html) => (landingHtml ||= html) },
  })
  if (!site.outcome.ok) return { ok: false, message: site.outcome.message }

  const pages = site.outcome.pages.length
  emit({
    stage: 'crawl.done',
    detail: `Found ${pages} ${pages === 1 ? 'page' : 'pages'} on your site`,
  })
  return {
    ok: true,
    text: quarantineCorpus(site.outcome.pages),
    label: new URL(url).hostname,
    foundName: site.outcome.pages[0]?.title ?? '',
    colors: landingHtml ? declaredColors(landingHtml) : [],
  }
}

/**
 * Read everything that was supplied, together, and prefer the richest result.
 *
 * Precedence still decides which WINS (a document beats a site beats a
 * sentence) — it no longer decides which is attempted. Both requests are in
 * flight at once, so supplying two inputs costs the slower one rather than the
 * sum, and a failure on the document is not a reason to have ignored the site.
 */
export async function readDoorStreaming(
  input: ReadDoorInput,
  onStage: (s: Stage) => void,
): Promise<DoorRead | DoorFail> {
  const began = Date.now()
  const stages: Stage[] = []
  const emit = (s: Omit<Stage, 'ms'>) => {
    const full: Stage = { ...s, ms: Date.now() - began }
    stages.push(full)
    onStage(full)
  }

  const url = normaliseUrl(input.url)
  const sentence = input.sentence.trim()

  // BOTH AT ONCE. They share no data and neither gates the other.
  const [pdfResult, siteResult] = await Promise.all([
    input.pdf ? readPdf(input, input.pdf, emit) : Promise.resolve(null),
    url ? readSite(url, emit) : Promise.resolve(null),
  ])

  const costUsd = pdfResult && !pdfResult.ok ? pdfResult.costUsd : (pdfResult?.costUsd ?? 0)

  if (pdfResult?.ok) {
    return {
      ok: true,
      kind: 'pdf',
      text: pdfResult.text,
      label: pdfResult.label,
      foundName: '',
      colors: siteResult?.ok ? siteResult.colors : [],
      note: null,
      fellBack: false,
      stages,
      costUsd,
    }
  }

  if (siteResult?.ok) {
    return {
      ok: true,
      kind: 'url',
      text: siteResult.text,
      label: siteResult.label,
      foundName: siteResult.foundName,
      colors: siteResult.colors,
      note: input.pdf ? 'We could not read the PDF, so we read your website instead.' : null,
      fellBack: input.pdf !== null,
      stages,
      costUsd,
    }
  }

  if (sentence.length >= MIN_SENTENCE_CHARS) {
    return {
      ok: true,
      kind: 'sentence',
      text: sentence,
      label: 'what you told us',
      foundName: '',
      colors: [],
      note:
        input.pdf || url
          ? 'We could not read what you gave us, so we used your own words instead.'
          : null,
      fellBack: input.pdf !== null || url !== null,
      stages,
      costUsd,
    }
  }

  const message =
    (pdfResult && !pdfResult.ok ? pdfResult.message : null) ??
    (siteResult && !siteResult.ok ? siteResult.message : null) ??
    'Give us one thing to read: a link, a PDF, or a sentence about what you do.'
  emit({ stage: 'failed', detail: message })
  return { ok: false, message, stages, costUsd }
}
