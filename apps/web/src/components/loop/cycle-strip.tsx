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
      className="surface-ring rounded-card bg-surface p-6 shadow-card max-narrow:p-4"
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

      {/*
        SEVEN EQUAL COLUMNS, and the rail is drawn BETWEEN them rather than
        inside them. Each cell carries half a connector on its left and half on
        its right; adjacent halves meet exactly on the column boundary, so the
        line is continuous at any width without a single absolute position.

        The first cell's left half and the last cell's right half render
        transparent rather than being omitted — a missing element would make
        those two columns a different width from the other five, and the
        reference's whole character is seven columns of one size.

        WIDTH BEHAVIOUR. Seven columns hold to 1180px. Below that they become
        four, then two — never seven squeezed, because a 90px column
        cannot hold "Approve to publish" and the description under it. The
        horizontal rail is hidden the moment the row wraps: a connector that
        runs off the end of a row and reappears on the next one draws an order
        that is not the order.
      */}
      <ol className="mt-6 grid gap-y-7 wide:grid-cols-7 max-wide:grid-cols-4 max-narrow:grid-cols-2">
        {STAGES.map((stage, index) => (
          <Stage key={stage.name} stage={stage} index={index} current={current} />
        ))}
      </ol>

      {/* The return edge, stated rather than drawn. This is the sentence a
          circular diagram would be trying to convey, and it says more. */}
      <p className="type-sm mt-6 max-w-[68ch] border-t border-line-soft pt-4 text-muted">
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
}: {
  stage: (typeof STAGES)[number]
  index: number
  current: number
}) {
  const isCurrent = index === current
  const isDone = current >= 0 && index < current
  const first = index === 0
  const last = index === STAGES.length - 1

  // A segment is travelled once the step on its RIGHT has been reached. So the
  // half-line entering step 4 is filled while the half leaving it is not — a
  // filled connector means "this step finished", never "the next one started".
  const enteringFilled = current >= 0 && index <= current
  const leavingFilled = current >= 0 && index < current

  return (
    <li
      // `aria-current="step"` rather than colour alone: the marker is a fact
      // about the reader's week and has to reach someone who cannot see the
      // accent.
      aria-current={isCurrent ? 'step' : undefined}
      // `h-full` with the bar on `mt-auto`: descriptions are two to four lines
      // and a bar placed after the text would sit at a different height in every
      // column. One baseline across all seven is the whole point of a rail.
      className="flex h-full min-w-0 flex-col items-center text-center"
    >
      {/* The rail. Full-bleed to the cell edges so the halves meet. */}
      {/* Below 1180px the rail halves are hidden, which leaves the circle as the
          only child and floats it to the start of the row. Centred once the rail
          is gone, so a wrapped grid reads as a grid of steps rather than as a
          ragged left edge. */}
      <div className="flex w-full items-center max-wide:justify-center" aria-hidden>
        <Rail filled={enteringFilled} hidden={first} />
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-pill transition-micro',
            isCurrent
              ? 'bg-primary text-primary-foreground shadow-brand'
              : isDone
                ? 'bg-tint-100 text-accent shadow-[inset_0_0_0_1.5px_var(--acc)] dark:bg-s2'
                : 'surface-ring-firm bg-surface text-muted',
          ].join(' ')}
        >
          {isDone ? (
            <Check size={16} strokeWidth={2.6} />
          ) : (
            <span className="type-sm num font-[650]">{index + 1}</span>
          )}
        </span>
        <Rail filled={leavingFilled} hidden={last} />
      </div>

      <span className="sr-only">
        Step {index + 1} of {STAGES.length}
        {isCurrent ? ', running now' : isDone ? ', done' : ''}
      </span>

      <stage.icon
        size={20}
        strokeWidth={1.7}
        aria-hidden
        className={['mt-4 shrink-0', isCurrent ? 'text-accent' : 'text-ink'].join(' ')}
      />

      <span className="type-h3 mt-2 text-ink">{stage.name}</span>

      <span className="type-sm mt-1 mb-4 max-w-[24ch] text-balance text-muted">{stage.what}</span>

      {/*
        The progress bar under the running step. It is the reference's one piece
        of pure decoration, and it earns its place by being the only mark that
        survives at a glance from across a desk — but it is decoration, so the
        state it shows is also spelled out in the sr-only line above and in the
        "Step 4 of 7" beside the heading. Nothing here is the only carrier of a
        fact.
      */}
      <span
        aria-hidden
        className={[
          'mt-auto h-[3px] w-14 shrink-0 rounded-pill transition-micro',
          isCurrent ? 'bg-accent' : 'bg-transparent',
        ].join(' ')}
      />
    </li>
  )
}

/** Half a connector. Transparent rather than absent at the two ends, so every
 *  column measures the same. */
function Rail({ filled, hidden }: { filled: boolean; hidden: boolean }) {
  return (
    <span
      className={[
        'h-px min-w-0 flex-1 transition-micro max-wide:hidden',
        hidden ? 'bg-transparent' : filled ? 'bg-accent' : 'bg-line-soft',
      ].join(' ')}
    />
  )
}
