import {
  BarChart3,
  CalendarRange,
  FlaskConical,
  Lightbulb,
  PenLine,
  Send,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { LoopCycleStatus } from '@sahoda/shared'

/**
 * THE SEVEN STAGES OF ONE WEEK — the Loop section's signature.
 *
 * ── WHY THIS IS NUMBERED, WHEN ALMOST NOTHING ELSE HERE IS ───────────────────
 * Numbered markers are decoration in most designs. Here the order is the whole
 * product: `collect → reflect → plan → create → test → stage → report` is a real
 * state machine (FSD M2), each stage consumes the previous one's output, and a
 * reader who does not grasp the sequence has not understood what the Loop is.
 * The numbers encode something true, so they earn their place.
 *
 * ── AND WHY IT IS A LINE, NOT A RING ─────────────────────────────────────────
 * A circle is the obvious drawing for a "loop" and it is the wrong one twice
 * over: it has no reading order on a phone, and it implies the seven stages are
 * evenly weighted and evenly spaced in time, which they are not — collect and
 * report are minutes at the two ends of a week, create is hours in the middle.
 * A line reads left to right, wraps honestly at narrow widths, and the return
 * edge is stated in words underneath, where a sentence can say the thing an arc
 * only gestures at: what the report teaches goes back into the Brand Brain.
 *
 * NOT ONE STAGE CARRIES A FIGURE. No durations, no counts, no "5–7 posts". The
 * plan stage will produce briefs; how many is a decision about the reader's
 * week, and no query behind this screen has made it.
 *
 * ── AND NOW IT MARKS WHERE A REAL CYCLE IS ───────────────────────────────────
 * wt-ia drew this with no stage marked, and said so plainly: there was no cycle,
 * so any highlight would have been a claim about the reader's week with nothing
 * behind it. There is a cycle now, `loop_cycles.status` names a stage of exactly
 * this machine, and the marker reads that column.
 *
 * Passing no `status` still draws the strip unmarked, which is the correct
 * rendering for a workspace that has never run one — the honest empty state did
 * not stop being honest.
 */

/**
 * Which stage a cycle status is showing. The halt is drawn ON the plan stage
 * rather than as a stage of its own: `awaiting_cost_approval` is not a seventh
 * thing Sahoda does, it is the plan stage finished and waiting for a person,
 * and giving it its own marker would make the strip disagree with the diagram
 * the FSD describes.
 */
const STATUS_STAGE: Record<LoopCycleStatus, number> = {
  collecting: 0,
  reflecting: 1,
  planning: 2,
  awaiting_cost_approval: 2,
  creating: 3,
  testing: 4,
  staging: 5,
  reported: 6,
  // A cycle that ended badly has no current stage. Marking one would say it is
  // still working on something it stopped doing.
  cancelled: -1,
  failed: -1,
}

const STAGES: ReadonlyArray<{ icon: LucideIcon; name: string; what: string }> = [
  {
    icon: BarChart3,
    name: 'Collect',
    what: 'Last week’s numbers, unanswered messages, and anything Radar picked up.',
  },
  {
    icon: Lightbulb,
    name: 'Reflect',
    what: 'What that adds up to, written as learnings you can accept or reject.',
  },
  {
    icon: CalendarRange,
    name: 'Plan',
    what: 'Briefs for the week ahead, put on the days and times that have worked.',
  },
  {
    icon: PenLine,
    name: 'Create',
    what: 'Each brief becomes a draft, with a separate body for every channel.',
  },
  {
    icon: FlaskConical,
    name: 'Test',
    what: 'Each draft is read by your Audience Twin before anyone else sees it.',
  },
  {
    icon: Send,
    name: 'Stage',
    what: 'Where it lands depends on your dial: your Planner, your approvals, or the queue.',
  },
  {
    icon: Sparkles,
    name: 'Report',
    what: 'Monday morning: what worked, what did not, and what Sahoda learned.',
  },
]

export interface CycleStripProps {
  /** The live cycle's status, or undefined when no cycle has ever run. */
  status?: LoopCycleStatus
}

export function CycleStrip({ status }: CycleStripProps = {}) {
  const current = status ? STATUS_STAGE[status] : -1
  return (
    <section aria-labelledby="loop-cycle" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-cycle" className="type-h2">
          One week, seven steps
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          The Loop runs the same seven steps every week. You decide how far it gets on its own
          before it needs you. That is the dial below.
        </p>
      </div>

      <ol className="grid gap-2 wide:grid-cols-7 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {STAGES.map((stage, index) => {
          const isCurrent = index === current
          const isDone = current >= 0 && index < current
          return (
            <li
              key={stage.name}
              // `aria-current="step"` rather than colour alone: the marker is a
              // fact about the reader's week and has to reach someone who
              // cannot see the accent.
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'flex flex-col gap-1.5 rounded-card p-3',
                isCurrent
                  ? 'bg-accent-subtle ring-1 ring-[var(--accent)]'
                  : isDone
                    ? 'surface-ring bg-surface'
                    : 'is-proposed',
              ].join(' ')}
              data-inert-control={current < 0 ? '' : undefined}
            >
              <span className="flex items-center gap-2">
                <stage.icon
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden
                  className={['shrink-0', isCurrent ? 'text-accent' : 'text-muted'].join(' ')}
                />
                <span className="type-eyebrow num text-muted">
                  {index + 1}
                  <span className="sr-only"> of 7</span>
                </span>
                {isCurrent ? <span className="type-eyebrow text-accent">Now</span> : null}
              </span>
              <span className="type-h3 text-ink">{stage.name}</span>
              <span className="type-sm text-muted">{stage.what}</span>
            </li>
          )
        })}
      </ol>

      {/* The return edge, stated rather than drawn. This is the sentence a
          circular diagram would be trying to convey, and it says more. */}
      <p className="type-sm max-w-[68ch] text-muted">
        Then it starts again, from a Brand Brain that now knows what happened last week. That is the
        part that makes it a loop rather than a schedule.
      </p>
    </section>
  )
}
