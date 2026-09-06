'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Lock, Sparkles } from 'lucide-react'
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
import { creditWord } from '@/lib/credit-words'
// Lazy: a canvas editor is a large chunk that most visits never open, and the
// Studio's first paint is where a person is deciding whether to spend.
const DrawModal = dynamic(() =>
  import('@/components/studio/draw-modal').then((mod) => mod.DrawModal),
)

import { ModelPicker } from '@/components/studio/model-picker'
import { PictureActions } from '@/components/studio/picture-actions'
import { PictureViewer } from '@/components/studio/picture-viewer'
import { ReferenceUpload } from '@/components/studio/reference-upload'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Textarea } from '@/components/ui/textarea'
import type { CanvasPicture } from '@/lib/studio/canvas'
import type { StudioFormat } from '@/lib/studio/formats'
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
 * THE WORKBENCH: CONTROLS ON THE LEFT, THE PICTURE ON THE RIGHT.
 *
 * ── WHY THE CANVAS IS HALF THE SCREEN ───────────────────────────────────────
 * Judging a picture is the work. A thumbnail in a list is enough to know a
 * generation finished and not enough to decide whether to keep it, so the newest
 * result gets real space and everything else is a control beside it.
 *
 * ── THE CANVAS IS NEVER EMPTY, IT IS ALWAYS SAYING SOMETHING ────────────────
 * Before the first press it explains what will appear there. While a generation
 * runs it says so. After a refusal it carries the refusal. An empty rectangle
 * would read as something that failed to load.
 *
 * ── EVERY RULE IS ASKED OF `modes.ts`, NEVER RE-IMPLEMENTED HERE ────────────
 * Whether a mode may run, how many references it takes, and the sentence when it
 * may not, all come from one module the server action asks as well. A screen
 * that offered a mode the action refuses would waste a press; one that hid a
 * mode the action allows would cost a feature.
 */
/**
 * The controls this screen is designed for and does not have.
 *
 * ── WHY THEY ARE ON THE SCREEN AT ALL ───────────────────────────────────────
 * Named so the gap is trackable rather than invisible: a person wondering
 * whether Sahoda can exclude a subject gets an answer, and so does the next
 * session opening this file. Each is a title and nothing more, because a
 * description of an unbuilt control is a specification pretending to be copy.
 *
 * They render as spans. `design-lint.mjs` rule 3 refuses `<button disabled>`
 * beside a coming-soon label, and it is right: a disabled button is still
 * announced as an action.
 */
