'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

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

import { PictureViewer } from '@/components/studio/picture-viewer'
import { StudioCanvas } from '@/components/studio/studio-canvas'
import { StudioComposer } from '@/components/studio/studio-composer'
import { StudioSettings } from '@/components/studio/studio-settings'
import { SendOptions } from '@/components/studio/send-options'
import type { CanvasPicture } from '@/lib/studio/canvas'
import type { StudioFormat } from '@/lib/studio/formats'
import { describeModeBlock, ruleFor } from '@/lib/studio/modes'
import { defaultModelId, imageActionFor, modelById } from '@/lib/studio/models'
import type { LibraryRead } from '@/lib/studio/read'
import { stampNote } from '@/lib/studio/stamp-copy'
import { describeInsufficient, describePartial } from '@/lib/studio/refusal-copy'

/**
 * THE STUDIO WORKBENCH: STATE AND RULES HERE, PIXELS IN FIVE FILES BESIDE IT.
 *
 * ── WHY THIS FILE IS NOW SHORT ──────────────────────────────────────────────
 * It was 1,190 lines holding every control, every sentence and every rule. What
 * moved out is markup only — the composer, the control row, the tray behind
 * "More", the two secondary lists, and the canvas. What stayed is the part that
 * must not be duplicated: what the press will cost, which mode is legal, what a
 * refused press says, and the single `queueGeneration` call.
 *
 * ── EVERY RULE IS ASKED OF `modes.ts`, NEVER RE-IMPLEMENTED ─────────────────
 * Whether a mode may run, how many references it takes, and the sentence when it
 * may not, all come from one module the server action asks as well. A screen
 * that offered a mode the action refuses would waste a press; one that hid a
 * mode the action allows would cost a feature.
 *
 * ── THE PAGE IS ONE COLUMN NOW, NOT A 420px RAIL BESIDE A CANVAS ────────────
 * Founder's ruling, 2026-09-05, against a reference: the workspace is wide,
 * white and quiet, and the composer is the object it is built around. A
 * controls-rail plus a canvas made both halves narrow and the composer a form.
 */
