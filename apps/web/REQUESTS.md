# apps/web — cross-lane requests

Requests from the web lane to other worktrees. Mirrors `packages/billing/REQUESTS.md`.

---

## [OPEN] wt-db: `public.resolve_brand_memory` — the Brand Brain write RPC

**Why:** Brand Resolve (FSD M1) produces a `BrandMemoryPayload` (via the `brand_guidelines`
mesh task) that must persist as a `brand_memory` version. `brand_memory` has RLS **read-only**
(`app.apply_tenant_read_policy` → `t_select` only; "all writes are server-side" by design), there
is **no write RPC**, and apps/web has **no service-role client** (forbidden). So the web lane can
resolve a brain but cannot save it. This is the exact shape of the `bootstrap_workspace` blocker —
same fix pattern.

**Requested function** (mirror `public.bootstrap_workspace`'s security model):

```sql
create or replace function public.resolve_brand_memory(
  p_workspace_id uuid,
  p_payload      jsonb,                 -- a validated BrandMemoryPayload (app zod-parses first)
  p_source       text default 'resolved' -- brand_memory_source: resolved | manual | system
) returns jsonb                          -- { "brand_memory": <row>, "version": int }
language plpgsql security definer set search_path = public
```

**Required semantics:**

1. Identity from `auth.jwt() ->> 'sub'` **only** (never an argument); null/empty → `raise 'AUTH_REQUIRED'`.
2. Membership check: caller must be a `workspace_members` row for `p_workspace_id`; else
   `raise 'NOT_A_MEMBER'` (do not leak existence). _(Optional: restrict to roles that may edit the
   brain — owner/editor/approver — if that maps to a product rule; viewer should not resolve.)_
3. Validate `p_source in ('resolved','manual','system')` → else `raise 'INVALID_SOURCE'`.
   Defense-in-depth: reject a payload missing the six top-level keys
   (`voice, brand_persona, customer_persona, hook, taboo, alignment`) → `raise 'INVALID_PAYLOAD'`.
4. `pg_advisory_xact_lock(hashtextextended('resolve_brand:' || p_workspace_id::text, 0))` to serialize
   concurrent resolves for one workspace (prevents two "active" rows / version races).
5. `v_version := coalesce(max(version), 0) + 1` for the workspace.
6. Supersede: `update brand_memory set status='superseded', updated_at=now()
where workspace_id = p_workspace_id and status = 'active'` (respects the
   `brand_memory_one_active` partial unique index — one active per workspace).
7. Insert the new row: `version = v_version, status = 'active', payload = p_payload,
source = p_source, created_by = v_user`.
8. Return `jsonb_build_object('brand_memory', to_jsonb(new_row), 'version', v_version)`.

**Grants:** `revoke all ... from public, anon; grant execute ... to authenticated, service_role;`
(client-reachable for signed-in members only — same as `bootstrap_workspace`).

**Idempotency (optional, nice-to-have):** each call creates a new version by design. If a double-submit
guard is wanted, add an optional `p_idempotency_key text` and short-circuit-return the existing row when
a version already carries that key — but `brand_memory` has no such column today, so the app instead
relies on the advisory lock + single-Finish UX for Alpha. The **credit charge** is already exactly-once
via `withCredits` `objectRef`, independent of this RPC.

**Until this lands:** the web onboarding flow resolves + refines + themes the brain and returns a typed
`SAVE_PENDING` at Finish (the `BOOTSTRAP_PENDING` pattern) — no fake "saved v1", brain held in session.
Wiring the persist call is a ~10-line change in `apps/web/src/app/actions/brand-resolve.ts` once the RPC
exists.

**Contract note:** naming drift to reconcile — `BrandMemorySourceSchema` uses `resolved|manual|system`
while an earlier TSD §5 draft referenced `created_by ∈ [user|system]`. The frozen shared schema
(`packages/shared/src/db/brand.ts`) is authoritative: `source` enum + a nullable text `created_by`.
