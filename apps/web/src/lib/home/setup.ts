/**
 * THE SETUP LADDER — the three things that make Home a dashboard, said once.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * docs/37 §15: "one absence gets one statement … say that once, at the top,
 * with the action — do not let five cards each discover it independently."
 * MEASURED 2026-09-06 on a workspace with one draft: the Performance card, the
 * Connections card, the Brand Brain card and the topbar ring each announced a
 * missing brain or a missing channel in their own words. The ladder is the one
 * statement; the cards keep their structure and stop repeating the remedy.
 *
 * ── THE SAME THREE DOORS AS THE EMPTY SCREEN ─────────────────────────────────
 * `startSteps` in started.ts names them for a workspace with nothing in it.
 * This is the same list with a `done` per step, for the workspace that has
 * begun but not finished — which is most of them, most of the time.
 *
 * ── AN UNKNOWN IS NEVER "UNDONE" ─────────────────────────────────────────────
 * `null` means a read did not answer. The safe direction is the one
 * `workspaceHasStarted` takes: treat it as present. Telling somebody to set up
 * a brain they have, because one query timed out, is a worse error than a
 * ladder that is briefly one rung short.
 */

export interface SetupSignals {
  /** `null` is an unreadable read. */
  hasBrain: boolean | null
  /** Connection rows. `null` is an unreadable read. */
  connections: number | null
  posts: number
}

export type SetupStepId = 'brain' | 'connect' | 'write'

export interface SetupStep {
  id: SetupStepId
  /** The door, verb-first. */
  label: string
  /** The state, in two words, for the row that is already done. */
  doneLabel: string
  href: '/onboarding' | '/connections' | '/posts/new'
  done: boolean
}

export interface SetupLadder {
  steps: SetupStep[]
  remaining: number
  /** The first undone step, in the order that unblocks the most. */
  next: SetupStep | null
}

export function setupLadder(signals: SetupSignals): SetupLadder {
  const steps: SetupStep[] = [
    {
      id: 'brain',
      label: 'Teach Sahoda about your business',
      doneLabel: 'Sahoda knows your business',
      href: '/onboarding',
      done: signals.hasBrain !== false,
    },
    {
      id: 'connect',
      label: 'Connect a social account',
      doneLabel: 'Account connected',
      href: '/connections',
      done: signals.connections === null || signals.connections > 0,
    },
    {
      id: 'write',
      label: 'Write your first post',
      doneLabel: 'First post written',
      href: '/posts/new',
      done: signals.posts > 0,
    },
  ]
  const undone = steps.filter((step) => !step.done)
  return { steps, remaining: undone.length, next: undone[0] ?? null }
}
