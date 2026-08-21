'use client'

import { useCallback, useRef, useState } from 'react'
import type { BrandMemoryPayload } from '@sahoda/shared'

import { saveBrandMemory, type BrandMemorySource } from '@/app/actions/brand-resolve'
import { resolveOnboarding } from '@/app/actions/onboarding-resolve'
import { saveWorkspaceTheme } from '@/app/actions/theme'
import { refineWithDoorText } from '@/lib/onboarding/classify'
import { storedIntakeFrom } from '@/lib/onboarding/to-stored-intake'

import { doorColors, doorText, type DoorOutcome } from './door-outcome'
import type { OrbHandle } from './orb'
import type { OnboardingData } from './store'

/**
 * Six facets, matching the six questions.
 *
 * The source's own rule: listing a facet the flow never asked for would show the
 * orb absorbing something the user never gave it.
 */
const FACETS = [
  'Brand name',
  'Positioning',
  'Audience',
  'Visual identity',
  'References',
  'Knowledge',
]

/**
 * The rotating status line.
 *
 * The source's list carries "Learning your tone of voice". It is dropped here
 * for the same reason the source dropped "Brand voice" from FACETS one constant
 * earlier: onboarding no longer asks for a tone, and the RESULT screen says so
 * outright ("I have not settled on a tone of voice yet"). Two consecutive
 * screens cannot claim opposite things about the same field.
 */
const MSGS = [
  'Understanding your positioning',
  'Mapping your audience',
  'Reading your visual identity',
  'Organising your brand knowledge',
  'Building your creative guidelines',
  'Connecting everything together',
]

/** Named because it is what the flow is genuinely waiting on. */
const READING_SITE = 'Reading your website'

export interface UseBuildArgs {
  data: OnboardingData
  door: DoorOutcome
  workspaceName: string
  reduced: boolean
  orb: { current: OrbHandle | null }
  onEnterProcessing: () => void
  onLeaveProcessing: () => void
  onBuilt: () => void
}

export interface BuildFailure {
  message: string
  retryable: boolean
}

/**
 * The build.
 *
 * The choreography is the source's, beat for beat: the orb moves into the
 * processing slot keeping every particle it accumulated, switches to
 * `processing`, and the six facets collapse one every 480ms after a 700ms
 * lead-in while the status line rotates every 900ms.
 *
 * WHAT IS NOT THE SOURCE'S is when it ends. The source runs a fixed 4,280ms
 * timer and then declares the brain built — which is fine for a mock-up, where
 * nothing is being waited on. Here a real model call is in flight. So the
 * screen HOLDS after the choreography until the resolve settles, and it
 * advances only on success. A failed resolve stays on this screen with the
 * server's own sentence; it never lands on a result card describing a Brand
 * Brain that was not made.
 */
