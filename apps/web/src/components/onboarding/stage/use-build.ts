'use client'

import { useCallback, useRef, useState } from 'react'
import type { BrandMemoryPayload } from '@sahoda/shared'

import { saveBrandMemory, type BrandMemorySource } from '@/app/actions/brand-resolve'
import { resolveOnboarding } from '@/app/actions/onboarding-resolve'
import { saveWorkspaceTheme } from '@/app/actions/theme'
import { refineWithDoorText } from '@/lib/onboarding/classify'
import { sendableSources } from '@/lib/onboarding/sources'
import { storedIntakeFrom } from '@/lib/onboarding/to-stored-intake'

import { doorColors, doorText, type DoorOutcome } from './door-outcome'
import type { OrbHandle } from './orb'
import type { OnboardingData, Rival } from './store'
import { waitForDoor } from './wait-for-door'

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
  onBuilt: () => void
  /** Called when the build decides the read is not going to land in time. */
  onDoorSettled: (outcome: DoorOutcome) => void
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
  onBuilt,
  onDoorSettled,
}: UseBuildArgs) {
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState(MSGS[0]!)
  const [failure, setFailure] = useState<BuildFailure | null>(null)
  const [brain, setBrain] = useState<BrandMemoryPayload | null>(null)
  const [brainSource, setBrainSource] = useState<BrandMemorySource>('resolved')
  /**
   * What did not land after the brain was built — a competitor, a source, or
   * both. Named for the moment rather than for one of the two things it can
   * report, because it carries either.
   *
   * `null` covers both "there were none to send" and "every one landed", which
   * are the two cases with nothing to say. A partial failure must not be
   * silent — the brain is built and charged by then, so losing a competitor
   * quietly would leave the person believing a page is being watched.
   */
  const [afterBuildNote, setWatchListNote] = useState<string | null>(null)
  /**
   * The logo's BYTES, deliberately outside `data`.
   *
   * `data` is serialised to localStorage on every change and a `File` becomes
   * `{}` there — which is precisely how this screen once ended up persisting a
   * logo as its filename and uploading nothing. A ref keeps the bytes for as
   * long as the tab is open and loses them honestly when it is not: the palette
   * survives the resume because it is strings, the file does not, and the screen
   * says which it still has.
   */
  const logoRef = useRef<File | null>(null)
  const [wasFree, setWasFree] = useState(false)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /**
   * Held SEPARATELY from `saveError`, because they mean opposite things.
   *
   * The first cut wrote a theme failure into `saveError` and then carried on to
   * save the brain — so a SUCCESSFUL save rendered a failure sentence beside it
   * and the Enter button was, from the reader's point of view, refusing. Losing
   * a theme is recoverable and does not block entry; losing the brain does.
   */
  const [themeError, setThemeError] = useState<string | null>(null)

  /**
   * THE MONEY GUARD.
   *
   * ── WHY IT IS HERE, AND WHERE IT CAME FROM ──────────────────────────────────
   * Ported from `onboarding-flow.tsx`, which this stage replaced as the mount
   * point for /onboarding. That file is now UNREACHABLE, and the guard in it was
   * the fix for QA #6 (2026-08-22): "Resolve runs for seconds with zero pending
   * state; double-click ran it twice." Merging the new stage would have put the
   * double-charge back with nothing going red — no test names this behaviour on
   * this side of the swap, and the gate cannot see a file stop being imported.
   *
   * ── AND THE HOLE IS BIGGER HERE THAN IT WAS THERE ───────────────────────────
   * The old flow dispatched through `useActionState`, so React's action queue
   * SERIALISED two presses into two charges. `start` is a bare async function:
   * two presses run CONCURRENTLY and both reach `resolveOnboarding`.
   *
   * The ledger key is now bound to the active brain version rather than minted
   * fresh per call (`lib/brand/resolve-object-ref.ts`), so two concurrent
   * dispatches would carry the SAME key and settle as one charge. **This guard
   * is still the one that must hold.** Exactly-once there is a settlement
   * property, not a scheduling one: two overlapping HOLDs on one key race, the
   * loser surfaces as a failed build to somebody who pressed a button twice,
   * and both run a real model call we pay for. The ledger stops the double
   * charge; this stops the double request.
   *
   * There are FOUR ways in, not one:
   *   · `#next`  "Build my Brand Brain" on the last step
   *   · `#skip`  "Skip for now" — a differently-labelled button firing the same
   *              paid call, which is why ONE SHARED ref beats per-button
   *              `disabled`
   *   · Enter on that step
   *   · the overlay's Retry
   *
   * A ref, not render state: it has to hold in the same tick as the second
   * press, before React has re-rendered anything. `busy` is the render mirror
   * the buttons read; it is never the guard.
   */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)

  /**
   * The same shape for the SAVE. Not a charge — `saveBrandMemory` never calls
   * the mesh — but two presses of "Enter Sahoda" write two `brand_memory`
   * versions and save the theme twice.
   */
  const saveInFlight = useRef(false)

  const timers = useRef<number[]>([])
  const doorRef = useRef(door)
  doorRef.current = door

  function clearTimers(): void {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  /**
   * Wait for a background site read that has not landed yet — BOUNDED, and
   * bounded in `wait-for-door.ts`, where the timeout arm can be executed by a
   * test instead of only by an unusually slow network.
   */
  async function settleDoor(): Promise<DoorOutcome> {
    if (doorRef.current.kind !== 'reading') return doorRef.current
    setMessage(READING_SITE)
    const settled = await waitForDoor({
      read: () => doorRef.current,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    })
    if (settled !== doorRef.current) {
      // The build is going on without the site, and the card has to say so.
      onDoorSettled(settled)
      doorRef.current = settled
    }
    return settled
  }

  const start = useCallback(async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    /**
     * Hoisted so the `finally` can stop it.
     *
     * It used to be cleared only on the paths that RETURN. A throw from
     * `settleDoor` or `resolveOnboarding` left the interval running and
     * `processing` true, so the overlay went on rotating "Mapping your
     * audience" forever, with no failure sentence and no Retry — a screen that
     * looks like work being done and is not. The guard is what made this a one
     * line fix; it is not the guard.
     */
    let tick = 0
    try {
      setFailure(null)
      setProcessing(true)

      /*  The canvas is NOT moved here. `.proc` is `display: none` until it is
          `.on`, and this runs in the same tick as `setProcessing(true)` — so a
          measurement taken now reads 0x0 off a hidden element, the backing store
          is sized 2x2, and CSS then stretches those four pixels across 480px.
          That renders as a flat dark rectangle over the status card, which is
          exactly what it did. The move is driven by an effect in the stage, which
          runs after the browser has laid the screen out. */
      orb.current?.setFacets(FACETS)
      orb.current?.setMode('processing')
      orb.current?.setEnergy(1)

      clearTimers()
      setMessage(MSGS[0]!)
      let mi = 0
      tick = window.setInterval(
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
      /**
       * The answers screen 02 and 03 collect, which used to stop at the browser.
       *
       * Until now this form carried model, regime, locale, doorText, an empty
       * refusal and a name. Everything else a person typed over six screens was
       * read for keywords by the classifier and then dropped — age, location,
       * role and interests reached nothing at all, and the positioning sentence
       * survived only as three enum values.
       *
       * `refusal` was hardcoded empty with the note that "a guess here would
       * become a red line the model treats as binding". That reasoning is about
       * guessing, and it stands: this sends what the person actually wrote, and
       * an untouched field still sends nothing.
       */
      form.set('refusal', data.neverSay.trim())
      form.set('positioning', data.what.trim())
      form.set('audience', data.audience.trim())
      form.set('audienceAge', data.age.trim())
      form.set('audienceLoc', data.loc.trim())
      form.set('audienceRole', data.role.trim())
      form.set('audienceInterests', data.interests.trim())
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

      /**
       * The watch list, sent to the same action the Radar screen uses.
       *
       * AFTER the resolve and never before it, and it cannot fail the build.
       * By this line the brain exists and the credits are spent; throwing that
       * away because a competitor URL was malformed would lose the expensive
       * half to protect the free one. Rows without an address are skipped
       * rather than sent — a session saved before this screen asked for one
       * comes back holding them, and `addCompetitor` would refuse them anyway.
       */
      const [watchNote, sourcesNote, logoNote] = [
        await sendWatchList(data.competitors),
        await sendSources(data.sources, data.sourceUrls),
        await sendLogo(logoRef.current),
      ]
      // Joined rather than nested: two independent things went wrong or did
      // not, and the reader needs both sentences, not the first one only.
      setWatchListNote([watchNote, sourcesNote, logoNote].filter(Boolean).join(' ') || null)
      setWasFree(state.kind === 'free')
      setFallbackMessage(state.kind === 'fallback' ? state.message : null)

      // Only now. The core has actually absorbed something.
      setProcessing(false)
      orb.current?.setMode('idle')
      onBuilt()
    } finally {
      // EVERY arm, including a throw. `settleDoor` and `resolveOnboarding` can
      // both reject, and a guard released anywhere else would latch the button
      // dead for the rest of the session. Deliberately NOT released in
      // `dismiss`: dismiss turns the overlay off while the resolve may still be
      // in flight, and releasing there would reopen the second charge.
      window.clearInterval(tick)
      clearTimers()
      inFlight.current = false
      setBusy(false)
    }
  }, [data, onBuilt, onDoorSettled, orb, reduced, workspaceName])

  const dismiss = useCallback(() => {
    clearTimers()
    setProcessing(false)
    setFailure(null)
    orb.current?.setMode('idle')
  }, [orb])

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
      if (saveInFlight.current) return
      saveInFlight.current = true
      setSaving(true)
      setSaveError(null)
      setThemeError(null)

      try {
        /**
         * The LOGO beats the website. Colours read out of a file somebody chose
         * are their statement about the brand; the door's extraction is a guess
         * from a page that may be mostly stock photography. An empty palette
         * means no logo, or a logo nothing could be read from, and both fall
         * through to the guess rather than to a theme of nothing.
         */
        const colors = data.palette.length > 0 ? data.palette : doorColors(doorRef.current)
        if (colors.length > 0) {
          const themeState = await saveWorkspaceTheme(colors)
          if (!themeState.ok) setThemeError(themeState.message)
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
        if (!result.ok) {
          setSaveError(result.message)
          then(false)
          return
        }
        then(true)
      } finally {
        /**
         * THE SAME `finally` `start` HAS, AND FOR THE SAME REASON.
         *
         * This released on the clean return only. `saveWorkspaceTheme` and
         * `saveBrandMemory` are both `await`ed and both can REJECT — a dropped
         * connection is enough — and a rejection left `saveInFlight` true and
         * `saving` true for the rest of the session. `ResultStep` reads
         * `saving={build.saving || launching}`, so both Enter Sahoda and Review
         * Brand Brain would sit in a saving state, showing no error, while the
         * ref swallowed every further press. A brain that was successfully
         * resolved would be unreachable, and the screen would look like it was
         * still working.
         *
         * A never-settling mock cannot catch this, which is why the test for it
         * REJECTS rather than hangs.
         */
        setSaving(false)
        saveInFlight.current = false
      }
    },
    [brain, brainSource, data],
  )

  return {
    processing,
    /** The render mirror of the money guard. Never the guard itself. */
    busy,
    message,
    failure,
    wasFree,
    fallbackMessage,
    afterBuildNote,
    takeLogo: (file: File) => {
      logoRef.current = file
    },
    saving,
    saveError,
    themeError,
    start,
    dismiss,
    finish,
  }
}

