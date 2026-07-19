# Sites v0 — Design

**Date:** 2026-07-19 · **Lane:** wt-pub · **Roadmap:** item 12 · **Status:** approved

> 12. **Sites v0**: prompt → sectioned page(s) → **real deploy** to `{slug}.sahoda.site` (Cloudflare) + contact form → `leads` + in-app alert.
> — `docs/05_Product_Roadmap_SAHODA_LABS.md:24`

**Alpha Gate DoD (Roadmap §5:70):** `☐ Site live at {slug}.sahoda.site; form creates a lead`, plus the gate-wide `☐ No fake states anywhere`.

---

## 1. Scope and boundary

Sites v0 turns a `site_generate` mesh output into (a) rows in the frozen `sites` / `site_pages` / `site_sections` schema and (b) a static HTML/CSS bundle themed with the workspace's tokens, then hands that bundle to a `Deployer`.

**New package: `packages/sites` (`@sahoda/sites`).** Source-only, deps `@sahoda/shared` + `zod`, mirroring `packages/publishing`: no build step, no vitest config, colocated `*.test.ts`, per-package `CLAUDE.md`.

Why not the alternatives:

- **`packages/render` is not available.** It is an empty placeholder — one 336-byte README whose text reads *"The Studio renderer (Satori/ResVG + node-canvas, zero-COGS exports) is post-Alpha backlog item #7. This directory is a placeholder... Do not build here during the Alpha sprint."* Its documented owner is raster/image export for social creatives (docs/03 §2, docs/02 §3.4), a different concern with a native-binary dependency profile (`@resvg/resvg-js`, `canvas`) that a pure-string HTML compiler must not inherit. It has no `package.json`, so pnpm/turbo/tsc cannot see it at all.
- **`packages/publishing` is the wrong domain.** Its charter is the Constraint Engine + `PublishAdapter` + AES token vault. A site has no `Channel` — and `AdapterError` structurally requires `channel: Channel`, so the lane's own error type does not fit. The only argument for it is that TSD §8 is titled "Publishing Layer & Sites Hosting", which is doc organization, not an architectural claim.

**Ownership note:** Roadmap §4's worktree map has no `wt-sites` and lists wt-pub as owning "packages/publishing + OAuth routes". Creating `packages/sites` from wt-pub is an authorized scope expansion, confirmed by the founder on 2026-07-19.

### Hard boundaries

`packages/sites` **never** calls mesh, touches a database, or calls `fetch` directly. It consumes a `SiteGenerateOutput` someone else already paid for, and produces rows + bytes. The caller (wt-web) runs `site_generate` inside `withCredits`. Everything left of a port is a pure function — which is the only reason the publishing lane reached 113 green tests with zero API calls, and the same property is what makes the escaping gate below testable.

Off-limits this lane: `apps/web` (wt-web mounts the UI), `packages/db` (only wt-db authors migrations).

---

## 2. Frozen contracts consumed

### Input — `SiteGenerateOutputSchema` (`packages/shared/src/mesh/tasks.ts:64-80`)

```ts
export const SiteGenerateOutputSchema = z.object({
  pages: z.array(z.object({
    path: z.string(),
    title: z.string(),
    seo: z.object({ description: z.string() }).optional(),
    sections: z.array(z.object({
      kind: SectionKindSchema,
      content: z.record(z.string(), z.unknown()),
    })),
  })),
})
```

`site_generate` is `tier: 'premium'`, `cachePrefix: 'brand_context'`, **no `fallbackPayload`** — a double JSON failure returns `ok:false` + `PROVIDER_ERROR`, so consumers never see `fallback: true` on this task. Price: `site_generate: 100` credits (`pricing.config.json:26`).

> The `.claude/agents/sites-agent.md` claim of "standard tier" is **stale**; the shipped code says `premium` in both `site-generate.ts:29` and `routing.ts:36`, and TSD §4 agrees. Code wins.

### Output — the frozen tables (`packages/db/supabase/migrations/20260718000007_sites.sql`)

