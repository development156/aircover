'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Sparkles } from 'lucide-react'
import type { BrandSignal, GenerationMode } from '@sahoda/shared'

import { queueGeneration } from '@/app/actions/studio'
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
import { defaultModelId, modelById } from '@/lib/studio/models'
import type { LibraryPicture } from '@/lib/studio/read'
import { PROMPT_STARTERS } from '@/lib/studio/prompt'
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
export function StudioWorkbench({
  formats,
  cost,
  library,
  pictures,
  signals,
}: {
  formats: StudioFormat[]
  cost: number
  /** Pictures already in this workspace, offered as things to match. */
  library: LibraryPicture[]
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
}) {
  const router = useRouter()
  const [wanted, setWanted] = useState('')
  const [mode, setMode] = useState<GenerationMode>('on_brand')
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [count, setCount] = useState(1)
  const [modelId, setModelId] = useState(defaultModelId)
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
   * Position zero unless somebody has clicked back through the strip. The reader
   * already sorted newest first, so after a generation the refreshed data puts
   * the picture that was just paid for at zero and the canvas shows it with no
   * effect, no id to track, and no chance of showing yesterday's.
   */
  const active = pictures.find((one) => one.imageId === activeId) ?? pictures[0] ?? null

  const rule = ruleFor(mode, modelId)
  // Asked of the same modules the RULES come from, never re-typed here. A chip
  // that names a model the picker no longer offers is a screen disagreeing with
  // itself about what is about to be spent.
  const modelLabel = modelById(modelId)?.label ?? 'None'
  const chosen = formats.find((f) => f.id === formatId) ?? null
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
        <h2 id="studio-make" className="type-h2">
          Make a picture
        </h2>

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
          {picked.length === 0 ? null : (
            <ul className="flex flex-wrap items-center gap-2" data-guide="studio-picked">
              {picked.map((assetId, at) => {
                const picture = library.find((one) => one.assetId === assetId) ?? null
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
                      <span className="absolute bottom-0 left-0 flex size-[16px] items-center justify-center rounded-full bg-primary type-sm text-primary-foreground">
                        <span className="num">{at + 1}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
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
                onAdded={(assetId) => {
                  setNote(null)
                  // Explore uses no reference by definition, so adding one means
                  // the other mode. Same move, same sentence, as picking a tile.
                  if (rule.maxReferences === 0) {
                    setMode('match')
                    setPicked([assetId])
                    setNote('Explore ignores a picture, so Sahoda moved you to Match a picture.')
                    router.refresh()
                    return
                  }
                  // Selected at once. Somebody who adds a picture to match wants
                  // to match it, and it appears in the grid below on the refresh
                  // already chosen.
                  setPicked((current) =>
                    current.includes(assetId) || current.length >= rule.maxReferences
                      ? current
                      : [...current, assetId],
                  )
                  router.refresh()
                }}
              />

              {library.length === 0 ? (
                <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
                  You have no pictures yet. Add one from this device, or make one below, and it
                  appears here to match.
                </p>
              ) : (
                <ul className="grid grid-cols-4 gap-2">
                  {library.map((picture) => {
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
                src={active.url}
                alt={active.prompt}
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

        {/* ── THE STRIP ───────────────────────────────────────────────────────
            Every picture this workspace has made that can actually be drawn,
            newest first. Judging one against the last one is the work, and it
            cannot be done by scrolling to a grid and back. */}
        {pictures.length === 0 ? null : (
          <ul className="flex gap-2 overflow-x-auto pb-1" data-guide="studio-strip">
            {pictures.map((picture) => {
              const on = picture.imageId === (active?.imageId ?? null)
              return (
                <li key={picture.imageId} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveId(picture.imageId)}
                    aria-pressed={on}
                    aria-label={picture.prompt}
                    className={`surface-ring block size-[64px] overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
                    <img
                      src={picture.url}
                      // Empty on purpose: the BUTTON is already labelled with the
                      // prompt, and a screen reader announcing it twice makes a
                      // strip of twelve read as twenty-four things.
                      alt=""
                      // Top-anchored: a square crop of a portrait photograph cuts
                      // a face off at the chin, and this product's pictures are
                      // food, shopfronts and people.
                      className="size-full object-cover object-top"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
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
