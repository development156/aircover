import {
  GATE_CLASSIFY_MAX_CHARS,
  GATE_CLASSIFY_MAX_RULES,
  type ClassifierOutcome,
  type GateClassifyInput,
  type GateClassifyOutput,
  type MeshUsage,
  type Result,
  type RunTask,
} from '@sahoda/shared'
import { gateClassifyTask } from '@sahoda/mesh'

/** Exactly what `RunTask` resolves to for this task — named so the race can be typed. */
type MeshCall = Result<GateClassifyOutput> & { usage?: MeshUsage }

/**
 * LAYER 3's binding — the mesh call, wrapped so that nothing it can do reaches
 * the publish path as anything other than a `ClassifierOutcome`.
 *
 * ── EVERY EXIT FROM THIS FILE IS EITHER FINDINGS OR A HOLD ───────────────────
 * `runTask` already guarantees a zod-parsed output with one repair retry and a
 * typed PROVIDER_ERROR rather than a silent mock. What it cannot guarantee is
 * that it RETURNS: a hung socket inside a 120s publish wall is a real state, and
 * a promise that never settles would take the whole publish down with it.
 *
 * So: a timeout, and a `catch` around everything. Both resolve to a state that
 * `decideGate` turns into a hold. There is deliberately no path out of this
 * function that says "we could not check, carry on".
 */

/**
 * How long layer 3 gets.
 *
 * ── THE ARITHMETIC IT HAS TO FIT INSIDE ─────────────────────────────────────
 * Both publish runners were sized before any model call lived on this path:
 *
 *   · publish-now caps at `maxDuration = 120`, against a worst realistic case
 *     near 50s (Instagram's 36s container poll plus media upload).
 *   · the cron tick caps at 300 and publishes up to `PUBLISH_BATCH = 4`
 *     variants, at ~50s each — roughly 200s, leaving ~100s of margin for the
 *     classification pass, the hold sweep and a cold start.
 *
 * 12s is what the cron can afford four of (48s) inside that margin, and it is a
 * rounding error against publish-now's headroom. A `standard`-tier call
 * emitting at most ~1,440 tokens lands well inside it; if it does not, the post
 * is HELD, which is a five-minute delay rather than a wrong publish.
 *
 * If PUBLISH_BATCH rises, revisit this number rather than assuming the margin
 * absorbed it.
 */
export const GATE_CLASSIFY_TIMEOUT_MS = 12_000

export interface GateClassifier {
  classify(input: GateClassifyInput, ctx: ClassifyContext): Promise<ClassifierOutcome>
}

export interface ClassifyContext {
  workspaceId: string
  traceId: string
}

export interface CreateGateClassifierOptions {
  runTask: RunTask
  timeoutMs?: number
}

/** Resolve to `marker` if `promise` has not settled in `ms`. Never rejects on the race. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  marker: symbol,
): Promise<T | symbol> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<symbol>((resolve) => {
        timer = setTimeout(() => resolve(marker), ms)
      }),
    ])
  } finally {
    // The losing model call keeps running to completion in the background; there
    // is no abort seam on `RunTask`. It costs one wasted call and writes its own
    // ai_provider_logs row, which is preferable to leaving a timer holding the
    // event loop open in a serverless function.
    if (timer) clearTimeout(timer)
  }
}

const TIMED_OUT = Symbol('gate-classify-timeout')

export function createGateClassifier(opts: CreateGateClassifierOptions): GateClassifier {
  const timeoutMs = opts.timeoutMs ?? GATE_CLASSIFY_TIMEOUT_MS

  async function classify(
    input: GateClassifyInput,
    ctx: ClassifyContext,
  ): Promise<ClassifierOutcome> {
    // Bounds checked HERE rather than trimming to fit. See `over-bounds` in
    // @sahoda/shared: a rule that was never put to the checker must not become a
    // rule that came back clear.
    if (input.rules.length === 0) return { ran: false, state: 'skipped-no-rules' }
    if (
      input.rules.length > GATE_CLASSIFY_MAX_RULES ||
      input.text.length > GATE_CLASSIFY_MAX_CHARS
    ) {
      return { ran: false, state: 'over-bounds' }
    }

    let raced: MeshCall | symbol
    try {
      raced = await withTimeout<MeshCall>(
        opts.runTask(gateClassifyTask.def, input, {
          workspaceId: ctx.workspaceId,
          traceId: ctx.traceId,
          // No `actionType`, and no `creditsCharged`. Those fields are
          // withCredits' telemetry, and this call is never charged — see
          // packages/mesh/src/tasks/gate-classify.ts. Sending a stub action
          // would put a paid-looking row in ai_provider_logs for work nobody
          // bought.
        }),
        timeoutMs,
        TIMED_OUT,
      )
    } catch {
      // A throw from the mesh is infrastructure, not a verdict. The message is
      // deliberately not read: it can carry provider text, and nothing here
      // needs it to know that the answer is "we do not know".
      return { ran: false, state: 'unavailable' }
    }

    if (raced === TIMED_OUT) return { ran: false, state: 'timeout' }

    const result = raced as MeshCall
    if (!result.ok) {
      // `runTask` returns a typed error for BOTH a provider failure and a double
      // zod failure. They are told apart so the audit row can say which — an
      // outage and a bad prompt need different people looking at them.
      return {
        ran: false,
        state: result.error.code === 'VALIDATION_ERROR' ? 'unparseable' : 'unavailable',
      }
    }

    return {
      ran: true,
      // The model that actually SERVED it, from telemetry — not the route we
      // asked for. The fallback chain can answer with a different model than the
      // primary, and an audit trail that records the intended one would name a
      // model that never saw the post.
      model: result.usage?.model ?? gateClassifyTask.def.name,
      findings: result.data.findings,
    }
  }

  return { classify }
}
