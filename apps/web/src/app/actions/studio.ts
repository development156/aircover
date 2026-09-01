'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, type Mesh } from '@sahoda/mesh'
import {
  GenerationModeSchema,
  MESH_TASK_ACTION,
  StudioGenerationRowSchema,
  StudioGenerationSchema,
  type BrandSignal,
  type WithCreditsFn,
} from '@sahoda/shared'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { kindForProvenMime } from '@/lib/assets/kind'
import { reportServerError } from '@/lib/observability/report'
import {
  FAILURE_REASON,
  chargeFailureState,
  type ChargeFailureState,
} from '@/lib/posts/charge-failure'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { assetObjectPath } from '@/lib/posts/media-path'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { sniffImage } from '@/lib/posts/sniff-image'
import { brandSignalsFor } from '@/lib/studio/brand-signals'
import { formatById } from '@/lib/studio/formats'
import { MAX_REFERENCES, MAX_TRIES_PER_PRESS, describeModeBlock } from '@/lib/studio/modes'
import { defaultModelId, describeModelBlock } from '@/lib/studio/models'
import { ReferenceIdsSchema } from '@/lib/studio/reference-ids'
import { conditionPrompt } from '@/lib/studio/prompt'
import { stampGeneratedPicture } from '@/lib/studio/stamp-generated'
import { attachAssetToPost } from '@/app/actions/assets'
import { createPost } from '@/app/actions/posts'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE STUDIO'S ONE WRITE: ASK A MODEL FOR A PICTURE.
 *
 * ── THE ROW IS WRITTEN BEFORE THE MODEL IS CALLED, AND THAT IS THE DESIGN ───
 * A generation takes between eight seconds and three minutes. MEASURED in this
 * repository: a server action CANNOT outlive the navigation that triggered it
 * (`components/posts/draft-recovery.ts` records `net::ERR_ABORTED` on a Back
 * press), and a Back inside this app does not unmount the segment, so no
 * cleanup, `pagehide` or `beforeunload` fires either.
 *
 * So the request is written to `studio_generations` FIRST. If the browser goes
 * away mid-flight the row is still there, still says what was asked and what it
 * cost, and the person finds it when they come back. Holding the request only in
 * React state would mean a Back press destroyed something they had paid for.
 *
 * ── AND NOBODY PAYS FOR A FAILURE ───────────────────────────────────────────
 * `withCredits` reserves the credits, the work runs inside the callback, and a
 * THROW in there releases the hold so nothing is charged. Every refusal below is
 * a throw for exactly that reason. The action string comes from
 * `MESH_TASK_ACTION`, never a literal: the mesh task is `image_generate` and the
 * pricing key is `image_standard`, and hardcoding either is how the two drift.
 *
 * ── THE BYTES GO THROUGH THE SAME GATE AS AN UPLOAD ─────────────────────────
 * `sniffImage` reads the real format and dimensions from the BYTES rather than
 * from the model's word for them. A generator that says PNG and returns WebP, or
 * that returns 512x512 when asked for 1080x1350, produces a file a platform
 * refuses at publish time. Catching it here costs a released hold; catching it
 * there costs somebody a post that silently never went out.
 */

// 'use server' modules may export only async functions, so these singletons stay
// module-private. Built lazily: `createMesh()` throws SYNCHRONOUSLY on a missing
// env var, and at module scope that 500s every route that imports this file.
let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

const GenerateInputSchema = z.object({
  mode: GenerationModeSchema,
  /** What the person typed. The same bounds the mesh's own input carries. */
  wanted: z.string().trim().min(3).max(1000),
  /** A preset id. Resolved through `formatById`, so a size the picker hid cannot be spent on. */
  formatId: z.string().min(1).max(40),
  /**
   * Pictures from this workspace's own library to condition on.
   *
   * Bounded here as well as by `describeModeBlock`, because the schema is what a
   * hand-made request meets: the screen's rule and the parser's bound have to
   * agree, and only one of them runs when somebody skips the screen.
   */
  referenceAssetIds: ReferenceIdsSchema,
  /**
   * How many separate pictures to try. Bounded by the SAME constant the screen
   * shows, so a hand-made request cannot ask for a hundred and be charged for
   * a hundred.
   */
  count: z.number().int().min(1).max(MAX_TRIES_PER_PRESS).default(1),
  /**
   * Which model draws it. Defaulted rather than required, so a caller that
   * predates the picker still works and gets the everyday model.
   */
  modelId: z.string().min(1).default(defaultModelId()),
})

