import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEFAULT_REFERENCE_FOLLOW,
  DEFAULT_STAMP_OPTIONS,
  IMAGE_TIER_ACTION,
  creditCost,
  shapeFromDimensions,
  type GenerationMode,
  type PromptRefineSettings,
  type ReferenceFollow,
  type StampAnchor,
  type StampSizeStep,
} from '@sahoda/shared'

import { queueGeneration, type QueueGenerationState } from '@/app/actions/studio'
import type { ComposerOpenPanel } from '@/components/studio/composer-panels'
import { editKeepsBrand } from '@/lib/studio/brand-carry'
import { aspectRatioLabel, type StudioFormat } from '@/lib/studio/formats'
import { describeModeBlock, ruleFor } from '@/lib/studio/modes'
import { defaultModelId, imageActionFor, modelById } from '@/lib/studio/models'
import type { LibraryRead } from '@/lib/studio/read'
import { describeInsufficient, describePartial } from '@/lib/studio/refusal-copy'
import type { ComposerInitialValues } from '@/components/studio/composer'

/**
 * ALL OF THE COMPOSER'S STATE AND RULES, KEPT OUT OF THE FILE THAT RENDERS IT.
 *
 * `composer.tsx` is arrangement: which sub-component gets which prop. Every
 * piece of state, every derived value (the price, the block message, whether
 * the press is ready) and the press itself live here instead, asked of
 * `lib/studio/modes.ts` and `lib/studio/models.ts` exactly as they were
 * before the extraction — this hook never re-implements a rule those modules
 * already own.
 */
