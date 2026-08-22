'use client'

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { BrandFieldMetaMap, BrandMemoryPayload } from '@sahoda/shared'
import { toast } from 'sonner'

import {
  saveBrandMemory,
  type BrandMemorySource,
  type SaveBrandState,
} from '@/app/actions/brand-resolve'
import { resolveOnboarding, type OnboardingResolveState } from '@/app/actions/onboarding-resolve'
import { saveWorkspaceTheme } from '@/app/actions/theme'
import { brandSkinVars } from '@/lib/brand/brand-theme'
import { editedPaths } from '@/lib/brand/edited-paths'
import { refineWithDoorText } from '@/lib/onboarding/classify'
import { storedIntakeFrom } from '@/lib/onboarding/to-stored-intake'
import { DEFAULT_INTAKE, type Intake } from '@/lib/onboarding/intake'

import type { AttemptError } from './attempt-error'
import { DoorStep, type DoorResult } from './door-step'
import { IntakeStep } from './intake-step'
import { QuestionStep } from './question-step'
import { RevealStep } from './reveal-step'
import { SavedBrainBanner } from './saved-brain-banner'
import { StepRail } from './step-rail'

type Screen = 'intake' | 'door' | 'question' | 'reveal'

const SCREEN_INDEX: Record<Screen, number> = { intake: 0, door: 1, question: 2, reveal: 3 }

export interface SavedBrainSummary {
  payload: BrandMemoryPayload
  version: number
  source: string
  updatedAt: string
  /** Provenance of the SAVED brain. Undefined once this session resolves a new one. */
  fieldMeta: BrandFieldMetaMap | undefined
}

export interface OnboardingFlowProps {
  /** The workspace's saved brain, or null. Non-null means re-entry. */
  savedBrain: SavedBrainSummary | null
  /** Server-decided: is the next resolve free? */
  isFree: boolean
  /** Server-owned cost of a charged resolve. */
  cost: number
  /** True when the workspace already has an active Brand Skin. */
  hasSavedTheme: boolean
  /** Fallback name when the door gives us none. */
  workspaceName: string
}

/**
 * The flow: three answers, one resolve, one reveal.
 *
 * Re-entry is the case the previous version got wrong. `/onboarding` used to
 * mount blank every time, so a workspace that had finished the flow was offered
 * it again from scratch — and the only way to see the brain it had already
 * resolved was to pay for a new one. When `savedBrain` is present the flow
 * opens ON the reveal, holding that brain, and no resolve has to happen at all.
 */