export type QueueGenerationState =
  | {
      ok: true
      generationId: string
      balanceAfter: number
      /** How many pictures actually arrived. Never more than was asked for. */
      made: number
      /** How many were asked for, so a partial result can say which it was. */
      asked: number
    }
  | { ok: false; insufficient: false; message: string }
  | ChargeFailureState

const REFUSALS = {
  signedOut: 'Sign in to make an image.',
  malformed: 'Describe the picture you want, in a few words at least.',
  unknownFormat: 'That size is not one Sahoda can make, so nothing was charged.',
  failed: 'Sahoda could not make this image. Nothing was charged.',
  /**
   * Every picture the person picked was unreadable by the time we went to use it.
   *
   * Its own sentence rather than the mode block's, because the two say different
   * things. "Pick the picture you want changed" is wrong here: they DID pick one,
   * and telling them to do the thing they just did is a remedy that cannot work.
   */
  referencesUnreadable:
    'Sahoda could not open the pictures you picked, so nothing was made and nothing was charged. Try picking them again.',
  /**
   * The request named more pictures than any mode accepts.
   *
   * Its own sentence because `malformed` is about the PROMPT. A hand-made
   * request carrying four references was told "Describe the picture you want, in
   * a few words at least", which describes a different field entirely: the parse
   * failed on `referenceAssetIds` and every failure mapped to one line.
   */
  tooManyReferences: `Pick at most ${MAX_REFERENCES} pictures for Sahoda to match.`,
} as const

/**
 * Ask for one image.
 *
 * Returns as soon as the row exists and the model has answered. A series of
 * slides is Phase 2 and is deliberately not faked here: `requested_count` stays
 * at 1, so no row ever claims to have asked for more than was asked for.
 */