export function useComposer({
  formats,
  library,
  initialValues,
  onGenerated,
}: {
  formats: StudioFormat[]
  library: LibraryRead
  initialValues?: ComposerInitialValues
  onGenerated?: (result: Extract<QueueGenerationState, { ok: true }>) => void
}) {
  const router = useRouter()
  const [wanted, setWantedRaw] = useState(initialValues?.wanted ?? '')
  /**
   * ── TRUE EXACTLY WHEN `wanted` ALREADY CARRIES THE BRAND IN ITS OWN PROSE ──
   *
   * Set the instant a refine is accepted (`acceptRefine`), because that is the
   * one moment `wanted` becomes a sentence `promptRefineTask` already wove the
   * brand into. Cleared the instant a revert happens (`revertRefine`),
   * unconditionally, because `prompt-refine-control.tsx` already owns that
   * moment and the person's own words never carried the brand.
   *
   * Every OTHER change to `wanted` — typing, pasting, a starter chip — goes
   * through `setWanted` below, which keeps the flag only across an edit small
   * enough that the refined sentence is still recognisably the same one
   * (`editKeepsBrand`). "Make it evening instead of morning" is exactly that
   * kind of edit: the brand's own wording survives untouched around the one
   * word that changed, so re-appending the `Brand context:` block on the next
   * press would be the same defect at one remove. Clearing the box, or a
   * starter chip replacing it outright, is not: nothing recognisable of the
   * refined sentence survives, so the flag drops and a fresh press is
   * conditioned the ordinary way.
   *
   * Deliberately NEVER seeded from `initialValues`: the remix path
   * (`viewer-initial-values.ts`) has no column to read this fact back from —
   * `prompt_given` is exactly the refined text, indistinguishable at that
   * point from a hand-typed one — so this always starts `false` there. That
   * is the conservative direction: the worst this default can do is repeat
   * the block once more (today's defect, unchanged), never silently drop
   * brand conditioning that used to apply. See this file's own PR notes for
   * the column that would close the gap.
   */
  const [brandCarried, setBrandCarried] = useState(false)
  const [mode, setMode] = useState<GenerationMode>(initialValues?.mode ?? 'on_brand')
  const [formatId, setFormatId] = useState(initialValues?.formatId ?? formats[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>(initialValues?.referenceAssetIds ?? [])
  const [count, setCount] = useState(initialValues?.count ?? 1)
  const [modelId, setModelId] = useState(initialValues?.modelId ?? defaultModelId)
  const [stampEnabled, setStampEnabled] = useState(
    initialValues?.stamp?.enabled ?? DEFAULT_STAMP_OPTIONS.enabled,
  )
  const [stampAnchor, setStampAnchor] = useState<StampAnchor>(
    initialValues?.stamp?.anchor ?? DEFAULT_STAMP_OPTIONS.anchor,
  )
  const [stampSizeStep, setStampSizeStep] = useState<StampSizeStep>(
    initialValues?.stamp?.sizeStep ?? DEFAULT_STAMP_OPTIONS.sizeStep,
  )
  // Not seeded from `initialValues`: neither is persisted anywhere a remix
  // could read it back from, so there is nothing honest to seed with yet.
  // See `composer.tsx`'s header for the gap this leaves.
  const [excludeText, setExcludeText] = useState('')
  const [referenceFollow, setReferenceFollow] = useState<ReferenceFollow>(DEFAULT_REFERENCE_FOLLOW)
  const [note, setNote] = useState<string | null>(null)
  const [short, setShort] = useState(false)
  const [viewingReference, setViewingReference] = useState<{
    assetId: string
    url: string | null
    title: string | null
  } | null>(null)
  const [busy, start] = useTransition()
  /**
   * ── THE SECOND PRESS THAT `busy` ALONE CANNOT STOP ────────────────────────
   * `busy` is React state and updates on the NEXT render, not the instant
   * `start()` runs, so a plain ref is what actually closes the window a fast
   * double-click or a repeated Enter lands in.
   */
  const pressLocked = useRef(false)
  const [openPanel, setOpenPanel] = useState<ComposerOpenPanel>(null)

  function togglePanel(name: Exclude<ComposerOpenPanel, null>) {
    setOpenPanel((current) => (current === name ? null : name))
  }

  /**
   * The ordinary path: typing, pasting, and a starter chip replacing the box
   * outright all call this. `editKeepsBrand` decides whether whatever the
   * flag currently says survives THIS particular change; it can only ever
   * turn `true` into `false`; it never turns a plain edit into a carrying one.
   */
  function setWanted(next: string) {
    setBrandCarried((carried) => carried && editKeepsBrand(wanted, next))
    setWantedRaw(next)
  }

  /** The refine control's own accept: the box now holds a sentence that carries the brand in its own prose. */
  function acceptRefine(next: string) {
    setWantedRaw(next)
    setBrandCarried(true)
  }

  /** The refine control's own revert: back to the person's exact words, which never carried the brand. */
  function revertRefine(original: string) {
    setWantedRaw(original)
    setBrandCarried(false)
  }

  const rule = ruleFor(mode, modelId)
  const modelLabel = modelById(modelId)?.label ?? 'None'
  const chosen = formats.find((f) => f.id === formatId) ?? null
  const sizeLabel = chosen === null ? 'None' : `${chosen.label} (${aspectRatioLabel(chosen)})`
  // `chosen` is null only when no format is offered at all, which the rest of
  // this bar already treats as "not ready" (`ready` below). `square` is a
  // harmless default for that unreachable-in-practice gap: it never renders
  // a ratio or a size, only the shape the refiner composes toward.
  const refineSettings: PromptRefineSettings = {
    mode,
    shape: chosen === null ? 'square' : shapeFromDimensions(chosen.width, chosen.height),
    hasReference: picked.length > 0,
    stampEnabled,
    stampAnchor,
    excludeText: excludeText.trim() === '' ? undefined : excludeText.trim(),
    referenceFollow: picked.length > 0 ? referenceFollow : undefined,
  }
  const cost = creditCost(imageActionFor(modelId) ?? IMAGE_TIER_ACTION.draft)
  const total = cost * count
  const libraryPictures = library.status === 'ok' ? library.pictures : []
  const blocked = describeModeBlock({ mode, references: picked.length, modelId })
  const ready = wanted.trim().length >= 3 && chosen !== null && blocked === null

  function toggleReference(assetId: string) {
    setNote(null)
    if (picked.includes(assetId)) {
      setPicked((current) => current.filter((id) => id !== assetId))
      return
    }
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

  function addReference(assetId: string) {
    setNote(null)
    if (rule.maxReferences === 0) {
      setMode('match')
      setPicked([assetId])
      setNote('Explore ignores a picture, so Sahoda moved you to Match a picture.')
      router.refresh()
      return
    }
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
    if (ruleFor(next, modelId).maxReferences === 0) setPicked([])
    setOpenPanel('match')
  }

  function chooseModel(next: string) {
    setNote(null)
    setModelId(next)
    // Trimmed to what the NEW model will look at, and off a mode it cannot do.
    setPicked((current) => current.slice(0, ruleFor(mode, next).maxReferences))
    if (!ruleFor(mode, next).ready) setMode('on_brand')
  }

  function generate() {
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
          excludeText: excludeText.trim() === '' ? undefined : excludeText.trim(),
          // Meaningless with no reference picked; the control is disabled in
          // that case, but this is the same defensive drop the server action
          // makes, kept honest on both sides of the wire.
          referenceFollow: picked.length > 0 ? referenceFollow : undefined,
          // Whether `wanted` already carries the brand, so the server action's
          // own `conditionPrompt` call does not repeat it. See `brandCarried`'s
          // own comment above.
          brandAlreadyCarried: brandCarried,
        })
        if (result.ok) {
          setNote(describePartial({ made: result.made, asked: result.asked }))
          onGenerated?.(result)
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
        pressLocked.current = false
      }
    })
  }

  return {
    wanted,
    setWanted,
    acceptRefine,
    revertRefine,
    mode,
    formatId,
    setFormatId,
    picked,
    count,
    setCount,
    modelId,
    stampEnabled,
    setStampEnabled,
    stampAnchor,
    setStampAnchor,
    stampSizeStep,
    setStampSizeStep,
    excludeText,
    setExcludeText,
    referenceFollow,
    setReferenceFollow,
    note,
    short,
    viewingReference,
    setViewingReference,
    busy,
    openPanel,
    togglePanel,
    rule,
    modelLabel,
    sizeLabel,
    refineSettings,
    total,
    libraryPictures,
    blocked,
    ready,
    toggleReference,
    addReference,
    chooseMode,
    chooseModel,
    generate,
  }
}

export type UseComposer = ReturnType<typeof useComposer>
