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
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'
import { newSiteGenerateRef } from '@/lib/sites/object-ref'
import { draftSlug } from '@/lib/sites/slug'
import type { GenerateSiteState } from '@/lib/sites/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/** Model-input caps — same reasoning as plan-week's GOALS_MAX_CHARS. */
const NAME_MAX_CHARS = 80
const GOAL_MAX_CHARS = 500

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
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: 'Sign in to generate a site.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) {
      return { ok: false, insufficient: false, message: 'Create a workspace first.' }
    }

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

    const objectRef = newSiteGenerateRef(workspace.id)
    const traceId = randomUUID()

    // TODO(owner ruling #5): entitlements gate BEFORE withCredits, once
    // @sahoda/billing ships the helper — same note as posts-ai/plan-week.
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
          // Delete the site row; pages/sections cascade. Best-effort — see doc.
          try {
            await supabase.from('sites').delete().eq('id', siteId)
          } catch {
            // The orphan is unpaid; the RELEASE below is what matters.
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
    reportPaidActionFailure('site-generate', error)
    // The billing env loader throws before any HOLD exists — config failures
    // caught here are verifiably uncharged, and a retry cannot fix them.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, insufficient: false, message: 'Could not generate the site — try again.' }
  }
}
