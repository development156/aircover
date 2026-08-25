'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { deferOnboarding } from '@/app/actions/onboarding-defer'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { creditWord } from '@/lib/credit-words'

import { BootVideo } from './boot-video'
import { doorColors, doorText, type DoorOutcome } from './door-outcome'
import { OrbColumn } from './orb-column'
import { useBootVideo } from './use-boot-video'
import { ProcessingOverlay } from './processing-overlay'
import { ProgressBar } from './progress-bar'
import { readSite } from './read-site'
import { useBuild } from './use-build'
import { useOrb } from './use-orb'
import { useStepHistory } from './use-step-history'
import {
  canAdvance,
  clearState,
  isStepId,
  DEFAULT_COLORS,
  DEFAULT_DATA,
  energyOf,
  loadState,
  NUMBERED,
  ORDER,
  saveState,
  signalCount,
  type OnboardingData,
  type StepId,
} from './store'
import { AudienceStep } from './steps/audience-step'
import { BasicsStep } from './steps/basics-step'
import { IntroStep } from './steps/intro-step'
import { KnowledgeStep } from './steps/knowledge-step'
import { ReferencesStep } from './steps/references-step'
import { ResultStep } from './steps/result-step'
import { RivalsStep } from './steps/rivals-step'
import { VisualStep } from './steps/visual-step'
import { WhatStep } from './steps/what-step'

/**
 * Never given a history entry. The brain behind the result was built and paid
 * for in this session, so an entry pointing at it would let Back return to a
 * screen whose work has already been consumed — the same reason `loadState`
 * refuses to resume there.
 */
const RESULT_ONLY: readonly StepId[] = ['result']

export interface OnboardingStageProps {
  workspaceId: string
  workspaceName: string
  /** Server-decided: is the next resolve free? A client flag could say free every time. */
  isFree: boolean
  cost: number
  /** True when this workspace already has a Brand Brain — re-entry, not a first run. */
  hasSavedBrain: boolean
  /**
   * Server-decided: has this PERSON already been shown the boot animation?
   *
   * Read from `users_profile.prefs`, so it holds across a sign-out, a second
   * device and a cleared browser — none of which localStorage survives. A read
   * that FAILED arrives here as `true`, because showing a ten-second film twice
   * to somebody who cannot skip it is the worse of the two mistakes.
   */
  hasSeenBootVideo: boolean
}

