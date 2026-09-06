import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEFAULT_REFERENCE_FOLLOW,
  DEFAULT_STAMP_OPTIONS,
  IMAGE_TIER_ACTION,
  creditCost,
  type GenerationMode,
  type ReferenceFollow,
  type StampAnchor,
  type StampSizeStep,
} from '@sahoda/shared'

import { queueGeneration, type QueueGenerationState } from '@/app/actions/studio'
import type { ComposerOpenPanel } from '@/components/studio/composer-panels'
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
  const [wanted, setWanted] = useState(initialValues?.wanted ?? '')
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

  const rule = ruleFor(mode, modelId)
  const modelLabel = modelById(modelId)?.label ?? 'None'
  const chosen = formats.find((f) => f.id === formatId) ?? null
  const sizeLabel = chosen === null ? 'None' : `${chosen.label} (${aspectRatioLabel(chosen)})`
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