export function useBuild({
  data,
  door,
  workspaceName,
  reduced,
  orb,
  onEnterProcessing,
  onLeaveProcessing,
  onBuilt,
}: UseBuildArgs) {
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState(MSGS[0]!)
  const [failure, setFailure] = useState<BuildFailure | null>(null)
  const [brain, setBrain] = useState<BrandMemoryPayload | null>(null)
  const [brainSource, setBrainSource] = useState<BrandMemorySource>('resolved')
  const [wasFree, setWasFree] = useState(false)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const timers = useRef<number[]>([])
  const doorRef = useRef(door)
  doorRef.current = door

  function clearTimers(): void {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  /** Wait for a background site read that has not landed yet. */
  async function settleDoor(): Promise<DoorOutcome> {
    if (doorRef.current.kind !== 'reading') return doorRef.current
    setMessage(READING_SITE)
    for (let i = 0; i < 600 && doorRef.current.kind === 'reading'; i++) {
      await new Promise((r) => setTimeout(r, 200))
    }
    return doorRef.current
  }

  const start = useCallback(async (): Promise<void> => {
    setFailure(null)
    setProcessing(true)

    // The SAME canvas is moved in, so the thing that collapses is literally the
    // thing the user grew.
    onEnterProcessing()
    orb.current?.setFacets(FACETS)
    orb.current?.setMode('processing')
    orb.current?.setEnergy(1)

    clearTimers()
    setMessage(MSGS[0]!)
    let mi = 0
    const tick = window.setInterval(
      () => {
        mi = (mi + 1) % MSGS.length
        setMessage(MSGS[mi]!)
      },
      reduced ? 1400 : 900,
    )

    FACETS.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => orb.current?.absorbFacet(i), 700 + i * (reduced ? 180 : 480)),
      )
    })

    const settled = await settleDoor()

    /**
     * A fault with nowhere to save is a HALT, not a warning.
     *
     * On `no_workspace` and `signed_out` the resolve returns "Create a
     * workspace first" / "Sign in to resolve your brand", so pressing on would
     * spend the user's last three minutes walking into a wall. Neither arm
     * offers a retry, because retrying is not the remedy for either.
     */
    if (settled.kind === 'blocked' && settled.fatal) {
      window.clearInterval(tick)
      clearTimers()
      setFailure({ message: settled.message, retryable: false })
      return
    }

    const form = new FormData()
    const classified = refineWithDoorText(intakeTextOf(data), doorText(settled), {})
    form.set('model', classified.intake.model)
    form.set('regime', classified.intake.regime)
    form.set('locale', classified.intake.locale)
    form.set('doorText', doorText(settled))
    // The flow no longer asks for a tone-to-avoid — it is set on /brain against
    // real output. A blank is a truthful "we were not told"; a guess here would
    // become a red line the model treats as binding.
    form.set('refusal', '')
    form.set(
      'name',
      data.name.trim() || (settled.kind === 'read' ? settled.foundName : '') || workspaceName,
    )

    const state = await resolveOnboarding(null, form)
    window.clearInterval(tick)
    clearTimers()

    if (!state.ok) {
      setFailure({
        message: state.message,
        // An insufficient balance is not fixed by pressing the same button.
        retryable: state.kind !== 'insufficient',
      })
      return
    }

    setBrain(state.brain)
    setBrainSource(state.kind === 'fallback' ? 'system' : 'resolved')
    setWasFree(state.kind === 'free')
    setFallbackMessage(state.kind === 'fallback' ? state.message : null)

    // Only now. The core has actually absorbed something.
    setProcessing(false)
    onLeaveProcessing()
    orb.current?.setMode('idle')
    onBuilt()
  }, [data, onBuilt, onEnterProcessing, onLeaveProcessing, orb, reduced, workspaceName])

  const dismiss = useCallback(() => {
    clearTimers()
    setProcessing(false)
    setFailure(null)
    onLeaveProcessing()
    orb.current?.setMode('idle')
  }, [onLeaveProcessing, orb])

  /**
   * Save both halves.
   *
   * The theme goes first and only its failure is toasted onto the screen:
   * losing a theme is recoverable, losing the brain is not, so the brain's
   * outcome owns the result and a theme failure never becomes a false "saved".
   */
  const finish = useCallback(
    async (then: (ok: boolean) => void): Promise<void> => {
      if (!brain) {
        then(false)
        return
      }
      setSaving(true)
      setSaveError(null)

      // Declared beats derived: swatches the user MOVED are their statement
      // about the brand, and the door's extraction is a guess from a page.
      const declared = data.colorsTouched.length > 0
      const colors = declared
        ? [data.colors.Primary, data.colors.Secondary]
        : doorColors(doorRef.current)
      if (colors.length > 0) {
        const themeState = await saveWorkspaceTheme(colors)
        if (!themeState.ok) setSaveError(themeState.message)
      }

      /**
       * `confirmPaths` is EMPTY, and that is the honest answer rather than an
       * oversight.
       *
       * A path is confirmed when a person wrote the sentence in it. The new
       * result card is READ-ONLY — every brain field is set on /brain, against
       * real output, which is what "Review Brand Brain" goes to. Nobody has
       * confirmed a field here, so nothing may be marked confirmed. Deriving
       * confirmations from the onboarding answers instead would mark the
       * model's own words as the customer's.
       */
      const result = await saveBrandMemory(
        brain,
        brainSource,
        [],
        storedIntakeFrom(intakeTextOf(data), doorText(doorRef.current), {}),
      )
      setSaving(false)
      if (!result.ok) {
        setSaveError(result.message)
        then(false)
        return
      }
      then(true)
    },
    [brain, brainSource, data],
  )

  return {
    processing,
    message,
    failure,
    wasFree,
    fallbackMessage,
    saving,
    saveError,
    start,
    dismiss,
    finish,
  }
}

/**
 * The text the classifier reads to derive model, regime and locale.
 *
 * BOTH the positioning sentence and the chip word, because the chip is a word
 * the user chose about their own business and the lexicon can read it — "Local
 * business" is evidence in the same way "we run a bakery" is. No OVERRIDE is
 * passed: an override means `chosen`, which `to-stored-intake.ts` persists as
 * `declared`, and the chip's vocabulary is not the intake's. Mapping "SaaS" to
 * a business model would be our guess wearing the customer's name.
 */
function intakeTextOf(data: OnboardingData): string {
  return [data.what, data.category, data.audience].filter(Boolean).join('. ')
}
