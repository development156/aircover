# Sites mount contract — the `SiteStore` port and the wt-web mount

**Status:** normative for wt-web. **Package:** `@sahoda/sites` (pure library — no Supabase client,
no `next/*`, no env reads). **Schema of record:**
`packages/db/supabase/migrations/20260718000007_sites.sql`. **Row/insert zod:**
`@sahoda/shared/db/sites`.

This spec gives wt-web everything needed to mount `@sahoda/sites` without reading the sites-v0 plan.
The five persistence/routing rulings are NOT restated here — `packages/sites/CLAUDE.md` is their
single normative source (§1–§5) and this spec references it so the two cannot drift. Where CLAUDE.md
was corrected against the real schema, that correction is carried below.

Every public export named here is verified present on the package surface in
`packages/sites/src/index.ts` (and pinned by `src/index.test.ts`).

---

## 1. The `SiteStore` port

`import type { SiteStore } from '@sahoda/sites'` — a **type only**. The package owns the interface;
wt-web implements it with the **service-role** Supabase client at the mount point. Nothing inside the
package imports an implementation, which is why the whole package tests without a database.

```ts
interface SiteStore {
  isSlugTaken(slug: string): Promise<boolean>
  createSite(rows: SiteRows): Promise<{ siteId: string }>
  recordDeploy(siteId: string, state: SiteDeployState): Promise<void>
}
```

The seam is **exactly three verbs** — pinned at runtime by `SITE_STORE_METHODS` inside the package's
`store.test.ts` (a test pin, deliberately not on the public surface). `SiteRows` comes from
`toRows`; `SiteDeployState` is the shape of the `sites.deploy` jsonb column. All three methods
**THROW on failure** — they must not swallow errors and must not return a plausible-looking id on a
failed write. The caller catches and maps to a typed `PROVIDER_ERROR` `Result`; a silent failure
here strands a site the user believes exists.

### `isSlugTaken(slug)`

True when `slug` is used by **any** workspace. `sites.slug` is **globally unique**, not per-tenant
(`slug text not null unique` — migration line 9), so this probe must query **without** a
`workspace_id` filter. A tenant-scoped query returns `false` for a slug another tenant holds, and the
insert then fails on a `23505` unique violation. See CLAUDE.md §1.

### `createSite(rows)` — one transaction, store owns all ids

Insert `sites` → `site_pages` → `site_sections` **atomically**, and mint **every** id. `SiteRows`
(from `toRows`) deliberately omits `site_id` / `page_id` / `workspace_id` from the child rows: the
implementation inserts the parent, reads back the generated uuid, and stamps it plus the workspace
onto the children. Roll the whole thing back on any failure. A partial insert leaves a `sites` row
with no pages — a blank host on a live slug that reads as a successful generation. The composite FKs
`(site_id, workspace_id)` (migration line 35) and `(page_id, workspace_id)` (line 49) mean the
tenant binding on a child must match the parent row actually written, so the store, not the mapper,
is the only place that can supply them. See CLAUDE.md §3.

### `recordDeploy(siteId, state)` — workspace-scoped UPDATE

There is **no deploy table** (correction, below). Deploy state lives in `sites.deploy` (jsonb, migration
line 14), with `sites.last_deployed_at` (line 15) and `sites.status` (lines 11–12). So `recordDeploy`
is an **`UPDATE` on `sites`**, not an insert: write `state` verbatim onto `sites.deploy`, and set
`last_deployed_at` when `state.deployedAt` is non-null. The signature takes only `siteId`, so the
implementation must re-read the tenant off the site row and add `.eq('workspace_id', …)` alongside
`.eq('id', siteId)`. Under the service role a bare `id` predicate writes any tenant's row;
`sites` carries `unique (id, workspace_id)` (line 19) to make that filter cheap. Write `state`
byte-for-byte — dropping or rewriting `preview` turns an honest preview into a fake live site. See
CLAUDE.md §4.

---

## 2. The end-to-end mount flow (site creation)

Every step names a public export of `@sahoda/sites`. wt-web owns the glue; the package supplies each
transform.

1. **Request** arrives (authenticated founder action) with the generator's raw draft output and the
   caller's `workspaceId` / `createdBy` (Clerk subject).
2. `normalizeDraft(raw)` → `{ draft, dropped }`. **Render `dropped`** to the founder — never swallow
   it (CLAUDE.md §6). `draft` is a validated `SiteDraft`.