| table | notable constraints |
|---|---|
| `sites` | `slug` NOT NULL **globally unique** (not per-workspace); `status` CHECK `draft\|deploying\|published\|failed\|unpublished`; `theme` / `deploy` untyped jsonb; `unique (id, workspace_id)` |
| `site_pages` | `unique (site_id, path)`; composite FK `(site_id, workspace_id)` → `sites`; `unique (id, workspace_id)` |
| `site_sections` | `kind` CHECK `hero\|features\|offer\|testimonials\|faq\|contact`; `content` jsonb **NOT NULL**; composite FK `(page_id, workspace_id)`; **no** `unique (id, workspace_id)`, **no** unique on `(page_id, sort)` |
| `leads` | `site_id` is the **only non-composite FK** in the family; **no INSERT policy, no DELETE policy** — inserts are service-role only |

Row schemas come from `packages/shared/src/db/sites.ts` and are never redefined. Note `SiteInsertSchema` requires **both** `slug: z.string().min(1)` and `created_by: z.string().min(1)`, so slug generation is a hard precondition of the first insert, not an afterthought.

**Four of TSD §9's eight site tables do not exist:** no `site_deployments`, `site_domains`, `site_forms`, or `site_events`. Deploy state therefore has exactly two homes — `sites.deploy jsonb` and `sites.last_deployed_at` — and the "keep last 5 bundles" promise (TSD §8) has no schema backing.

### Theme

Two parallel, non-isomorphic representations:

| | CSS layer | TS/DB layer |
|---|---|---|
| file | `packages/shared/tokens.css` (exported as `@sahoda/shared/tokens.css`) | `packages/shared/src/theme/tokens.ts` |
| names | `--p --pfg --pstrong --acc --t50 --t100 --t300` + fixed neutrals/semantics/shape | `primary primaryFg secondary accent surface[4] text{hi,mid,low} border …` |
| values | hex literals | OKLCH strings |

`workspace_themes` (`…000008_experience_ops.sql:5-23`) holds `tokens jsonb` with a partial unique index on `(workspace_id) where status='active'`. **It is never seeded** — the seed migration contains zero `workspace_themes` rows.

---

## 3. Architecture

```
SiteGenerateOutput
      │  normalize()          tolerant · hostile-input-safe · pure
      ▼
   SiteDraft ──────┬──── toRows() ──▶ {SiteInsert, SitePageInsert[], SiteSectionInsert[]} ──▶ [SiteStore]
                   │
                   └──── render(draft, theme) ──▶ SiteBundle ──▶ [Deployer] ──▶ DeployState
```

`SiteStore` and `Deployer` are the only async seams. Both follow the `ConnectionStore` precedent: this package owns the interface, wt-web implements it at the mount point.

### File layout

```
packages/sites/
  CLAUDE.md                  three non-negotiables
  REQUESTS.md                cross-lane asks (see §9)
  package.json  tsconfig.json
  fixtures/
    mesh/site-generate.{full,minimal,hostile,empty}.json
    cloudflare/{upload,dispatch}.{success,unauthorized,rate-limited,server-error}.json
  src/
    index.ts                 explicit named re-exports only
    normalize/
      section-content.ts     per-kind tolerant schemas → narrowed types
      draft.ts               SiteGenerateOutput → SiteDraft
      path.ts                path normalization + traversal guard
    slug.ts                  candidate derivation + reserved words + resolveSlug()
    map/to-rows.ts           SiteDraft → insert rows
    theme/
      oklch.ts               ported pure color math
      readability.ts         contrast guard
      css.ts                 ThemeTokens → the 7 brand CSS vars
    render/
      escape.ts              ★ the security gate
      document.ts            HTML shell, head, inlined tokens.css, theme block
      form.ts                contact-form markup
      sections/{hero,features,offer,testimonials,faq,contact}.ts
    deploy/
      port.ts                Deployer type, SiteDeployState schema
      fixture.ts             local preview writer, honestly labeled
      cloudflare.ts          Workers for Platforms, fixture-tested
    store.ts                 SiteStore port
```

Files stay under 300 lines (root CLAUDE.md); one section renderer per file.

---

## 4. Normalization — the model's output is advisory

`site_sections.content` is `z.record(z.string(), z.unknown())`. There is **no per-kind shape anywhere in the repo**; the only guidance is a prose hint in the mesh system prompt (*"each section's content holds its copy (e.g. headline, subhead, body, items)"*). That is a hint to the model, not a contract.

**Decision: per-kind tolerant zod schemas local to `packages/sites`.** Every field optional with coercion; the normalizer returns a narrowed type plus a `dropped: string[]` list. A hero missing a subhead renders without one; `items` arriving as a string becomes a one-item list; unknown fields are dropped, not fatal.