/**
 * ── WHY THE TWO ACTIONS BELOW ARE IMPORTED INSIDE THE FUNCTIONS ──────────────
 * They run once, on the last press of the last screen, so the first load of
 * screen 01 is the wrong place for them.
 *
 * MEASURED, and smaller than it sounds: moving these two off the static graph
 * took `/(onboarding)/onboarding` from 789.2 kB to 788.9 kB. 0.3 kB, not the
 * several this was expected to save — the route's weight is dominated by a
 * shared vendor chunk, not by these. Kept because it is still the right shape
 * and costs nothing, and recorded at its real size so the next person does not
 * re-derive it hoping for more.
 *
 * The budget script says in its own header that it cannot see a dynamic import,
 * so this moves bytes out of the measured window rather than deleting them.
 * Honest here, and it would not be for code the FIRST screen needs.
 */

/**
 * Read the picked knowledge sources into the library, and say what did not land.
 *
 * `addUrlDocument` fetches the address, stores the document and indexes it, and
 * costs nothing — `knowledge.ts` states that no action on that path is priced,
 * because no model is called on it. A source picked without an address is
 * skipped rather than sent: the step never gates, so leaving the field empty is
 * a thing people will do, and posting an empty URL just earns a refusal.
 */
async function sendSources(
  picked: readonly string[],
  urls: Readonly<Record<string, string>>,
): Promise<string | null> {
  const failed: string[] = []
  // The SAME rule the summary card counts with. See `lib/onboarding/sources.ts`:
  // when the rule lived only here, the card counted picks and told people about
  // sources that were never sent.
  for (const key of sendableSources(picked, urls)) {
    const url = (urls[key] ?? '').trim()
    try {
      const form = new FormData()
      form.set('url', url)
      form.set('title', key)
      const { addUrlDocument } = await import('@/app/actions/knowledge')
      const result = await addUrlDocument(form)
      if (!result.ok) failed.push(key)
    } catch {
      failed.push(key)
    }
  }
  if (failed.length === 0) return null
  return `Sahoda could not read ${failed.join(', ')}. Your Brand Brain is saved. Try ${failed.length === 1 ? 'that source' : 'those sources'} again from Knowledge.`
}