export function OnboardingStage({
  workspaceId,
  workspaceName,
  isFree,
  cost,
  hasSavedBrain,
  hasSeenBootVideo,
}: OnboardingStageProps) {
  const router = useRouter()

  /**
   * Hydration. The saved position lives in localStorage, which the server
   * cannot see, so the first paint is the intro for everyone and the resumed
   * step is adopted on mount. Rendering the resumed step on the server would be
   * a hydration mismatch on every returning user's first frame.
   */
  const [step, setStep] = useState<StepId>('intro')
  const [dir, setDir] = useState(1)
  const [data, setData] = useState<OnboardingData>(() => ({
    ...DEFAULT_DATA,
    colors: { ...DEFAULT_COLORS },
  }))
  const [hydrated, setHydrated] = useState(false)
  const [door, setDoor] = useState<DoorOutcome>({ kind: 'none' })
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saved = loadState(workspaceId)
    if (saved) {
      setData(saved.data)
      // Resume at the step they left. A saved `result` is not resumable —
      // the brain behind it was never built in this session.
      setStep(saved.step === 'result' ? 'comp' : saved.step)
    }
    setHydrated(true)
  }, [workspaceId])

  // Persist every move. Cheap, synchronous, and it is what makes Escape safe.
  useEffect(() => {
    if (!hydrated) return
    saveState(workspaceId, { step, data })
  }, [hydrated, workspaceId, step, data])

  const { orb, caption, moveTo } = useOrb(data, reduced.current, energyOf(data))

  const orbWrapRef = useRef<HTMLDivElement | null>(null)
  const procSlotRef = useRef<HTMLDivElement | null>(null)

  const patch = useCallback((next: Partial<OnboardingData>) => {
    setData((current) => ({ ...current, ...next }))
  }, [])

  /* ─────────────────────────────────────────────────── the step machine ── */

  const go = useCallback((id: StepId, direction: number) => {
    setDir(direction)
    setStep(id)
  }, [])

  const back = useCallback(() => {
    const i = ORDER.indexOf(step)
    if (i > 0) go(ORDER[i - 1]!, -1)
  }, [go, step])

  /**
   * The browser's Back button means "the previous question".
   *
   * Nine screens live behind one URL and none of them used to push a history
   * entry, so Back left the flow entirely — on the screens every customer meets
   * first. The typed answers already survived that (the store writes on every
   * move) but surviving a wrong exit is not the same as not being thrown out.
   *
   * `onPop` calls `setStep` directly rather than `go`: `go` also sets the
   * transition DIRECTION, and it is set here from the ORDER positions so a pop
   * animates backwards when it went backwards and forwards on a Forward press —
   * which is the half a `dir: -1` constant would get wrong.
   */
  useStepHistory<StepId>({
    step,
    isStep: isStepId,
    skip: RESULT_ONLY,
    onPop: (id) => {
      /**
       * NOT DURING THE FILM. This is the fourth way out of a screen whose
       * ruling is that there is no way out, and the only one that arrives from
       * the browser rather than from the page.
       *
       * Popping while the boot animation runs takes `step` off `result`, which
       * UNMOUNTS the video — so no `ended` ever fires, the start deadline was
       * long since disarmed by `playing`, and the progress watchdog reads a
       * null ref and returns. Nothing finishes, nothing navigates, and the
       * customer is left on the rivals step with a saved Brand Brain and no
       * route forward but pressing Build again.
       *
       * A skip control that also strands them. `exiting` is the same ref the
       * keyboard handler reads and it is set in the click's own call stack, so
       * there is no window where a pop can slip through.
       */
      if (exiting.current) return
      setDir(ORDER.indexOf(id) < ORDER.indexOf(step) ? -1 : 1)
      setStep(id)
    },
  })

  /**
   * The website read runs in the BACKGROUND from the moment they leave step 01.
   *
   * Measured in production (recorded in `door-step.tsx`): brand_extract p50
   * 26.3s, p90 37.0s. Blocking step 01 on that would put a half-minute wall in
   * front of a flow whose own intro promises three minutes. Running it while
   * they answer steps 02-06 costs them nothing and is finished by the time the
   * build needs it — and `useBuild` waits for it if it is not.
   */
  const readStarted = useRef('')
  const startSiteRead = useCallback((url: string) => {
    const site = url.trim()
    if (!site || readStarted.current === site) return
    readStarted.current = site
    setDoor({ kind: 'reading' })
    void readSite(site).then(setDoor)
  }, [])

  const advance = useCallback(() => {
    if (step === 'intro') return go('1', 1)
    if (step === '1') startSiteRead(data.site)
    const i = ORDER.indexOf(step)
    if (i >= 0 && i < ORDER.length - 1) go(ORDER[i + 1]!, 1)
  }, [data.site, go, startSiteRead, step])

  const build = useBuild({
    data,
    door,
    workspaceName,
    reduced: reduced.current,
    orb,
    onBuilt: () => go('result', 1),
    onDoorSettled: setDoor,
  })

  /**
   * Put the orb wherever the flow currently wants it.
   *
   * The canvas is created imperatively (React must not own a node that gets
   * moved between two parents), so SOMETHING has to place it — and it has to be
   * an EFFECT, for two separate reasons that both showed up as rendering bugs.
   *
   * Without any placement at all the right-hand column rendered empty and the
   * whole argument of the screen — an object that visibly grows as you teach
   * it — was simply absent, while 56 hashed, distinct, passing frames said the
   * walk was green.
   *
   * And placing it imperatively from `build.start()` was worse than not placing
   * it: `.proc` is `display: none` until it is `.on`, so a measurement taken in
   * the same tick as `setProcessing(true)` reads 0x0, the backing store is
   * sized 2x2, and CSS stretches four pixels across 480px — a flat dark
   * rectangle over the status card. An effect runs after the browser has laid
   * the screen out, so the box it measures is the box that exists.
   */
  useEffect(() => {
    moveTo(build.processing ? procSlotRef.current : orbWrapRef.current)
  })

  /* ───────────────────────────────────────────────── save and exit / end ── */

  /**
   * `Save & exit` — and the server call in front of it is not decoration.
   *
   * `(app)/layout.tsx` now sends an account with no Brand Brain to /onboarding
   * on arrival. Pushing /home from here without telling it would be bounced
   * straight back, and wt-onboard2's button would be gone while every test of
   * it still passed. `deferOnboarding` sets the session cookie that stands the
   * gate down for this visit.
   *
   * The navigation does not wait on the result: the worst a failed cookie costs
   * is one bounce back into a flow they can leave again, and blocking the
   * button on a round trip would be the larger harm.
   */
  const saveExit = useCallback(() => {
    saveState(workspaceId, { step, data })
    void deferOnboarding().finally(() => router.push('/home'))
  }, [data, router, step, workspaceId])

  const [launching, setLaunching] = useState(false)

  /* ────────────────────────────────────────────────── the boot animation ── */

  /**
   * Where the film is going. Held in a ref because BOTH halves of the exit are
   * asynchronous and they finish in either order: the save may land before the
   * ten seconds are up, or after. A destination in state would be read by
   * whichever of them fires first, from a render that may not have happened.
   */
  const destination = useRef<'home' | 'brain'>('home')
  const saveSettled = useRef(false)
  const videoSettled = useRef(false)

  /**
   * THE KEYBOARD LOCK, and it is a ref for a reason a test found.
   *
   * `launching` and `boot.phase` are both React state, so they are true only
   * after a render. A key pressed in the same tick as the click — a held Enter
   * repeats faster than React commits — would be read against the PREVIOUS
   * values and let Escape through, and Escape calls `saveExit`, which navigates.
   * That is a skip control, arriving by accident, on a screen whose entire
   * ruling is that there is not one.
   *
   * A ref is set in the click's own call stack, so there is no window at all.
   * Same argument as `inFlight` in `use-build.ts`; `launching` remains the
   * render mirror and is never the guard.
   */
  const exiting = useRef(false)

  const leave = useCallback(() => {
    clearState(workspaceId)
    router.push(destination.current === 'brain' ? '/brain' : '/home')
  }, [router, workspaceId])

  /**
   * Both halves have to be in before anyone moves.
   *
   * The film covers the save and the prefetch rather than being stacked on top
   * of them — that is what makes the end of it a fade into a dashboard that is
   * already built, instead of ten seconds followed by a second wait.
   */
  const leaveIfBothDone = useCallback(() => {
    if (saveSettled.current && videoSettled.current) leave()
  }, [leave])

  const boot = useBootVideo({
    onFinished: () => {
      videoSettled.current = true
      leaveIfBothDone()
    },
  })

  /**
   * Does the film run at all? Three ways it does not, and only one of them is
   * about this browser's abilities.
   *
   *  · `hasSeenBootVideo` — they have watched it. Once means once.
   *  · `prefers-reduced-motion` — an accessibility setting, and a ten-second
   *    unstoppable animation is precisely what it is set to prevent. Not a
   *    preference to weigh against a brand moment.
   *  · the file is absent — handled by the watchdogs rather than here, because
   *    a client cannot know that before it asks.
   */
  const playsBootVideo = !hasSeenBootVideo && !reduced.current

  const enterSahoda = useCallback(
    (then: 'home' | 'brain') => {
      destination.current = then
      saveSettled.current = false
      videoSettled.current = false
      // Before `play()`, so no keystroke can reach `saveExit` between the click
      // and React's next render.
      exiting.current = true

      /**
       * THE FILM STARTS FIRST, AND NOTHING IS AWAITED IN FRONT OF IT.
       *
       * This is the only line in the flow where the audio permission exists.
       * `build.finish` below is a round trip; putting it first would spend the
       * click's gesture and the ten seconds would play silently. See
       * `use-boot-video.ts`.
       */
      if (playsBootVideo) boot.start()

      void build.finish(async (ok) => {
        if (!ok) {
          /**
           * The save failed, so there is no dashboard to go to. Take the film
           * back off the card rather than playing a celebration over an error
           * the customer now has to read and act on. `abort` deliberately does
           * not navigate.
           */
          if (playsBootVideo) boot.abort()
          setLaunching(false)
          // The screen is theirs again — the error has to be readable and the
          // button pressable, which means the lock has to come off with it.
          exiting.current = false
          return
        }

        saveSettled.current = true

        if (playsBootVideo) {
          // The dashboard, built while the film runs. This is the half that
          // makes the last frame a fade rather than a second load.
          router.prefetch(then === 'brain' ? '/brain' : '/home')
          leaveIfBothDone()
          return
        }

        // ── NO FILM ─────────────────────────────────────────────────────────
        // Reduced motion goes straight through, as it always did.
        if (reduced.current) {
          leave()
          return
        }
        // And a returning brain-builder keeps the original six-beat wash: the
        // orb dissolves and the app is revealed THROUGH the Brand Brain.
        setLaunching(true)
        orb.current?.setMode('dissolve')
        window.setTimeout(leave, 620)
      })
    },
    [boot, build, leave, leaveIfBothDone, orb, playsBootVideo, router],
  )

  /* ──────────────────────────────────────────────────────────── keyboard ── */

  const gated = !canAdvance(step, data)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // `build.busy`, not just `build.processing`: the failure arms leave
      // `processing` true so the overlay can offer Retry, and `processing` only
      // becomes true after a render — a held Enter repeats faster than that.
      //
      // `exiting.current` is FIRST and is the one that matters during the boot
      // animation: it is set in the click's own call stack, so Escape, Enter and
      // every other key are dead from the instant the film is asked to play
      // rather than from the next render. There is no skip control on this
      // screen and the keyboard is half of what that means.
      if (exiting.current || build.processing || build.busy || launching) return
      if (e.key === 'Escape') {
        saveExit()
        return
      }
      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault()
        back()
        return
      }
      if (e.key !== 'Enter') return

      const active = document.activeElement as HTMLElement | null
      // A textarea keeps Enter for its newline; the two URL fields consume it
      // to add a card; a focused button already has its own Enter.
      if (active?.tagName === 'TEXTAREA' && !(e.metaKey || e.ctrlKey)) return
      if (active?.id === 'f-ref' || active?.id === 'f-comp') return
      if (active?.closest('button')) return

      if (step === 'intro') {
        e.preventDefault()
        go('1', 1)
        return
      }
      if (step === 'result') return
      if (step === 'comp') {
        e.preventDefault()
        void build.start()
        return
      }
      if (!gated) {
        e.preventDefault()
        advance()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [advance, back, build, gated, go, launching, saveExit, step])

  /* ─────────────────────────────────────────────────────────────── render ── */

  const numbered = NUMBERED.includes(step)
  const showRail = step !== 'intro' && step !== 'result'
  const showBack = step !== 'intro' && step !== 'result' && step !== '1'

  const stepBody =
    step === 'intro' ? (
      <IntroStep
        onBegin={() => go('1', 1)}
        onLater={saveExit}
        onReview={() => router.push('/brain')}
        isFree={isFree}
        cost={cost}
        hasSavedBrain={hasSavedBrain}
        workspaceName={workspaceName}
      />
    ) : step === '1' ? (
      <BasicsStep data={data} patch={patch} />
    ) : step === '2' ? (
      <WhatStep data={data} patch={patch} />
    ) : step === '3' ? (
      <AudienceStep data={data} patch={patch} />
    ) : step === '4' ? (
      <VisualStep data={data} patch={patch} />
    ) : step === '5' ? (
      <ReferencesStep data={data} patch={patch} />
    ) : step === '6' ? (
      <KnowledgeStep data={data} patch={patch} />
    ) : step === 'comp' ? (
      <RivalsStep data={data} patch={patch} />
    ) : (
      <ResultStep
        data={data}
        door={door}
        wasFree={build.wasFree}
        fallbackMessage={build.fallbackMessage}
        afterBuildNote={build.afterBuildNote}
        saving={build.saving || launching}
        saveError={build.saveError}
        themeError={build.themeError}
        onEnter={() => enterSahoda('home')}
        onReview={() => enterSahoda('brain')}
      />
    )

  return (
    <div className="onb">
      <div className="grain" aria-hidden="true" />

      <div className="stage" id="stage">
        <header className="nav">
          <div className="wordmark">
            <span className="onb-word">Sahoda Labs</span>
          </div>
          <div className="nav__acts">
            <ThemeToggle />
            <button type="button" className="nav__exit" id="exit" onClick={saveExit}>
              Save &amp; exit
            </button>
          </div>
        </header>

        <ProgressBar step={step} />

        <main className="frame">
          <div className="pane" id="pane">
            {/* Keyed so the entry animation restarts on every move — the source
                strips the class, forces a reflow and re-adds it; a remount is
                the same thing without touching the DOM by hand. */}
            <section
              key={`${step}-${dir}`}
              className={`step on ${dir > 0 ? 'in-r' : 'in-l'}`}
              id={`s-${step}`}
              data-step={step}
            >
              {showBack ? (
                <button type="button" className="back" onClick={back}>
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden /> Back
                </button>
              ) : null}
              {stepBody}
            </section>
          </div>

          <OrbColumn ref={orbWrapRef} caption={caption} />
        </main>

        {showRail ? (
          <div className="cta-row" id="rail">
            <button
              type="button"
              className="btn btn--primary"
              id="next"
              disabled={gated || build.busy}
              onClick={() => (step === 'comp' ? void build.start() : advance())}
            >
              <span className="btn__t">
                {step === 'comp' ? 'Build my Brand Brain' : 'Continue'}
              </span>
              <ArrowRight className="arw" size={18} strokeWidth={1.9} aria-hidden />
            </button>
            {step === 'comp' ? (
              <button
                type="button"
                className="btn btn--ghost"
                id="skip"
                disabled={build.busy}
                onClick={() => void build.start()}
              >
                Skip for now
              </button>
            ) : null}
            {step === 'comp' ? (
              /* The cost, on the screen that spends it. IntroStep promises the
                 figure is "shown again before you spend them", and this step
                 showed none — while BOTH buttons on it, one of them labelled
                 "Skip for now", start a charged resolve. */
              <span className="enterkey">
                {isFree ? 'Free the first time' : `Uses ${cost} ${creditWord(cost)}`}
              </span>
            ) : (
              <span className="enterkey">
                Press <b>Enter</b>
              </span>
            )}
          </div>
        ) : null}
      </div>

      <ProcessingOverlay
        on={build.processing}
        slotRef={procSlotRef}
        message={build.message}
        failure={build.failure}
        onRetry={() => void build.start()}
        onBack={build.dismiss}
      />

      <div className={`wash ${launching ? 'go' : ''}`} id="wash" aria-hidden="true" />

      {/* MOUNTED AT THE RESULT STEP, NOT BEFORE AND NOT ON DEMAND.
          `preload="auto"` here pulls 2.7 MB, which is the right trade one screen
          from the end and the wrong one behind a customer still typing their
          brand name. And it must exist BEFORE the click: `play()` has to run in
          that click's own call stack to keep the audio permission, and an
          element created in the same tick has nothing to play. */}
      {/* `boot.phase === 'playing'` is the second half of the Back guard above,
          and it is deliberately belt AND braces. `onPop` stops the pop this app
          knows about; this stops the element being destroyed by ANY step change
          while frames are moving — a future control, a hot reload, a pop that
          arrived by a route nobody has thought of. Unmounting a running film is
          the one failure mode with no watchdog behind it, because every watchdog
          reads the element that just went away. */}
      {(step === 'result' || boot.phase === 'playing') && playsBootVideo ? (
        <BootVideo
          videoRef={boot.videoRef}
          active={boot.phase === 'playing'}
          onPlaying={boot.onPlaying}
          onEnded={boot.onEnded}
          onError={boot.onError}
        />
      ) : null}

      {/* Read by the resolve. Kept out of the visible tree but in the DOM so the
          e2e walk can assert what the flow is actually holding. */}
      {/* `data-boot-*` is how a run reports WHICH branch the audio took. A
          headless browser has no audio sink, so "sound was heard" is not a
          measurable claim — "the unmuted path ran and the muted fallback did
          not" is, and it is the honest one. `data-boot-end` names which of the
          four endings fired: ended, start-timeout, stalled or error. */}
      <span
        hidden
        data-onb-signals={signalCount(data)}
        data-onb-door={door.kind}
        data-boot-plays={playsBootVideo ? 'yes' : 'no'}
        data-boot-phase={boot.phase}
        data-boot-audio={boot.audioPath}
        data-boot-end={boot.endReason ?? ''}
      />
    </div>
  )
}