export async function queueGeneration(input: unknown): Promise<QueueGenerationState> {
  const action = MESH_TASK_ACTION.image_generate
  let workspaceId: string | undefined

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: REFUSALS.signedOut }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsed = GenerateInputSchema.safeParse(input)
    if (!parsed.success) {
      // WHICH field failed, not one sentence for all of them. `safeParse` runs
      // before `describeModeBlock`, so the reference bound is met here first and
      // was reported as a complaint about the prompt.
      const onReferences = parsed.error.issues.some(
        (issue) => issue.path[0] === 'referenceAssetIds',
      )
      return {
        ok: false,
        insufficient: false,
        message: onReferences ? REFUSALS.tooManyReferences : REFUSALS.malformed,
      }
    }

    // Through the SAME function the picker uses, so a hand-made request cannot
    // reach a size the screen refused to offer.
    const format = formatById(parsed.data.formatId)
    if (format === null) {
      return { ok: false, insufficient: false, message: REFUSALS.unknownFormat }
    }

    // ── THE MODEL, BEFORE THE MODE ──────────────────────────────────────────
    // Checked first because every rule below depends on it: what a mode may do
    // and how many references it takes are the CHOSEN MODEL's answer. A model
    // the router cannot reach is refused here rather than spending a hold on a
    // call that cannot be made.
    const modelBlocked = describeModelBlock(parsed.data.modelId)
    if (modelBlocked !== null) {
      return { ok: false, insufficient: false, message: modelBlocked }
    }

    // The mode's own rule, asked through the SAME function the screen asks, so
    // a request that skipped the screen cannot reach a mode the screen refused.
    const blocked = describeModeBlock({
      mode: parsed.data.mode,
      references: parsed.data.referenceAssetIds.length,
      modelId: parsed.data.modelId,
    })
    if (blocked !== null) return { ok: false, insufficient: false, message: blocked }

    // Read before anything is charged: a brain that cannot be read produces an
    // unconditioned image, which is a worse picture and not a failure, and the
    // screen says which happened.
    const signals: BrandSignal[] = await brandSignalsFor(workspace.id)
    const conditioned = conditionPrompt({
      mode: parsed.data.mode,
      wanted: parsed.data.wanted,
      signals,
    })

    const supabase = createServerSupabase()

    // ── REFERENCES, RESOLVED TO LINKS THE PROVIDER CAN FETCH ─────────────────
    //
    // Signed URLs rather than base64. The Images API accepts either, and a
    // 1080x1350 photograph as base64 is over a megabyte of request body per
    // reference; three of them would be four megabytes on every press. The links
    // are short-lived and scoped to this workspace's own bucket.
    //
    // A reference that cannot be signed is DROPPED rather than failing the
    // generation, and the row records which ids were asked for either way. A
    // person who picked three pictures and got two of them conditioning the
    // result still gets a picture; failing outright would spend nothing and give
    // them nothing.
    const referenceUrls = await signReferences(
      supabase,
      workspace.id,
      parsed.data.referenceAssetIds,
    )

    // ── ASK THE MODE'S RULE AGAIN, AGAINST WHAT SURVIVED SIGNING ─────────────
    //
    // The block above ran against the count the person PICKED. Signing drops
    // anything it cannot resolve and returns `[]` outright on a query error, so
    // a mode with a floor of one could reach the model with zero references —
    // `edit` would send a bare prompt, get back a fresh unrelated picture
    // instead of the edit, and charge in full for it. Dropping SOME references
    // is the documented, deliberate behaviour; dropping ALL of them for a mode
    // that structurally requires one is not the same event.
    //
    // Re-asking the same function is what makes this exact rather than a second
    // rule that can drift from the first. A smaller count can only trip the
    // `minReferences` branch, never the `maxReferences` one, so a non-null here
    // can ONLY mean signing took it below the floor.
    if (
      describeModeBlock({
        mode: parsed.data.mode,
        references: referenceUrls.length,
        // The SAME model the first check used. `ruleFor(mode, modelId)` reads the
        // chosen model's own reference bounds, so asking without it would check a
        // different model's floor than the one this request will run on.
        modelId: parsed.data.modelId,
      }) !== null
    ) {
      return { ok: false, insufficient: false, message: REFUSALS.referencesUnreadable }
    }

    // ── THE ROW, BEFORE THE MODEL ────────────────────────────────────────────
    const queued = await supabase
      .from('studio_generations')
      .insert({
        workspace_id: workspace.id,
        status: 'queued',
        mode: parsed.data.mode,
        prompt_given: parsed.data.wanted,
        prompt_sent: conditioned.prompt,
        format_id: format.id,
        width: format.width,
        height: format.height,
        requested_count: parsed.data.count,
        // Recorded at REQUEST time, not after the call. A row that only learns
        // its model on success cannot say what a failure was trying to use,
        // which is the case where somebody most wants to know.
        model_id: parsed.data.modelId,
        reference_asset_ids: parsed.data.referenceAssetIds,
        // Explore legitimately used nothing, and `[]` says that. A null here
        // would mean conditioning never ran, which is a different claim.
        brand_signals: conditioned.used,
        created_by: userId,
      })
      .select('id')
      .single()

    if (queued.error || !queued.data) {
      return { ok: false, insufficient: false, message: REFUSALS.failed }
    }
    const generationId = queued.data.id as string

    const traceId = randomUUID()
    // Fresh per invocation and server-derived. A stable ref would let a second
    // press replay a spent hold: no charge, but the paid provider call still runs.
    // The picture's index is part of it, because four pictures on one press are
    // four separate charges and a shared ref would collapse them into one.
    const objectRefFor = (idx: number) => `studio:${workspace.id}:${generationId}:${idx}`

    let providerCostMicroUsd: number | null = null

    // ── FOUR PICTURES ARE FOUR CHARGES, NOT ONE ─────────────────────────────
    //
    // The routed model draws one picture per call (MEASURED, docs/43), so asking
    // for four means four calls. Each one gets its OWN hold, which is the only
    // arrangement where the money stays honest: if the third call fails, the
    // first two were delivered and are charged, the third releases its hold, and
    // the fourth is never attempted. One hold covering all four would either
    // charge for pictures nobody received or refund pictures they did.
    //
    // And the loop STOPS at the first failure rather than pressing on. A call
    // that just failed usually fails again for the same reason, and spending
    // three more times to prove it is somebody else's money.
    let delivered = 0
    let charged = 0
    let balanceAfter: number | null = null
    let lastFailure: ChargeFailureState | null = null
    // The ledger's own code, kept so the row records WHY rather than a word this
    // file chose. Somebody reading the row tomorrow needs the real reason.
    let lastErrorCode: string | null = null

    for (let idx = 0; idx < parsed.data.count; idx += 1) {
      // `deliveredThis` is what makes a charge claim honest: only the caller can
      // know whether the callback reached its end, and the error alone cannot say.
      let failure: string | null = null
      let deliveredThis = false
      // What THIS press reserved, carried out of the callback so it can be added
      // to `charged` only after the debit is known to have committed.
      let chargedThis = 0

      const credits = await getWithCredits()(
        { workspaceId: workspace.id, action, objectRef: objectRefFor(idx) },
        async (ctx: { actionType: string; creditsCharged: number }) => {
          if (idx === 0) {
            await supabase
              .from('studio_generations')
              .update({ status: 'running', started_at: new Date().toISOString() })
              .eq('id', generationId)
              .eq('workspace_id', workspace.id)
          }

          const result = await getMesh().runImage(
            {
              prompt: conditioned.prompt,
              size: 'square',
              // The exact canvas, not one of three ratios. Without this a story
              // comes back landscape with nothing saying so.
              dims: { width: format.width, height: format.height },
              // Absent when there are none. `openrouter.ts` drops the field
              // entirely for an empty list, because a field carrying [] and a
              // field that is not there are different requests.
              references: referenceUrls,
              // ── THE CHOICE HAD TO TRAVEL, AND DID NOT ────────────────────
              // The field existed at BOTH ends and nothing carried it across:
              // `ImageGenerateInputSchema` declares `modelId`, `engine.ts`
              // reads `req.modelId` and hands it to `planImage`, and this call
              // omitted it. So a person picked a model, `describeModelBlock`
              // vetted it, `model_id` was written on the row, and the mesh
              // routed to the TIER DEFAULT — the row recorded a model that had
              // not drawn the picture. Same shape as the `keywordBrackets`
              // defect on the publish path.
              modelId: parsed.data.modelId,
            },
            {
              workspaceId: workspace.id,
              traceId,
              userId,
              actionType: ctx.actionType,
              creditsCharged: ctx.creditsCharged,
            },
          )
          // Our own copy, never `result.error.message`: that can carry provider text.
          if (!result.ok) {
            failure = FAILURE_REASON.MESH_ERROR
            throw new Error('MESH_ERROR')
          }
          // What the PROVIDER said it cost, in whole ten-thousandths of a US cent.
          // Undefined when it said nothing, and the column then stays null: an
          // estimate rendered as a price is a figure nobody quoted, which is why
          // the mesh hands this back separately from `usage.costUsd`.
          const thisCost =
            typeof result.data.providerCostUsd === 'number'
              ? Math.round(result.data.providerCostUsd * 1_000_000)
              : null
          if (thisCost !== null) {
            providerCostMicroUsd = (providerCostMicroUsd ?? 0) + thisCost
          }

          const bytes = Uint8Array.from(Buffer.from(result.data.base64, 'base64'))
          if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_UPLOAD_CAP_BYTES) {
            failure = FAILURE_REASON.IMAGE_UNREADABLE
            throw new Error('IMAGE_UNUSABLE')
          }

          // Facts, not the model's claim. `result.data.mime` is deliberately unused.
          const sniffed = sniffImage(bytes)
          if (!sniffed.ok) {
            failure = FAILURE_REASON.IMAGE_UNREADABLE
            throw new Error('IMAGE_UNREADABLE')
          }
          const kind = kindForProvenMime(sniffed.image.mime)
          if (kind === null) {
            failure = FAILURE_REASON.IMAGE_UNREADABLE
            throw new Error('IMAGE_UNSUPPORTED')
          }

          const newAssetId = randomUUID()
          const objectPath = assetObjectPath({
            workspaceId: workspace.id,
            assetId: newAssetId,
            mime: sniffed.image.mime,
          })
          const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, bytes, {
            contentType: sniffed.image.mime,
            upsert: false,
          })
          if (upload.error) {
            failure = FAILURE_REASON.IMAGE_NOT_STORED
            throw new Error('STORAGE_FAILED')
          }

          const row = await supabase.from('assets').insert({
            id: newAssetId,
            workspace_id: workspace.id,
            storage_path: objectPath,
            kind,
            mime: sniffed.image.mime,
            bytes: bytes.byteLength,
            width: sniffed.image.width,
            height: sniffed.image.height,
            created_by: userId,
          })
          if (row.error) {
            // The object is already in storage and nothing points at it. Remove it
            // rather than leaving bytes nobody can reach or delete.
            await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
            failure = FAILURE_REASON.IMAGE_NOT_STORED
            throw new Error('ASSET_ROW_FAILED')
          }

          // ── THE STAMP RIDES ALONG, AND NEVER COSTS THE GENERATION ─────────
          // Local compute, so nothing above changes: no second hold, no second
          // charge, `ctx.creditsCharged` untouched. `stampGeneratedPicture` is
          // total by contract (it returns null for every failure and throws for
          // none), which is why there is no try around it here: a throw in this
          // callback releases the hold and refuses a picture the customer
          // already has, and one owner of that guarantee is testable where two
          // are not. See `lib/studio/stamp-generated.ts`.
          const stamped = await stampGeneratedPicture({
            workspaceId: workspace.id,
            userId,
            picture: bytes,
            supabase,
          })

          const imageRow = {
            workspace_id: workspace.id,
            generation_id: generationId,
            idx,
            asset_id: newAssetId,
            width: sniffed.image.width,
            height: sniffed.image.height,
          }

          // ── DEPLOY-SAFE, THE SAME WAY `assets.ts` IS ──────────────────────
          // `stamped_asset_id` arrives with a migration a human applies, and
          // this code ships before that happens. It goes in the SAME insert
          // rather than a follow-up update because this table is append-only:
          // it carries `block_mutations` and has no UPDATE policy, so a second
          // statement could never land. On `42703` (undefined column) the row
          // is written again without it, so a missing column costs the LINK and
          // never the record of a generation somebody paid for.
          let image = await supabase.from('studio_generation_images').insert({
            ...imageRow,
            stamped_asset_id: stamped.outcome === 'stamped' ? stamped.assetId : null,
            // WHY, beside the pointer and in the SAME insert. The pointer's null
            // is one fact standing in for several situations and the screen has
            // to tell them apart; the migration's step 5 carries the reasoning.
            stamp_outcome: stamped.outcome,
          })

          if (image.error?.code === '42703') {
            image = await supabase.from('studio_generation_images').insert(imageRow)
          }

          // ── THE PROVENANCE ROW, CHECKED LIKE EVERY OTHER WRITE ABOVE ───────
          //
          // This insert used to be awaited with its `.error` never read, while
          // the storage upload and the `assets` insert directly above it both
          // checked and threw. A lost row meant the person was charged, the
          // picture reached their library, and NOTHING recorded which
          // generation made it — after which `describeCount` would tell them
          // "3 of the 4 options you asked for arrived. You were charged for
          // those and for nothing else" about four they had paid for.
          //
          // Rolled back the same way the asset row above rolls back, so the
          // failure costs a released hold rather than a false claim about
          // money. The migration's §6 states this contract: an image row is
          // written once, "create it, or do nothing".
          //
          // THE STAMPED COPY IS ROLLED BACK TOO, and it is listed first
          // because it is the one a person would SEE. Both asset rows are in
          // the library by now; undoing only the generation's own would leave a
          // stamped picture sitting there for a generation that was refused and
          // refunded. Each undo is independent — a failure to remove the
          // stamped copy must not stop the generation's own from being removed
          // — so they are separate statements rather than one chain.
          if (image.error) {
            if (stamped.outcome === 'stamped') {
              await supabase.from('assets').delete().eq('id', stamped.assetId)
              await supabase.storage.from(MEDIA_BUCKET).remove([stamped.objectPath])
            }
            await supabase.from('assets').delete().eq('id', newAssetId)
            await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
            failure = FAILURE_REASON.IMAGE_NOT_STORED
            throw new Error('IMAGE_ROW_FAILED')
          }

          chargedThis = ctx.creditsCharged
          deliveredThis = true
        },
      )

      if (credits.ok) {
        delivered += 1
        // ── COUNTED ONLY ONCE THE DEBIT ACTUALLY COMMITTED ─────────────────
        // `withCredits` reaches its DEBIT after the callback returns, so a
        // failure there releases the hold and charges nothing. Incrementing
        // inside the callback counted a credit that never left the wallet, and
        // when an earlier picture had succeeded the row was still written
        // `ready` with `cost_credits` claiming it.
        charged += chargedThis
        balanceAfter = credits.data.balanceAfter
        continue
      }

      // This picture's hold was released, so it was not charged. Through the SAME
      // mapper every other paid action uses: it decides whether a charge claim is
      // honest from `delivered`, which only the caller knows, and it is
      // deliberately unable to read the provider's own message.
      lastErrorCode = credits.error.code
      lastFailure = chargeFailureState({
        error: credits.error,
        action,
        delivered: deliveredThis,
        reason: failure,
      })
      break
    }

    // ── NOTHING ARRIVED ──────────────────────────────────────────────────────
    if (delivered === 0) {
      await supabase
        .from('studio_generations')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: lastErrorCode,
        })
        .eq('id', generationId)
        .eq('workspace_id', workspace.id)

      revalidateBalance()
      return lastFailure ?? { ok: false, insufficient: false, message: REFUSALS.failed }
    }

    await supabase
      .from('studio_generations')
      .update({
        status: 'ready',
        finished_at: new Date().toISOString(),
        cost_credits: charged,
        provider_cost_micro_usd: providerCostMicroUsd,
        provider: 'openrouter',
      })
      .eq('id', generationId)
      .eq('workspace_id', workspace.id)

    revalidateBalance()
    revalidatePath('/studio')
    revalidatePath('/assets')
    return {
      ok: true,
      generationId,
      // Never null here: at least one picture was delivered, and every delivery
      // came back through a successful charge that carried a balance.
      balanceAfter: balanceAfter ?? 0,
      made: delivered,
      asked: parsed.data.count,
    }
  } catch (error) {
    reportServerError(error, { action: 'queueGeneration', workspaceId })
    return { ok: false, insufficient: false, message: REFUSALS.failed }
  }
}