3. `resolveSlug(draft.name, isTaken, traceId)` where `isTaken` is
   `(slug) => store.isSlugTaken(slug)` (the `IsSlugTaken` seam). Returns `Result<string>`. A throwing
   or non-boolean predicate is already funnelled to a **scrubbed** `PROVIDER_ERROR` inside
   `resolveSlug` — the raw driver message (which can carry the connection string) never escapes, so
   do not re-wrap or interpolate it. On `!ok`, stop and surface the error.
4. `toRows(draft, { workspaceId, slug: slugResult.data, createdBy })` → `SiteRows`. Tenancy comes
   **only** from the options here, never from the draft; the child rows omit their FKs by design.
5. `store.createSite(rows)` → `{ siteId }` (transactional; store mints the id). Wrap the call in
   `try/catch` and map a throw to `PROVIDER_ERROR`. **TOCTOU:** the global `sites.slug` index is only
   observed by step 3, not held, so treat a Postgres `23505` on `sites.slug` as **recoverable** —
   call `resolveSlug` again (its next walk steps past the now-taken slug) rather than crashing.
6. `renderBundle(draft, ctx)` → `SiteBundle`, where `ctx: RenderContext` carries `siteName`,
   `tokensCss`, `theme` (a `ThemeTokens | null`; `null` is the common path), `formAction` (the lead
   endpoint, e.g. `/api/leads`, or `null` for no form) and `canonicalOrigin`. `renderBundle` is the
   **only** supported route to markup — every interpolation runs through the escape gate. Derive the
   theme CSS with `themeCss(theme)` for the injected `tokensCss` / head.
7. `deployer(bundle, deployCtx)` where `deployer = createFixtureDeployer({ outDir, writeFile })`
   for Alpha (the Cloudflare deployer is the same `Deployer` type). `Deployer` is a bare callable
   (`(bundle, ctx) => Promise<Result<SiteDeployState>>`), not an object with a `.deploy` method — call
   it directly. `deployCtx: DeployContext` carries
   `workspaceId`, `siteId` (from step 5), `slug`, `baseDomain` (injected config — never hardcoded),
   `traceId` and `previous` (prior `history`). Returns `Result<SiteDeployState>`.
8. `store.recordDeploy(siteId, state)` with the `SiteDeployState` from step 7 (workspace-scoped
   `UPDATE`, per §1). Wrap in `try/catch` → `PROVIDER_ERROR` on throw; record nothing on failure.

Public exports used: `normalizeDraft`, `resolveSlug` (+ `IsSlugTaken` type), `toRows` (+ `SiteRows`,
`ToRowsOptions` types), `renderBundle` (+ `RenderContext` type), `themeCss`, `createFixtureDeployer`
(+ `Deployer`, `DeployContext`, `SiteBundle`, `SiteDeployState` types), `SiteDeployStateSchema` (to
re-validate a value read back out of `sites.deploy`). `SiteStore` is the type wt-web implements.

---

## 3. The public LEAD route contract

The lead form is **unauthenticated**. The route is the entire security perimeter.

- **Parse the body with a NON-tenant-bearing schema.** Accept only `name`, `email`, `phone`,
  `message`, and free-form `payload` / `source`. Do **NOT** parse with `LeadInsertSchema` — that is a
  **row shape**: it requires `workspace_id` (`z.uuid()`, not optional) and accepts an optional
  `site_id` (`@sahoda/shared/db/sites` lines 96–105). Parsing the request with it hands the caller
  both tenant fields. `LEAD_FORM_FIELDS` (`['name','email','phone','message']`, public surface) is
  the field contract the form emits and therefore the exact set the route may accept.
- **Derive `workspace_id` AND `site_id` from the resolved `sites` row**, looked up by host/slug
  (`sites.slug` is globally `unique`, so it resolves to exactly one row). Ignore any tenant field the
  payload carries. `leads.site_id` is `references sites (id) on delete set null` (migration line 57) —
  the one **single-column** FK in the family; unlike `site_pages` / `site_sections` (composite
  `(parent_id, workspace_id)` FKs), a `site_id` belonging to another workspace inserts cleanly. The
  database will not catch a forged tenant here. See CLAUDE.md §1.
