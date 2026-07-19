import type { SiteRows } from './map/to-rows'
import type { SiteDeployState } from './deploy/port'

/**
 * The persistence port for the sites family — THE seam between @sahoda/sites and wt-web.
 * This package owns the interface; wt-web implements it with the service-role Supabase
 * client at the mount point. Nothing inside this package imports an implementation: every
 * function left of this port is pure, which is why the whole package tests without a DB.
 *
 * Implementations THROW on failure. They must NOT swallow errors and must NOT return a
 * plausible-looking id on a failed write — the caller catches and maps to a
 * PROVIDER_ERROR `Result`. A silent failure here strands a site the user believes exists.
 *
 * ── HARD REQUIREMENTS ────────────────────────────────────────────────────────────────
 *
 * 1. THE PUBLIC LEAD-FORM ROUTE MUST DERIVE `workspace_id` FROM THE SITE ROW, VIA THE
 *    REQUEST HOST/SLUG — NEVER FROM THE FORM PAYLOAD.
 *    `leads.site_id` is the only non-composite FK in the sites family: every other child
 *    table is bound by a composite `(parent_id, workspace_id)` FK that makes a mismatched
 *    tenant physically impossible. `leads` has no such guard. A forged `workspace_id` in a
 *    submitted form therefore writes a lead into an arbitrary workspace, and the database
 *    cannot stop it. The route is the only boundary. Look the site up by host/slug, read
 *    `workspace_id` off that row, and ignore any tenant field the client sent.
 *
 * 2. `leads` HAS NO INSERT POLICY — DELIBERATELY. The public form is unauthenticated, so
 *    the route inserts with the service role, which bypasses RLS entirely. That makes the
 *    route the whole security perimeter: verify Turnstile AND apply the rate limit BEFORE
 *    the insert, never after. (The TURNSTILE_* env keys are not yet provisioned — see
 *    REQUESTS.md item 2; the route must fail closed until they exist, never skip the check.)
 *
 * 3. `createSite` MUST INSERT site → pages → sections IN ONE TRANSACTION, AND OWNS ALL ID
 *    GENERATION. `SiteRows` deliberately omits `site_id`/`page_id`/`workspace_id` from the
 *    child rows: the implementation mints each parent id, stamps it and the workspace onto
 *    the children, and rolls the whole thing back on any failure. A partial insert leaves a
 *    site with no pages — a site that renders empty and reads as a successful generation.
 *
 * 4. `recordDeploy` MUST FILTER BY WORKSPACE AS WELL AS BY ID. The signature takes only
 *    `siteId`, so the implementation has to re-read the tenant off the site row and add
 *    `.eq('workspace_id', …)`; `sites` carries `unique (id, workspace_id)` to make that
 *    filter cheap. A service-role update keyed on `id` alone is one missing predicate away
 *    from writing deploy state onto another tenant's site.
 */

/**
 * The port's verb set as a RUNTIME value. `SiteStore` is a type and `import type` is erased
 * by esbuild, so without this constant `store.test.ts` would report green against a missing
 * `store.ts` and would be exercising only `resolveSlug` and `toRows`. Exporting one real
 * value makes the red step fail for the honest reason, and lets the test assert the seam is
 * exactly three verbs wide. Deliberately NOT re-exported from `src/index.ts` — it is a test
 * pin, not part of the public surface.
 */
export const SITE_STORE_METHODS = ['isSlugTaken', 'createSite', 'recordDeploy'] as const

export interface SiteStore {
  /**
   * True when `slug` is already used by ANY workspace. `sites.slug` is globally unique,
   * not per-tenant, so this probe must query without a workspace filter — a tenant-scoped
   * query returns false for a slug another tenant holds and the insert then fails on 23505.
   */
  isSlugTaken(slug: string): Promise<boolean>

  /**
   * Insert the site and all of its pages and sections transactionally; returns the new
   * site id. See hard requirement 3. Throw on failure.
   */
  createSite(rows: SiteRows): Promise<{ siteId: string }>

  /**
   * Persist deploy state onto `sites.deploy` (and `sites.last_deployed_at` when
   * `state.deployedAt` is non-null). Write `state` verbatim: `preview: true` means the URL
   * is NOT public, and dropping or rewriting that flag turns an honest preview into a fake
   * live site. Throw on failure.
   */
  recordDeploy(siteId: string, state: SiteDeployState): Promise<void>
}
