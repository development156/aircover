import type { DoorOutcome } from './door-outcome'

/**
 * How long the build will wait for a site read that is still in flight.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────
 * It was a loop inside `useBuild`, and in a real run it is almost never
 * entered: the read starts when the user leaves step 01 and they then answer
 * five more screens, so by the time they press Build it has long since landed.
 * That is good for users and bad for evidence — a branch that only fires when
 * the network is unusually slow is a branch no run of the suite will ever
 * execute. Pulled out here with its clock injected, it can be, and is.
 *
 * ── THE DEFECT THE BOUND EXISTS TO END ───────────────────────────────────────
 * The first cut waited 600 x 200ms. Two minutes of "Reading your website", with
 * every facet already collapsed and no way out, is precisely what
 * `door-step.tsx` measured and named: "twenty-six seconds of a spinner with no
 * words is indistinguishable from a hang, and the person waiting has no way to
 * tell whether to keep waiting or reload — which is how a slow success gets
 * reported as a failure." Worse, it then resolved with an empty doorText and
 * said nothing about it, so the read was dropped silently.
 */

/** Production p90 for this read is 37.0s. The ceiling sits above it. */
export const DOOR_TICK_MS = 200
export const DOOR_WAIT_TICKS = 225

/**
 * What the card says when the read did not finish in time.
 *
 * NOT a verdict on the page — nothing came back about it either way — and NOT
 * retryable, because the brain has already been built without it and pressing
 * a button will not put it back. The remedy offered is the one that can
 * actually succeed: add it on the Brand Brain page.
 */
export const DOOR_TIMED_OUT: DoorOutcome = {
  kind: 'blocked',
  message:
    'Sahoda was still reading your website when this was built, so it was built without it. That is not a verdict on your site — open Brand Brain to add what it says.',
  retryable: false,
  fatal: false,
}

export interface WaitForDoorOptions {
  /** The CURRENT outcome, re-read every tick. */
  read: () => DoorOutcome
  /** Injected so a test does not wait 45 real seconds. */
  sleep: (ms: number) => Promise<void>
  tickMs?: number
  maxTicks?: number
}

export async function waitForDoor({
  read,
  sleep,
  tickMs = DOOR_TICK_MS,
  maxTicks = DOOR_WAIT_TICKS,
}: WaitForDoorOptions): Promise<DoorOutcome> {
  for (let i = 0; i < maxTicks; i++) {
    const now = read()
    if (now.kind !== 'reading') return now
    await sleep(tickMs)
  }
  const last = read()
  return last.kind === 'reading' ? DOOR_TIMED_OUT : last
}
