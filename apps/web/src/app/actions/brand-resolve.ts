'use server'

import { auth } from '@clerk/nextjs/server'
import {
  BrandIntakeSchema,
  BrandMemoryPayloadSchema,
  ResolveBrandMemoryResultSchema,
  type BrandIntake,
} from '@sahoda/shared'

import { nextFieldMeta } from '@/lib/brand/field-meta'
import { pruneBlankListEntries } from '@/lib/brand/prune-blank-entries'
import { readBrain } from '@/lib/brand/read-brain'
import { mapSaveBrandError } from '@/lib/brand/save-brand-error'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * The Brand Brain WRITE path, and nothing else.
 *
 * `resolveBrand` used to live here — the 50-credit `brand_research` entry point
 * for the Spark screen. Both are gone: `resolveOnboarding` is now the only
 * charged resolve, and it owns the doors. A `'use server'` export is a callable
 * RPC whether or not any UI references it, so leaving a second charging endpoint
 * standing "just in case" would leave a second way to spend a customer's credits
 * with nothing on screen able to explain it.
 */

export type SaveBrandState =
  { ok: true; version: number; replayed: boolean } | { ok: false; message: string }

/**
 * Who wrote this version. Three values, and each one is load-bearing:
 *
 *   `manual`   — a person. It selects which provenance rule applies to every
 *                field (lib/brand/field-meta.ts), so a hand-edit saved as
 *                `resolved` renders the user's own sentence as a machine guess.
 *   `resolved` — a genuine model resolve of THIS brand.
 *   `system`   — a demo fallback. `packages/shared/src/brand/resolve.ts` states
 *                the contract: a fallback "persists with `source='system'` and a
 *                visible notice — never presented as a genuine resolve". This
 *                once hardcoded `'resolved'`, survivable only while nothing could
 *                re-save a fallback; onboarding now loads a saved brain and
 *                offers Approve on it, so a sample could be approved straight
 *                back in as a real resolve — laundering the one flag that says it
 *                is not the user's brand.
 *
 * A closed union rather than a raw string: the RPC rejects anything outside its
 * three values anyway, and this keeps a caller from naming one it has not
 * thought about.
 */
export type SaveBrandSource = 'resolved' | 'manual' | 'system'

/**
 * The two sources ONBOARDING can produce. It never writes `manual` — the reveal
 * either approves what the model returned or approves a served sample, and
 * per-field authorship there is carried by `confirmPaths`, not by this.
 *
 * A narrowed alias rather than a second union, so it cannot drift from the set
 * the RPC accepts. (Type exports are erased, so they are legal from a
 * `'use server'` module — only runtime exports must be async functions.)
 */
export type BrandMemorySource = Extract<SaveBrandSource, 'resolved' | 'system'>

/**
 * Persist the (possibly hand-edited) Brand Brain via `public.resolve_brand_memory`
 * — the one client-reachable write into `brand_memory` (the table is read-only
 * under RLS). Called with THREE arguments on purpose: omitting the optimistic
 * `p_expected_version` skips the compare-and-set, so a rage-click on Finish
 * replays the already-active payload as a success instead of raising
 * VERSION_CONFLICT. Identity and membership are derived from the JWT inside the
 * function; we still zod-parse both directions at this boundary.
 *
 * This writes only. It never calls the mesh and never charges.
 */
export async function saveBrandMemory(
  brain: unknown,
  source: SaveBrandSource = 'resolved',
  /** Fields this write confirms outright — see `nextFieldMeta`. */
  confirmPaths: readonly string[] = [],
  /**
   * The onboarding picks, when THIS write is the one that learned them.
   *
   * `null` means "say nothing about the intake", and it is the right answer for
   * every caller except onboarding: a single-field edit from /brain knows
   * nothing about the customer's trade and must not be able to speak for it.
   *
   * ── WHY NULL CANNOT ERASE ────────────────────────────────────────────────
   * `BrandMemoryPayloadSchema` has no `intake` key, so the parse below strips
   * any that arrives on `brain` — which means every save would drop a stored
   * intake unless it is deliberately carried forward. It is, from the row being
   * replaced. Without that, one hand-edit of a tagline would silently return a
   * clinic to the floor pack, and nothing on any screen would say so.
   *
   * The default is `null` rather than required-in-position only because two
   * optional parameters already precede it. The default is the IDENTITY —
   * it never writes and never erases — so a call site that forgets it loses a
   * new intake at worst and can never destroy a stored one.
   */
  intake: BrandIntake | null = null,
): Promise<SaveBrandState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save your Brand Brain.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }
    workspaceId = workspace.id

    const parsed = BrandMemoryPayloadSchema.safeParse(brain)
    if (!parsed.success) {
      return { ok: false, message: 'That Brand Brain is incomplete. Check the cards and retry.' }
    }

    // Prune AFTER validation: the schema pins the three fixed arrays at exactly 3,
    // and pruning only shortens the two open lists (which have no minimum). Blank
    // rows are cheap to create in the editor but permanent once saved — mesh
    // prepends the active brain to every model call.
    const payload = pruneBlankListEntries(parsed.data)

    // Provenance is stamped against the brain being REPLACED, so both rules can
    // be applied: a confirmation survives only where the new text matches what
    // the owner already agreed to. The comparison must run on the PRUNED payload
    // — an unpruned candidate differs from a pruned predecessor in the two
    // open-ended lists alone, which would revert those fields to guesses on every
    // save for a reason the user never caused.
    //
    // A `system` save names no confirmPaths, so a demo fallback lands with all
    // fifteen fields unconfirmed. That is the correct reading: nobody agreed to
    // a sample, least of all to one of a brand that is not theirs.
    const previous = await readBrain()
    const fieldMeta = nextFieldMeta(
      previous.status === 'ok' ? { payload: previous.active, meta: previous.meta } : null,
      payload,
      confirmPaths,
    )

    // Carried forward when this write has nothing to say about it — see the
    // `intake` parameter. Validated on the way through so a malformed stored
    // value is dropped rather than re-persisted for ever.
    const carried = previous.status === 'ok' ? previous.intake : null
    const nextIntake = BrandIntakeSchema.safeParse(intake ?? carried)

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('resolve_brand_memory', {
      p_workspace_id: workspace.id,
      p_payload: {
        ...payload,
        field_meta: fieldMeta,
        ...(nextIntake.success ? { intake: nextIntake.data } : {}),
      },
      p_source: source,
    })
    if (error || !data) return { ok: false, message: mapSaveBrandError(error) }

    const result = ResolveBrandMemoryResultSchema.safeParse(data)
    if (!result.success) {
      return { ok: false, message: 'Saved, but the response was unreadable. Reload to confirm.' }
    }
    return { ok: true, version: result.data.version, replayed: result.data.replayed }
  } catch (error) {
    reportServerError(error, { action: 'saveBrandMemory', workspaceId })
    return { ok: false, message: 'Could not save your Brand Brain. Try again.' }
  }
}
