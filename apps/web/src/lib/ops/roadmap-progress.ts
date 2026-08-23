import type { OpsRoadmapItem } from '@sahoda/shared'

/**
 * The arithmetic behind the roadmap card (doc 13 §7). Pure — no I/O, no clock.
 *
 * `today` is always a parameter. A card that reads the clock internally cannot
 * be tested for the boundary that actually matters ("overdue by one day"), and
 * server and client would disagree across midnight in different timezones.
 */

export type StageState = 'done' | 'active' | 'todo'

export interface StageSummary {
  stage: string
  label: string
  /** Σweight(done) — the numerator doc 13 §7 specifies, not a count of items. */
  doneWeight: number
  totalWeight: number
  /** 0–100, rounded down: 99% must never render while an item is still open. */
  percent: number
  openItems: OpsRoadmapItem[]
  state: StageState
}

/** `admin-ops` → `Admin Ops`, `backlog-3` → `Backlog 3`, `alpha` → `Alpha`. */
export function stageLabel(stage: string): string {
  return stage
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function bySort(a: OpsRoadmapItem, b: OpsRoadmapItem): number {
  return a.sort - b.sort
}

/**
 * The stage the build is actually in.
 *
 * NOT simply "the earliest incomplete stage". Every Alpha item is recorded
 * `todo` on purpose — the last gate review scored §5 at 6/14 FAIL and the seed
 * refuses to invent a status it cannot evidence — so the earliest incomplete
 * stage is `alpha` and would stay `alpha` for as long as that understatement
 * stands, hiding the stage where work is visibly happening.
 *
 * So: the earliest incomplete stage that has any item OFF `todo` — the stage
 * with work in flight. If no stage has started, fall back to the earliest
 * incomplete one, which is the honest answer to "what is next".
 *
 * This does not overstate anything: Alpha keeps its `todo` dot and its items
 * stay in the checklist below. It only decides which stage the card leads with.
 */
export function currentStage(items: readonly OpsRoadmapItem[]): string | null {
  const stages = orderedStages(items)
  const incomplete = stages.filter((stage) =>
    items.some((item) => item.stage === stage && item.status !== 'done'),
  )
  if (incomplete.length === 0) return null

  const started = incomplete.find((stage) =>
    items.some((item) => item.stage === stage && item.status !== 'todo'),
  )
  return started ?? incomplete[0] ?? null
}

/** Stage order comes from the items' own sort, so docs/05's ordering is the ordering. */
function orderedStages(items: readonly OpsRoadmapItem[]): string[] {
  const firstSort = new Map<string, number>()
  for (const item of items) {
    const seen = firstSort.get(item.stage)
    if (seen === undefined || item.sort < seen) firstSort.set(item.stage, item.sort)
  }
  return [...firstSort.entries()].sort((a, b) => a[1] - b[1]).map(([stage]) => stage)
}

export function summarise(items: readonly OpsRoadmapItem[]): StageSummary[] {
  const current = currentStage(items)

  return orderedStages(items).map((stage) => {
    const inStage = items.filter((item) => item.stage === stage)
    const totalWeight = inStage.reduce((sum, item) => sum + item.weight, 0)
    const doneWeight = inStage
      .filter((item) => item.status === 'done')
      .reduce((sum, item) => sum + item.weight, 0)

    return {
      stage,
      label: stageLabel(stage),
      doneWeight,
      totalWeight,
      // Floored, not rounded: rounding 99.6% to 100% would show a complete bar
      // over an open item, which is the fake-success this project refuses.
      percent: totalWeight === 0 ? 0 : Math.floor((doneWeight / totalWeight) * 100),
      openItems: inStage.filter((item) => item.status !== 'done').sort(bySort),
      state: stage === current ? 'active' : doneWeight === totalWeight ? 'done' : 'todo',
    }
  })
}

/**
 * Whole days from `today` to `target`, negative when overdue, null when unset.
 *
 * Compared as calendar dates in UTC rather than as instants: "3 days left"
 * should not become "2 days left" because the request arrived at 23:00 IST.
 */
export function daysRemaining(targetDate: string | null, today: Date): number | null {
  if (!targetDate) return null
  const target = Date.parse(`${targetDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target)) return null

  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((target - midnight) / 86_400_000)
}

export type Urgency = 'none' | 'calm' | 'soon' | 'overdue'

/** doc 13 §7: amber ≤3 days, crimson overdue. Never orange for a failure state. */
export function urgencyOf(days: number | null): Urgency {
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  return days <= 3 ? 'soon' : 'calm'
}

export type BlockerKind = 'roadmap' | 'gate' | 'blocked'

export interface ToReachDone {
  key: string
  kind: BlockerKind
  label: string
  /** Anchor on the board below; SL-016 gives every card `id="task-<code>"`. */
  href: string | null
}

/**
 * "To reach Done" — the answer to *what should be done to get to done* (§7).
 *
 * Three sources, in the order a person would act on them: a red gate blocks
 * everything and is usually minutes of work; a blocked card is waiting on a
 * decision; open roadmap items are the remaining build. Ordered by how quickly
 * acting on it unblocks somebody, not by data source.
 */
export function toReachDone({
  stage,
  blockedTasks,
  redSuites,
}: {
  stage: StageSummary | null
  blockedTasks: readonly { code: string; title: string; blocked_reason: string | null }[]
  redSuites: readonly string[]
}): ToReachDone[] {
  return [
    ...redSuites.map((suite) => ({
      key: `gate:${suite}`,
      kind: 'gate' as const,
      label: `The ${suite} gate is red. Fix it or supersede the run.`,
      href: null,
    })),
    ...blockedTasks.map((task) => ({
      key: `blocked:${task.code}`,
      kind: 'blocked' as const,
      label: task.blocked_reason
        ? `${task.code} is blocked: ${task.blocked_reason}`
        : `${task.code} is blocked, with no reason recorded.`,
      href: `#task-${task.code}`,
    })),
    ...(stage?.openItems ?? []).map((item) => ({
      key: `item:${item.code}`,
      kind: 'roadmap' as const,
      label: `${item.code} · ${item.title}`,
      href: null,
    })),
  ]
}

