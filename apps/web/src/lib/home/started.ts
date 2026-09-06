/**
 * HAS ANYTHING HAPPENED IN THIS WORKSPACE YET?
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * /home renders nine containers and every one of them owns an empty state.
 * MEASURED on a bootstrapped workspace with nothing else in it
 * (`empty__home__full__1440__light`, 2026-08-23), the page states the same
 * absence SEVEN times — eight counting the topbar's "No brain yet":
 *
 *   Needs your attention   "Nothing is waiting on you…"
 *   Performance            four absence rules + "Connect a channel to start measuring."
 *   Credits spent          "Nothing spent yet…"
 *   Week strip             seven empty day boxes + "Nothing scheduled this week yet…"
 *   Brand Brain            "Sahoda doesn't know your brand yet."
 *   Connections            four x "Not connected" + "You can write and plan without one…"
 *   This week, from Sahoda "Sahoda hasn't drafted anything this week."
 *
 * Every sentence is true and well written. docs/27 §1 found FIVE of these on
 * /analytics and called it "a product apologising for itself"; /home has more,
 * and nobody counted them because /home's restructure note is about hierarchy
 * rather than repetition. It runs 1085px at 1440, 1795px at 1024 and 2025px at
 * 390 to deliver one fact.
 *
 * ── WHY A PREDICATE AND NOT A `posts.length === 0` CHECK IN THE PAGE ─────────
 * Because the interesting failure is the OTHER direction. A workspace where one
 * of these five signals is present has something real to report, and swallowing
 * its dashboard behind a setup screen would hide the reader's own work — which
 * is a worse defect than the one being fixed. Every signal is checked, each one
 * fails SAFE (an unreadable read counts as "something", never as "nothing"), and
 * the whole decision sits in one testable function instead of a boolean chain in
 * JSX that the next reader has to re-derive.
 */

/** The five things that mean this workspace has begun. Any one is enough. */
export interface StartedSignals {
  /** Posts of any status, including drafts. */
  posts: number
  /** Connection rows. `null` is an unreadable read. */
  connections: number | null
  /** Whether a Brand Brain exists. `null` is an unreadable read. */
  hasBrain: boolean | null
  /**
   * Spend categories in the last 30 days. `null` is an unreadable read.
   *
   * A real 0 is knowledge — the workspace has spent nothing — and is the only
   * value of this field that argues for "not started".
   */
  spendRows: number | null
  /** Anything the account itself reported, independent of this workspace's work. */
  accountReported: boolean
}

/**
 * True when the dashboard has something to be a dashboard ABOUT.
 *
 * ── EVERY UNKNOWN COUNTS AS STARTED ──────────────────────────────────────────
 * `connections === null` and `hasBrain === null` mean a read did not answer, and
 * both resolve to `true` here. That is the safe direction and it is not
 * arbitrary: replacing a customer's dashboard with a "let's get you set up"
 * screen on the strength of a query that FAILED would tell them their work is
 * gone. The cost of the other error is one extra scroll past some empty cards.
 */
export function workspaceHasStarted(signals: StartedSignals): boolean {
  if (signals.posts > 0) return true
  if (signals.connections === null || signals.connections > 0) return true
  if (signals.hasBrain === null || signals.hasBrain) return true
  if (signals.spendRows === null || signals.spendRows > 0) return true
  return signals.accountReported
}

/** One thing to do next, in the order that unblocks the most. */
export type StartStepId = 'brain' | 'connect' | 'write'

export interface StartStep {
  id: StartStepId
  label: string
  /** What this step turns on, stated as the thing the reader gets. */
  gets: string
  href: '/onboarding' | '/connections' | '/posts/new'
}

/**
 * The three doors, in the order that unblocks the most.
 *
 * ── AND WITHOUT A `done` FLAG, WHICH THE FIRST VERSION CARRIED ───────────────
 * It rendered three empty tick-rings. `workspaceHasStarted` returns false only
 * when EVERY signal is empty, and `done` was derived from those same signals, so
 * on the only screen that calls this every step is always incomplete and no ring
 * could ever be filled. A checklist whose boxes cannot be checked is furniture.
 *
 * ── AND THE ORDER IS NOT A REQUIREMENT ───────────────────────────────────────
 * Writing genuinely works with no connection and no brain; `ConnectionsCard`
 * says so and is right. The order is what unblocks the most, not a gate, and no
 * step is disabled by the state of another — presenting it as a sequence with
 * locks would be a false claim about the product.
 */
export function startSteps(): StartStep[] {
  return [
    {
      id: 'brain',
      label: 'Teach Sahoda about your business',
      gets: 'Everything Sahoda writes starts from this.',
      // /onboarding, not /brain. This list only renders for a workspace with
      // no brain, and /brain for that workspace is a page that says so and
      // offers one more button to /onboarding. MEASURED 2026-09-06 on the
      // wt-core preview: the lead door was two hops, while the topbar's ring
      // for the same state was already one.
      href: '/onboarding',
    },
    {
      id: 'connect',
      label: 'Connect a social account',
      gets: 'Lets a post really go out, and starts counting reach and followers.',
      href: '/connections',
    },
    {
      id: 'write',
      label: 'Write your first post',
      gets: 'Shows up in your week and in your list of things to check.',
      href: '/posts/new',
    },
  ]
}