/** One generation and its images, for the screen. Parsed per row. */
export async function readGeneration(
  id: unknown,
): Promise<
  | { ok: true; generation: ReturnType<typeof StudioGenerationSchema.parse> }
  | { ok: false; message: string }
> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, message: 'That image request does not exist.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('studio_generations')
    .select('*')
    .eq('workspace_id', ws.workspace.id)
    .eq('id', parsed.data)
    .maybeSingle()

  if (error) return { ok: false, message: 'Sahoda could not read that image request just now.' }
  if (!data) return { ok: false, message: 'That image request does not exist.' }

  // The refined schema, for the reason `read.ts` gives at its own call site.
  const row = StudioGenerationRowSchema.safeParse(data)
  if (!row.success) {
    reportServerError(new Error('studio: generation row did not parse'), {
      action: 'readGeneration',
    })
    return { ok: false, message: 'Sahoda could not read that image request just now.' }
  }
  return { ok: true, generation: row.data }
}

/**
 * Turn asset ids into links a provider can fetch, in the order they were picked.
 *
 * Order matters: reference conditioning is not commutative, and the first
 * picture generally weighs most. Anything that could not be resolved is left
 * out rather than substituted, so what reaches the model is a subset of what was
 * asked for and never something else.
 */
async function signReferences(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  assetIds: readonly string[],
): Promise<string[]> {
  if (assetIds.length === 0) return []

  const { data, error } = await supabase
    .from('assets')
    .select('id, storage_path')
    // Scoped to the workspace as well as by RLS: the policy admits every
    // workspace this person belongs to, so an unscoped read would let one
    // workspace's picture condition another's.
    .eq('workspace_id', workspaceId)
    .in('id', [...assetIds])

  if (error || !data) return []

  const rows = data.filter(
    (row): row is { id: string; storage_path: string } =>
      typeof row.id === 'string' && typeof row.storage_path === 'string',
  )
  const signed = await signMediaPreviews(rows)
  const urls = new Map(signed.map((one) => [one.id, one.url]))

  return assetIds
    .map((id) => urls.get(id) ?? null)
    .filter((url): url is string => typeof url === 'string')
}