/**
 * The number the card headline shows (doc 16 §6).
 *
 * Weighted completion across the WHOLE roadmap, not the current stage.
 *
 * The card used to headline `summarise(...).percent` for the active stage. On
 * 1 Aug that read **60%** — the admin-ops stage being 12/20 of its own weight —
 * while the whole roadmap stood at 22%. Nobody reads a number that size on a
 * roadmap card as "we are 60% through this stage"; they read it as "the product
 * is 60% done". Doc 16 §6 is explicit that the card must answer *can a real
 * customer complete a journey and pay for it*, and that by that measure the
 * answer is nearer a quarter. A bar past halfway when the answer is a quarter is
 * a fake success state, which doc 15 §2 rule 3 forbids.
 *
 * Per-stage percentages are still correct and still shown — as stage detail,
 * where the denominator is visible and cannot be mistaken for the product.
 */
export const STATUS_ONLY_STAGE = 'beta-path'

export function journeyPercent(items: readonly OpsRoadmapItem[]): number {
  // `beta-path` holds doc 16 §6's five phases. They are a STATUS VIEW of work
  // already counted under the product stages, not extra work — counting both
  // double-fills the denominator and *understates* progress. Including them
  // moved the headline from 22% to 14%, which is wrong in the flattering-free
  // direction but still wrong.
  const counted = items.filter((item) => item.stage !== STATUS_ONLY_STAGE)
  const total = counted.reduce((sum, item) => sum + item.weight, 0)
  if (total === 0) return 0
  const done = counted
    .filter((item) => item.status === 'done')
    .reduce((sum, item) => sum + item.weight, 0)
  // Floor, never round: 22.9% must not present itself as 23%.
  return Math.floor((done / total) * 100)
}

/** What the headline number is measuring. Shown next to it, never implied. */
export const JOURNEY_LABEL = 'of the way to a customer completing a journey and paying'