const COMING_SOON = [
  { title: 'Leave out' },
  { title: 'Same again' },
  { title: 'Follow how closely' },
  { title: 'Tidy my words' },
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

export function StudioWorkbench({
  formats,
  library,
  pictures,
  signals,
  balance,
  initialWanted = '',
}: {
  formats: StudioFormat[]
  /**
   * What the reader typed on /home, handed over in the URL so the box they
   * pressed on is the box their words end up in. Read once as the field's
   * opening value; typing here always wins over the seed.
   */
  initialWanted?: string
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
  const [wanted, setWanted] = useState(initialWanted)
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
  const [made, setMade] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [viewing, setViewing] = useState<CanvasPicture | null>(null)
  const [drawing, setDrawing] = useState<CanvasPicture | null>(null)
  const [busy, start] = useTransition()
  /**
   * Open by default, and that is a decision rather than a default.
   *
   * This screen's job IS these controls; a composer that hides all of them
   * behind a chevron makes a person hunt for the model on their first visit.
   * The composer stays the thing you look at first because it is the one dark
   * object on a light page, not because everything else is hidden.
   */
  const [settingsOpen, setSettingsOpen] = useState(true)
  /**
   * Which version of the ACTIVE picture is on screen.
   *
   * Not per-picture: clicking through the strip lands on a picture that may not
   * have a stamped copy at all, so the choice is re-derived below rather than
   * remembered per id. Defaults to the stamped one — that is the picture the
   * person will post, and the original is one press away.
   */
  const [showing, setShowing] = useState<'stamped' | 'original'>('stamped')

  /**
   * Position zero unless somebody has clicked back through the strip. The reader
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
  // `modelId` only ever holds a catalogue id (the default or a picker choice),
  // so the null arm is the type's; the draft price is its total answer and not
  // a state a person reaches. The server refuses an unknown id before any hold.
  const cost = creditCost(imageActionFor(modelId) ?? IMAGE_TIER_ACTION.draft)
  // The pictures themselves, for the two places that only need to look one up.
  // A failed read has none to look through, which is not the same claim as an
  // empty library — the sentences below keep those apart.
  const libraryPictures = library.status === 'ok' ? library.pictures : []
  // Asked, never re-derived. See this file's header.
  const blocked = describeModeBlock({ mode, references: picked.length, modelId })
  const ready = wanted.trim().length >= 3 && chosen !== null && blocked === null

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
    setNote(null)
    setShort(false)
    start(async () => {
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
        setMade(true)
        // Silent when everything asked for arrived. A partial result is neither
        // a success nor a failure and gets its own sentence, which names both
        // numbers and says what happened to the money.
        setNote(describePartial({ made: result.made, asked: result.asked }))
        // Back to position zero, so the refreshed data shows the NEW picture
        // rather than whichever older one was being looked at when it started.
        setActiveId(null)
        // The picture itself arrives with the refreshed server data, which also
        // carries its signed link. Holding bytes in state here would put a
        // megabyte in the browser that the next navigation throws away.
        router.refresh()
        return
      }
      setShort(result.insufficient)
      setNote(
        result.insufficient
          ? describeInsufficient({ required: result.required, available: result.available })
          : result.message,
      )
    })
  }

  return (
    <div
      className="grid gap-4 wide:grid-cols-[minmax(0,420px)_minmax(0,1fr)] max-wide:grid-cols-1"
      data-guide="studio-workbench"
    >
      <section aria-labelledby="studio-make" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="studio-make" className="type-h2">
            Make a picture
          </h2>
          {balance === null ? null : (
            <span className="type-sm text-muted" data-guide="studio-balance">
              {/* `creditWord`, never a hardcoded plural: a wallet holding one
                  credit would read "1 credits left". `credit-words.test.ts`
                  scans for exactly this and caught it here. */}
              <span className="num">{balance.toLocaleString()}</span> {creditWord(balance)} left
            </span>
          )}
        </div>

        {/* ── THE COMPOSER: ONE DARK OBJECT ON A LIGHT PAGE ───────────────────
            `data-surface="inverse"` rather than a hand-written dark fill, so
            every token inside it re-resolves — `bg-surface` is #171717 here,
            `text-muted` is #979797 rather than the light theme's #57575a, and
            the primary's hover is the lifted orange rather than a hole in the
            panel. That scope is the ONLY correct way to paint a dark panel in
            this product; a bespoke fill leaves `text-ink` black on near-black.

            WHY THE SCREEN IS SHAPED THIS WAY. The controls did not change and
            neither did any rule they ask about. What changed is that the
            request now reads as one thing you compose and press, instead of six
            labelled fieldsets scrolling down a column — Sahoda already had more
            genuine control here than the tools it is compared to, and none of
            it was legible at a glance. */}
        <div
          data-surface="inverse"
          className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-lg"
        >
          <label className="flex flex-col gap-1">
            <span className="sr-only">What should the picture show?</span>
            <Textarea
              value={wanted}
              autoGrow
              rows={2}
              maxLength={1000}
              placeholder={promptHintFor(mode)}
              onChange={(event) => setWanted(event.target.value)}
              data-guide="studio-prompt"
              // The prompt is the loudest thing in the composer and does not
              // need a box drawn round it: it already sits on a surface nothing
              // else on the page shares. `bg-transparent` keeps the panel's own
              // fill rather than stacking a second one at the same value.
              className="border-0 bg-transparent px-0 py-0 type-h3 font-[400] shadow-none focus-visible:outline-none"
            />
          </label>

          {/* ── SOMETHING TO TRY ──────────────────────────────────────────────
              A box nobody knows what to put in stays empty. These FILL the box
              rather than generating, so nothing is spent by trying one and the
              words can be edited first. Hidden once there is something to edit,
              because then they are only in the way. */}
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

          {/* ── WHAT IT IS MATCHING, IN THE ORDER IT WILL BE SENT ─────────────
              The numeral is the POSITION and not a tick, for the same reason
              the grid below carries one: `signReferences` sends them in pick
              order and the first weighs most. A count alone ("3 refs") states
              a fact nobody can check; the tiles show the claim. */}
          <ul className="flex flex-wrap items-center gap-2" data-guide="studio-picked">
            {picked.length === 0 ? (
              <>
                <li>
                  <ReferenceUpload compact disabled={false} onAdded={addReference} />
                </li>
                <li className="type-sm text-muted">Add a picture to match, if you have one</li>
              </>
            ) : null}
          </ul>
          {picked.length === 0 ? null : (
            <ul className="flex flex-wrap items-center gap-2">
              {picked.map((assetId, at) => {
                const picture = libraryPictures.find((one) => one.assetId === assetId) ?? null
                return (
                  <li key={assetId}>
                    <button
                      type="button"
                      onClick={() => toggleReference(assetId)}
                      aria-label={`Stop matching ${picture?.title ?? 'this picture'}, picked ${at + 1} of ${picked.length}`}
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
                  </li>
                )
              })}
              {/* ── ADD ONE WITHOUT LEAVING THE COMPOSER ────────────────────
                  The full picker lives in the settings, where the library grid
                  and the mode rules are. This is the shortest route for the one
                  case that does not need any of that: a photograph on the
                  device right now. It is the SAME `ReferenceUpload`, so the
                  mode switch, the limit and the refusal copy are the component's
                  and not a second implementation of them. */}
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
          )}

          {/* ── THE CHIP ROW: WHAT THIS PRESS WILL DO, IN ONE LINE ────────────
              Each chip is a SUMMARY and an entry point, not a cycling control.
              A chip that steps through three models would be quick to build and
              wrong to use: the pickers below carry the reasons a person needs
              to choose between them, and one of them lists the models we cannot
              reach yet, which is a door rather than a wall. So a chip opens the
              settings and the real control keeps its label, its legend and its
              keyboard behaviour. */}
          <div className="flex flex-wrap items-center gap-2" data-guide="studio-chips">
            {[
              { label: 'Model', value: modelLabel },
              { label: 'Look', value: rule.label },
              { label: 'Size', value: chosen?.label ?? 'None' },
              { label: 'How many', value: String(count) },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-expanded={settingsOpen}
                aria-controls="studio-settings"
                className="surface-ring flex items-center gap-2 rounded-pill bg-s2 px-3 py-1.5 type-sm transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="text-muted">{chip.label}</span>
                <span className="font-[550] text-ink">{chip.value}</span>
              </button>
            ))}

            <div className="grow" />

            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-controls="studio-settings"
              className="rounded-pill px-2 py-1.5 type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {settingsOpen ? 'Hide settings' : 'Settings'}
            </button>

            {/* The TOTAL, not the unit price. Somebody who chose four and was
                shown the price of one has not been told what this press costs. */}
            <CostLabel
              action={count === 1 ? 'Make a picture' : `Make ${count} pictures`}
              cost={cost * count}
            />

            <Button
              onClick={generate}
              loading={busy}
              disabled={!ready}
              data-guide="studio-generate"
            >
              Make this picture
            </Button>
          </div>

          {/* Inside the composer, because it is about THIS press. */}
          {blocked === null ? null : (
            <p
              role="status"
              className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
            >
              {blocked}
            </p>
          )}
        </div>

        {/* ── THE SETTINGS, ON THE SAME OBJECT ────────────────────────────────
            Its own `data-surface="inverse"`, because the scope does not cross a
            sibling boundary. `bg-canvas` rather than `bg-surface`, so the two
            halves read as two zones of one block: in this scope those are
            #0d0d0d and #171717, a real step rather than the same value twice. */}
        {settingsOpen ? (
          <div
            id="studio-settings"
            data-surface="inverse"
            className="flex flex-col gap-4 rounded-xl bg-canvas p-4 shadow-lg"
          >
            {/* ── WHAT SAHODA WILL ADD, BEFORE ANYTHING IS SPENT ────────────
                The same array the action stores on the row, so the screen and
                the record cannot disagree. Three states and never two: a read
                that failed is not a workspace with nothing to add, and Explore
                deliberately sends nothing at all. */}
            <div className="flex flex-col gap-2" data-guide="studio-signals">
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
                <>
                  <ul className="flex flex-wrap gap-2">
                    {signals.map((signal) => (
                      <li
                        key={signal.field}
                        className="flex items-center gap-2 rounded-pill bg-s2 px-3 py-1 type-sm text-ink"
                      >
                        <span
                          aria-hidden
                          className={`size-[6px] shrink-0 rounded-full ${
                            signal.certainty === 'confirmed' ? 'bg-primary' : 'surface-ring-firm'
                          }`}
                        />
                        {signal.value}
                        <span className="sr-only">
                          {signal.certainty === 'confirmed'
                            ? ', which you confirmed'
                            : ', which Sahoda guessed'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="type-sm text-muted">
                    A hollow dot is one Sahoda worked out for you. Confirm it in the Brand Brain and
                    the picture stops drifting between one attempt and the next.
                  </p>
                </>
              )}
            </div>

            {/* ── COMING SOON, LISTED RATHER THAN HIDDEN ────────────────────
                The same choice `ModelPicker` makes for a model we cannot reach:
                shown, visibly not a control, with the reason. Hiding them would
                be tidier and would leave somebody wondering whether Sahoda can
                do this at all — a wall instead of a door.

                SPANS, not `<button disabled>`. `design-lint.mjs` rule 3 refuses
                that pairing outright, because a screen reader still announces a
                disabled button as an action the reader could take. */}
            <div className="flex flex-col gap-2" data-guide="studio-coming-soon">
              <span className="type-eyebrow text-muted">Coming soon</span>
              <ul className="flex flex-wrap gap-2">
                {COMING_SOON.map((one) => (
                  <li
                    key={one.title}
                    className="surface-ring flex items-center gap-2 rounded-pill px-3 py-1 opacity-70"
                  >
                    <Lock className="size-[12px] text-muted" aria-hidden />
                    <span className="type-sm text-muted">{one.title}</span>
                  </li>
                ))}
              </ul>
              <p className="type-sm text-muted">
                Designed and not built yet. Nothing here changes what a press does today.
              </p>
            </div>

            <div className="h-px bg-line" />

            {/* ── ABOVE THE MODES, BECAUSE IT CHANGES WHAT THEY CAN DO ───────
                Picking a model that draws a whole set in one call is what makes
                "a set that matches" appear at all, and it moves the reference
                limit from three to fourteen. A control that changes the options
                below it belongs above them. */}
            <ModelPicker
              modelId={modelId}
              onChoose={(next) => {
                setNote(null)
                setModelId(next)
                // Trimmed to what the NEW model will look at. Carrying eight
                // references onto a model that takes three would send a request
                // the action refuses, after the person had already chosen them.
                setPicked((current) => current.slice(0, ruleFor(mode, next).maxReferences))
                // And off a mode the new model cannot do. Leaving somebody on a
                // greyed-out Series is a dead end they did not create.
                if (!ruleFor(mode, next).ready) setMode('on_brand')
              }}
            />

            <fieldset className="flex flex-col gap-2">
              <legend className="type-sm text-muted">How should Sahoda approach it?</legend>
              <div className="grid gap-2 narrow:grid-cols-3 max-narrow:grid-cols-1">
                {readyModes(modelId).map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => chooseMode(option.mode)}
                    aria-pressed={mode === option.mode}
                    className={`surface-ring rounded-card px-3 py-2 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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

            {/* ── WHAT TO MATCH ────────────────────────────────────────────────
                Shown in EVERY mode, including the one that ignores references.
                This used to be hidden for Explore, on the reasoning that
                offering a picker would invite a choice the mode then ignores.
                That reasoning stopped being true the moment picking one MOVED
                you to the mode that uses it: the choice is now honoured rather
                than ignored, and hiding the control only hides the shortest
                route to what a person meant. */}
            <fieldset className="flex flex-col gap-2" data-guide="studio-references">
              <legend className="type-sm text-muted">
                {rule.maxReferences === 0
                  ? 'Picking a picture here moves you to Match a picture.'
                  : rule.minReferences > 0
                    ? 'Which picture should Sahoda match?'
                    : 'Anything Sahoda should match? (optional)'}
              </legend>

              {/* ── THE UPLOAD FOLLOWS THE SAME RULE THE TILES DO ───────────────
                  `disabled={picked.length >= rule.maxReferences}` read `0 >= 0`
                  in Explore, so adding from the device was dead the moment the
                  mode opened — while the legend directly above promised
                  "Picking a picture here moves you to Match a picture" and
                  `toggleReference` did exactly that for every tile below. The
                  one route that did not get the mode switch was the one a
                  person with a new photograph would take, and nothing on the
                  screen said why. */}
              <ReferenceUpload
                disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
                onAdded={addReference}
              />

              {/* ── THREE ANSWERS, THREE SENTENCES ────────────────────────────
                  A failed read used to arrive as an empty list and be told "You
                  have no pictures yet", which is false for anybody with a
                  library. Each status gets the claim that is true of it, and the
                  failed one keeps only the remedy that works without the read:
                  the device. */}
              {library.status === 'unreadable' ? (
                <p
                  role="status"
                  className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
                >
                  Sahoda could not read your pictures just now. You can still add one from this
                  device, or make one below.
                </p>
              ) : library.status === 'no-workspace' ? (
                <p
                  role="status"
                  className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
                >
                  There is no workspace to read pictures from, so there is nothing here to match.
                </p>
              ) : library.pictures.length === 0 ? (
                <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
                  You have no pictures yet. Add one from this device, or make one below, and it
                  appears here to match.
                </p>
              ) : (
                <ul className="grid grid-cols-4 gap-2">
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

            {/* ── HOW MANY TRIES ──────────────────────────────────────────────
                Four separate calls, not a matching set: the routed model draws
                one picture per call, so these will differ from each other. That
                is what "show me some options" means and is why the label says
                options. */}
            <fieldset className="flex flex-col gap-2">
              <legend className="type-sm text-muted">How many options?</legend>
              <div className="flex flex-wrap gap-2" data-guide="studio-count">
                {Array.from({ length: MAX_TRIES_PER_PRESS }, (_unused, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    aria-pressed={count === n}
                    className={`surface-ring rounded-card px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      count === n ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
                    }`}
                  >
                    <span className="num">{n}</span>
                  </button>
                ))}
              </div>
              {count === 1 ? null : (
                <span className="type-sm text-muted">
                  <span className="num">{count}</span> different pictures from the same description,
                  so you can pick. They will not match each other.
                </span>
              )}
            </fieldset>

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
                    {format.label}
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

            {/* ── YOUR LOGO: WHETHER, WHERE, HOW BIG ──────────────────────────
                Three named steps for size, never a slider a person cannot judge
                by looking at it — `StampOptionsSchema`'s own header carries the
                reasoning. Off never changes the price or the model's own
                picture: it only means no stamped copy is made, and the chip row
                above already shows the total for exactly what will be charged
                either way. */}
            <fieldset className="flex flex-col gap-2" data-guide="studio-logo">
              <legend className="type-sm text-muted">Stamp your logo on this picture?</legend>
              <div
                role="group"
                aria-label="Stamp your logo on this picture"
                className="surface-ring flex w-fit gap-1 rounded-pill bg-canvas p-1"
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
                  are correctly announced as unavailable, which is what
                  `disabled` on a real button is for. This is not the
                  coming-soon pattern above: these controls work, and will
                  act on the very next press that turns the stamp back on. */}
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
          </div>
        ) : null}

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
      </section>

      {/* ── THE CANVAS ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="studio-canvas" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="studio-canvas" className="type-h2">
            The canvas
          </h2>
          {active === null ? null : (
            <PictureActions
              picture={active}
              onOpen={() => setViewing(active)}
              onReuse={() => reuse(active)}
              onDraw={() => setDrawing(active)}
            />
          )}
        </div>

        <div
          className="surface-ring relative flex items-center justify-center overflow-hidden rounded-card bg-s2"
          style={{
            aspectRatio: chosen === null ? '1 / 1' : `${chosen.width} / ${chosen.height}`,
          }}
          data-guide="studio-canvas"
        >
          {/* ── THE PICTURE, WHEN THERE IS ONE ──────────────────────────────
              Shown UNDER the drawing message rather than replaced by it, so a
              second press does not blank the picture somebody is still looking
              at. Nothing is lost while the next one is being made. */}
          {active === null ? null : (
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
          )}

          {busy || active === null ? (
            <p className="pointer-events-none relative max-w-[38ch] px-6 text-center type-sm text-muted">
              {busy ? (
                'Sahoda is drawing this now. It usually takes a few seconds, and you can leave this screen without losing it.'
              ) : made ? (
                'Made. It is saved to your library, and it appears here in a moment.'
              ) : (
                <>
                  <Sparkles className="mx-auto mb-2 size-[18px]" aria-hidden />
                  Your picture appears here, at the size you picked, so you can judge it before you
                  use it.
                </>
              )}
            </p>
          ) : null}
        </div>

        {/* ── WHICH ONE DO YOU WANT, AND WHY THERE IS ONLY ONE ────────────────
            The same dark object the composer uses, and the same reason: this is
            the bar you act from once the picture exists. `data-surface="inverse"`
            re-resolves every token inside it, so nothing here paints a colour of
            its own.

            The TOGGLE only exists when there are genuinely two pictures. Every
            other case gets the sentence for ITS answer and no control, because a
            toggle over one picture is a control that does nothing — and the
            sentence is asked of `stamp-copy.ts` rather than written here, so the
            five answers cannot quietly collapse into "no logo". */}
        {active === null || note_ === null ? null : (
          <div
            data-surface="inverse"
            data-guide="studio-logo-bar"
            className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 pl-4 shadow-lg"
          >
            {bothVersions ? (
              <div
                role="group"
                aria-label="Which version of this picture to show"
                className="surface-ring flex gap-1 rounded-pill bg-canvas p-1"
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

            <div className="flex min-w-[24ch] flex-1 flex-col gap-0.5">
              <span className="type-sm font-[550] text-ink">{note_.title}</span>
              <span className="type-sm text-muted">{note_.body}</span>
            </div>

            {/* A remedy is offered ONLY when one exists. `remedy: null` is the
                assertion that no action of theirs would change this, not a gap
                somebody forgot to fill — see `no-impossible-remedy.spec.ts`. */}
            {note_.remedy === null ? null : (
              <Link
                href={note_.remedy.href}
                className="surface-ring rounded-pill px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {note_.remedy.label}
              </Link>
            )}
          </div>
        )}

        {/* Both are kept, always. Said once, here, rather than inside the
            toggle: it is true of every stamped picture whether or not anybody
            touches the control. */}
        {bothVersions ? (
          <p className="type-sm text-muted">
            Both versions are saved. Picking one here does not delete the other.
          </p>
        ) : null}

        {/* ── THE STRIP ───────────────────────────────────────────────────────
            Every picture this workspace has made that can actually be drawn,
            newest first. Judging one against the last one is the work, and it
            cannot be done by scrolling to a grid and back. */}
        {pictures.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="type-eyebrow text-muted">Made earlier</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            {/* ── A GRID, NOT A SCROLLING RIBBON ──────────────────────────────
                Judging one picture against the last one is the work, and a
                64px ribbon that scrolls sideways shows about four of them at a
                size nothing can be judged at. Square tiles at six across show a
                fortnight of work at a glance, and each carries the two facts
                that separate one from another: the shape it was drawn at and
                how long ago.

                The age is rendered on the SERVER and passed down — a relative
                time computed in the browser is computed against a clock the
                server never saw, and React re-renders the mismatch. */}
            <ul
              className="grid grid-cols-3 gap-3 narrow:grid-cols-4 wide:grid-cols-6"
              data-guide="studio-strip"
            >
              {pictures.map((picture) => {
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
                        // makes a strip of twelve read as twenty-four things.
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
          </div>
        )}

        <p className="type-sm text-muted">
          Every picture is saved to your library the moment it is made, so nothing is lost if you
          leave.
        </p>
      </section>

      <PictureViewer picture={viewing} onClose={() => setViewing(null)} />

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
