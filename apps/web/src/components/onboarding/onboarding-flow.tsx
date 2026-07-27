'use client'

import { useActionState, useEffect, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { creditCost, type BrandMemoryPayload } from '@sahoda/shared'
import { toast } from 'sonner'

import { resolveBrand, saveBrandMemory, type SaveBrandState } from '@/app/actions/brand-resolve'
import { saveWorkspaceTheme } from '@/app/actions/theme'
import { brandSkinVars } from '@/lib/brand/brand-theme'

import type { LogoValue } from './logo-drop'
import { RefineStep } from './refine-step'
import { SparkStep, type SparkAttemptError, type SparkValues } from './spark-step'
import { StepRail } from './step-rail'
import { ThemePreview } from './theme-preview'
import { ThemeStep } from './theme-step'

type Screen = 'spark' | 'refine' | 'theme'

const RESOLVE_COST = creditCost('brand_research')
const DEFAULT_TAGLINE = 'A living Brand Brain shapes every caption, campaign and reply.'
const EMPTY_SPARK: SparkValues = { name: '', category: '', website: '', instagram: '' }

function buildResolveFormData(spark: SparkValues): FormData {
  const data = new FormData()
  data.set('name', spark.name)
  data.set('category', spark.category)
  data.set('website', spark.website)
  data.set('instagram', spark.instagram)
  return data
}

/** 0-based rail index — "Generate" (index 1) is Spark while a request is in flight. */
function railIndex(screen: Screen, isPending: boolean): number {
  if (screen === 'spark') return isPending ? 1 : 0
  return screen === 'refine' ? 2 : 3
}

/**
 * Orchestrates the whole 4-step "approve, don't author" flow: one
 * `useActionState(resolveBrand, …)` shared by the initial Generate AND every
 * per-card Regenerate (the latter calls the returned dispatcher directly with
 * a manually-built FormData — `formAction` is a plain callable, not tied to a
 * DOM <form> submit event). See docs/superpowers/specs/2026-07-19 for the
 * charge-policy contract this consumes as-is.
 */
export function OnboardingFlow() {
  const [state, formAction, isPending] = useActionState(resolveBrand, null)

  const [screen, setScreen] = useState<Screen>('spark')
  const [spark, setSpark] = useState<SparkValues>(EMPTY_SPARK)
  const [logo, setLogo] = useState<LogoValue | null>(null)
  const [attemptError, setAttemptError] = useState<SparkAttemptError | null>(null)
  const [brain, setBrain] = useState<BrandMemoryPayload | null>(null)
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)
  const [colors, setColors] = useState<string[] | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [saveState, setSaveState] = useState<SaveBrandState | null>(null)

  useEffect(() => {
    if (!state) return

    if (state.ok) {
      setBrain(state.brain)
      setFallbackMessage(state.kind === 'fallback' ? state.message : null)
      if (state.kind === 'resolved') setBalanceAfter(state.balanceAfter)
      setAttemptError(null)
      setScreen('refine')
      return
    }

    if (screen === 'spark') {
      setAttemptError(
        state.kind === 'insufficient'
          ? {
              kind: 'insufficient',
              message: state.message,
              required: state.required,
              available: state.available,
            }
          : { kind: 'error', message: state.message },
      )
      return
    }

    // A Regenerate attempt failed while a brain was already in view — keep
    // the user's current (possibly hand-edited) Brand Brain on screen and
    // surface the failure as a toast instead of blanking the Refine step.
    toast(state.message)
    // `screen` is read, not depended on — only a genuinely NEW result should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Finish persists the (hand-edited) brain via the resolve_brand_memory RPC.
  // Three-argument call — no expected-version precondition — so a rage-click
  // replays the active payload as a success instead of a VERSION_CONFLICT.
  // Finish persists BOTH halves of what the user approved: the brain, and the
  // Brand Skin extracted from their logo. The theme is saved first and only its
  // failure is surfaced as a toast — losing a theme is recoverable (re-upload),
  // losing the brain is not, so the brain's outcome owns `saveState` and the
  // success panel. A theme failure never turns into a false "saved" claim.
  function handleFinish() {
    if (!brain) return
    startSaving(async () => {
      if (colors && colors.length > 0) {
        const themeState = await saveWorkspaceTheme(colors)
        if (!themeState.ok) toast(themeState.message)
      }
      setSaveState(await saveBrandMemory(brain))
    })
  }

  function handleRegenerate() {
    formAction(buildResolveFormData(spark))
  }

  const brandName = spark.name.trim()
  const tagline = brain?.hook.core_promise || brain?.customer_persona.one_liner || DEFAULT_TAGLINE
  const chips = brain
    ? brain.voice.signature_phrases.filter(Boolean)
    : spark.category
      ? [spark.category]
      : []
  const previewStyle: CSSProperties | undefined =
    colors && colors.length > 0 ? (brandSkinVars(colors) as CSSProperties) : undefined

  return (
    <div className="mx-auto max-w-content p-page max-narrow:p-page-mobile">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="type-eyebrow text-accent">Brand Brain</span>
          <h1 className="mt-1 text-[25px] font-extrabold text-ink">Set up your Brand Brain</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Approve, don't author — give Sahoda a spark and refine what it resolves.
          </p>
        </div>
        <Link
          href="/home"
          data-guide="onboarding.skip"
          className="shrink-0 text-[13px] font-semibold text-muted transition-micro hover:text-ink"
        >
          Skip for now
        </Link>
      </header>

      <div className="grid gap-6 wide:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StepRail activeIndex={railIndex(screen, isPending)} />

          <div className="rounded-card border border-line bg-bg p-6 shadow-card wide:p-7">
            {screen === 'spark' ? (
              <SparkStep
                formAction={formAction}
                onSubmitStart={() => setAttemptError(null)}
                isPending={isPending}
                attemptError={attemptError}
                spark={spark}
                onSparkChange={(patch) => setSpark((current) => ({ ...current, ...patch }))}
                logo={logo}
                onLogoChange={setLogo}
                generateCost={RESOLVE_COST}
              />
            ) : null}

            {screen === 'refine' && brain ? (
              <RefineStep
                brain={brain}
                onChange={(updater) =>
                  setBrain((current) => (current ? updater(current) : current))
                }
                fallbackMessage={fallbackMessage}
                balanceAfter={balanceAfter}
                regenerateCost={RESOLVE_COST}
                regeneratePending={isPending}
                onRegenerate={handleRegenerate}
                onContinue={() => setScreen('theme')}
              />
            ) : null}

            {screen === 'theme' ? (
              <ThemeStep
                logo={logo}
                onLogoChange={setLogo}
                colors={colors}
                onColorsChange={setColors}
                onFinish={handleFinish}
                saving={isSaving}
                saveState={saveState}
              />
            ) : null}
          </div>
        </div>

        <div className="hidden wide:block">
          <ThemePreview
            style={previewStyle}
            brandName={brandName}
            tagline={tagline}
            chips={chips}
          />
        </div>
      </div>
    </div>
  )
}