- **Verify Turnstile and apply the rate limit BEFORE the service-role insert, never after.** `leads`
  enables RLS with `leads_select` + `leads_update` for `authenticated` and has **no INSERT policy at
  all** (migration lines 77–82), so the only write path is the service role, which bypasses RLS.
  **`TURNSTILE_*` is not yet provisioned** (see the sites-v0 plan open issue #2 —
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`; to be tracked in wt-web's REQUESTS.md).
  While it is missing the route **FAILS CLOSED** and rejects the submission — an unprovisioned captcha
  that degrades to accepting everything is an open public insert endpoint on a service-role
  connection. See CLAUDE.md §2.
- Construct the insert from the resolved ids + the parsed content fields, then insert with the
  service-role client.

---

## 4. Deploy-status UI rule — branch on `preview` before `status`

Read `preview` **first**:

```
preview === true  → "Preview only — not a public URL"   (whatever status says)
preview === false → branch on status
```

The fixture deployer returns `status: 'live'` with `preview: true` and a `file://` url — an honest
pair only **conjunctively**. A consumer that reads `status` alone renders "Live" for a path on one
machine's disk nobody else can open. `SiteDeployStateSchema` enforces `url !== null ⟺ status ===
'live'` and forbids a `file://` url with `preview: false`, so the schema cannot save you:
`{ status: 'live', preview: true }` is a valid, intended state. Only the consumer can read it
correctly. See CLAUDE.md §5.

---

## 5. Rulings — one line each (normative source: `packages/sites/CLAUDE.md`)

Do not re-derive these; CLAUDE.md §1–§6 is authoritative. Summarized so wt-web can scan them:

1. **§1 Tenant is derived, never read from the body** — resolve host/slug → `sites` row, take
   `workspace_id` + `site_id` from it; `leads.site_id` is a single-column FK the DB won't tenant-check.
2. **§2 `leads` has no INSERT policy** — the service-role route is the whole perimeter; Turnstile +
   rate limit before the insert, fail closed while `TURNSTILE_*` is unprovisioned.
3. **§3 `createSite` is one transaction** — site → pages → sections atomically, store mints ids, roll
   back on any failure.
4. **§4 `recordDeploy` carries `.eq('workspace_id', …)`** — see the schema correction below.
5. **§5 UI branches on `preview` before `status`** — `preview: true` means "preview only" even when
   `status` is `'live'`.
6. **§6 Surface `dropped`** — render every discarded/coerced value `normalizeDraft` reports; swallowing
   it is silent data loss.

### Schema corrections carried from CLAUDE.md (verified against the migration)

- **There is no deploy TABLE.** `site_deployments` does not exist. Deploy state is the `sites.deploy`
  jsonb column (migration line 14; shape = `SiteDeployState`), with `sites.last_deployed_at` (line 15).
  So `recordDeploy` is an **`UPDATE` on `sites`**, not an insert, and deploy history lives in
  `deploy.history` (capped by `DEPLOY_HISTORY_LIMIT = 5`), not in rows.
- **Two status vocabularies — do not cross them.** `sites.status` CHECK is
  `draft | deploying | published | failed | unpublished` (migration lines 11–12).
  `SiteDeployState.status` is `pending | live | failed` (`src/deploy/port.ts`). **`'live'` is NOT a
  legal `sites.status` value** — writing the deploy state's status straight into `sites.status`
  violates the CHECK constraint.

---

## Verified against the migration `20260718000007_sites.sql`

| Claim | Lines |
| --- | --- |
| `sites.slug text not null unique` (globally unique) | 9 |
| `sites.status` CHECK = `draft \| deploying \| published \| failed \| unpublished` | 11–12 |
| `sites.deploy jsonb`, `sites.last_deployed_at timestamptz` | 14–15 |
| `sites unique (id, workspace_id)` (cheap workspace-scoped predicate) | 19 |
| `site_pages` composite FK `(site_id, workspace_id) references sites (id, workspace_id)` | 35 |
| `site_sections` composite FK `(page_id, workspace_id) references site_pages (id, workspace_id)` | 49 |
| `leads.site_id references sites (id) on delete set null` (single-column FK) | 57 |
| `leads` RLS enabled; `leads_select` + `leads_update` for `authenticated`; **no INSERT policy** | 77–82 |

`SiteDeployState.status` enum (`pending \| live \| failed`) verified in
`packages/sites/src/deploy/port.ts`. `LeadInsertSchema` (requires `workspace_id`, optional `site_id`)
verified in `packages/shared/src/db/sites.ts` lines 96–105.
