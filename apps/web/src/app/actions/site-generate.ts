'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, siteGenerateTask, SiteGenerateInputSchema, type Mesh } from '@sahoda/mesh'
import { normalizeDraft, toRows } from '@sahoda/sites'
import { creditCost, MESH_TASK_ACTION, type WithCreditsFn } from '@sahoda/shared'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { reportServerError } from '@/lib/observability/report'
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'
import { newSiteGenerateRef } from '@/lib/sites/object-ref'
import { countSites } from '@/lib/sites/read'
import { draftSlug } from '@/lib/sites/slug'
import type { GenerateSiteState } from '@/lib/sites/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/** Model-input caps — same reasoning as plan-week's GOALS_MAX_CHARS. */
const NAME_MAX_CHARS = 80
const GOAL_MAX_CHARS = 500

/**
 * Entitlement refusal copy. All three are pre-HOLD, so the not-charged claim is
 * verifiable rather than hopeful — this is the payoff for gating before
 * `withCredits` rather than inside it.
 */
const NOT_GENERATED = 'Nothing was generated and you were not charged.'
const COUNT_UNREADABLE = `Couldn't check how many sites you already have. ${NOT_GENERATED} Reload and try again.`
const PLAN_UNREADABLE = `Couldn't check your plan just now. ${NOT_GENERATED} Try again in a moment.`

/** Alpha generates the homepage; more pages when the deploy half exists. */
const PAGES_V0 = 1

// Lazily-built singletons — see actions/plan-week.ts for why.
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

/**
 * Generate a site draft (100 cr, `site_generate`) and persist its tree. The
 * model call, `normalizeDraft` and ALL inserts run inside the `withCredits`
 * callback: any failure before the rows exist throws → HOLD released → "you
 * were not charged" is verifiably true. The insert spans three tables and is
 * NOT one statement, so a mid-way failure deletes the site row (pages/sections
 * cascade) before throwing — best-effort: an unpaid orphan draft is possible if
 * the cleanup itself fails, and that is the acceptable direction (an orphan
 * costs nothing; a charge without rows is the lie we refuse).
 *
 * PREVIEW ONLY: `sites.status` stays 'draft' and nothing here deploys — the
 * public *.sahoda.site half is deferred and unowned (see /sites page copy).
 */