export type StartPostState =
  | { ok: true; postId: string }
  | {
      ok: false
      message: string
      /**
       * The draft that DOES exist, when the picture is the half that failed.
       *
       * The header below promises the person is "sent to it with a sentence
       * about the picture", and the failure arm returned no id, so nothing could
       * send them anywhere: `picture-actions.tsx` only set a note, the draft was
       * created and unreachable from that screen, and pressing the button again
       * made another empty one. Present here exactly when there is somewhere to
       * go, so a caller cannot navigate to a post that was never created.
       */
      postId?: string
    }

/**
 * TURN A PICTURE INTO A POST, WITHOUT A TRIP THROUGH THE LIBRARY.
 *
 * ── THE STEP THAT WAS LOSING PICTURES ───────────────────────────────────────
 * A picture was made, saved to the library, and then the person had to open the
 * composer, find the library, recognise their own picture among everything else
 * in it, and attach it. Every one of those is a place to stop, and a picture
 * that never becomes a post is the whole point of this product not happening.
 *
 * ── THE DRAFT CARRIES THE WORDS THAT MADE IT ────────────────────────────────
 * The title is the prompt. Somebody who makes four pictures in a morning is
 * looking at four untitled drafts otherwise, and the words they typed are the
 * only thing that tells them which is which.
 *
 * ── AND A FAILED ATTACH IS NOT A FAILED POST ────────────────────────────────
 * The draft is created first and the picture attached second. If the attach
 * fails, the DRAFT still exists and the person is sent to it with a sentence
 * about the picture, rather than losing both. Deleting the draft to make the
 * failure clean would throw away the half that worked.
 */