export function StudioWorkbench({
  formats,
  library,
  pictures,
  signals,
  balance,
}: {
  formats: StudioFormat[]
  /**
   * Pictures already in this workspace, offered as things to match, or which of
   * two reasons there are none. A failed read is not an empty library.
   */
  library: LibraryRead
  /** What this workspace has already made, newest first, for the canvas. */
  pictures: CanvasPicture[]
  /**
   * What the Brand Brain will add to this request, shown BEFORE the press.
   *
   * The same array `queueGeneration` builds and stores on the row. Null means
   * the read failed, which is a different sentence from an empty array —
   * `BrandSignalsSchema`'s own header forbids collapsing the two.
   */
  signals: BrandSignal[] | null
  /**
   * Spendable credits, or null when the read did not produce a number.
   *
   * NULL RENDERS AS NOTHING, never as zero and never as a diagnosis. "0 credits
   * left" for a read that failed would tell somebody with a full wallet they
   * cannot afford to work.
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
   * Seeded from `DEFAULT_STAMP_OPTIONS`, the same value `queueGeneration` falls
   * back to when `stamp` is absent, so a person who never opens this gets
   * exactly the picture Sahoda has always drawn: on, bottom right, medium.
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
   * CLOSED by default, and that reverses the old decision rather than drifting
   * from it. The tray used to open on arrival because the controls lived only
   * inside it, so a closed tray was a screen with no controls. The row above it
   * now carries the four choices a person actually changes, and the tray holds
   * the three that need a paragraph each — so opening it on arrival would put a
   * model catalogue and a library grid between somebody and the box they came
   * to type in.
   */
  const [settingsOpen, setSettingsOpen] = useState(false)
  /**
   * Which version of the ACTIVE picture is on screen. Not per-picture: clicking
   * through the strip lands on a picture that may not have a stamped copy at
   * all. Defaults to the stamped one — that is the picture the person will post.
   */
  const [showing, setShowing] = useState<'stamped' | 'original'>('stamped')

  /**
   * Position zero unless somebody has clicked back through the strip. The reader
   * already sorted newest first, so after a generation the refreshed data puts
   * the picture that was just paid for at zero.
   */
  const active = pictures.find((one) => one.imageId === activeId) ?? pictures[0] ?? null

  /**
   * What this picture's logo story is, ASKED never derived. `stamp-copy.ts` owns
   * the five answers and refuses to share a sentence between them. A null
   * outcome is "never attempted", which is why it is passed through.
   */
  const note_ = active === null ? null : stampNote(active.stampOutcome)
  // Both versions exist only when one was actually stamped AND its link signed.
  // A stamped copy whose preview would not sign is a picture we cannot show.
  const bothVersions = note_ !== null && note_.hasBothVersions && active?.stampedUrl != null
  const shown = bothVersions && showing === 'stamped' ? active!.stampedUrl! : (active?.url ?? null)

  const rule = ruleFor(mode, modelId)
  // Asked of the same modules the RULES come from, never re-typed here. A row
  // that names a model the picker no longer offers is a screen disagreeing with
  // itself about what is about to be spent.
  const modelLabel = modelById(modelId)?.label ?? 'None'
  const chosen = formats.find((f) => f.id === formatId) ?? null
  // `modelId` only ever holds a catalogue id, so the null arm is the type's; the
  // draft price is its total answer and not a state a person reaches. The server
  // refuses an unknown id before any hold.
  const cost = creditCost(imageActionFor(modelId) ?? IMAGE_TIER_ACTION.draft)
  // A failed read has no pictures to look through, which is not the same claim
  // as an empty library — the sentences in the tray keep those apart.
  const libraryPictures = library.status === 'ok' ? library.pictures : []
  // Asked, never re-derived. See this file's header.
  const blocked = describeModeBlock({ mode, references: picked.length, modelId })
  const ready = wanted.trim().length >= 3 && chosen !== null && blocked === null

  /**
   * ── A PRESS THAT CHANGES NOTHING MUST SAY WHY ─────────────────────────────
   * This silently dropped the click once the mode's reference limit was reached:
   * the tile did not select, nothing moved, and nothing was said. The sentence
   * comes from `modes.ts`, the same one the server action would refuse with.
   */
  function toggleReference(assetId: string) {
    setNote(null)
    if (picked.includes(assetId)) {
      setPicked((current) => current.filter((id) => id !== assetId))
      return
    }
    // Explore uses no reference by definition, so a person who picks one has
    // said something the mode cannot honour. Moving them to the mode that DOES
    // is what they meant; refusing would be technically correct and useless.
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
   * A picture added from the device, from EITHER upload control. Extracted the
   * moment the composer got its own tile: two call sites doing the mode switch,
   * the limit and the refresh separately is how one of them quietly stops doing
   * the mode switch.
   */
  function addReference(assetId: string) {
    setNote(null)
    if (rule.maxReferences === 0) {
      setMode('match')
      setPicked([assetId])
      setNote('Explore ignores a picture, so Sahoda moved you to Match a picture.')
      router.refresh()
      return
    }
    // Selected at once. Somebody who adds a picture to match wants to match it.
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
    const next_ = ruleFor(next, modelId)
    // Explore is unconditioned by definition, so keeping references selected
    // would leave a contradiction on screen that the person did not create.
    if (next_.maxReferences === 0) setPicked([])
    /**
     * ── A REFUSAL MAY NEVER NAME A CONTROL THAT IS NOT ON SCREEN ────────────
     * Match a picture refuses with "Pick one picture for Sahoda to match", and
     * the grid to pick from lives in the tray. Shutting the tray by default
     * turned that sentence into an instruction with nothing to carry it out —
     * the impossible remedy this product forbids, wearing a refusal.
     *
     * So choosing a look that REQUIRES a picture opens the tray, which is where
     * the pictures are. Only when it requires one: a look that merely accepts
     * an optional reference does not, or every mode change would fling a model
     * catalogue open under somebody who only wanted to change the look.
     */
    if (next_.minReferences > 0) setSettingsOpen(true)
  }

  /**
   * ── LOADS THE REQUEST BACK, AND DOES NOT SPEND ────────────────────────────
   * The fastest useful action after a picture you almost like is the same
   * request with one word changed. It fills the controls and stops: firing
   * immediately would spend credits on a press that reads as "show me what I
   * asked for", and the whole point is to change something first.
   */
  function reuse(picture: CanvasPicture) {
    setNote(null)
    setWanted(picture.prompt)
    setMode(picture.mode)
    setPicked(picture.referenceAssetIds.slice(0, ruleFor(picture.mode, modelId).maxReferences))
    // A format since retired is dropped rather than selected: a select holding a
    // value that is not one of its options silently shows the first one, and the
    // person is charged for a size they did not choose.
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
        // Back to position zero, so the refreshed data shows the NEW picture.
        setActiveId(null)
        // The picture arrives with the refreshed server data, which also carries
        // its signed link. Holding bytes in state here would put a megabyte in
        // the browser that the next navigation throws away.
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
    <div className="flex flex-col gap-6" data-guide="studio-workbench">
      {balance === null ? null : (
        <p className="type-meta text-muted" data-guide="studio-balance">
          {/* `creditWord`, never a hardcoded plural: a wallet holding one credit
              would read "1 credits left". `credit-words.test.ts` scans for
              exactly this and caught it here. */}
          <span className="num">{balance.toLocaleString()}</span> {creditWord(balance)} left
        </p>
      )}

      <StudioComposer
        wanted={wanted}
        onWanted={setWanted}
        mode={mode}
        onMode={chooseMode}
        modelId={modelId}
        modelLabel={modelLabel}
        modeWhat={rule.what}
        formats={formats}
        formatId={formatId}
        chosen={chosen}
        onFormat={setFormatId}
        count={count}
        onCount={setCount}
        stampEnabled={stampEnabled}
        onStamp={setStampEnabled}
        moreOpen={settingsOpen}
        onMore={() => setSettingsOpen((open) => !open)}
        picked={picked}
        libraryPictures={libraryPictures}
        libraryUnreadable={library.status === 'unreadable'}
        onTogglePicked={toggleReference}
        onAddReference={addReference}
        blocked={blocked}
        ready={ready}
        busy={busy}
        cost={cost}
        onGenerate={generate}
      />

      {settingsOpen ? (
        <StudioSettings
          mode={mode}
          modelId={modelId}
          onModel={(next) => {
            setNote(null)
            setModelId(next)
            // Trimmed to what the NEW model will look at. Carrying eight
            // references onto a model that takes three would send a request the
            // action refuses, after the person had already chosen them.
            setPicked((current) => current.slice(0, ruleFor(mode, next).maxReferences))
            // And off a mode the new model cannot do. Leaving somebody on a
            // greyed-out Series is a dead end they did not create.
            if (!ruleFor(mode, next).ready) setMode('on_brand')
          }}
          library={library}
          picked={picked}
          onTogglePicked={toggleReference}
          onAddReference={addReference}
          stampEnabled={stampEnabled}
          stampAnchor={stampAnchor}
          onAnchor={setStampAnchor}
          stampSizeStep={stampSizeStep}
          onSizeStep={setStampSizeStep}
        />
      ) : null}

      {note === null ? null : (
        <p role="alert" className="type-sm text-ink">
          {note}{' '}
          {/* A shortfall is the one refusal with a remedy, so it is the one that
              gets a way out. */}
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

      <SendOptions signals={signals} />

      <StudioCanvas
        active={active}
        shown={shown}
        bothVersions={bothVersions}
        showing={showing}
        onShowing={setShowing}
        chosen={chosen}
        busy={busy}
        made={made}
        note={note_}
        pictures={pictures}
        onPick={setActiveId}
        onOpen={() => setViewing(active)}
        onReuse={() => active !== null && reuse(active)}
        onDraw={() => setDrawing(active)}
      />

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
