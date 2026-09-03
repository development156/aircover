import 'server-only'

import { randomUUID } from 'node:crypto'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { brandExtractTask, createMesh, type Mesh } from '@sahoda/mesh'
import { openSite, quarantineCorpus } from '@sahoda/research'
import {
  creditCost,
  MESH_TASK_ACTION,
  type CreditInsufficientDetails,
  type MeshContext,
  type WithCreditsFn,
} from '@sahoda/shared'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { declaredColors } from '@/lib/brand/declared-colors'
import { openUploadDoor, type ExtractRunner } from '@/lib/brand/url-door'
import { MAX_PDF_BYTES, MIN_SENTENCE_CHARS, normaliseUrl } from '@/lib/onboarding/door'
import type { DoorPdf } from '@/lib/onboarding/door-request'
import { creditWord } from '@/lib/credit-words'

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
  /** Credits debited from the workspace. Zero unless the PDF arm ran to completion. */
  creditsCharged: number
}

export interface DoorFail {
  ok: false
  message: string
  stages: Stage[]
  costUsd: number
  /** Always zero: a read that failed released its hold. Stated so the receipt can say so. */
  creditsCharged: 0
}

export interface ReadDoorInput {
  /** Described, not carried: `read()` is the copy, and it runs after the size check. */
  pdf: DoorPdf | null
  url: string
  sentence: string
  workspaceId: string
  userId: string
}

/** Injected by tests; the route takes the defaults. */
export interface ReadDoorDeps {
  withCredits?: () => WithCreditsFn
}

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

/**
 * The pricing key for a PDF read. `brand_extract` maps to `brand_research`,
 * which is the one price the door's model call has; there is no separate door
 * price in pricing.config.json and this file may not invent one.
 */
const DOOR_ACTION = MESH_TASK_ACTION.brand_extract

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

type PdfRead =
  | { ok: true; text: string; label: string; costUsd: number; creditsCharged: number }
  | { ok: false; message: string; costUsd: number; creditsCharged: 0 }

const PDF_TOO_LARGE_MESSAGE = `That PDF is over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB. Upload a shorter one, or tell us in your own words.`

const HOLD_FAILED_MESSAGE =
  'Sahoda could not set credits aside for this read, so it did not open your PDF. Nothing was charged. Try again.'

function insufficientMessage(details: CreditInsufficientDetails | undefined): string {
  const required = details?.required ?? creditCost(DOOR_ACTION)
  const available = details?.available ?? 0
  return `Reading a PDF costs ${required} ${creditWord(required)} and this workspace has ${available}. Paste your website link instead, which is free, or add credits and try again.`
}

/**
 * THE PDF ARM IS PAID WORK, AND IT NOW HOLDS CREDITS LIKE EVERY OTHER PAID PATH.
 *
 * `brand_extract` is a standard-tier model call and the OCR escalation below
 * it is a metered provider engine. Both ran with no hold and no ceiling: any
 * signed-in workspace could loop them at Sahoda's expense while its own screen
 * showed an estimate nobody was charged. The whole arm now runs inside one
 * `withCredits`: HOLD before the first parse, DEBIT only when the read returns
 * text, RELEASE on every failure. The customer pays for output or for nothing.
 *
 * ONE hold covers the free parser AND the OCR retry, so escalating does not
 * bill twice. The object ref is the trace id: every read is a new spend, and a
 * retry after a failure has nothing to replay because its hold was released.
 *
 * The size check is BEFORE the hold and before `read()`, so an oversize PDF
 * costs neither a ledger row nor a copy of its bytes.
 */
async function readPdf(
  input: ReadDoorInput,
  pdf: DoorPdf,
  emit: (s: Omit<Stage, 'ms'>) => void,
  resolveWithCredits: () => WithCreditsFn,
): Promise<PdfRead> {
  if (pdf.size > MAX_PDF_BYTES) {
    return { ok: false, costUsd: 0, creditsCharged: 0, message: PDF_TOO_LARGE_MESSAGE }
  }

  let withCredits: WithCreditsFn
  try {
    withCredits = resolveWithCredits()
  } catch (error) {
    reportPaidActionFailure('door.pdf', error)
    return {
      ok: false,
      costUsd: 0,
      creditsCharged: 0,
      message: isDeploymentConfigCause(error) ? DEPLOYMENT_CONFIG_MESSAGE : HOLD_FAILED_MESSAGE,
    }
  }

  const traceId = randomUUID()
  // The read's own verdict, carried out of the wrapper. Throwing inside is what
  // releases the hold; the sentence the customer reads is this one.
  let refused: PdfRead | null = null

  const credits = await withCredits(
    { workspaceId: input.workspaceId, action: DOOR_ACTION, objectRef: `door:${traceId}` },
    async (charge) => {
      const outcome = await readPdfUncharged(pdf, emit, {
        workspaceId: input.workspaceId,
        traceId,
        userId: input.userId,
        actionType: charge.actionType,
        creditsCharged: charge.creditsCharged,
      })
      if (!outcome.ok) {
        refused = outcome
        throw new Error('DOOR_READ_FAILED') // -> RELEASE, no charge
      }
      return outcome // -> DEBIT, the only charged path
    },
  )

  if (credits.ok) return { ...credits.data.data, creditsCharged: creditCost(DOOR_ACTION) }
  if (refused !== null) return refused

  if (credits.error.code === 'CREDIT_INSUFFICIENT') {
    return {
      ok: false,
      costUsd: 0,
      creditsCharged: 0,
      message: insufficientMessage(credits.error.details as CreditInsufficientDetails | undefined),
    }
  }
  reportPaidActionFailure('door.pdf', credits.error)
  return {
    ok: false,
    costUsd: 0,
    creditsCharged: 0,
    message: isDeploymentConfigCause(credits.error)
      ? DEPLOYMENT_CONFIG_MESSAGE
      : HOLD_FAILED_MESSAGE,
  }
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
 *
 * Runs INSIDE the credit hold `readPdf` takes, which is what makes the
 * automatic escalation defensible: the customer agreed to one price for one
 * read, and the engine choice is ours to make within it.
 */
async function readPdfUncharged(
  pdf: DoorPdf,
  emit: (s: Omit<Stage, 'ms'>) => void,
  ctx: MeshContext,
): Promise<
  | { ok: true; text: string; label: string; costUsd: number }
  | { ok: false; message: string; costUsd: number; creditsCharged: 0 }
> {
  emit({ stage: 'pdf.start', detail: `Reading ${pdf.name}` })
  const bytes = await pdf.read()
  const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`

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
  if (free.reason !== 'unreadable') {
    return { ok: false, message: free.message, costUsd: 0, creditsCharged: 0 }
  }

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
  if (!ocr.ok) return { ok: false, message: ocr.message, costUsd: estimate, creditsCharged: 0 }

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
  deps: ReadDoorDeps = {},
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
    input.pdf
      ? readPdf(input, input.pdf, emit, deps.withCredits ?? getWithCredits)
      : Promise.resolve(null),
    url ? readSite(url, emit) : Promise.resolve(null),
  ])

  const costUsd = pdfResult?.costUsd ?? 0

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
      creditsCharged: pdfResult.creditsCharged,
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
      creditsCharged: 0,
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
      creditsCharged: 0,
    }
  }

  const message =
    (pdfResult && !pdfResult.ok ? pdfResult.message : null) ??
    (siteResult && !siteResult.ok ? siteResult.message : null) ??
    'Give us one thing to read: a link, a PDF, or a sentence about what you do.'
  emit({ stage: 'failed', detail: message })
  return { ok: false, message, stages, costUsd, creditsCharged: 0 }
}
