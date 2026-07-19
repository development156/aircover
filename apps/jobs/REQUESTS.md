# apps/jobs — cross-lane requests

Requests from the jobs lane to other worktrees. Mirrors `apps/web/REQUESTS.md` and
`packages/billing/REQUESTS.md`.

---

## wt-pub: no sanctioned way to open a connection secret — BLOCKS every live publish

`packages/publishing/src/index.ts` exports zero vault symbols (`encryptToken`, `decryptToken`,
`createTokenVault`, `keyringFromEnv`, `EncryptedToken`, `Keyring`, `TokenVault` all stay in
`src/vault/token-vault.ts`; `defaultUnseal` in `src/oauth/common.ts` is module-internal), and
`package.json` declares only `"exports": { ".": "./src/index.ts" }` — no subpath. So the boundary
is closed at the package level, not merely by convention.

Consequence: `PublishRequest.auth.accessToken` is a plaintext string with **no sanctioned
producer**. `mode: 'live'` is unimplementable from apps/jobs today. apps/web hit the same wall
(LEARNINGS.md item 5: "`decryptToken` is unexported, so apps/web can neither publish nor RECORD a
publish").

We did **not** take the available workaround — reading `TOKEN_VAULT_KEY` and re-implementing
AES-256-GCM with `node:crypto` — because it duplicates a deliberately private envelope format and
breaks the "token material stays inside this package" non-negotiable.

**Ask:** export ONE narrow server-only opener from the barrel. Preferred shape:

```ts
export function openConnectionSecret(sealed: unknown): {
  accessToken: string
  refreshToken?: string
}
```

It should take the stored `connection_secrets.access_token_enc` jsonb value exactly as it sits in
the row, key off `TOKEN_VAULT_KEY` internally, return plaintext in memory only, and throw a typed
error that never echoes ciphertext or key material. Please do **not** export `EncryptedToken` or
the vault itself.

**Meanwhile:** `src/publish/tokens.ts` has the seam ready — `createConnectionResolver({
loadConnection, openSecret })`. `openSecret` is left unwired, so a live publish fails with
`TOKEN_VAULT_UNAVAILABLE`, writes an honest `failed` row to `post_publish_logs`, and never
fabricates a success. When the opener lands, only that one argument changes.

## wt-pub + wt-db: the sealed-envelope shape is ambiguous at the boundary

`defaultSeal` (`src/oauth/common.ts`) produces `JSON.stringify(vault.encrypt(plaintext))` — a
string — and `ConnectionUpsert.encryptedSecret` is documented "persist verbatim into
connection_secrets". But `connection_secrets.access_token_enc` is `jsonb`, and
`public.upsert_connection(...)` takes `p_access_token_enc jsonb` / `p_refresh_token_enc jsonb`
separately. The column comment (`20260719160916_add_upsert_connection.sql`) says "Under the
fallback mapping (B) this may hold a bundle of access+refresh".

**Ask:** state the on-disk contract for `access_token_enc` in one place — direct
`{iv,tag,data,key_version}` envelope, or the mapping-(B) bundle, and which writer produces which.
apps/jobs must not branch on a guess; the opener above should normalise whatever the column holds.

## wt-billing: no entitlement gate helper

`createWithCredits` documents that entitlement gating "is a SEPARATE gate helper called at each AI
entry point BEFORE this wrapper (owner ruling #5)". That helper does not exist, and apps/jobs
cannot add it to `packages/billing`. Same request apps/web already has open.

**Meanwhile:** `runPlanWeekJob` charges via `withCredits` with **no plan gate**. Please confirm
that is acceptable for Alpha, or ship the helper.

## wt-web: wallet copy will become wrong once the reaper is deployed

`apps/web/src/lib/wallet/balance.ts` and `read.ts` tell users held credits are "not released
automatically", and `balance.test.ts:232-244` asserts that string and explicitly asserts the
absence of "will be released / released shortly / released soon".

That was true — nothing reaped expired holds. It is no longer true once `holdSweepTask` runs: an
expired hold is released within roughly 10–15 minutes (10 min TTL + 10 min grace, swept every 5).

**Ask:** update the copy and the matching assertion when the sweep is deployed. This is a
documentation obligation, not a build break — landing the reaper does not fail that test today.

## wt-web: the planner has no trigger wired

`apps/web/src/app/(app)/planner/page.tsx` is a static `EmptyState` with no action. The jobs side is
ready: `triggerPlanWeek(payload)` with `PlanWeekJobPayloadSchema` from `@sahoda/shared`.

**Ask:** wire the planner's "Plan my week" action to that helper.

## Open question for whoever owns the spec: the reaper's grace margin

The HOLD TTL is 10 minutes (`DEFAULT_HOLD_TTL_SECONDS`, and the ledger's own
`interval '10 minutes'`) and the sweep runs every 5. Releasing strictly on `hold_expires_at <
now()` would reap a slow-but-alive run mid-flight; its DEBIT then raises `HOLD_ALREADY_SETTLED`,
`withCredits` converts that to `PROVIDER_ERROR`, and the user sees a failure for work that
succeeded and was never charged.

**Decided in-lane:** a further 10-minute grace (`SAHODA_HOLD_SWEEP_GRACE_SECONDS`, default 600),
plus `maxDuration: 300` in `trigger.config.ts` so a run cannot outlive its own hold. Both are
pinned by tests. Flagging it because the "every 5 min, past `hold_expires_at`" wording in
`packages/shared/src/jobs/payloads.ts` cites a §3.6 that does not appear to exist in /docs — if
there is a real spec, it should win over this ruling.

## Untested: Trigger.dev against raw-TS workspace packages

Every workspace package ships `"exports": "./src/index.ts"` with **no build step**, and apps/jobs
uses `moduleResolution: "Bundler"`. That layout has not been exercised against the Trigger.dev
bundler, and a `deploy` has never been run from this repo.

**Mitigation already in place:** every job core (`runPublishPost`, `sweepExpiredHolds`,
`runPlanWeekJob`) is free of the Trigger.dev SDK and fully unit-tested without it. Only the three
files under `src/trigger/` import it, so the fallback `apps/jobs/CLAUDE.md` already sanctions
(Vercel cron + QStash, same task signature) is a wrapper swap rather than a rewrite.
