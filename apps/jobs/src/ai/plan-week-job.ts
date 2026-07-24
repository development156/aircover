import { randomUUID } from 'node:crypto'
import {
  PlanWeekJobPayloadSchema,
  appError,
  err,
  ok,
  type Channel,
  type MeshContext,
  type PlanWeekJobPayload,
  type PlanWeekOutput,
  type Result,
  type WithCreditsFn,
} from '@sahoda/shared'

/** One brief mapped onto a `posts` insert. */
export interface BriefInsert {
  title: string
  body: string
  channels: Channel[]
  scheduledAt: string
  status: 'idea'
  origin: 'plan_week'
}

export interface PlanWeekJobDeps {
  withCredits: WithCreditsFn
  /** The mesh seam — runs the model and returns the frozen Result contract. */
  runPlanWeek(
    input: { goals: string; channels: Channel[] },
    ctx: MeshContext,
  ): Promise<Result<PlanWeekOutput>>
  insertBriefs(workspaceId: string, briefs: BriefInsert[]): Promise<number>
  /** Injected for deterministic refs in tests. */
  newObjectRef?: () => string
}

export interface PlanWeekJobResult {
  postsCreated: number
}

/**
 * The durable "Plan my week" job: validate → charge → run the model → land 5 posts as
 * ideas. This is the seam apps/web's planner triggers; the mesh call itself stays in
 * ./plan-week so it can be unit-tested without credits.
 *
 * Input is validated BEFORE withCredits on purpose. The mesh runner validates the model's
 * OUTPUT but not the caller's input, so an unvalidated payload would reserve credits and
 * burn a paid provider call before failing.
 *
 * The objectRef is minted fresh per invocation. withCredits derives its attempt from
 * (action, objectRef), so a stable ref would make a second plan replay the first run's
 * spent HOLD+DEBIT — the user would not be charged twice, but the paid model call would
 * still happen. A fresh ref keeps "one plan = one charge" honest in both directions.
 *
 * A model failure throws inside the wrapper's callback, which is what triggers the
 * RELEASE — users are never charged for a failure.
 */
export async function runPlanWeekJob(
  payload: PlanWeekJobPayload,
  deps: PlanWeekJobDeps,
): Promise<Result<PlanWeekJobResult>> {
  const parsed = PlanWeekJobPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return err(
      appError(
        'VALIDATION_ERROR',
        `plan_week payload rejected: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        payload.traceId ?? 'unknown',
      ),
    )
  }
  const input = parsed.data
  const objectRef = (deps.newObjectRef ?? randomUUID)()
  const ctx: MeshContext = { workspaceId: input.workspaceId, traceId: input.traceId }

  const charged = await deps.withCredits(
    { workspaceId: input.workspaceId, action: 'loop_cycle', objectRef },
    async () => {
      const result = await deps.runPlanWeek({ goals: input.goals, channels: input.channels }, ctx)
      // Throwing is the contract for "release the hold" — never swallow into a success.
      if (!result.ok) throw new Error(result.error.message)

      const briefs: BriefInsert[] = result.data.briefs.map((b) => ({
        title: b.title,
        body: b.body,
        channels: b.channels,
        scheduledAt: b.suggestedSlot,
        status: 'idea',
        origin: 'plan_week',
      }))
      return deps.insertBriefs(input.workspaceId, briefs)
    },
  )

  if (!charged.ok) return err(charged.error)
  return ok({ postsCreated: charged.data.data })
}