export async function generateSite(name: unknown, goal: unknown): Promise<GenerateSiteState> {
  const action = MESH_TASK_ACTION['site_generate']
  // Hoisted so the outer catch can tag the tenant — see lib/observability/report.ts.
  // The two INNER catches sit inside the try and already have `workspace` in scope.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: 'Sign in to generate a site.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) {
      // `insufficient: false` because nothing was charged and nothing could be —
      // there is no wallet to charge. The MESSAGE is the part that was wrong: on
      // an unreadable read it told someone with a workspace to make another.
      return { ok: false, insufficient: false, message: ws.message }
    }
    const workspace = ws.workspace
    workspaceId = workspace.id

    // Parse BEFORE the callback — never reserve credits for garbage.
    const parsedInput = SiteGenerateInputSchema.safeParse({
      name: typeof name === 'string' ? name.trim().slice(0, NAME_MAX_CHARS) : name,
      goal: typeof goal === 'string' ? goal.trim().slice(0, GOAL_MAX_CHARS) : goal,
      pages: PAGES_V0,
      prompt: '',
    })
    if (!parsedInput.success) {
      return { ok: false, insufficient: false, message: 'Name your site first.' }
    }

    // ── ENTITLEMENTS GATE (owner ruling #5) ──────────────────────────────────
    // BEFORE `withCredits`, and before the objectRef that keys the ledger. A plan
    // refusal that arrives AFTER a hold is worse than no check at all: the customer
    // watches credits move for an action their plan was never going to allow, and
    // "you were not charged" stops being verifiable. Refusing here makes that claim
    // true by construction — no HOLD has been taken at this line.
    //
    // Free allows `sites: 0`, so before this gate existed a free workspace could
    // spend all 100 of its granted credits on the one thing its plan forbids.
    //
    // The count is REAL and passed in, never omitted — see the CALLER OBLIGATION on
    // `createCheckEntitlement` and the warning on `checkCountableLimit`. Omitting it
    // still refuses Free (`limit > 0` is false at 0) while admitting a Starter
    // workspace that already holds its single site, forever.
    //
    // ⚠ RESIDUAL TOCTOU, accepted in this lane. This counts and then inserts in
    // separate statements, so two concurrent generates on Starter can both read 0
    // and both insert. The gate's own doc names the only two remedies — count inside
    // the inserting transaction, or a DB constraint bounding rows per workspace. The
    // inserts below are three separate PostgREST calls (not one transaction), and
    // only wt-db may add a constraint. Neither is available here. Filed as F4 in
    // docs/ux-findings.md. The window is narrow and the failure is over-provisioning
    // a paid resource, not a charge for nothing.
    const siteCount = await countSites(workspace.id)
    if (siteCount === null) {
      // Fail CLOSED. An unreadable count must never read as zero — the same
      // unreadable-≠-zero rule `recentSites` already follows two files over.
      return { ok: false, insufficient: false, message: COUNT_UNREADABLE }
    }

    const limit = await checkCountableLimit(workspace.id, 'sites', siteCount)
    if (limit.kind === 'blocked') {
      return { ok: false, insufficient: false, message: `${limit.sentence} ${NOT_GENERATED}` }
    }
    if (limit.kind === 'unknown') {
      // The gate could not answer. Refuse, but say whose problem it is — naming a
      // plan we failed to read would send them to a pricing page for our outage.
      return { ok: false, insufficient: false, message: PLAN_UNREADABLE }
    }

    const objectRef = newSiteGenerateRef(workspace.id)
    const traceId = randomUUID()

    let failure: string | null = null
    let delivered = false
    let outcome = { siteId: '', slug: '', pages: 0, dropped: 0 }

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(siteGenerateTask.def, parsedInput.data, {
          workspaceId: workspace.id,
          traceId,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        })
        if (!result.ok) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }

        // maxPages mirrors the request: PAGES_V0 is otherwise only a prompt
        // instruction, and a model ignoring it would persist pages the panel
        // copy ("a one-page site draft") never promised.
        const normalized = normalizeDraft(result.data, {
          name: parsedInput.data.name,
          goal: parsedInput.data.goal,
          maxPages: PAGES_V0,
          traceId,
        })
        if (!normalized.ok || normalized.data.draft.pages.length === 0) {
          failure = FAILURE_REASON.NO_SITE
          throw new Error('NO_SITE') // → RELEASE: nothing usable is not a delivery
        }
        const { draft, dropped } = normalized.data

        // From here to the last insert, any throw is a save failure.
        failure = FAILURE_REASON.SITE_SAVE_FAILED

        const slug = draftSlug(parsedInput.data.name)
        const rows = toRows(draft, { workspaceId: workspace.id, slug, createdBy: userId })

        const supabase = createServerSupabase()
        const { data: siteRow, error: siteError } = await supabase
          .from('sites')
          .insert(rows.site)
          .select('id')
          .single()
        if (siteError || !siteRow) throw new Error('SITE_INSERT_FAILED')
        const siteId: string = siteRow.id

        try {
          const pageInserts = rows.pages.map(({ page }) => ({
            ...page,
            site_id: siteId,
            workspace_id: workspace.id,
          }))
          const { data: pageRows, error: pagesError } = await supabase
            .from('site_pages')
            .insert(pageInserts)
            .select('id, path')
          if (pagesError || !pageRows || pageRows.length !== pageInserts.length) {
            throw new Error('PAGES_INSERT_FAILED')
          }

          // page_id by path — bulk-insert row order is not a contract.
          const idByPath = new Map(pageRows.map((row) => [row.path as string, row.id as string]))
          const sectionInserts = rows.pages.flatMap(({ page, sections }) => {
            const pageId = idByPath.get(page.path)
            if (!pageId) throw new Error('PAGE_ID_MISSING')
            return sections.map((section) => ({
              ...section,
              page_id: pageId,
              workspace_id: workspace.id,
            }))
          })
          if (sectionInserts.length > 0) {
            const { data: sectionRows, error: sectionsError } = await supabase
              .from('site_sections')
              .insert(sectionInserts)
              .select('id')
            if (sectionsError || !sectionRows || sectionRows.length !== sectionInserts.length) {
              throw new Error('SECTIONS_INSERT_FAILED')
            }
          }
        } catch (insertError) {
          // Reported HERE and not left to the outer catch, which never sees this:
          // the re-throw below lands inside the withCredits callback, so the
          // wrapper converts it into a Result and `chargeFailureState` returns a
          // calm message. Without this call a three-table write failing halfway
          // through is completely silent.
          reportServerError(insertError, { action: 'generateSite:siteRowsInsert', workspaceId })

          // Delete the site row; pages/sections cascade. Best-effort — see doc.
          try {
            await supabase.from('sites').delete().eq('id', siteId)
          } catch (cleanupError) {
            // THE MOST IMPORTANT REPORT IN THIS FILE. This is a COMPENSATING
            // TRANSACTION that itself failed: the inserts did not complete and
            // the undo did not either, so a half-built site row is now stranded
            // in the database with nothing left to reconcile it. The re-throw
            // below still RELEASES the hold, so the row is unpaid — but it is
            // also invisible, and nobody finds an orphan by staring at a Result
            // envelope. This is the one failure here that needs a human.
            reportServerError(cleanupError, {
              action: 'generateSite:orphanCleanupFailed',
              workspaceId,
            })
          }
          throw insertError // → RELEASE, no charge
        }

        outcome = { siteId, slug, pages: rows.pages.length, dropped: dropped.length }
        // Last statement before return — past here the wrapper owns the outcome.
        delivered = true
        return outcome
      },
    )

    // Revalidate whenever the site EXISTS — including the lost-ack branch
    // (see plan-week.ts: a stale page under an unconfirmed-charge warning
    // invites the retry that double-charges).
    if (delivered) revalidatePath('/sites')
    // The credit chip lives in the layout, which a page-scoped revalidate
    // never reaches.
    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('site-generate', credits.error)
      // A mesh config throw inside the callback released the hold, so the
      // not-charged claim is verifiable. Never on the delivered path — there
      // the unconfirmed-charge warning must survive.
      if (!delivered && isDeploymentConfigCause(credits.error)) {
        return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
      }
      return chargeFailureState({ error: credits.error, action, delivered, reason: failure })
    }

    return {
      ok: true,
      ...outcome,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch (error) {
    reportServerError(error, { action: 'generateSite', workspaceId })
    reportPaidActionFailure('site-generate', error)
    // The billing env loader throws before any HOLD exists — config failures
    // caught here are verifiably uncharged, and a retry cannot fix them.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, insufficient: false, message: 'Could not generate the site. Try again.' }
  }
}
