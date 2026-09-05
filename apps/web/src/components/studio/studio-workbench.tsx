'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ChevronDown,
  ImageIcon,
  Loader2,
  Lock,
  Minus,
  Plus,
  Sparkles,
  Stamp,
  X,
} from 'lucide-react'
import {
  DEFAULT_STAMP_OPTIONS,
  IMAGE_TIER_ACTION,
  creditCost,
  type BrandSignal,
  type GenerationMode,
  type StampAnchor,
  type StampSizeStep,
} from '@sahoda/shared'

import { queueGeneration } from '@/app/actions/studio'
import { colorNames } from '@/lib/brand/color-name'
import { creditWord } from '@/lib/credit-words'
// Lazy: a canvas editor is a large chunk that most visits never open, and the
// Studio's first paint is where a person is deciding whether to spend.
const DrawModal = dynamic(() =>
  import('@/components/studio/draw-modal').then((mod) => mod.DrawModal),
)

import { ModelPicker } from '@/components/studio/model-picker'
import { PictureActions } from '@/components/studio/picture-actions'
import { PictureViewer } from '@/components/studio/picture-viewer'
import { PromptRefineControl } from '@/components/studio/prompt-refine-control'
import { ReferencePreview } from '@/components/studio/reference-preview'
import { ReferenceUpload } from '@/components/studio/reference-upload'
import { Textarea } from '@/components/ui/textarea'
import { anchorNote } from '@/lib/studio/anchor-note'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { aspectRatioLabel, type StudioFormat } from '@/lib/studio/formats'
import {
  MAX_TRIES_PER_PRESS,
  describeModeBlock,
  promptHintFor,
  readyModes,
  ruleFor,
} from '@/lib/studio/modes'
import { defaultModelId, imageActionFor, modelById } from '@/lib/studio/models'
import type { LibraryRead } from '@/lib/studio/read'
import { PROMPT_STARTERS } from '@/lib/studio/prompt'
import { stampNote } from '@/lib/studio/stamp-copy'
import { describeInsufficient, describePartial } from '@/lib/studio/refusal-copy'

/**
 * THE WORKBENCH: A BAR, THEN THE WORK.
 *
 * ── APPROVED REDESIGN, NOT A TIDY-UP ────────────────────────────────────────
 * The founder compared this screen to a reference product and chose to move
 * away from a tall stacked composer toward a single bar: prompt, controls and
 * the priced primary read left to right in one glance, with the page itself
 * content-led rather than ending in a panel waiting for a picture.
 * `gen3.py`'s own docstring records what was taken from the reference (one
 * bar, the price ON the primary, a content-led page, small pills, a filter
 * row over the work) and what was refused (their palette, their type, their
 * hero collage of sample outputs we do not have).
 *
 * ── PILLS OPEN THE REAL CONTROLS, NEVER A SECOND IMPLEMENTATION OF THEM ─────
 * Model, Approach, Size and Logo are summaries that open the same fieldsets
 * this screen has always used — `ModelPicker`, the mode buttons, the format
 * select, the stamp fieldset. `openPanel` says which one is expanded below
 * the bar; only one at a time, so the bar never grows into the old six-card
 * column. Match and the count stepper need no picker behind them, so they act
 * directly: Match opens the reference grid because picking a reference is
 * itself a decision worth a whole panel, and the count is a −/+ a person can
 * read at a glance.
 *
 * ── EVERY RULE IS ASKED OF `modes.ts`, NEVER RE-IMPLEMENTED HERE ────────────
 * Whether a mode may run, how many references it takes, and the sentence when
 * it may not, all come from one module the server action asks as well.
 *
 * ── EXACTLY ONE OBJECT INVERTS: THE BAR ──────────────────────────────────
 * Founder ruling. Dropping `data-surface="inverse"` entirely removed the
 * three-panel zebra this screen used to have, but it also left the bar
 * painted with `bg-surface` at the SAME value as the page in dark theme
 * (`#171717` on `#0d0d0d`, 1.30:1) — barely separated from the ground it
 * sits on. The zebra came from three panels disagreeing with each other and
 * with the page, not from any one of them being dark. So exactly one element
 * on this screen carries the scope: the composer bar (the `data-guide=
 * "studio-bar"` div, below). Nothing else does — not "Will send", not the
 * result bar, not the work grid, not the empty state.
 *
 * ── THE TRAP THIS HAS ALREADY BITTEN ONCE ─────────────────────────────────
 * Inside `data-surface="inverse"`, `--ink` is WHITE (in light theme; it
 * flips to black when the scope nests under `[data-theme="dark"]`, which is
 * the point — see tokens.css's own header on the inverse surface). The
 * shared `Button`'s primary variant hovers to `bg-ink` with a literal white
 * label, which paints white on white the moment `--ink` is white. `Generate
 * Image` is therefore a CUSTOM button again, hovering through the `--pstrong` /
 * `--pstrong-fg` pair instead (see the button's own className below) — the
 * pair the inverse scope solves for exactly this control, and which already
 * flips correctly with the scope in both themes (tokens.css lines 703–742,
 * 856–863). Every other control inside the bar (the pills, the stepper, the
 * locked "N more", the reference tiles) resolves `--ink`, `--line`, `--s2`
 * and `--surface-3` through the same scope and needed no change: those
 * tokens are the six aliases the scope re-declares on its own element, so a
 * descendant using `bg-s2` or `text-muted` already picks up the dark ladder
 * correctly (tokens.css's own comment on `--brand-deep` is the trap this
 * would otherwise repeat).
 */
/**
 * The controls this screen is designed for and does not have.
 *
 * ── WHY THEY ARE ON THE SCREEN AT ALL ───────────────────────────────────────
 * Named so the gap is trackable rather than invisible. The bar's own "N more"
 * chip counts this list, so the two can never drift apart.
 *
 * They render as spans. `design-lint.mjs` rule 3 refuses `<button disabled>`
 * beside a coming-soon label, and it is right: a disabled button is still
 * announced as an action.
 *
 * ── A NAME LEAVES THIS LIST THE DAY IT SHIPS ───────────────────────────────
 * "Tidy my words" sat here after the refiner shipped, so the screen carried a
 * lock beside a control that was rendering, working and charging a credit a
 * few hundred pixels above it. A list of what is missing is only useful while
 * it is true, and a stale entry here is the same defect as a stale number
 * anywhere else in this product: delete the name in the commit that builds
 * the thing.
 */
const COMING_SOON = [
  { title: 'Leave out' },
  { title: 'Same again' },
  { title: 'Follow how closely' },
] as const

/**
 * The four corners a stamp may sit in, in reading order.
 *
 * The values are `StampAnchor`'s own four strings from `@sahoda/shared` — never
 * retyped here — so a choice this screen offers is always one the server
 * action's own validation accepts.
 */