/**
 * Keep the logo, in the assets library, like any other file.
 *
 * The point of asking for a logo rather than three hex fields is that the file
 * is worth having: it belongs in Assets, where a post or a site can use it. A
 * version of this that read the colours and dropped the bytes would be the same
 * defect the colour pickers replaced, wearing a friendlier question.
 *
 * AFTER the brain, and it cannot fail the build, for the reason the competitors
 * and the sources are sent here too: by this line the expensive half is already
 * paid for.
 */
async function sendLogo(file: File | null): Promise<string | null> {
  if (!file) return null
  try {
    const form = new FormData()
    form.set('file', file)
    form.set('title', 'Logo')
    const { uploadAsset } = await import('@/app/actions/assets')
    const result = await uploadAsset(form)
    if (result.ok) return null
    // The COLOURS are already saved and the theme is right either way, so the
    // sentence says what was lost and what was not.
    return `Sahoda could not keep your logo file. Your colours are saved. Add it again from Assets.`
  } catch {
    return `Sahoda could not keep your logo file. Your colours are saved. Add it again from Assets.`
  }
}

/**
 * Put the competitors on the Radar watch list, and say what did not land.
 *
 * Sequential rather than `Promise.all`: each call is a workspace-scoped write
 * behind RLS, and firing five at once at a free-tier database to save a few
 * hundred milliseconds on a screen the user is already watching an animation on
 * is a bad trade. Returns `null` when there is nothing to report.
 */
async function sendWatchList(rivals: readonly Rival[]): Promise<string | null> {
  const sendable = rivals.filter((r) => r.url.trim() !== '')
  const failed: string[] = []
  for (const rival of sendable) {
    try {
      const { addCompetitor } = await import('@/app/actions/radar')
      const result = await addCompetitor(rival.name, rival.url, rival.kind)
      if (!result.ok) failed.push(rival.name)
    } catch {
      // A throw and an `ok: false` are the same outcome to the person reading
      // the sentence: this one is not being watched.
      failed.push(rival.name)
    }
  }
  const skipped = rivals.length - sendable.length
  if (failed.length === 0 && skipped === 0) return null
  const parts: string[] = []
  if (failed.length > 0) {
    parts.push(
      `Sahoda could not add ${failed.join(', ')} to your watch list. Your Brand Brain is saved. Add ${failed.length === 1 ? 'it' : 'them'} again on Radar.`,
    )
  }
  if (skipped > 0) {
    parts.push(
      `${skipped} ${skipped === 1 ? 'competitor has' : 'competitors have'} no address, so ${skipped === 1 ? 'it was' : 'they were'} not added to the watch list.`,
    )
  }
  return parts.join(' ')
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
