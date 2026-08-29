import {
  BarChart3,
  CalendarRange,
  Check,
  FlaskConical,
  Lightbulb,
  PenLine,
  Send,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { LoopCycleStatus } from '@sahoda/shared'

/**
 * THE SEVEN STAGES OF ONE WEEK — the Loop section's signature, and now the page's
 * hero.
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
 * ── WHAT CHANGED IN THE REDRAW, AND WHAT DID NOT ─────────────────────────────
 * Seven bordered cards became seven nodes on ONE rail. The change is not
 * cosmetic: a card per stage drew seven boxes of equal weight and the sequence
 * had to be inferred from the numbers, which is the opposite of what this
 * section is for. The rail draws the sequence itself, and the connector between
 * two nodes carries the state of the step BEFORE it, so progress reads as a line
 * filling rather than as seven independent lights.
 *
 * NOT ONE STAGE CARRIES A FIGURE. No durations, no counts, no "5–7 posts". The
 * plan stage will produce briefs; how many is a decision about the reader's
 * week, and no query behind this screen has made it.
 *
 * Passing no `status` still draws the rail unmarked, which is the correct
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
    <section
      aria-labelledby="loop-cycle"
      className="surface-ring rounded-card bg-surface p-5 shadow-card max-narrow:p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="loop-cycle" className="type-h2">
          One week, seven steps
        </h2>
        <p className="type-sm text-muted">
          {current >= 0 ? (
            <>
              Step <span className="num text-ink">{current + 1}</span> of{' '}
              <span className="num">{STAGES.length}</span>
            </>
          ) : status ? (
            // A cycle that stopped is not a cycle that never started, and the
            // summary beside this one says which. Claiming "not running yet"
            // over a failed week contradicts it.
            'This week stopped'
          ) : (
            'Not running yet'
          )}
        </p>
      </div>

      <ol className="mt-5 grid gap-y-5 wide:grid-cols-7 wide:gap-x-0 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {STAGES.map((stage, index) => (
          <Stage
            key={stage.name}
            stage={stage}
            index={index}
            current={current}
            last={index === STAGES.length - 1}
          />
        ))}
      </ol>

      {/* The return edge, stated rather than drawn. This is the sentence a
          circular diagram would be trying to convey, and it says more. */}
      <p className="type-sm mt-5 max-w-[68ch] border-t border-line-soft pt-4 text-muted">
        The Loop runs the same seven steps every week. Then it starts again, from a Brand Brain that
        now knows what happened last week. That is the part that makes it a loop rather than a
        schedule. You decide how far it gets on its own before it needs you, and the dial below is
        where you set that.
      </p>
    </section>
  )
}

function Stage({
  stage,
  index,
  current,
  last,
}: {
  stage: (typeof STAGES)[number]
  index: number
  current: number
  last: boolean
}) {
  const isCurrent = index === current
  const isDone = current >= 0 && index < current

  return (
    <li
      // `aria-current="step"` rather than colour alone: the marker is a fact
      // about the reader's week and has to reach someone who cannot see the
      // accent.
      aria-current={isCurrent ? 'step' : undefined}
      className="flex flex-col gap-2 wide:px-1.5"
    >
      {/* The node and the rail it sits on. The connector belongs to the node on
          its left, so a filled connector means "this step finished", never
          "the next one started". */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={[
            'flex size-8 shrink-0 items-center justify-center rounded-full transition-micro',
            isCurrent
              ? 'bg-primary text-primary-foreground shadow-brand'
              : isDone
                ? 'surface-ring bg-tint-100 text-accent dark:bg-s2'
                : 'surface-ring bg-s2 text-muted',
          ].join(' ')}
        >
          {isDone ? (
            <Check size={15} strokeWidth={2.5} />
          ) : (
            <span className="type-sm num font-[650]">{index + 1}</span>
          )}
        </span>
        <span className="sr-only">
          Step {index + 1} of {STAGES.length}
          {isCurrent ? ', running now' : isDone ? ', done' : ''}
        </span>
        {!last ? (
          <span
            aria-hidden
            className={[
              'h-px min-w-4 flex-1 transition-micro max-wide:hidden',
              isDone ? 'bg-accent' : 'bg-line-soft',
            ].join(' ')}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <stage.icon
            size={14}
            strokeWidth={1.9}
            aria-hidden
            className={['shrink-0', isCurrent ? 'text-accent' : 'text-muted'].join(' ')}
          />
          <span className="type-h3 text-ink">{stage.name}</span>
          {isCurrent ? <span className="type-eyebrow text-accent">Now</span> : null}
        </span>
        <span className="type-sm text-muted">{stage.what}</span>
      </div>
    </li>
  )
}