const ANCHOR_OPTIONS: readonly { value: StampAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

/** The three named sizes, smallest first. Never a slider: see `StampOptionsSchema`'s own header. */
const SIZE_STEP_OPTIONS: readonly { value: StampSizeStep; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

/**
 * The field this brain leaf was built from, `brand-signals.ts`'s own string,
 * turned into a label a reader recognises. Sentence-cased rather than
 * relisted here: a second list of field names is how one drifts from the
 * other the first time a leaf is added there and not here.
 */
function labelFor(field: string): string {
  return field.length === 0 ? field : field[0]!.toUpperCase() + field.slice(1)
}

/**
 * `brandSignalsFor` names this leaf `colours` and its `value` is the raw
 * theme tokens joined with `, ` — `oklch(0.5663 0.16 262.1)` and the like.
 * Printing that string is the single worst thing the old screen did: a shop
 * owner reads notation, not colour. This never prints it; it always paints
 * it, as swatches, and only for the one leaf that is actually colour.
 */
function colourValuesOf(signal: { field: string; value: string }): string[] | null {
  return signal.field === 'colours' ? signal.value.split(', ').filter((c) => c !== '') : null
}

/** Which pill's own control is expanded below the bar. One at a time. */
type OpenPanel = 'model' | 'approach' | 'size' | 'match' | 'logo' | null

/** Which shape of work the filter row is narrowed to. */
type WorkFilter = 'all' | 'square' | 'story' | 'wide' | 'logo'

const FILTERS: readonly { value: WorkFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'square', label: 'Square post' },
  { value: 'story', label: 'Story' },
  { value: 'wide', label: 'Wide' },
  { value: 'logo', label: 'With logo' },
]

/**
 * Which filter a picture belongs to, from its own shape and logo outcome —
 * never from the currently-chosen format, which is a fact about the NEXT
 * press and not about a picture already made. A picture with no recorded
 * width or height only ever matches "All".
 */
function categoryOf(picture: CanvasPicture): WorkFilter[] {
  const out: WorkFilter[] = []
  if (picture.stampOutcome === 'stamped') out.push('logo')
  if (picture.width === null || picture.height === null) return out
  const ratio = picture.width / picture.height
  if (ratio >= 0.94 && ratio <= 1.06) out.push('square')
  else if (ratio < 0.94) out.push('story')
  else out.push('wide')
  return out
}

export function StudioWorkbench({
  formats,
  library,
  pictures,
  signals,
  balance,
}: {
  formats: StudioFormat[]
  /**
   * Pictures already in this workspace, offered as things to match, or which
   * of two reasons there are none. A failed read is not an empty library.
   */
  library: LibraryRead
  /** What this workspace has already made, newest first, for the canvas. */
  pictures: CanvasPicture[]
  /**
   * What the Brand Brain will add to this request, shown BEFORE the press.
   *
   * The same array `queueGeneration` builds and stores on the row, from the same
   * `brandSignalsFor`. Null means the read failed, which is a different sentence
   * from an empty array — that one means Explore, where adding nothing is
   * correct. `BrandSignalsSchema`'s own header forbids collapsing the two.
   */
  signals: BrandSignal[] | null
  /**
   * Spendable credits, or null when the read did not produce a number.
   *
   * NULL RENDERS AS NOTHING, never as zero and never as a diagnosis. "0 credits
   * left" for a read that failed would tell somebody with a full wallet they
   * cannot afford to work; the page's own comment carries why the sentence for
   * a failed read belongs to the wallet screen rather than here.
   */
  balance: number | null
}) {
  const router = useRouter()
  const [wanted, setWanted] = useState('')
  const [mode, setMode] = useState<GenerationMode>('on_brand')
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [count, setCount] = useState(1)
  const [modelId, setModelId] = useState(defaultModelId)
  /**
   * ── WHAT THE NEXT PRESS WILL DO WITH THE LOGO ─────────────────────────────
   * Seeded from `DEFAULT_STAMP_OPTIONS`, the same value `queueGeneration` falls
   * back to when `stamp` is absent, so a person who never opens this fieldset
   * gets exactly the picture Sahoda has always drawn: on, bottom right, medium.
   */
  const [stampEnabled, setStampEnabled] = useState(DEFAULT_STAMP_OPTIONS.enabled)
  const [stampAnchor, setStampAnchor] = useState<StampAnchor>(DEFAULT_STAMP_OPTIONS.anchor)
  const [stampSizeStep, setStampSizeStep] = useState<StampSizeStep>(DEFAULT_STAMP_OPTIONS.sizeStep)
  const [note, setNote] = useState<string | null>(null)
  const [short, setShort] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [viewing, setViewing] = useState<CanvasPicture | null>(null)
  const [drawing, setDrawing] = useState<CanvasPicture | null>(null)
  /**
   * Which reference thumbnail is expanded large, or none. A reference asset is
   * not a `CanvasPicture` (see `reference-preview.tsx`'s own header for why),
   * so this is kept apart from `viewing` above rather than widening that state
   * to accept a shape it was never built for.
   */
  const [viewingReference, setViewingReference] = useState<{
    assetId: string
    url: string | null
    title: string | null
  } | null>(null)
  const [busy, start] = useTransition()
  /**
   * ── THE SECOND PRESS THAT `busy` ALONE CANNOT STOP ────────────────────────
   * `disabled={!ready || busy}` reads correctly at first glance and is not
   * enough on its own: `busy` is `isPending` from `useTransition`, which is
   * REACT STATE, and React state changes on the next render, not the instant
   * `start()` is called. `generate()` itself runs synchronously and its async
   * body begins executing the moment `start()` is invoked, before React has
   * painted the disabled button. A second click that lands in that window (a
   * fast double-click, or a keyboard Enter fired again before the re-render)
   * reaches `onClick={generate}` a second time and calls `queueGeneration` a
   * second time, and a second call is a second hold on the wallet for a press
   * the person only meant to make once — the exact defect the founder named.
   * A plain ref side-steps React's render cycle entirely: it is read and
   * written synchronously, in the same tick as the click, so the guard is up
   * before the SECOND click's handler can run.
   */
  const pressLocked = useRef(false)
  /**
   * Which pill's own control is open below the bar. Closed by default: the bar
   * is meant to read as ~100px, not as the old composer's six stacked cards
   * open on first paint. Each pill is a summary and a door, never both at once.
   */
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [filter, setFilter] = useState<WorkFilter>('all')
  /**
   * Which version of the ACTIVE picture is on screen.
   *
   * Not per-picture: clicking through the grid lands on a picture that may not
   * have a stamped copy at all, so the choice is re-derived below rather than
   * remembered per id. Defaults to the stamped one — that is the picture the
   * person will post, and the original is one press away.
   */
  const [showing, setShowing] = useState<'stamped' | 'original'>('stamped')

  function togglePanel(name: Exclude<OpenPanel, null>) {
    setOpenPanel((current) => (current === name ? null : name))
  }

  /**
   * Position zero unless somebody has clicked back through the grid. The reader
   * already sorted newest first, so after a generation the refreshed data puts
   * the picture that was just paid for at zero and the canvas shows it with no
   * effect, no id to track, and no chance of showing yesterday's.
   */
  const active = pictures.find((one) => one.imageId === activeId) ?? pictures[0] ?? null

  /**
   * ── WHAT THIS PICTURE'S LOGO STORY IS, ASKED NEVER DERIVED ────────────────
   * `stamp-copy.ts` owns the five answers and refuses to share a sentence
   * between them. This screen only asks. A null outcome is "never attempted",
   * which is why it is passed through rather than defaulted to anything.
   */
  const note_ = active === null ? null : stampNote(active.stampOutcome)
  // Both versions exist only when one was actually stamped AND its link signed.
  // A stamped copy whose preview would not sign is a picture we cannot show, so
  // offering the choice would be a control with nothing behind half of it.
  const bothVersions = note_ !== null && note_.hasBothVersions && active?.stampedUrl != null
  const shown = bothVersions && showing === 'stamped' ? active!.stampedUrl! : (active?.url ?? null)

  const rule = ruleFor(mode, modelId)
  // Asked of the same modules the RULES come from, never re-typed here. A chip
  // that names a model the picker no longer offers is a screen disagreeing with
  // itself about what is about to be spent.
  const modelLabel = modelById(modelId)?.label ?? 'None'
  const chosen = formats.find((f) => f.id === formatId) ?? null
  /**
   * ── THE SHAPE, NOT JUST THE NAME ───────────────────────────────────────
   * "Story" and "Square post" say nothing about the shape being chosen.
   * Derived from the chosen format's own width and height via
   * `aspectRatioLabel` (never a hardcoded table, and never rounded to look
   * tidy: see that function's own header), so a preset added to the
   * catalogue gets a correct ratio here for free.
   */
  const sizeLabel = chosen === null ? 'None' : `${chosen.label} (${aspectRatioLabel(chosen)})`
  // `modelId` only ever holds a catalogue id (the default or a picker choice),
  // so the null arm is the type's; the draft price is its total answer and not
  // a state a person reaches. The server refuses an unknown id before any hold.
  const cost = creditCost(imageActionFor(modelId) ?? IMAGE_TIER_ACTION.draft)
  const total = cost * count
  // The pictures themselves, for the two places that only need to look one up.
  // A failed read has none to look through, which is not the same claim as an
  // empty library — the sentences below keep those apart.
  const libraryPictures = library.status === 'ok' ? library.pictures : []
  // Asked, never re-derived. See this file's header.
  const blocked = describeModeBlock({ mode, references: picked.length, modelId })
  const ready = wanted.trim().length >= 3 && chosen !== null && blocked === null

  const shownPictures =
    filter === 'all' ? pictures : pictures.filter((one) => categoryOf(one).includes(filter))

  /**
   * ── A PRESS THAT CHANGES NOTHING MUST SAY WHY ─────────────────────────────
   * This silently dropped the click once the mode's reference limit was reached:
   * the tile did not select, nothing moved, and nothing was said. A control that
   * ignores a press without explaining is exactly the dead end this product
   * forbids, and it is worse than a refusal because the person cannot tell
   * whether they missed the target or the app is broken.
   *
   * The sentence comes from `modes.ts`, the same one the server action would
   * refuse with, so the screen never invents its own wording for a rule it does
   * not own.
   */
  function toggleReference(assetId: string) {
    setNote(null)
    if (picked.includes(assetId)) {
      setPicked((current) => current.filter((id) => id !== assetId))
      return
    }
    // ── PICKING A PICTURE IN A MODE THAT IGNORES ONE ────────────────────────
    // Explore uses no reference by definition, so a person who picks one has
    // said something the mode cannot honour. Moving them to the mode that DOES
    // is what they meant; refusing the press would be technically correct and
    // useless. It says so, because a mode that changed itself silently would be
    // the screen overruling a choice they made.
    if (rule.maxReferences === 0) {
      setMode('match')
      setPicked([assetId])
      setNote('Explore ignores a picture, so Sahoda moved you to Match a picture.')
      return
    }

    if (picked.length >= rule.maxReferences) {
      setNote(describeModeBlock({ mode, references: picked.length + 1, modelId }))
      return
    }
    setPicked((current) => [...current, assetId])
  }

  /**
   * A picture added from the device, from EITHER upload control.
   *
   * Extracted the moment the composer got its own tile: two call sites doing
   * the mode switch, the limit and the refresh separately is how one of them
   * quietly stops doing the mode switch. `reference-upload.tsx`'s own header
   * records what that already cost once.
   */
  function addReference(assetId: string) {
    setNote(null)
    // Explore uses no reference by definition, so adding one means the other
    // mode. Same move, same sentence, as picking a tile.
    if (rule.maxReferences === 0) {
      setMode('match')
      setPicked([assetId])
      setNote('Explore ignores a picture, so Sahoda moved you to Match a picture.')
      router.refresh()
      return
    }
    // Selected at once. Somebody who adds a picture to match wants to match it,
    // and it appears in the grid below on the refresh already chosen.
    setPicked((current) =>
      current.includes(assetId) || current.length >= rule.maxReferences
        ? current
        : [...current, assetId],
    )
    router.refresh()
  }

  function chooseMode(next: GenerationMode) {
    setNote(null)
    setMode(next)
    // Explore is unconditioned by definition, so keeping references selected
    // would leave a contradiction on screen that the person did not create.
    if (ruleFor(next, modelId).maxReferences === 0) setPicked([])
    // Straight into Match, whatever was chosen: picking an approach is the
    // moment a person needs to know what it does or does not use as a
    // reference, and that legend lives in the Match panel. The old tray kept
    // the reference fieldset visible under the mode buttons for free; this is
    // the same idea with one pill instead of an always-open column.
    setOpenPanel('match')
  }

  /**
   * ── LOADS THE REQUEST BACK, AND DOES NOT SPEND ────────────────────────────
   * The fastest useful action after a picture you almost like is the same
   * request with one word changed, and that used to mean retyping the sentence
   * and re-picking every reference. It fills the controls and stops: firing
   * immediately would spend credits on a press that reads as "show me what I
   * asked for", and the whole point is to change something first.
   *
   * A format since retired is dropped rather than selected, because a select
   * holding a value that is not one of its options silently shows the first one
   * and the person is charged for a size they did not choose.
   */
  function reuse(picture: CanvasPicture) {
    setNote(null)
    setWanted(picture.prompt)
    setMode(picture.mode)
    setPicked(picture.referenceAssetIds.slice(0, ruleFor(picture.mode, modelId).maxReferences))
    if (picture.formatId !== null && formats.some((one) => one.id === picture.formatId)) {
      setFormatId(picture.formatId)
    }
  }

  function generate() {
    // ── THE GUARD ITSELF ───────────────────────────────────────────────────
    // Synchronous, and checked before anything else runs. A second press
    // while the ref is already locked returns immediately: no second
    // `queueGeneration`, no second hold on the wallet. See the ref's own
    // comment for why `busy`/`disabled` alone cannot do this.
    if (pressLocked.current) return
    pressLocked.current = true
    setNote(null)
    setShort(false)
    start(async () => {
      try {
        const result = await queueGeneration({
          mode,
          wanted,
          formatId,
          referenceAssetIds: picked,
          count,
          modelId,
          stamp: { enabled: stampEnabled, anchor: stampAnchor, sizeStep: stampSizeStep },
        })
        if (result.ok) {
          // Silent when everything asked for arrived. A partial result is
          // neither a success nor a failure and gets its own sentence, which
          // names both numbers and says what happened to the money.
          setNote(describePartial({ made: result.made, asked: result.asked }))
          // Back to position zero, so the refreshed data shows the NEW
          // picture rather than whichever older one was being looked at when
          // it started.
          setActiveId(null)
          // The picture itself arrives with the refreshed server data, which
          // also carries its signed link. Holding bytes in state here would
          // put a megabyte in the browser that the next navigation throws
          // away.
          router.refresh()
          return
        }
        setShort(result.insufficient)
        setNote(
          result.insufficient
            ? describeInsufficient({ required: result.required, available: result.available })
            : result.message,
        )
      } finally {
        // Unlocked whichever way the press ended, success, shortfall or
        // refusal, so the NEXT press (a genuinely new one) is never stuck
        // behind a lock this one forgot to release.
        pressLocked.current = false
      }
    })
  }

  return (
    // ── CONTENT-LED, WITH ONE SHARED LEFT EDGE ─────────────────────────────
    // The old screen capped and centred the whole page at the 720px composer's
    // own width. The bar keeps a measure of its own (820px, capped) below —
    // but it is LEFT-aligned, not centred: the title above this component
    // (`PageTitle`, in `page.tsx`) sits flush at the page's own gutter, and a
    // centred bar drifted away from it the moment the page was wider than
    // 820px + 2x whatever margin centring produced. Dropping `mx-auto` here
    // means the bar's left edge, "Will send"'s left edge and the title's left
    // edge are the SAME x, because all three now start at the container's own
    // edge rather than two of them being recomputed by `auto` margins. The
    // work grid stays full width below — that is the one thing that should
    // break the column, and `max-w-[820px]` alone (no `mx-auto`) still caps
    // the bar's own measure so the prompt never runs 1400px wide on a big
    // screen.
    <div className="flex w-full flex-col gap-6" data-guide="studio-workbench">
      <section aria-labelledby="studio-make" className="flex flex-col gap-3">
        <h2 id="studio-make" className="sr-only">
          Make a picture
        </h2>

        <div className="flex w-full max-w-[820px] flex-col gap-3">
          {/* ── THE READOUT RELATES TO THE BAR IT SITS ON ─────────────────────
              Right-aligned inside the SAME capped, left-aligned column as the
              bar below it, so its right edge is the bar's own right edge
              rather than a number floating above whatever the centred column
              happened to be that render. */}
          {balance === null ? null : (
            <div className="flex justify-end">
              <span className="type-sm text-muted" data-guide="studio-balance">
                {/* `creditWord`, never a hardcoded plural: a wallet holding one
                    credit would read "1 credits left". `credit-words.test.ts`
                    scans for exactly this and caught it here. */}
                <span className="num">{balance.toLocaleString()}</span> {creditWord(balance)} left
              </span>
            </div>
          )}

          {/* ── THE BAR: THE ONE OBJECT THAT INVERTS ────────────────────────────
              Row 1 is the prompt and the priced primary. Row 2 is every control,
              each the same 32px pill shape. `data-surface="inverse"` is scoped
              to this element ALONE (see this file's header): everything inside
              it — the pills, the stepper, the reference tiles — resolves
              `--ink`/`--line`/`--s2`/`--surface-3` through this scope's own
              re-declared aliases, which is why none of them needed a literal
              colour change to read correctly. */}
          <div
            className="surface-ring flex flex-col gap-3 rounded-xl bg-surface p-3 shadow-lg"
            data-guide="studio-bar"
            data-surface="inverse"
          >
            <div className="flex items-start gap-4">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="sr-only">What should the picture show?</span>
                <Textarea
                  value={wanted}
                  autoGrow
                  // ── THREE LINES AT REST, NOT ONE ─────────────────────────────
                  // Founder's own complaint against an earlier build: a
                  // single-line box on a screen whose entire purpose is
                  // describing a picture read as an afterthought beside the
                  // starter chips beneath it, each about as tall as the field
                  // itself. `rows={3}` is what `autoGrow`'s own `fit()` measures
                  // FROM on an empty box (no inline height has been set yet, so
                  // `scrollHeight` reports the natural three-row size), so the
                  // rest height is exactly the same "primary object" size the
                  // founder asked for, not a separate constant to keep in step.
                  rows={3}
                  // Grows to roughly eight lines, then scrolls inside itself —
                  // the composer bar must not push the page around without
                  // limit. `Textarea`'s own `fit()` caps `scrollHeight` at
                  // `line-height * maxRows` and switches to an internal
                  // scrollbar past it, so this is the one number to change if
                  // that ceiling ever needs to move.
                  maxRows={8}
                  maxLength={1000}
                  placeholder={promptHintFor(mode)}
                  onChange={(event) => setWanted(event.target.value)}
                  onKeyDown={(event) => {
                    // ── ENTER STILL INSERTS A NEWLINE, UNCHANGED ────────────────
                    // A `<textarea>` already does this natively and nothing here
                    // intercepts a bare Enter — a multi-line prompt needs to be
                    // typeable a sentence at a time without every line break
                    // firing a paid press. Cmd/Ctrl+Enter is ADDED as the
                    // keyboard submit, a new affordance rather than a changed
                    // one, mirroring the same `ready && !busy` gate the button's
                    // own `disabled` attribute enforces — a keydown handler that
                    // called `generate` unconditionally would bypass it.
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      if (ready && !busy) generate()
                    }
                  }}
                  data-guide="studio-prompt"
                  // The prompt is the loudest thing on the bar and does not need
                  // a box drawn round it: it already sits on the bar's own
                  // surface. `bg-transparent` keeps that fill rather than
                  // stacking a second one at the same value. `min-h-0`
                  // overrides the shared Textarea's own `min-h-[74px]`: that
                  // floor is correct for a form field sized on purpose, but it
                  // fights `autoGrow` here — the box measures its own content
                  // via `scrollHeight` and sets an inline height, and a CSS
                  // min-height above that inline value wins anyway. The visible
                  // floor now comes from `rows={3}` above, not from this class.
                  className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 type-h3 font-[400] shadow-none focus-visible:outline-none"
                />
              </label>

              {/* ── THE PRICE IS ON THE PRIMARY, AND THE BUTTON IS CUSTOM ────────
                  `Generate Image` carries the total as its own second line.
                  The price and the press are one decision, and a cost
                  floating beside the button on its own row would read as
                  unrelated to it.
                  A CUSTOM button, not the shared `Button`: `Button`'s primary
                  variant hovers to `bg-ink`, which is correct on the page and
                  wrong in here — inside `data-surface="inverse"`, `--ink` IS
                  white (in light theme), so that hover would paint white text
                  on a white fill. `--pstrong`/`--pstrong-fg` are the pair this
                  scope solves for exactly this control: the fill LIFTS on
                  hover rather than darkening toward the panel behind it, and
                  the pair already flips correctly per theme (this file's own
                  header).

                  ── UNMISTAKABLY BUSY, NOT JUST DISABLED ─────────────────────
                  The founder's own complaint: a second press burns credits,
                  and the old spinner-in-a-corner did not read as "something
                  is happening" at a glance. While `busy`, the label itself
                  changes to name what is happening (never staying "Generate
                  Image" as if nothing had been pressed), the fill dims a step
                  so the whole control reads as working rather than merely
                  greyed out, and `aria-busy` carries the same fact to a
                  screen reader. `pressLocked` (see its own comment) is the
                  part that actually stops a second spend; `disabled` and this
                  visible state are what make that unnecessary to discover by
                  trying it twice. */}
              <button
                type="button"
                onClick={generate}
                disabled={!ready || busy}
                aria-busy={busy || undefined}
                data-guide="studio-generate"
                className={`inline-flex h-[56px] shrink-0 flex-col items-start justify-center gap-0 rounded-lg bg-primary px-5 text-primary-foreground transition-micro hover:bg-primary-strong hover:text-primary-strong-foreground active:translate-y-[0.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:shadow-[inset_0_0_0_1px_var(--line)] ${
                  busy
                    ? 'disabled:bg-primary/80 disabled:text-primary-foreground disabled:opacity-100'
                    : 'disabled:bg-s2 disabled:text-muted disabled:opacity-100'
                }`}
              >
                <span className="flex items-center gap-1.5 type-sm font-[650]">
                  {busy ? (
                    <Loader2 className="size-[15px] animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-[15px]" aria-hidden />
                  )}
                  {busy ? 'Generating image…' : 'Generate Image'}
                </span>
                <span className="num type-sm font-[500] opacity-75">
                  {total} {creditWord(total)}
                </span>
              </button>
            </div>

            {/* ── REWRITE FOR THE MODEL, PRICED BEFORE THE PRESS ──────────────────
                What the founder asked for: a control that takes what somebody
                typed and rewrites it in terms of how the picture should be made.
                Its own file (`prompt-refine-control.tsx`) owns the press-lock,
                the price and the reversibility; this screen only hands it the
                prompt and the setter, the same contract `wanted`/`setWanted`
                already are. */}
            <PromptRefineControl wanted={wanted} onChange={setWanted} />

            {/* ── SOMETHING TO TRY ──────────────────────────────────────────────
                A box nobody knows what to put in stays empty. These FILL the box
                rather than generating, so nothing is spent by trying one and the
                words can be edited first. Hidden once there is something to
                edit, because then they are only in the way. */}
            {wanted.trim() === '' ? (
              <ul className="flex flex-wrap gap-2" data-guide="studio-starters">
                {PROMPT_STARTERS.map((starter) => (
                  <li key={starter}>
                    <button
                      type="button"
                      onClick={() => setWanted(starter)}
                      className="surface-ring rounded-pill bg-s2 px-3 py-1 text-left type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {starter}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* ── QUICK ADD, WITHOUT OPENING MATCH ──────────────────────────────
                A 44px tile that works whether or not the Match panel is open,
                because the photograph on the phone in somebody's hand should
                not need a panel opened first. The numeral on each thumbnail is
                the pick ORDER, not a tick: `signReferences` sends them in that
                order and the first weighs most.

                ── ONE DOOR TO "ADD A PICTURE", NOT TWO ──────────────────────────
                This row used to render even with nothing picked, inviting a
                picture right beside the Match pill in Row 2 below — the same
                door twice, adjacent. The Match pill is the way IN now (it
                reads better in the control row, and its own panel carries a
                full `ReferenceUpload`); this row appears only once a picture
                has actually been picked, because the numbered thumbnails are
                worth showing and the empty invitation twice is not. */}
            {picked.length > 0 ? (
              <ul className="flex flex-wrap items-center gap-2" data-guide="studio-picked">
                {picked.map((assetId, at) => {
                  const picture = libraryPictures.find((one) => one.assetId === assetId) ?? null
                  const named = picture?.title ?? 'this picture'
                  return (
                    <li key={assetId} className="relative">
                      {/* ── CLICK OPENS A LARGE PREVIEW, NEVER REMOVES ──────────────
                          `toggleReference` used to live on THIS button, so the only
                          way to see a reference large was back into the Match
                          panel and the only way to drop one was the same click that
                          somebody might have meant as "show me this bigger". The X
                          below is now the one and only removal path. */}
                      <button
                        type="button"
                        onClick={() =>
                          setViewingReference({
                            assetId,
                            url: picture?.url ?? null,
                            title: picture?.title ?? null,
                          })
                        }
                        aria-label={`Open ${named} large, picked ${at + 1} of ${picked.length}`}
                        className="surface-ring relative block size-[44px] overflow-hidden rounded-sm transition-micro hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {picture?.url == null ? (
                          <span className="flex size-full items-center justify-center bg-s2" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- a
                          // short-lived signed URL from a private bucket cannot be
                          // optimised without proxying the credential.
                          <img
                            src={picture.url}
                            alt=""
                            className="size-full object-cover object-top"
                          />
                        )}
                        <span className="absolute bottom-0 left-0 flex size-[16px] items-center justify-center rounded-pill bg-primary type-sm text-primary-foreground">
                          <span className="num">{at + 1}</span>
                        </span>
                      </button>
                      {/* ── THE ONE REMOVAL PATH, NAMED ─────────────────────────────
                          `toggleReference` is the same function the Match panel's
                          own grid uses to unpick a picture — never a second removal
                          path. Removing an earlier entry re-slices `picked`, and
                          because the numeral above is read from THIS array's own
                          index (`at + 1`), the remaining thumbnails renumber for
                          free: no separate renumbering step to keep in step. */}
                      <button
                        type="button"
                        onClick={() => toggleReference(assetId)}
                        aria-label={`Stop matching ${named}, picked ${at + 1} of ${picked.length}`}
                        className="surface-ring absolute -right-1.5 -top-1.5 flex size-[16px] items-center justify-center rounded-full bg-surface-3 text-ink transition-micro hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <X className="size-[10px]" aria-hidden />
                      </button>
                    </li>
                  )
                })}
                <li>
                  <ReferenceUpload
                    compact
                    disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
                    onAdded={addReference}
                  />
                </li>
                <li className="type-sm text-muted">
                  <span className="num">{picked.length}</span> to match, in order
                </li>
              </ul>
            ) : null}

            {/* ── ROW 2: ONE CONTROL SHAPE FOR EVERY PILL ───────────────────────
                Match, a divider, then Model, Approach and Size — each a bare
                value with a caret, opening the fieldset it summarises. The
                count is a −/+ a person reads at a glance rather than another
                door. The logo pill is the same shape again, and "N more" names
                what is designed and not built without pretending it is a door
                too: it is a `<span>`, never a button. */}
            <div className="flex flex-wrap items-center gap-2" data-guide="studio-chips">
              <PillButton
                icon={<ImageIcon className="size-[14px]" aria-hidden />}
                label="Match"
                axisLabel={
                  picked.length === 0 ? 'Match, none picked' : `Match, ${picked.length} picked`
                }
                onClick={() => togglePanel('match')}
                expanded={openPanel === 'match'}
                controls="studio-panel-match"
              />

              <span aria-hidden className="mx-1 h-[20px] w-px bg-line" />

              <PillButton
                label={modelLabel}
                axisLabel={`Model, ${modelLabel}`}
                onClick={() => togglePanel('model')}
                expanded={openPanel === 'model'}
                controls="studio-panel-model"
                caret
              />
              <PillButton
                label={rule.label}
                axisLabel={`Approach, ${rule.label}`}
                onClick={() => togglePanel('approach')}
                expanded={openPanel === 'approach'}
                controls="studio-panel-approach"
                caret
              />
              <PillButton
                label={sizeLabel}
                axisLabel={`Size, ${sizeLabel}`}
                onClick={() => togglePanel('size')}
                expanded={openPanel === 'size'}
                controls="studio-panel-size"
                caret
              />

              {/* ── HOW MANY TRIES, AS A STEPPER ────────────────────────────────
                  Bounded by the same `MAX_TRIES_PER_PRESS` the action enforces,
                  never a literal. Four separate calls, not a matching set: the
                  routed model draws one picture per call, so these will differ
                  from each other, which is what the note beneath the bar says
                  once more than one is chosen. */}
              <div
                role="group"
                aria-label="How many pictures this press makes"
                className="surface-ring flex h-control items-center gap-0.5 rounded-pill bg-s2 px-1"
                data-guide="studio-count"
              >
                <button
                  type="button"
                  aria-label="Fewer pictures this press"
                  disabled={count <= 1}
                  onClick={() => setCount((n) => Math.max(1, n - 1))}
                  className="flex size-[26px] items-center justify-center rounded-full text-muted transition-micro hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
                >
                  <Minus className="size-[13px]" aria-hidden />
                </button>
                <span className="num type-sm w-[16px] text-center font-[550]" aria-hidden>
                  {count}
                </span>
                <button
                  type="button"
                  aria-label="More pictures this press"
                  disabled={count >= MAX_TRIES_PER_PRESS}
                  onClick={() => setCount((n) => Math.min(MAX_TRIES_PER_PRESS, n + 1))}
                  className="flex size-[26px] items-center justify-center rounded-full text-muted transition-micro hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
                >
                  <Plus className="size-[13px]" aria-hidden />
                </button>
              </div>

              <PillButton
                icon={<Stamp className="size-[14px]" aria-hidden />}
                label={stampEnabled ? 'Logo on' : 'Logo off'}
                axisLabel={`Logo, ${stampEnabled ? 'on' : 'off'}`}
                onClick={() => togglePanel('logo')}
                expanded={openPanel === 'logo'}
                controls="studio-panel-logo"
                caret
              />

              <div className="grow" />

              {/* ── NAMED, NOT A DOOR, AND LEGIBLE ───────────────────────────────
                  A `<span>`, never a button: nothing behind it opens, because
                  these four are designed and not built. `design-lint.mjs` rule 3
                  refuses a disabled button paired with coming-soon copy for
                  exactly this reason — a screen reader still announces a
                  disabled button as an action the reader could take.
                  No `opacity-70` here, on purpose: this is a promise about
                  what is coming, not chrome, and dimming it on top of
                  `text-muted`'s own lighter weight read as disabled rather
                  than as a label worth reading. The lock icon still says it
                  is not a door; the text no longer looks like it is fading
                  out of the control row. */}
              <span className="flex items-center gap-1.5 type-sm text-muted">
                <Lock className="size-[12px]" aria-hidden />
                <span className="num">{COMING_SOON.length}</span> more
              </span>
            </div>

            {count === 1 ? null : (
              <p className="type-sm text-muted">
                <span className="num">{count}</span> different pictures from the same description,
                so you can pick. They will not match each other.
              </p>
            )}

            {/* Inside the bar, because it is about THIS press. */}
            {blocked === null ? null : (
              <p
                role="status"
                className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
              >
                {blocked}
              </p>
            )}

            {/* ── THE OPEN PANEL: WHICHEVER PILL WAS PRESSED ─────────────────── */}
            {openPanel === null ? null : (
              <div
                className="surface-ring flex flex-col gap-3 rounded-card bg-canvas p-3"
                id={`studio-panel-${openPanel}`}
              >
                {openPanel === 'model' ? (
                  <ModelPicker
                    modelId={modelId}
                    onChoose={(next) => {
                      setNote(null)
                      setModelId(next)
                      // Trimmed to what the NEW model will look at. Carrying eight
                      // references onto a model that takes three would send a
                      // request the action refuses, after the person had already
                      // chosen them.
                      setPicked((current) => current.slice(0, ruleFor(mode, next).maxReferences))
                      // And off a mode the new model cannot do. Leaving somebody
                      // on a greyed-out Series is a dead end they did not create.
                      if (!ruleFor(mode, next).ready) setMode('on_brand')
                    }}
                  />
                ) : null}

                {openPanel === 'approach' ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="type-sm text-muted">How should Sahoda approach it?</legend>
                    <div className="grid gap-2 narrow:grid-cols-3 max-narrow:grid-cols-1">
                      {readyModes(modelId).map((option) => (
                        <button
                          key={option.mode}
                          type="button"
                          onClick={() => chooseMode(option.mode)}
                          aria-pressed={mode === option.mode}
                          className={`surface-ring rounded-card px-3 py-1.5 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            mode === option.mode
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-s2 text-muted'
                          }`}
                        >
                          <span className="block type-sm font-[550]">{option.label}</span>
                          <span className="block type-sm">{option.what}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {openPanel === 'size' ? (
                  <label className="flex flex-col gap-1">
                    <span className="type-sm text-muted">What size?</span>
                    <select
                      value={formatId}
                      onChange={(event) => setFormatId(event.target.value)}
                      className="surface-ring h-input w-fit rounded-sm bg-s2 px-2 type-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      data-guide="studio-format"
                    >
                      {formats.map((format) => (
                        <option key={format.id} value={format.id}>
                          {format.label} ({aspectRatioLabel(format)})
                        </option>
                      ))}
                    </select>
                    {chosen === null ? null : (
                      <span className="type-sm text-muted">
                        <span className="num">{chosen.width}</span> by{' '}
                        <span className="num">{chosen.height}</span> pixels, for{' '}
                        <span className="num">{chosen.channels.length}</span> of your channels.
                      </span>
                    )}
                  </label>
                ) : null}

                {/* ── WHAT TO MATCH ────────────────────────────────────────────────
                    Shown for every mode, including the one that ignores
                    references. Picking one MOVES a person to the mode that uses
                    it, so the choice is honoured rather than ignored. */}
                {openPanel === 'match' ? (
                  <fieldset className="flex flex-col gap-2" data-guide="studio-references">
                    <legend className="type-sm text-muted">
                      {rule.maxReferences === 0
                        ? 'Picking a picture here moves you to Match a picture.'
                        : rule.minReferences > 0
                          ? 'Which picture should Sahoda match?'
                          : 'Anything Sahoda should match? (optional)'}
                    </legend>

                    <ReferenceUpload
                      disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
                      onAdded={addReference}
                    />

                    {/* ── THREE ANSWERS, THREE SENTENCES ────────────────────────────
                        A failed read used to arrive as an empty list and be told
                        "You have no pictures yet", which is false for anybody
                        with a library. */}
                    {library.status === 'unreadable' ? (
                      <p
                        role="status"
                        className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
                      >
                        Sahoda could not read your pictures just now. You can still add one from
                        this device, or make one below.
                      </p>
                    ) : library.status === 'no-workspace' ? (
                      <p
                        role="status"
                        className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
                      >
                        There is no workspace to read pictures from, so there is nothing here to
                        match.
                      </p>
                    ) : library.pictures.length === 0 ? (
                      <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
                        You have no pictures yet. Add one from this device, or make one below, and
                        it appears here to match.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-6 gap-1.5">
                        {library.pictures.map((picture) => {
                          // The POSITION, not a yes. `signReferences` sends them in
                          // pick order and the first weighs most, so an order-free
                          // tick hides something the model acts on.
                          const at = picked.indexOf(picture.assetId)
                          const on = at !== -1
                          return (
                            <li key={picture.assetId}>
                              <button
                                type="button"
                                onClick={() => toggleReference(picture.assetId)}
                                aria-pressed={on}
                                aria-label={
                                  on
                                    ? `${picture.title ?? 'A picture in your library'}, picked ${at + 1} of ${picked.length}`
                                    : (picture.title ?? 'A picture in your library')
                                }
                                className={`surface-ring relative block w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                                  on ? 'ring-2 ring-accent' : ''
                                }`}
                              >
                                {picture.url === null ? (
                                  <span className="flex aspect-square items-center justify-center bg-s2 type-sm text-muted">
                                    no preview
                                  </span>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element -- as above.
                                  <img
                                    src={picture.url}
                                    alt={picture.title ?? 'A picture in your library'}
                                    className="aspect-square w-full object-cover object-top"
                                  />
                                )}
                                {on ? (
                                  <span className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-primary type-sm text-primary-foreground">
                                    <span className="num">{at + 1}</span>
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </fieldset>
                ) : null}

                {/* ── YOUR LOGO: WHETHER, WHERE, HOW BIG ──────────────────────────
                    Three named steps for size, never a slider a person cannot
                    judge by looking at it — `StampOptionsSchema`'s own header
                    carries the reasoning. */}
                {openPanel === 'logo' ? (
                  <fieldset className="flex flex-col gap-2" data-guide="studio-logo">
                    <legend className="type-sm text-muted">Stamp your logo on this picture?</legend>
                    <div
                      role="group"
                      aria-label="Stamp your logo on this picture"
                      className="surface-ring flex w-fit gap-1 rounded-pill bg-s2 p-1"
                    >
                      {(
                        [
                          { value: true, label: 'Stamp it' },
                          { value: false, label: 'Leave it off' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          onClick={() => setStampEnabled(option.value)}
                          aria-pressed={stampEnabled === option.value}
                          className={`rounded-pill px-3 py-1 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            stampEnabled === option.value
                              ? 'bg-surface-3 text-ink'
                              : 'text-muted hover:text-ink'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {/* Both real controls, disabled (not hidden) once the stamp is
                        off: a corner and a size that will not be used this press
                        are correctly announced as unavailable. */}
                    <div className="flex flex-wrap gap-2" data-guide="studio-logo-corner">
                      {ANCHOR_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!stampEnabled}
                          onClick={() => setStampAnchor(option.value)}
                          aria-pressed={stampAnchor === option.value}
                          className={`surface-ring rounded-card px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                            stampAnchor === option.value
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-s2 text-muted'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2" data-guide="studio-logo-size">
                      {SIZE_STEP_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!stampEnabled}
                          onClick={() => setStampSizeStep(option.value)}
                          aria-pressed={stampSizeStep === option.value}
                          className={`surface-ring rounded-card px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                            stampSizeStep === option.value
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-s2 text-muted'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <p className="type-sm text-muted">
                      {stampEnabled
                        ? 'Sahoda keeps the unstamped original too, so this is never a one-way choice.'
                        : 'This picture is drawn without your logo. Nothing already made changes, and you can turn it back on for the next one.'}
                    </p>
                  </fieldset>
                ) : null}
              </div>
            )}
          </div>

          {/* ── "WILL SEND": A LABEL COLUMN AND A VALUE COLUMN, NOT A PARAGRAPH ──
              This used to be one `flex-wrap` row of dot-label-value groups,
              which read fine for two short facts and became a paragraph the
              moment a real workspace had five: the eyebrow stayed inline with
              the first pair, later labels started wherever the previous
              value's wrap happened to end, and "Character Mentor" (a business
              name) ran three times longer than "Warm cream, deep brown, one
              orange" and dragged the whole row to the right edge with it.
              `grid-cols-[auto_1fr]` gives every row the SAME two columns: the
              label column sizes itself to the widest label and never wraps
              (`whitespace-nowrap`), so every value starts at the same x, and
              the value itself is `line-clamp-2` rather than left to keep
              growing — the long value's WORDS are unchanged, only how many
              lines it may claim before truncating. */}
          <div className="flex flex-col gap-1.5" data-guide="studio-signals">
            <span className="type-eyebrow text-muted">Will send</span>
            {signals === null ? (
              <p className="type-sm text-muted">
                Sahoda could not read your Brand Brain just now, so it cannot show what it would
                add. The picture can still be drawn.
              </p>
            ) : signals.length === 0 ? (
              <p className="type-sm text-muted">
                Nothing from your Brand Brain. Fill it in and pictures start looking like your
                business rather than generic.
              </p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
                {signals.map((signal) => {
                  // The one leaf that is colour, and the reason this screen
                  // exists: `signal.value` here is raw theme notation
                  // (`oklch(...)`, comma-joined), and printing it is the exact
                  // defect being fixed. A colour is painted, never spelled.
                  const swatches = colourValuesOf(signal)
                  return (
                    <Fragment key={signal.field}>
                      <dt className="flex items-center gap-1.5 whitespace-nowrap type-sm text-muted">
                        <span
                          aria-hidden
                          className={`size-[6px] shrink-0 rounded-full ${
                            signal.certainty === 'confirmed' ? 'bg-primary' : 'surface-ring-firm'
                          }`}
                        />
                        {labelFor(signal.field)}
                      </dt>
                      <dd className="flex min-w-0 items-baseline gap-1.5">
                        {swatches === null ? (
                          <span className="line-clamp-2 type-sm text-ink">{signal.value}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {swatches.map((colour, at) => (
                              <span
                                key={`${colour}-${at}`}
                                aria-hidden
                                style={{ background: colour }}
                                className="surface-ring size-[13px] shrink-0 rounded-sm"
                              />
                            ))}
                            <span className="sr-only">{colorNames(swatches).join(', ')}</span>
                          </span>
                        )}
                        <span className="sr-only">
                          {signal.certainty === 'confirmed'
                            ? ', which you confirmed'
                            : ', which Sahoda guessed'}
                        </span>
                      </dd>
                    </Fragment>
                  )
                })}
              </dl>
            )}
          </div>

          {/* ── NOT BUILT, NAMED RATHER THAN HIDDEN ──────────────────────────────
              The same choice `ModelPicker` makes for a model we cannot reach,
              shown, visibly not a control, with the reason. Spans, never
              `<button disabled>` — `design-lint.mjs` rule 3 refuses that pairing
              outright, because a screen reader still announces a disabled
              button as an action the reader could take. */}
          <div className="flex flex-wrap items-center gap-2" data-guide="studio-coming-soon">
            <span className="type-eyebrow text-muted">Not built yet</span>
            {COMING_SOON.map((one) => (
              <span
                key={one.title}
                className="surface-ring flex items-center gap-2 rounded-pill px-3 py-1 opacity-70"
              >
                <Lock className="size-[12px] text-muted" aria-hidden />
                <span className="type-sm text-muted">{one.title}</span>
              </span>
            ))}
            <span className="type-sm text-muted">
              Designed and not built. Nothing here changes what a press does today.
            </span>
          </div>

          {note === null ? null : (
            <p role="alert" className="type-sm text-ink">
              {note}{' '}
              {/* A shortfall is the one refusal with a remedy, so it is the one
                  that gets a way out. */}
              {short ? (
                <Link
                  href="/wallet"
                  className="font-[600] underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Top up your wallet
                </Link>
              ) : null}
            </p>
          )}
        </div>
      </section>

      {/* ── THE WORK: CONTENT-LED, FULL PAGE WIDTH ────────────────────────────
          Nothing here is capped at the bar's 820px measure: a grid of pictures
          wants room and a line of text does not. Before a first picture exists
          the grid is replaced by a line saying nothing has been made yet —
          never a void, never invented sample pictures.

          ── ONE OWNER FOR THE STARTERS, NOT TWO ─────────────────────────────
          This block used to repeat the bar's own five starter chips, about
          400px below the identical five chips the bar already shows whenever
          the prompt is empty — which, on a fresh workspace, is always true at
          the same time as this block being shown. The bar keeps them: that is
          the box they FILL. This block states the claim plainly and points up
          at the box that is already open and waiting, rather than opening a
          second copy of the same five buttons. */}
      {pictures.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6" data-guide="studio-empty">
          {/* ── THE PLACE THE FIRST PICTURE WILL APPEAR SAYS SO ────────────────
              Before a picture exists there is no canvas panel to overlay (see
              this file's own note above the button, and the test named "there
              is no canvas panel before anything has been made"), so a person
              waiting on their FIRST press has nowhere on screen that says
              anything is happening besides the button itself. This is that
              place: the same honest, no-percentage sentence the canvas
              overlay uses once a picture exists, `role="status"` so it is
              announced without anybody having to go looking for it. */}
          {busy ? (
            <p role="status" className="type-sm text-muted" data-guide="studio-empty-busy">
              Sahoda is generating your first image now. It usually takes a few seconds, and you can
              leave this screen without losing it.
            </p>
          ) : (
            <p className="type-sm text-muted">
              Nothing made yet. Use an idea from the box above, or write your own, then press
              Generate Image.
            </p>
          )}
        </div>
      ) : (
        <section aria-labelledby="studio-canvas" className="flex flex-col gap-4">
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 id="studio-canvas" className="type-h2">
                  The canvas
                </h2>
                {/* Shape and age, both real facts about the ACTIVE picture rather
                  than the chosen format: switching through the grid can land
                  on a picture drawn at a size nobody has selected since. */}
                {active === null || active.width === null || active.height === null ? null : (
                  <span className="type-sm text-muted" data-guide="studio-canvas-meta">
                    <span className="num">{active.width}</span> ×{' '}
                    <span className="num">{active.height}</span>
                    {active.madeAgo === null ? null : <> · {active.madeAgo}</>}
                  </span>
                )}
              </div>
              {active === null ? null : (
                <PictureActions
                  picture={active}
                  onOpen={() => setViewing(active)}
                  onReuse={() => reuse(active)}
                  onDraw={() => setDrawing(active)}
                />
              )}
            </div>

            {active === null ? null : (
              <div
                className="surface-ring relative flex items-center justify-center overflow-hidden rounded-card bg-s2"
                style={{
                  aspectRatio: chosen === null ? '1 / 1' : `${chosen.width} / ${chosen.height}`,
                }}
                data-guide="studio-canvas"
              >
                {/* ── THE PICTURE ITSELF ────────────────────────────────────────
                    Shown UNDER the drawing message rather than replaced by it,
                    so a second press does not blank the picture somebody is
                    still looking at. */}
                <button
                  type="button"
                  onClick={() => setViewing(active)}
                  aria-label={`Open "${active.prompt}" large`}
                  className="absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                    short-lived signed URL from a private bucket cannot be
                    optimised by next/image without proxying the credential. */}
                  <img
                    src={shown ?? active.url}
                    alt={
                      bothVersions && showing === 'stamped'
                        ? `${active.prompt}, with your logo`
                        : active.prompt
                    }
                    width={active.width ?? undefined}
                    height={active.height ?? undefined}
                    className={`size-full object-contain transition-micro ${busy ? 'opacity-40' : ''}`}
                  />
                </button>

                {busy ? (
                  <p
                    role="status"
                    className="pointer-events-none relative max-w-[38ch] px-6 text-center type-sm text-muted"
                  >
                    Sahoda is generating this image now. It usually takes a few seconds, and you can
                    leave this screen without losing it.
                  </p>
                ) : null}
              </div>
            )}

            {/* ── WHICH ONE DO YOU WANT, AND WHY THERE IS ONLY ONE ────────────────
              The same object shape the bar uses, no inversion: `bg-surface`
              and `surface-ring` follow the page theme. The TOGGLE only exists
              when there are genuinely two pictures. */}
            {note_ === null ? null : (
              <div
                data-guide="studio-logo-bar"
                className="surface-ring flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 pl-4 shadow-lg"
              >
                {bothVersions ? (
                  <div
                    role="group"
                    aria-label="Which version of this picture to show"
                    className="surface-ring flex gap-1 rounded-pill bg-s2 p-1"
                  >
                    {(['stamped', 'original'] as const).map((which) => (
                      <button
                        key={which}
                        type="button"
                        onClick={() => setShowing(which)}
                        aria-pressed={showing === which}
                        className={`rounded-pill px-3 py-1 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          showing === which ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'
                        }`}
                      >
                        {which === 'stamped' ? 'With your logo' : 'Without it'}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* ── WHERE THE MARK LANDED, IN THE SLOT THAT USED TO SAY IT COULD
                    NOT BE KNOWN ────────────────────────────────────────────────
                    This span carried "Exact placement: coming soon" behind a
                    lock for one reason: nothing recorded the corner. The
                    renderer now measures all four and may move the mark off the
                    chosen one, and `studio_generation_images.stamped_anchor`
                    records where it went, so for a picture that HAS a record
                    the lock is no longer the truth.

                    Three outcomes, and they stay three because they are three
                    different facts:
                      moved       say so, and why. The customer set a corner and
                                  got another one, which is the case that must
                                  never be silent
                      as_chosen   say nothing. The mark is where they asked and
                                  there is nothing to announce
                      unrecorded  keep the lock. The column is not applied yet,
                                  or the row predates it, and "we did not record
                                  this" is exactly what the lock has always
                                  meant */}
                <span className="type-sm text-muted" data-guide="studio-frame-note">
                  {bothVersions && showing === 'stamped'
                    ? (() => {
                        const placement = anchorNote({
                          anchor: active.stampAnchor ?? null,
                          reason: active.stampAnchorMovedReason ?? null,
                        })
                        if (placement.moved) return placement.body
                        if (placement.reason === 'as_chosen') return null
                        return (
                          <span className="inline-flex items-center gap-1 opacity-70">
                            <Lock className="size-[11px]" aria-hidden />
                            Exact placement: coming soon
                          </span>
                        )
                      })()
                    : 'As the model drew it'}
                </span>

                <div className="flex min-w-[24ch] flex-1 items-baseline gap-2">
                  <span
                    aria-hidden
                    className={`size-[7px] shrink-0 rounded-full ${
                      note_.dotFilled ? 'bg-primary' : 'surface-ring-firm'
                    }`}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="type-sm font-[550] text-ink">{note_.title}</span>
                    <span className="type-sm text-muted">{note_.body}</span>
                  </div>
                </div>

                {note_.remedy === null ? null : (
                  <Link
                    href={note_.remedy.href}
                    className="surface-ring rounded-pill px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {note_.remedy.label}
                  </Link>
                )}

                {/* ── SAVE AND USE IN A POST: NAMED, NOT BUILT, IN THIS BAR ──────
                    "Save it" and "Use it in a post" already work, on the
                    picture actions row above. Same house pattern as the
                    coming-soon controls: a `<span>` carrying `Lock`, never
                    `<button disabled>`. */}
                <span className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1.5 type-sm text-muted opacity-70">
                    <Lock className="size-[12px]" aria-hidden />
                    Save
                  </span>
                  <span className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-sm font-[550] text-muted opacity-70">
                    <Lock className="size-[12px]" aria-hidden />
                    Use in a post
                  </span>
                </span>
              </div>
            )}

            {bothVersions ? (
              <p className="type-sm text-muted">
                Both versions are saved. Picking one here does not delete the other.
              </p>
            ) : null}
          </div>

          {/* ── THE WORK GRID: FULL PAGE WIDTH, WITH A FILTER ROW ABOVE IT ──────
              Every picture this workspace has made that can actually be drawn,
              newest first, at full page width — a grid of pictures wants room
              and the bar's own 820px measure does not fit that. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="type-eyebrow text-muted">What you have made</span>
                <span className="type-sm text-muted">Open one to change it</span>
              </div>
              <div className="flex flex-wrap gap-2" data-guide="studio-filter">
                {FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    aria-pressed={filter === option.value}
                    className={`rounded-pill px-3.5 py-1.5 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      filter === option.value
                        ? 'bg-ink text-canvas'
                        : 'surface-ring text-muted hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {shownPictures.length === 0 ? (
              <p className="type-sm text-muted">Nothing matches this filter yet.</p>
            ) : (
              <ul
                className="grid grid-cols-3 gap-3 narrow:grid-cols-4 wide:grid-cols-6"
                data-guide="studio-strip"
              >
                {shownPictures.map((picture) => {
                  const on = picture.imageId === (active?.imageId ?? null)
                  const meta = [picture.formatId, picture.madeAgo].filter(Boolean).join(' · ')
                  return (
                    <li key={picture.imageId} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveId(picture.imageId)}
                        aria-pressed={on}
                        aria-label={picture.prompt}
                        className={`surface-ring relative block aspect-square w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          on ? 'ring-2 ring-accent' : ''
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
                        <img
                          src={picture.stampedUrl ?? picture.url}
                          // Empty on purpose: the BUTTON is already labelled with
                          // the prompt, and a screen reader announcing it twice
                          // makes a grid of twelve read as twenty-four things.
                          alt=""
                          // Top-anchored: a square crop of a portrait photograph
                          // cuts a face off at the chin, and this product's
                          // pictures are food, shopfronts and people.
                          className="size-full object-cover object-top"
                        />
                      </button>
                      {meta === '' ? null : <span className="num type-sm text-muted">{meta}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <p className="type-sm text-muted">
            Every picture is saved to your library the moment it is made, so nothing is lost if you
            leave.
          </p>
        </section>
      )}

      <PictureViewer picture={viewing} onClose={() => setViewing(null)} />

      <ReferencePreview picture={viewingReference} onClose={() => setViewingReference(null)} />

      <DrawModal
        open={drawing !== null}
        onClose={() => setDrawing(null)}
        picture={
          drawing === null || drawing.width === null || drawing.height === null
            ? null
            : {
                url: drawing.url,
                width: drawing.width,
                height: drawing.height,
                prompt: drawing.prompt,
              }
        }
        onSaved={(assetId) => {
          setNote(null)
          // Straight into the mode that uses it, with it already picked. A
          // marked picture left unselected is a press that led nowhere.
          setMode('edit')
          setPicked([assetId])
          router.refresh()
        }}
      />
    </div>
  )
}

/**
 * ONE PILL SHAPE, EVERY TIME.
 *
 * The bar's second row is Match, Model, Approach, Size and Logo, and every one
 * of them is this same 32px shape: an optional leading icon, a bare value —
 * never "axis value" — and an optional trailing caret. The axis lives on the
 * accessible name instead, so a screen reader hears "Model, Everyday" even
 * though the label on screen only says "Everyday".
 */
function PillButton({
  icon,
  label,
  axisLabel,
  onClick,
  expanded,
  controls,
  caret = false,
}: {
  icon?: React.ReactNode
  label: string
  axisLabel: string
  onClick: () => void
  expanded: boolean
  controls: string
  caret?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={axisLabel}
      className="surface-ring flex h-control items-center gap-1.5 rounded-pill bg-s2 px-3 type-sm font-[550] text-ink transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {icon}
      <span aria-hidden>{label}</span>
      {caret ? (
        <ChevronDown
          className={`size-[12px] shrink-0 text-muted transition-micro ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      ) : null}
    </button>
  )
}