Rejected: promoting the shapes to `@sahoda/shared`. That makes them a frozen cross-package contract requiring a `[contract]` PR **and** a matching mesh prompt change owned by wt-mesh — a cross-worktree dependency mid-sprint. Local first; promote post-Alpha if a second consumer appears (the precedent wt-billing set with `PaymentProvider`, ruling #2).

### Invariants zod does not enforce — all consumer responsibility

The mesh prompt asserts these; `SiteGenerateOutputSchema` does not. Each is enforced in `normalize/draft.ts`:

| # | invariant | failure if unenforced | handling |
|---|---|---|---|
| 1 | unique `path` per site | second insert violates `unique(site_id, path)` — a hard 23505 | dedupe, keep first, record in `dropped` |
| 2 | page count ≤ requested | unbounded array (contrast `PlanWeekOutputSchema` which uses `.length(5)`) | truncate to the requested count |
| 3 | non-empty `pages` / `sections` | `{"pages":[]}` parses clean → an empty site deploys | reject with `VALIDATION_ERROR` |
| 4 | `"/"` page leads with a hero | prompt-only; a `/` starting with `faq` parses | reorder is **not** attempted; recorded in `dropped` only |
| 5 | `path` is bare `z.string()` | `""`, `../etc`, no leading slash all legal | normalize (§4.1) |
| 6 | `title` has no `.min(1)` | empty `<title>` | fall back to site name |

Ordering: `sort = array index`, since mesh emits position only. The DB permits duplicate `sort` values and has no tiebreaker, so the mapper is the sole ordering authority; readers must `order by sort, created_at`.

### 4.1 Path normalization — a traversal guard

`path` becomes a filename in the bundle, so it is untrusted input at a filesystem boundary. Normalization: trim → force a single leading `/` → collapse repeated slashes → strip trailing slash (except root) → lowercase → reject any segment that is `.` or `..` or contains a path separator, NUL, or a control character → cap length. `""` → `/`. A path that cannot be normalized is dropped, not coerced into something plausible. `/` maps to `index.html`; `/about` to `about/index.html`.

---

## 5. The escaping invariant — a security gate

**This is the most important property in the package.** Model-generated copy is rendered into a document that ships to a customer's live domain. A prompt-injected `<script>` reaching that page is the worst failure mode available here: it executes in the tenant's origin, on their visitors.

Rules, non-negotiable:

1. **Every interpolation passes through `escape.ts`.** No exceptions, no raw-HTML pass-through, no `dangerouslySet`-equivalent escape hatch anywhere in the package.
2. **Context-correct escaping.** Text nodes, attribute values, and URL attributes have different rules; `escapeHtml`, `escapeAttr`, and `safeUrl` are separate functions. `safeUrl` allows only `http:`, `https:`, `mailto:`, and `tel:` — `javascript:` and `data:` are rejected, and a rejected URL drops the link rather than emitting a dead or dangerous one.
3. **No model-supplied string reaches `<style>`, `<script>`, or an event-handler attribute.** Ever. The generated document contains no inline JavaScript at all in v0 — the contact form is a plain HTML `POST`, which removes the entire class.
4. **Theme values are validated, not interpolated.** OKLCH strings from `workspace_themes.tokens` go into a CSS custom property, so they are checked against a strict pattern before emission; anything unparseable falls back to the token default rather than being written through.

The escaping suite is written **first**, before any renderer, and treated as a gate: a failure there blocks the package, not just the file.

---

## 6. Theme → CSS

`ThemeTokens` is lossy against the CSS layer — it has **no field for `--pstrong`, `--t50`, `--t100`, `--t300`**. The existing mapper `themeTokensFrom(colors)` (`apps/web/src/lib/brand/brand-theme.ts:119`) runs the other direction.

**Approach:** inline `tokens.css` verbatim into `<head>` as the baseline, then emit a second `:root{…}` block overriding only the seven brand vars derived from the workspace's active theme. Pure string work, zero `apps/web` import.

Re-derivation formulas, ported from the proven implementation (`brand-theme.ts:69-92`):

```
pstrong = oklch(l - 0.1, c, h)
t50     = oklch(0.97, min(c, 0.02), h)
t100    = oklch(0.93, min(c, 0.05), h)
t300    = oklch(0.78, clamp(c, 0.08, 0.16), h)
```

The OKLCH math (`rgbToOklch`, `oklchToRgb`, `formatOklch`, `parseOklch`, `relativeLuminance`, `contrastRatio`) is ported from `apps/web/src/lib/brand/oklch.ts` — it is dependency-free pure math, and porting is the only legal move since apps/web is off-limits this lane. `color-extract.ts` is **not** ported: it uses `document` and is browser-only.

Traps designed around:

- **`--pfg` is not a color.** `brandSkinVars` emits the literal string `'var(--ink)'` or `'white'`. Valid only because `tokens.css` (which defines `--ink`) is inlined in the same document.
- **No active theme is the default path**, not an edge case, because `workspace_themes` is never seeded. Unthemed renders emit `tokens.css` alone with no override block — a first-class branch with its own test.
- **`parseOklch` accepts only `oklch(L C H)`** space-separated — no `%`, no alpha, no hex. Guard the parse; fall back on failure.
- **Readability Guard** applies to the `--p`/`--pfg` pair exactly as in apps/web: darken the primary in steps until white or `var(--ink)` clears 4.5:1, pick the better, near-black+white fallback for pathological inputs.
- **Never pair `--acc` on a `--t50`/`--t100` surface.** In dark, tints stay warm-light while `--acc` flips to Orange300 (~1.7:1). Swap to `--s2` in dark.
- Generated sites use **Outfit** (docs/07 Brand Kit:62) and are **fully responsive always** (docs/06 §4.6).

---

## 7. Deployment

```ts
export type Deployer = (bundle: SiteBundle, ctx: DeployContext) => Promise<Result<SiteDeployState>>
```

**`fixtureDeployer` is the default.** It writes the bundle to a local directory and returns `{ preview: true, url: 'file://…' }`. `preview: true` means *this is not a public URL*; it is a **required** field on `DeployState` so it cannot be forgotten, and the UI must surface it. This is the honest-labeling mechanism for the whole feature.

**`cloudflareDeployer`** is written in full against recorded fixtures — real Workers-for-Platforms upload logic, zero live calls in tests, matching how the X and GBP adapters shipped. When `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_ZONE_ID` are absent it returns a typed error, **never a fake success**. Enabling it later is credentials, not code.

The anti-fake-deploy rule is repeated in four canon docs and is the load-bearing constraint here: TSD §2 *"kills the fake-deploy problem"*; PRD:38 *"real website hosting & deploys (no simulated Netlify URLs)"*; `sites-agent.md` *"live URL returned immediately, honestly (no fake links, ever — that was v1's sin)"*.

Base domain (`sahoda.site`, per `NEXT_PUBLIC_SITE_DOMAIN` in docs/12 §7) is **injected config, never hardcoded**, so a wrong or unregistered domain cannot produce a plausible-looking URL from inside the renderer.

### `sites.deploy` — a shape this design invents

Nothing in the repo defines it, and `site_deployments` does not exist, so:

```ts
export const SiteDeployStateSchema = z.object({
  deployer:   z.enum(['fixture', 'cloudflare']),
  status:     z.enum(['pending', 'live', 'failed']),
  preview:    z.boolean(),              // true ⇒ NOT a public URL
  url:        z.string().nullable(),    // null unless genuinely reachable
  bundleId:   z.string(),               // content hash
  scriptName: z.string().nullable(),    // CF worker name
  deployedAt: z.string().nullable(),
  error:      z.object({ code: z.string(), message: z.string() }).nullable(),
  history:    z.array(SiteDeployHistoryEntrySchema).max(5),
})

export const SiteDeployHistoryEntrySchema = z.object({
  bundleId:   z.string(),
  deployedAt: z.string(),
  url:        z.string().nullable(),
  preview:    z.boolean(),
})
```

`history` carries the last 5 bundles so the TSD §8 rollback promise is not schema-blocked later. **The field is built; rollback itself is not** — it is absent from Roadmap item 12. Local to this package now, flagged for `@sahoda/shared` promotion post-Alpha.

Site status transitions: `draft → deploying → published | failed`, mapping onto the frozen CHECK.

---

## 8. What wt-web must implement

Two ports, documented in the same style as the `ConnectionStore` contract.

### `SiteStore`

```ts
export interface SiteStore {
  isSlugTaken(slug: string): Promise<boolean>
  createSite(rows: SiteRows): Promise<{ siteId: string }>
  recordDeploy(siteId: string, state: DeployState): Promise<void>
}
```

Implementations throw; the caller maps to a `Result`. Slug resolution is `resolveSlug(name, isTaken)` with the predicate injected, so collision logic is fully testable with a fake and the **global** unique index is respected. Candidates: ascii-folded slugified name → `-2` … `-9` → then a short random suffix, retried at most 5 times, after which `resolveSlug` returns a typed `VALIDATION_ERROR` rather than looping. The bound is explicit so the function always terminates against an adversarial or broken predicate. Reserved words (`www`, `app`, `api`, `admin`, `mail`, `cdn`, `static`, …) are rejected before the first probe.

### `leadFormContract`

The package emits the form markup; wt-web mounts the public route. The contract states, as a hard requirement:

> **The endpoint must derive `workspace_id` from the site row via the request Host/slug — never from the form payload.** `leads.site_id` is the only non-composite FK in the family, so a forged `workspace_id` in a submitted form would write a lead into an arbitrary workspace. The DB cannot stop this; the route is the only boundary.

Also specified: `leads` has no INSERT policy, so the route uses the service role; Turnstile verification and rate limiting are required before insert (see §9 — the Turnstile key is not provisioned).

---

## 9. Filed, not absorbed → `packages/sites/REQUESTS.md`

1. **RLS tests missing for the entire sites family.** `packages/db/tests/rls.test.ts` has no anon-client test for `sites`, `site_pages`, `site_sections`, `leads`, or `workspace_themes`. Root CLAUDE.md requires one per table; this will trip the `/ship` gate. **Owner: wt-db.**
2. **`TURNSTILE_*` env keys do not exist.** Four docs assert Turnstile anti-spam on the lead form — including the `leads` migration comment itself — but `docs/12_Build_Companion` §7 `.env.example` provisions no key. The form route cannot spam-check without one. **Owner: founder / wt-web.**
3. **Free-site entitlement unimplemented.** FSD M6 specifies 100 cr + "1 free site/quarter on paid plans"; PRD §7.1 says Free = "0 (preview only)"; PRD §10 still lists this as an open question. Nothing implements a quota. v0 ships the debit path only (the Alpha Gate requires it) and does not fake the quota. **Owner: wt-billing.**

---

## 10. Test plan — tests first, in this order

| # | suite | what it pins |
|---|---|---|
| 1 | `render/escape.test.ts` | **the security gate** — `<script>`, `"` `'` `<` `>` `&` in text/attr context, `javascript:` and `data:` URLs, unicode/bidi tricks, an injected event-handler attribute. Written before any renderer exists. |
| 2 | `normalize/*.test.ts` | hostile fixtures: empty `pages`, duplicate paths, `..` and `""` paths, 50 pages against a request of 2, `items` as a string, missing every optional field, junk keys |
| 3 | `slug.test.ts` | reserved words, collision walk, unicode folding, length cap, termination under a permanently-taken predicate |
| 4 | `map/to-rows.test.ts` | `sort = index`, workspace binding on every row, conformance to `SiteInsertSchema` / `SitePageInsertSchema` / `SiteSectionInsertSchema` |
| 5 | `theme/*.test.ts` | no-active-theme fallback, all 7 vars emitted, re-derivation formulas, contrast guard never returns a pair below 4.5:1, unparseable OKLCH falls back |
| 6 | `render/*.test.ts` | document shell, each of the six section kinds, graceful degradation on missing fields, form markup, responsive meta |
| 7 | `deploy/*.test.ts` | fixture honesty (`preview: true`, no public URL claimed), CF against recorded fixtures, typed error when unconfigured, and an explicit **no-network assertion** |

Style follows the lane: no mocking library, no `vi.mock` — hand-written closures, fixtures imported as JSON, a frozen `FIXED_NOW` injected via `now: () => FIXED_NOW`, builders taking `Partial<T>` overrides spread last, and test names that state behavior plus why.

---

## 11. Out of scope

Per Roadmap §6 and FSD M6: custom domains (**leave the seam, don't build it** — backlog #11), section editor / chat edit / undo, site analytics, code export, SEO-blog agent, Hindi output, public API + MCP tools, Studio renderer, WhatsApp lead alerts (v0 is in-app), AI follow-up drafts, rollback UI.

Roadmap §7 note: Sites v0 is the 4th item cut if the sprint slips, and Cloudflare tooling is time-boxed at 90 minutes before falling back to a static export on a wildcard subdomain. The `Deployer` port is what makes that fallback a new file rather than a rewrite.