export function OnboardingFlow({
  savedBrain,
  isFree,
  cost,
  hasSavedTheme,
  workspaceName,
}: OnboardingFlowProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<OnboardingResolveState | null, FormData>(
    resolveOnboarding,
    null,
  )

  /**
   * The money guard. `newResolveObjectRef` mints a FRESH ledger key per call, so
   * two dispatches are two charges — and React's action queue does not drop the
   * second, it runs it once the first settles (MEASURED: two same-tick dispatches
   * on an ungated control invoke the action twice). A ref, not render state: it
   * has to hold in the same tick as the second press, before React has
   * re-rendered anything.
   */
  const inFlight = useRef(false)
  /**
   * Render mirror of the guard. The screens ask THIS, not `isPending`, whether a
   * resolve is running: QA frames j1-09/j1-10 (2026-08-22) caught the resolve
   * button enabled and labelled "Resolve my brand · free" mid-resolve. Why
   * `isPending` read false there is not established, so this does not explain it —
   * it removes the dependency on it. Never the guard itself; a ref is.
   */
  const [dispatched, setDispatched] = useState(false)
  const resolving = isPending || dispatched

  const [screen, setScreen] = useState<Screen>(savedBrain ? 'reveal' : 'intake')
  const [intake, setIntake] = useState<Intake>(DEFAULT_INTAKE)
  const [intakeText, setIntakeText] = useState('')
  const [overrides, setOverrides] = useState<Partial<Intake>>({})
  const [door, setDoor] = useState<DoorResult | null>(null)
  const [refusal, setRefusal] = useState('')

  const [brain, setBrain] = useState<BrandMemoryPayload | null>(savedBrain?.payload ?? null)
  /**
   * The brain as it ARRIVED, before any card was edited. Approve diffs against
   * it to name the fields a person actually wrote, which is what marks them
   * confirmed (lib/brand/field-meta.ts).
   *
   * Without this, Approve would save with no `confirmPaths` and a user who
   * corrected six cards would land on /brain reading "0 of 15 confirmed" — the
   * exact "my corrections were thrown away" misreading the ring exists to avoid.
   * Re-seeded on EVERY resolve including a re-resolve, or the diff would be
   * taken against a payload two model calls old.
   */
  const [baseline, setBaseline] = useState<BrandMemoryPayload | null>(savedBrain?.payload ?? null)
  /**
   * Provenance of the brain currently on screen, carried so Approve can write
   * it back truthfully. A demo fallback is saved `system` and stays `system`
   * even after hand-editing: editing a sample does not turn it into a resolve
   * of this brand, and `system` is the flag that stops it being mistaken for
   * one later.
   */
  const [brainSource, setBrainSource] = useState<BrandMemorySource>(
    savedBrain?.source === 'system' ? 'system' : 'resolved',
  )
  const [wasFree, setWasFree] = useState(false)
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)
  const [attemptError, setAttemptError] = useState<AttemptError | null>(null)

  const [isSaving, startSaving] = useTransition()
  const [saveState, setSaveState] = useState<SaveBrandState | null>(null)

  useEffect(() => {
    // Every return path of `resolveOnboarding` yields a fresh object, so this
    // effect runs on every settle: success, fallback, insufficient and error.
    // Keyed on `state`, NEVER on `isPending` — if `isPending` never flips, an
    // `[isPending]` release never fires and the button latches dead forever.
    inFlight.current = false
    setDispatched(false)
    if (!state) return

    if (state.ok) {
      setBrain(state.brain)
      setBaseline(state.brain)
      setBrainSource(state.kind === 'fallback' ? 'system' : 'resolved')
      setWasFree(state.kind === 'free')
      setBalanceAfter(state.kind === 'resolved' ? state.balanceAfter : null)
      setFallbackMessage(state.kind === 'fallback' ? state.message : null)
      setAttemptError(null)
      setScreen('reveal')
      return
    }

    const failure: AttemptError =
      state.kind === 'insufficient'
        ? {
            kind: 'insufficient',
            message: state.message,
            required: state.required,
            available: state.available,
          }
        : { kind: 'error', message: state.message }

    setAttemptError(failure)
    // On the reveal a failed re-resolve must not take the brain off screen —
    // the toast is the immediate signal, the notice on the step is what stays.
    if (brain) toast(state.message)
    // `brain` is read, not depended on: only a genuinely NEW result re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function buildFormData(answer: string): FormData {
    const data = new FormData()
    data.set('model', intake.model)
    data.set('regime', intake.regime)
    data.set('locale', intake.locale)
    data.set('doorText', door?.text ?? '')
    data.set('refusal', answer)
    data.set('name', door?.foundName || workspaceName)
    return data
  }

  function handleResolve(answer: string): void {
    if (inFlight.current) return
    inFlight.current = true
    setDispatched(true)
    setRefusal(answer)
    setAttemptError(null)
    formAction(buildFormData(answer))
  }

  /** Same charge, same guard: six Regenerate buttons share one dispatch. */
  function handleRegenerate(): void {
    if (inFlight.current) return
    inFlight.current = true
    setDispatched(true)
    formAction(buildFormData(refusal))
  }

  /**
   * Finish saves BOTH halves. The theme goes first and only its failure is
   * toasted: losing a theme is recoverable, losing the brain is not, so the
   * brain's outcome owns `saveState` and a theme failure never becomes a false
   * "saved" claim.
   */
  function handleFinish(): void {
    if (!brain) return
    startSaving(async () => {
      const colors = door?.colors ?? []
      if (colors.length > 0) {
        const themeState = await saveWorkspaceTheme(colors)
        if (!themeState.ok) toast(themeState.message)
      }
      // Naming the edited fields is what confirms them. Editing a card on a
      // demo fallback still counts: the row stays `system` (it is not this
      // brand's resolve), but the sentence the user typed is theirs.
      //
      // The intake rides along on THIS write because this is the only moment the
      // three picks and the brain are both in hand. Without it the refusal gate
      // resolves every workspace to `consumer`/`default` and the mandated tier is
      // the floor pack alone — see `storedIntakeFrom`, which returns null rather
      // than persisting a regime nobody actually indicated.
      const result = await saveBrandMemory(
        brain,
        brainSource,
        editedPaths(baseline, brain),
        storedIntakeFrom(intakeText, door?.text ?? '', overrides),
      )
      setSaveState(result)
      // The theme paints the shell, so the app has to be re-entered to wear it.
      if (result.ok) router.push('/home')
    })
  }

  const colors = door?.colors ?? []
  const previewStyle: CSSProperties | undefined =
    colors.length > 0 ? (brandSkinVars(colors) as CSSProperties) : undefined

  // `savedBrain` is a server prop and never clears, so "Start over" leaves it
  // set while the user is back on screen 1 with nothing loaded. The header has
  // to track the SCREEN as well, exactly as the banner below already does.
  const showingSaved = savedBrain !== null && screen === 'reveal'

  return (
    <div style={previewStyle} className="mx-auto max-w-content p-page max-narrow:p-page-mobile">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="type-eyebrow text-accent">Brand Brain</span>
          <h1 className="mt-1 text-[20px] font-[650] tracking-[-0.02em] text-ink">
            {showingSaved ? 'Your Brand Brain' : 'Three answers, then we listen'}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {showingSaved
              ? 'Loaded from your workspace. Edit anything and approve to save a new version.'
              : 'Tell us what you do, show us how you talk, answer one question.'}
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

      <div className="flex min-w-0 flex-col gap-4">
        <StepRail activeIndex={SCREEN_INDEX[screen]} />

        {showingSaved && savedBrain ? (
          <SavedBrainBanner
            version={savedBrain.version}
            source={savedBrain.source}
            updatedAt={savedBrain.updatedAt}
            onStartOver={() => {
              setBrain(null)
              // Reset with the brain it describes. The next resolve overwrites
              // it either way, so this is symmetry rather than a live bug —
              // but a reset that clears two of three related pieces of state is
              // how the third becomes one on the next edit.
              setBrainSource('resolved')
              setSaveState(null)
              setScreen('intake')
            }}
          />
        ) : null}

        <div className="surface-ring rounded-card bg-surface p-5 wide:p-6">
          {screen === 'intake' ? (
            <IntakeStep
              initialText={intakeText}
              initialOverrides={overrides}
              onContinue={(next, text, picked) => {
                setIntake(next)
                setIntakeText(text)
                setOverrides(picked)
                setScreen('door')
              }}
            />
          ) : null}

          {screen === 'door' ? (
            <DoorStep
              onBack={() => setScreen('intake')}
              onContinue={(result) => {
                setDoor(result)
                // The door text is richer than the sentence typed on screen 1,
                // so an ASSUMED pick yields to it — otherwise a bakery whose
                // owner typed only its name is asked the agency question.
                // A pick they CHOSE, or one the sentence matched, is untouched.
                setIntake(refineWithDoorText(intakeText, result.text, overrides).intake)
                setScreen('question')
              }}
            />
          ) : null}

          {screen === 'question' ? (
            <QuestionStep
              intake={intake}
              isPending={resolving}
              isFree={isFree}
              cost={cost}
              attemptError={attemptError}
              onBack={() => setScreen('door')}
              onResolve={handleResolve}
            />
          ) : null}

          {screen === 'reveal' && brain ? (
            <RevealStep
              brain={brain}
              // The SAVED brain's provenance, and only when the brain on screen
              // IS the saved one. `door !== null` is the same proof
              // `canRegenerate` uses: it means screens 1-3 ran in this session,
              // so what is on screen came out of a fresh resolve and nobody has
              // confirmed any of it. Passing the saved meta there would credit a
              // new brain with confirmations made against an old one.
              fieldMeta={door === null ? savedBrain?.fieldMeta : undefined}
              onChange={(updater) => setBrain((current) => (current ? updater(current) : current))}
              balanceAfter={balanceAfter}
              wasFree={wasFree}
              fallbackMessage={fallbackMessage}
              colors={colors}
              hasSavedTheme={hasSavedTheme}
              // `door !== null` is the proof that screens 1-3 were answered in
              // THIS session. Without it, a reveal opened from a saved brain
              // would resolve from the default picks and an empty door.
              canRegenerate={door !== null}
              // The EFFECTIVE cost, not the list price. A re-resolve before
              // anything is approved takes the same free path the first one did
              // (`isFirstResolve` reads `brand_memory`, which is still empty),
              // so a card reading "Uses 50 credits" would be quoting a charge
              // the server is not going to make.
              regenerateCost={isFree ? 'free' : cost}
              regeneratePending={resolving}
              regenerateError={attemptError}
              onRegenerate={handleRegenerate}
              onFinish={handleFinish}
              saving={isSaving}
              saveState={saveState}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
