/**
 * Public surface of `@sahoda/sites`. Explicit named re-exports only — never `export *`.
 *
 * The package turns a generator's raw output into (a) rows for the frozen
 * `sites` / `site_pages` / `site_sections` schema and (b) a static HTML/CSS bundle, then hands
 * that bundle to a `Deployer`. It never calls a model, never touches a database and never calls
 * `fetch`: `IsSlugTaken`, `WriteBundleFile` and `Deployer` are the only seams, and the consumer
 * supplies all three.
 *
 * DELIBERATELY NOT EXPORTED — each with the reason, pinned by name in `index.test.ts`:
 *
 *   renderHero / renderFeatures / renderOffer / renderTestimonials / renderFaq / renderContact
 *   renderSection
 *       The per-kind renderers. `renderBundle` is the ONLY route to markup, because it is what
 *       guarantees every interpolation has gone through `render/escape.ts`. A directly callable
 *       renderer is an escape hatch around the security gate.
 *
 *   renderDocument / renderStylesheet / renderLeadForm
 *       Bundle-internal. A page rendered alone ships without its stylesheet; a form rendered
 *       alone posts to an unbound action. Neither has an honest standalone use.
 *
 *   renderLink / renderCta
 *       The package's single link-emitting path and its one caller. Exporting them hands a
 *       consumer a way to emit an anchor outside a section — the exact mistake `renderLink`
 *       exists to prevent.
 *
 *   normalizeSection / normalizePath / pathToFile / isBundleFilePath
 *       The raw normalizers. Reachable only through `normalizeDraft`, which is where path
 *       dedupe, the traversal guard and the page bound are applied. Exposing them lets a caller
 *       assemble a `SiteDraft` that skipped all three and still satisfies the type.
 *
 *   coerce, and the module-level limit / character-class constants in `render/escape.ts`
 *       Callers must pick a context-correct escaper, never a bare stringifier, and must not
 *       re-implement a limit check instead of calling the function that owns it.
 *
 *   appendHistory / DEPLOY_HISTORY_LIMIT
 *       History capping is the deployers' job; `SiteDeployStateSchema` is what a persisted
 *       value is checked against.
 *
 * NOT YET EXPORTABLE — the module does not exist on disk this wave, so there is nothing to
 * re-export: `createCloudflareDeployer` and the transports.
 *
 * DELIBERATELY NOT EXPORTED — the theme derivation internals (`parseOklch`, `formatOklch`,
 * `guardPrimaryForeground`, `BRAND_VAR_NAMES`, `brandSkinVars`). `themeCss` is the one public
 * theme entry: it owns the null path, the strict-parse fallback and the output-side gate, so a
 * consumer never needs to touch a raw colour value. Exposing the parts hands a caller a way to
 * emit an unguarded token string — the exact write-through the strict parse exists to prevent.
 */
export const SITES_PACKAGE = '@sahoda/sites' as const

// ── Escaping: the security gate. Every interpolation in this package goes through it, and the
// public lead route should use it for anything it echoes back. ─────────────────────────────
export { escapeHtml, escapeAttr, safeUrl, stripControl } from './render/escape'

// ── Normalization: untrusted generator output → a validated `SiteDraft`. ────────────────────
export { normalizeDraft } from './normalize/draft'
export type { SiteDraft, DraftPage } from './normalize/draft'

// ── Mapping: a draft → the frozen insert shapes. The store owns the foreign keys, which is
// why `SiteRowsPage` omits them. ───────────────────────────────────────────────────────────
export { toRows } from './map/to-rows'
export type { ToRowsOptions, SiteRows, SiteRowsPage } from './map/to-rows'

// ── Rendering: `renderBundle` is the ONLY supported route to markup. ────────────────────────
export { renderBundle } from './render/bundle'
export type { RenderContext } from './render/context'

/**
 * The field names the lead form emits, and therefore the exact set the public lead route may
 * accept. Exported as the contract between the two: a route that hard-codes its own list
 * silently drops a field the moment the form gains one.
 */
export { LEAD_FORM_FIELDS } from './render/form'

// ── Deploy: the port, the fixture deployer, and the runtime schemas for the `sites.deploy`
// jsonb column. The schemas ship as VALUES, not just types — types erase at runtime, and the
// consumer reading that column back out of Postgres needs something that actually checks. ──
export { createFixtureDeployer } from './deploy/fixture'
export { SiteDeployStateSchema, SiteDeployHistoryEntrySchema } from './deploy/port'
export type {
  Deployer,
  DeployContext,
  SiteBundle,
  BundleFile,
  SiteDeployState,
  SiteDeployHistoryEntry,
} from './deploy/port'

/**
 * `themeCss(tokens: ThemeTokens | null): string` — the Brand Skin derivation. `null` (the
 * common path — `workspace_themes` is never seeded) and any theme whose primary fails the
 * strict OKLCH parse both yield `''`, so the head falls back to the inlined tokens.css defaults
 * rather than a partial or unsafe `:root{}`. A populated, parseable theme emits exactly the
 * seven themeable vars (`--p --pfg --pstrong --acc --t50 --t100 --t300`), every colour
 * round-tripped through `formatOklch` so no stored string is ever written verbatim.
 */
export { themeCss } from './theme/css'

// ── Slugs. `slugify` alone is pure derivation; the reserved-word rejection and the -2/-3
// collision walk live in `resolveSlug`, which is what a consumer would otherwise hand-roll
// against a globally unique column. `IsSlugTaken` is the seam it asks. ─────────────────────
export { slugify, resolveSlug, RESERVED_SLUGS } from './slug'
export type { IsSlugTaken, ResolveSlugDeps } from './slug'
