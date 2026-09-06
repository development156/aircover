/**
 * ONE READING OF THE LOOP'S STATE, FOR EVERY PART OF THE CONTROL THAT SHOWS IT.
 *
 * ── THE DEFECT THIS FILE EXISTS FOR ──────────────────────────────────────────
 * `loop-status.tsx` derived its label, its colours and its button from the same
 * three booleans in three separate expressions, and only the LABEL asked
 * `enabled` first. Its comment even said why that mattered: a workspace with no
 * settings row reads `enabled: false, paused: false`, which is the same pair as
 * a live, idle Loop.
 *
 * The other two expressions never learned it. So a workspace that had never
 * opened the Loop got a pill reading "Not turned on" painted in the green `ok`
 * chrome that means running, beside a button offering to "Pause the Loop".
 * Worse, `eligibility.ts` hands that workspace a remedy link LABELLED "Turn the
 * Loop on" that points at `#loop-controls`, which is that button: following the
 * product's own instruction paused a Loop that had never run. Per `read.ts`'s
 * measurement that is 28 of 33 production workspaces.
 *
 * The fix is not three corrected expressions, because three expressions can
 * disagree again. It is ONE state, derived once, that every part reads.
 *
 * ── AND THE BUTTON'S WRITE HAD TO MOVE WITH ITS LABEL ────────────────────────
 * `enabled` is `settings row exists`, so the toggle that writes the row is what
 * turns the Loop on. The old call was `setLoopSettings({ paused: !paused })`,
 * which for a never-enabled workspace meant `{ paused: true }` — it created the
 * row already paused. `intent` below is what the press MEANS, and the caller
 * writes `paused: false` for a turn-on rather than negating a flag that was
 * never the question.
 */

export type LoopState = 'off' | 'paused' | 'running' | 'waiting'

export interface LoopStatusFacts {
  /** Whether anybody has ever turned the Loop on in this workspace. */
  enabled: boolean
  paused: boolean
  /** Whether a cycle is working right now. */
  running: boolean
}

export interface LoopStatusView {
  state: LoopState
  /** What the pill says. The word carries the meaning; the dot is decoration. */
  label: string
  /** What pressing the button would DO, not what flag it would flip. */
  intent: 'turn-on' | 'pause'
  /** The dot's colour. */
  tone: string
  /** The pill's ground. */
  ground: string
  /** The label's own colour, receding for the two states that are not live. */
  text: string
}

/**
 * `enabled` is asked FIRST, and everything below reads the answer.
 *
 * A settings row that does not exist is not an un-paused Loop, and the two are
 * indistinguishable from `paused` alone.
 */
export function loopState(facts: LoopStatusFacts): LoopState {
  if (!facts.enabled) return 'off'
  if (facts.paused) return 'paused'
  return facts.running ? 'running' : 'waiting'
}

export function loopStatusView(facts: LoopStatusFacts, waitingFor: string): LoopStatusView {
  const state = loopState(facts)

  // `off` and `paused` are both "nothing is going to happen", so they recede
  // together. Neither may wear the `ok` chrome, which means running.
  const quiet = state === 'off' || state === 'paused'

  return {
    state,
    label:
      state === 'off'
        ? 'Not turned on'
        : state === 'paused'
          ? 'Paused'
          : state === 'running'
            ? 'Running now'
            : `On, ${waitingFor}`,
    // A Loop that was never turned on is turned ON by this button, not paused.
    intent: quiet ? 'turn-on' : 'pause',
    tone: quiet ? 'text-muted' : state === 'running' ? 'text-accent' : 'text-ok',
    ground: quiet ? 'bg-s2' : state === 'running' ? 'bg-tint-100 dark:bg-s2' : 'bg-ok-bg',
    text: quiet ? 'text-muted' : 'text-ink',
  }
}
