import { GATE_SUITES, readGateRuns, readSessions } from '@/lib/ops/read'
import {
  formatIst,
  gateChips,
  pulseOf,
  relativeAge,
  type ChipState,
  type GateChip,
} from '@/lib/ops/session-pulse'
import { cn } from '@/lib/utils'

/**
 * D5 · Header strips (doc 13 §12) — session pulse on the left, gates on the right.
 *
 * Everything here is derived from ingested rows; there is nothing to configure.
 */

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-card border border-line bg-bg px-4 py-3 shadow-card">
      {children}
    </div>
  )
}

/**
 * The blade pulse.
 *
 * `motion-safe:animate-pulse` rather than a bare animation: docs/06 requires
 * reduced-motion to be clean, and a dot that throbs forever is exactly the kind
 * of ambient motion that setting exists to stop. With motion reduced the dot
 * still renders in the live colour, so the STATE survives even when the
 * animation does not — the meaning was never in the movement.
 */
function PulseDot({ live }: { live: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-pill',
        live ? 'bg-primary motion-safe:animate-pulse' : 'bg-faint',
      )}
    />
  )
}

async function SessionStrip({ now }: { now: Date }) {
  const sessions = await readSessions()

  if (sessions.status !== 'ok') {
    return (
      <Strip>
        <PulseDot live={false} />
        <span className="text-[13px] text-muted">
          We couldn&apos;t read session activity just now.
        </span>
      </Strip>
    )
  }

  const pulse = pulseOf(sessions.data, now)

  if (pulse.state === 'never') {
    return (
      <Strip>
        <PulseDot live={false} />
        <span className="text-[13px] text-muted">No session has reported here yet.</span>
      </Strip>
    )
  }

  if (pulse.state === 'idle') {
    return (
      <Strip>
        <PulseDot live={false} />
        <span className="truncate text-[13px] text-muted">
          {pulse.since ? `Idle since ${formatIst(pulse.since)}` : 'Idle'}
        </span>
      </Strip>
    )
  }

  return (
    <Strip>
      <PulseDot live />
      <span className="truncate text-[13px]">
        <span className="font-semibold">Claude is working</span>
        <span className="text-muted"> · {pulse.label}</span>
      </span>
      {pulse.tasks.length > 0 ? (
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted tabular-nums">
          {pulse.tasks.slice(0, 3).join(' ')}
          {pulse.tasks.length > 3 ? ` +${pulse.tasks.length - 3}` : ''}
        </span>
      ) : null}
    </Strip>
  )
}

const CHIP_STYLE: Record<ChipState, string> = {
  pass: 'bg-ok-bg text-ok',
  // Crimson for a failure, never orange (docs/08 §6).
  fail: 'bg-danger-bg text-danger',
  blocked: 'bg-danger-bg text-danger',
  running: 'bg-s2 text-muted',
  // Deliberately neutral, not green: an unrun suite is an absence of evidence.
  never: 'bg-s2 text-faint',
}

const CHIP_WORD: Record<ChipState, string> = {
  pass: 'passed',
  fail: 'failed',
  blocked: 'blocked',
  running: 'running',
  never: 'never run',
}

function Chip({ chip, now }: { chip: GateChip; now: Date }) {
  const age = relativeAge(chip.at, now)

  return (
    <span
      title={chip.at ? `${chip.suite} ${CHIP_WORD[chip.state]} · ${formatIst(chip.at)}` : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium',
        CHIP_STYLE[chip.state],
      )}
    >
      <span className="font-semibold">{chip.suite}</span>
      <span className="opacity-80">{CHIP_WORD[chip.state]}</span>
      {age ? <span className="tabular-nums opacity-70">{age}</span> : null}
    </span>
  )
}

async function GatesStrip({ now }: { now: Date }) {
  const gates = await readGateRuns()

  if (gates.status !== 'ok') {
    return (
      <Strip>
        <span className="text-[13px] text-muted">
          We couldn&apos;t read the test gates just now.
        </span>
      </Strip>
    )
  }

  const chips = gateChips([...GATE_SUITES], gates.data)

  return (
    <Strip>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <Chip key={chip.suite} chip={chip} now={now} />
        ))}
      </div>
    </Strip>
  )
}

export async function HeaderStrips() {
  // One clock for both strips, for the same reason the roadmap card has one.
  const now = new Date()

  return (
    <div className="flex flex-wrap items-stretch gap-grid">
      <SessionStrip now={now} />
      <GatesStrip now={now} />
    </div>
  )
}