export async function startPostFromPicture(assetId: unknown): Promise<StartPostState> {
  let workspaceId: string | undefined
  try {
    const parsed = z.uuid().safeParse(assetId)
    if (!parsed.success) return { ok: false, message: 'That picture does not exist.' }

    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to start a post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // The prompt that made it, read through the same scoped path as everything
    // else. A picture from another workspace is simply not found.
    const supabase = createServerSupabase()
    const found = await supabase
      .from('studio_generation_images')
      .select('generation_id')
      .eq('workspace_id', ws.workspace.id)
      .eq('asset_id', parsed.data)
      .limit(1)
      .maybeSingle()

    let title = ''
    if (found.data?.generation_id) {
      const row = await supabase
        .from('studio_generations')
        .select('prompt_given')
        .eq('workspace_id', ws.workspace.id)
        .eq('id', found.data.generation_id)
        .maybeSingle()
      if (typeof row.data?.prompt_given === 'string') title = row.data.prompt_given
    }

    const post = await createPost(title)
    if (!post.ok) return { ok: false, message: post.message }

    const attached = await attachAssetToPost(post.postId, parsed.data)
    if (!attached.ok) {
      // The draft exists. Sending them to it with the picture missing beats
      // losing the half that worked — and that needs the id, which this arm did
      // not carry.
      return { ok: false, message: attached.message, postId: post.postId }
    }

    revalidatePath('/posts')
    return { ok: true, postId: post.postId }
  } catch (error) {
    reportServerError(error, { action: 'startPostFromPicture', workspaceId })
    return { ok: false, message: 'Sahoda could not start a post from that picture. Try again.' }
  }
}

