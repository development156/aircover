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

## wt-web: a `failed` post needs per-channel state — fan-in for partials is HELD on this

Owner ruling: a partially published post settles to `failed`, **conditional** on the status
surface saying which channel went out and which did not ("went out on X, did not go out on
Google"). If the UI cannot express that, hold fan-in for partials only and file this. It cannot,
so partials are held. Full-publish fan-in proceeds and is unaffected.

What exists today:

- `components/posts/status-badge.tsx:18` — `STATUS_STYLES` is the ONLY `posts.status` renderer:
  one chip, one label. `failed` renders as a single red "Failed" over the whole post.
- Consumed at `post-card.tsx:65` and `planner-row.tsx:42`; `week-grid.tsx:27` uses the colour only.
- `posts/[id]/page.tsx` → `PostEditor` renders **no** post status chip at all.
- Nothing anywhere reads `post_variants.publish_status`. `listVariants` already does `select('*')`
  (`lib/posts/read.ts:101`), so the field is on the wire and discarded.

Why this blocks the write rather than just looking thin: a post that really did go out on X, shown
under one red "Failed" chip, tells the owner of that content it never published — while it is live
on the platform. That is the same class of lie as the "Scheduled" badge this sprint just fixed,
pointing the other way, and the job would be the thing writing it.

**Ask:** a per-channel outcome surface wherever post status renders. Minimum viable is the
existing channel pills (`post-card.tsx:79-89`, `planner-row.tsx:45-55`) carrying variant state
instead of being uniformly grey — they are already per-channel and already rendered. The data
needs no query change.

`publish-preview.tsx:88-158` is the closest existing pattern (per-channel groups with honest
"Simulated — nothing was posted" wording), but it is an ephemeral dry-run and deliberately never
reflects persisted state, so it is a model to copy rather than a component to reuse.

**Meanwhile:** `classifyCandidate` returns `hold` with reason `partial-needs-per-channel-ui`, and
carries `publishedChannels` / `unpublishedChannels` so the held set is reviewable in report mode.
Nothing is written. When the surface lands, the hold becomes `settle('failed')` — one branch.

**Not urgent on today's data.** All three production posts carrying published variants are
`mode: 'fixture'`, so they are held by ruling 3 (`fixture-publish`) before the partial rule is ever
reached. The partial hold currently fires on zero rows.

## wt-web: `autoPublishTruth` and the dispatch gate must not drift

`lib/posts/schedule-status.ts` labels only `status === 'scheduled'`, and its doc comment states
that scheduled auto-publish does not exist. Both facts are about to change, and the gate is now
written down once in `@sahoda/shared`:

```ts
import { isDispatchable, DISPATCHABLE_STATUSES } from '@sahoda/shared'
```

`isDispatchable(status, scheduledAt)` is exactly `status IN ('approved','scheduled') AND
scheduled_at IS NOT NULL` (plus rejecting an unparseable date). Please consume it rather than
re-deriving the predicate — the whole point of lifting it into shared was that the badge and the
dispatcher cannot disagree about which posts are waiting to go out.

Note the asymmetry that makes this matter: in production **10 of 10** past-due gated posts are
`approved`, not `scheduled`. A UI that keys auto-publish copy on `'scheduled'` alone describes
none of the real ones.

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

## wt-web/infra: `TRIGGER_PROJECT_REF` vs `TRIGGER_PROJECT_ID` — the deploy targets no project

Two names for one value, and nothing reconciles them:

- `apps/jobs/trigger.config.ts:13` reads `process.env.TRIGGER_PROJECT_REF ?? ''`.
- `turbo.json:43` allowlists `TRIGGER_PROJECT_ID` (not `..._REF`).
- `docs/12_Build_Companion_SAHODA_LABS.md:113` also documents `TRIGGER_PROJECT_ID`.

So whichever name is actually set in the environment, exactly one of these is wrong. If the env
holds `TRIGGER_PROJECT_ID`, `trigger.config.ts` falls through its `?? ''` and configures
`project: ''`. That is the failure the config's own comment says it wants to avoid — the
`?? ''` fallback makes a missing ref a **silent empty string** rather than a loud throw, so the
"deploys fail loudly rather than silently targeting the wrong project" promise on line 4-5 does
not hold as written.

**Ask:** pick one name, then align all three sites. Two sub-decisions for whoever owns infra:

1. Trigger.dev's own config key is `project` and its docs call the value a _project ref_
   (`proj_...`), so `TRIGGER_PROJECT_REF` is the truer name — but `TRIGGER_PROJECT_ID` is the one
   already in `turbo.json` and the build companion, and is presumably what is set in Vercel. The
   cheaper fix is renaming the config read; the more correct one is renaming the other two.
2. Whichever wins, `TRIGGER_PROJECT_REF`/`_ID` must be in the `turbo.json` build env allowlist
   under the name the code actually reads, or turbo will not pass it through.

**Also ask:** replace `?? ''` with a throw (or a startup assert) so a missing ref fails at deploy
time with a named error instead of producing an empty project string.

Not blocking today — no `deploy` has been run from this repo yet (see the next item), so this has
never been exercised. It will bite on the first deploy attempt.

## Untested: Trigger.dev against raw-TS workspace packages

Every workspace package ships `"exports": "./src/index.ts"` with **no build step**, and apps/jobs
uses `moduleResolution: "Bundler"`. That layout has not been exercised against the Trigger.dev
bundler, and a `deploy` has never been run from this repo.

**Mitigation already in place:** every job core (`runPublishPost`, `sweepExpiredHolds`,
`runPlanWeekJob`) is free of the Trigger.dev SDK and fully unit-tested without it. Only the three
files under `src/trigger/` import it, so the fallback `apps/jobs/CLAUDE.md` already sanctions
(Vercel cron + QStash, same task signature) is a wrapper swap rather than a rewrite.