export type DiscardGenerationState = { ok: true } | { ok: false; message: string }

/**
 * FORGET A REQUEST, WITHOUT THROWING AWAY THE PICTURE.
 *
 * ── TWO DIFFERENT THINGS, AND ONLY ONE OF THEM GOES ─────────────────────────
 * A generation row is the RECORD: what was asked, what it cost, what
 * conditioned it. The picture it produced is a file in the library, which the
 * person may already have posted. Deleting the record must not delete the
 * picture, and a screen that implied otherwise would stop people tidying up for
 * fear of losing work they are using.
 *
 * The database enforces this rather than this function remembering it:
 * `studio_generation_images.asset_id` is `on delete set null`, so the child rows
 * cascade away and the assets do not. The library is the only place a picture
 * is deleted, deliberately, because that is where its usage is checked.
 *
 * ── AND THE CHILD ROWS GO BY CASCADE, NOT BY HAND ───────────────────────────
 * `studio_generation_images` is append-only: it has SELECT and INSERT policies
 * and a `block_mutations` trigger, so nothing may delete a row directly. The
 * trigger admits deletes at `pg_trigger_depth() > 1`, which is exactly a
 * cascade. Deleting the parent is therefore the only route, and it is the one
 * the schema was shaped for.
 */
export async function discardGeneration(id: unknown): Promise<DiscardGenerationState> {
  let workspaceId: string | undefined
  try {
    const parsed = z.uuid().safeParse(id)
    if (!parsed.success) return { ok: false, message: 'That request does not exist.' }

    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to remove a request.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    // Scoped here as well as in RLS: the policy admits every workspace this
    // person belongs to, so an unscoped delete could reach another one's row.
    const { error } = await supabase
      .from('studio_generations')
      .delete()
      .eq('id', parsed.data)
      .eq('workspace_id', ws.workspace.id)

    if (error) {
      return { ok: false, message: 'Sahoda could not remove that request. Nothing was changed.' }
    }

    revalidatePath('/studio')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'discardGeneration', workspaceId })
    return { ok: false, message: 'Sahoda could not remove that request. Nothing was changed.' }
  }
}
