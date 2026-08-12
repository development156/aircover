# UX findings

The input list for the UX audit. One entry per finding: where it lives, and **what a
user experiences** — not what the code does. A finding is only useful here if it can be
stated as something a person saw or would see.

Findings 1–4 are the duplicate-channel family, all **fixed**. They are recorded together
because they are one defect that moved three times, and the shape of that movement is the
thing the audit should be looking for elsewhere: a guarantee held by convention in each
consumer instead of once at the boundary.

Status: `FIXED` · `OPEN` · `WATCH` (fixed, but the class is worth re-checking).

---

## 1. The schedule picker promised a post would go out when nothing could receive it

**Where:** `apps/web/src/lib/posts/connection-gap.ts:78` (`someChannelStillConnected`)
**Status:** FIXED
**What a user experiences:** They pick LinkedIn, set a time, and the picker says
"This goes out on its own at around that time." LinkedIn is not connected. Nothing goes
out, and nothing tells them so — they find out by the post never appearing.

The condition "is any channel still connected" was derived as
`unconnectedNames.length >= totalChannels`. For `['linkedin','linkedin']` that is
`1 >= 2` — false — so the picker took the optimistic branch. The parameter is now stated
by the caller rather than inferred from a length.

---

## 2. The same warning named one broken account twice

**Where:** `apps/web/src/lib/posts/connection-gap.ts:36` (`unconnectedFrom`) · fixed in `5b84e34`
**Status:** FIXED
**What a user experiences:** "Nothing goes out at that time — LinkedIn and LinkedIn
aren't connected." They go looking for a second LinkedIn account they never connected,
because the sentence names two and uses a plural verb for one broken channel.

Finding 1's fix corrected the boolean and left the NAME LIST undeduplicated — the same
defect, one line over.

---

## 3. A repeated connected channel rendered two identical Publish buttons

**Where:** `apps/web/src/components/posts/publish-now.tsx:97` (`onRail`) · fixed in `e31fee1`
**Status:** FIXED — **shipped to production**
**What a user experiences:** Two "Publish to X" buttons stacked under one post, with no
way to tell them apart. Pressing either publishes once; pressing both is an attempt to
publish the same post twice. React also logged "Encountered two children with the same
key", so the second button's state could attach to the first.

`PublishNow` splits its channels into a button rail and a warning. The warning went
through `unconnectedFrom` (which deduplicated); the rail read the raw array. One shared
input, two branches, one guard.

---

## 4. ROOT CAUSE — `posts.channels` is a `text[]` that every consumer reads as a set

**Where:** `packages/shared/src/db/content.ts:26` (`PostSchema.channels`)
**Status:** FIXED at the boundary — `packages/shared/src/db/channel-set.ts:65`
**What a user experiences:** Nothing directly. This is the reason findings 1–3 exist and
the reason each fix only held for a day: the column has no unique constraint, the planner
and the editor write it untouched, and each consumer was left to defend itself. Three
consumers, three private `[...new Set(...)]` guards, and every gap between them was a
shipped bug.

Fixed by deduplicating **once**, when the row is parsed: `channels` is now a `ChannelSet`
— a branded readonly array that only `toChannelSet` can produce. A consumer that wants a
set can no longer be handed a raw array by a caller who forgot, and the four component-local
guards are gone (`post-card.tsx:82`, `planner-row.tsx:55`, `publish-now.tsx:97`,
`connection-gap.ts:36`).

Proven by mutation: removing the `new Set` from `toChannelSet` fails eight named tests
across all three failure modes —

| failure mode | test |
| --- | --- |
| count-based wording | `a duplicated channel cannot turn "nothing goes out" into "it goes out"` |
| rendered names | `a channel repeated in post.channels is named ONCE, in the singular` |
| React keys | `a repeated CONNECTED channel offers one button, not two identical ones` |
| React keys | `renders ONE chip on the posts list, not two destinations` |

---

## What the audit should carry forward from 1–4

Three questions to ask of every finding, because these are what made one defect into four:

1. **Is the guarantee held once, or once per consumer?** A rule enforced by convention in
   each reader is a rule that will be missing from the next reader.
2. **Which siblings read the same input?** Every fix here closed the reported consumer while
   a sibling kept reading the raw value. Count-based wording, rendered names and React keys
   are three different symptoms of one cause, and they are reported as three different bugs.
3. **Does the test assert the branch, or the sentence the user reads?** Findings 1 and 2
   both had passing tests. They asserted the boolean, not the copy on screen.

---

## 5–17 · Entitlements and plan limits (lane `wt-limits`)

Lane `wt-limits`, pinned at `0875f80`. Scope: the entitlements gate and the plan-limit
UI. Not the publish path, not onboarding, not `/brain`.

`checkEntitlement` shipped correct, tested, and **called from nowhere**. Free allows
`sites: 0`, so a free workspace could spend all 100 of its granted credits on a
`site_generate` its plan forbids. This is what that audit found and what it left.

The brief asked for ten. The audit produced **thirteen**. 15–17 were found while
reviewing this lane's own diff, and all three are defects the gate itself introduces —
they did not exist before today because nothing enforced a limit.

**Thirteen findings. Nine fixed here, four reported with a recommendation.**

| #   | Finding                                                           | Verdict       |
| --- | ----------------------------------------------------------------- | ------------- |
| 5  | `site_generate` ungated — 100 credits for a forbidden resource     | **Fixed**     |
| 6  | Zernio **return** route wrote unlimited channels                   | **Fixed**     |
| 7  | A gate without `currentUsage` leaves every paid tier unbounded     | **Fixed**     |
| 8  | The gate is check-then-act and no remedy exists in this lane       | Reported      |
| 9  | Four TODOs named an entitlement dimension that does not exist      | **Fixed**     |
| 10  | `seats`, `twinSize`, `loopLevel` have no create surface to gate    | Reported      |
| 11  | No limit shown before the click, though cost always was            | **Fixed**     |
| 12  | `REQUESTS.md §8` points at a file that does not exist              | **Fixed** (¹) |
| 13  | There is no plan-upgrade surface — the gate ends in a dead end     | Reported      |
| 14 | A plan decline would have been reported as a write outage          | **Fixed**     |
| 15 | Zernio **start** refused only after the OAuth grant was made       | **Fixed**     |
| 16 | The gate would have 500'd two pages where billing env is unset     | **Fixed**     |
| 17 | No way to delete a site, so a Starter customer locks at 1 forever  | Reported      |

¹ Half of it. See finding 12.

---

### The audit: every action a PLAN_CATALOG dimension could constrain

`PLAN_CATALOG.limits` is `{channels, sites, seats, loopLevel, twinSize}`. Free is
`{channels: 2, sites: 0, seats: 1, loopLevel: 1, twinSize: 0}`.

| Dimension   | Live create path in `apps/web`                       | Was gated | Now         |
| ----------- | ---------------------------------------------------- | --------- | ----------- |
| `sites`     | `actions/site-generate.ts` → `generateSite` (100 cr)  | No        | **Gated**   |
| `channels`  | `api/oauth/zernio/start` → the consent screen (finding 15)   | No        | **Gated**   |
| `channels`  | `api/oauth/zernio/return` → `upsert_zernio_connection` | No       | **Gated**   |
| `seats`     | none — see 10                                        | n/a       | none needed |
| `loopLevel` | none — the Loop is unbuilt                           | n/a       | none needed |
| `twinSize`  | none — personas are unbuilt                          | n/a       | none needed |

No other `apps/web` write path touches a dimension in the catalog. `actions/ops-team.ts`
looks like a seats path and is not: it manages `ops_admins`, SAHODA's own internal
console. Gating staff seats on a customer's plan would be flatly wrong.

---

### 5 — `site_generate` was ungated · **Fixed**

`generateSite` charges 100 credits and inserts across three tables. Free allows zero
sites. Nothing checked.

Gated in `actions/site-generate.ts`, **before** `withCredits` and before the
`objectRef` that keys the ledger. The ordering is the finding as much as the check:
a refusal after a hold means the customer watches credits move for an action their
plan forbids, and "you were not charged" stops being verifiable. Refusing before the
hold makes that claim true by construction — no HOLD exists at the line that returns
it.

Pinned by `generateSite — the plan gate` in `actions/site-generate.test.ts`:
no ledger call, no model run, no rows.

### 6 — the Zernio return route wrote unlimited channels · **Fixed**

`api/oauth/zernio/return` loops over every platform Zernio fronts and upserts every
account it finds. Free allows 2 channels; four platforms are live. A free workspace
could hold all four.

**It does not refuse the trip.** By the time this route runs the account is already
connected on Zernio's side — the user approved it on the platform's own screen.
Rejecting the return produces exactly the failure the route's own comments are built
around: "an account they connected at Zernio that this app cannot see." It would also
break the documented self-heal, and misfire on every repeat visit, because
re-upserting existing rows would count as new.

So accounts are partitioned on `platform:accountId` — the same tuple
`upsert_zernio_connection` takes as its conflict target. A key already present is a
REFRESH: it updates a row that exists, consumes no allowance, and is written
unconditionally. Only genuinely new rows draw down headroom; the remainder are left
unwritten and reported as `?zernio=limit`, a 303 with count-free copy.

### 7 — a gate without `currentUsage` leaves every paid tier unbounded · **Fixed**

The sharpest finding here, and the one a careless fix walks straight past.

`isAllowed` answers a *weaker* question when `currentUsage` is absent: `limit > 0` —
"does the plan grant any of these at all". For Free/`sites: 0` that refuses, which is
correct **by coincidence**. For Starter (`sites: 1`) it returns true forever, however
many sites already exist.

So a gate that forgets the count still closes the headline hole in 5 while leaving
every paid tier unbounded — and a test suite covering only the free case calls it a
pass. Both call sites pass a real count, from `countSites` and `readConnectionSlots`
respectively, and both counts fail closed on an unreadable read rather than degrading
to zero.

Pinned by `starter, one site already` in `lib/billing/limit-gates.test.ts`, which runs
against the real `createCheckEntitlement` and the real `PLAN_CATALOG`.

### 8 — the gate is check-then-act, and neither remedy is available here · Reported

`createCheckEntitlement` documents this itself: it is a stateless calculator over a
`currentUsage` the caller supplies. It counts nothing and takes no lock. Two
concurrent creates on a 3-site plan can both read 2, both pass, and both insert.

Its doc names the only two remedies: count inside the same transaction as the insert,
or rely on a DB constraint bounding the resource per workspace.

**Neither is available in this lane.** `generateSite`'s inserts are three separate
PostgREST calls, not one transaction, and only `wt-db` may add a constraint. The
window is left open deliberately and documented at both call sites.

> **Recommendation (wt-db):** a partial unique index or a `check` bounding rows per
> workspace cannot express "depends on the workspace's current plan". The tractable
> shape is a `SECURITY DEFINER` insert function for `sites` that re-counts and
> compares against `plans.limits` in the same statement — the same reason
> `apply_ledger_entry` can be atomic while this cannot. Filed in `apps/web/REQUESTS.md`.

The residual risk is over-provisioning a paid resource under a race, not a charge for
nothing. That is the acceptable direction, but it is not zero.

### 9 — four TODOs named a dimension that does not exist · **Fixed**

The brief said three; there are four (`posts-ai.ts` has two). All four claimed an
entitlements gate belonged at an AI entry point:

- `actions/plan-week.ts:112`
- `actions/posts-ai.ts:120` and `:243`
- `actions/site-generate.ts:88` ← the only true one, now the gate

The other three are **no-ops, and were not wired.** No `PLAN_CATALOG` dimension covers
planning a week, generating variants, or rewriting a caption. `loopLevel` is the
maximum autonomy level for the Loop, which is unbuilt; these are user-clicked manual
actions, and gating them on `loopLevel` would refuse a free customer the credits they
were granted to spend.

A dimension-less `checkEntitlement({ workspaceId })` was considered and rejected: it
returns `allowed: true` unconditionally, so it would read as a gate to every future
maintainer while enforcing nothing. **A fake gate is worse than a visible TODO.** Each
TODO is replaced by a comment stating what actually constrains the action — credits,
via `withCredits` — and why no dimension applies.

### 10 — three dimensions have no create surface to gate · Reported

- **`seats` (Free: 1).** The only path that writes `workspace_members` is
  `bootstrap_workspace`, called by `createWorkspace` — it creates the owner's own row,
  seat 1 of 1. There is no invite-a-teammate surface in `apps/web` at all.
- **`loopLevel` (Free: 1).** The Loop is unbuilt; `apps/jobs` has no autonomy runner.
- **`twinSize` (Free: 0).** Personas are unbuilt.

Nothing to gate, so nothing was gated. Recorded so the next lane to build any of them
knows the limit exists and is unenforced.

> **Recommendation:** when an invite surface is built, `seats` is the one dimension
> where a post-hoc check is unacceptable — a refusal after the invitation email has
> gone out is visible to a third party. Gate before `createInvitation`, not after.

### 11 — the limit was invisible until after the commitment · **Fixed**

Credit cost has always been rendered before the click (`CostLabel`). The plan limit
was not rendered anywhere. A free user filled in a site name, a goal, clicked a button
labelled "Generate site · 100 credits", and would now learn their plan never allowed it.

Both surfaces now show the limit before the click, from a server-side read:

- `/sites` — `GenerateSitePanel` takes a required `limitNotice` prop and disables the
  button. Required, not optional-with-a-default: an omitted prop defaulting to `null`
  would silently render the un-gated panel and every caller that forgot it would look
  correct.
- `/connections` — the connect buttons disable with the plan sentence above them.

**The copy is derived, never written.** `cheapestPlanWithAtLeast` (added to
`@sahoda/shared` next to `PLAN_CATALOG`) picks the cheapest plan by price whose limit
reaches what is needed. The obvious hand-written sentence — "Sites are on Growth and
above" — is **false**: Starter allows 1 site, so it asks the customer for three times
the price they need. Pinned by a test asserting the sentence names Starter and does
not contain "Growth".

Every "we could not tell" case renders **nothing** rather than a limit notice. The
server action fails closed regardless, so nothing is admitted by staying quiet; what
it avoids is telling someone their plan is full when the truth is we could not read it.

### 12 — `REQUESTS.md §8` points at a file that does not exist · **Fixed** (half)

`packages/billing/src/entitlements/checkEntitlement.ts:94` cites "Filed in
REQUESTS.md §8" for the atomicity caveat. `apps/web/REQUESTS.md:3` says it mirrors
`packages/billing/REQUESTS.md` — **that file does not exist**, and `apps/web/REQUESTS.md`
has no numbered sections at all (its headings are `## <lane>: <title>`). The caveat
was filed nowhere, which is why it survived to be rediscovered here.

Repointed at `docs/ux-findings.md` 8, and the wt-db request is now really filed.

**Not fixed:** `packages/billing/src/webhooks/applyPlanGrant.ts:32` cites
"REQUESTS.md §6" for a refund/support obligation and has the same broken pointer. I
cannot tell what §6 was meant to say, so guessing a target would replace a dangling
pointer with a wrong one. Flagged for the billing lane.

### 13 — the gate ends in a dead end · Reported

The only checkout in `apps/web` is `components/wallet/top-up-panel.tsx`, which buys
**credits**. There is no plan-upgrade surface anywhere — no pricing page, no plan
selector, no checkout that takes a `PlanId`.

So the honest limit copy names a plan ("Sites are on Starter and above") that the
customer has **no way to buy from inside the product**. The gate is still correct:
refusing is right and refusing quietly would be worse. But this is a real gap and it
gets worse the moment the gate ships, because before today nobody ever hit it.

Deliberately **not** papered over: the notice names the plan and links nowhere. A
"Upgrade your plan" link to a route that does not exist would be a fabricated success,
and `/wallet` is the wrong destination — topping up credits does not raise a plan limit,
so sending them there sells the wrong thing to solve their problem.

> **Recommendation (owner + billing lane):** the plan grant rail already exists —
> `applyPlanGrant` and the Cashfree `order_tags` carry `workspace/plan/period`. What is
> missing is a surface that starts that order. Until it exists, the limit copy should
> arguably name a support contact rather than a plan.
>
> **See finding 17**, which makes this materially worse for `sites`: with no delete either, a
> Starter customer's first draft is also their last. Of the two gaps, the delete control
> is the cheaper fix and the more urgent one.

### 14 — a plan decline would have been reported as a write outage · **Fixed**

Found while wiring 6. The return route had:

```ts
if (written === 0 && accounts.length > 0) return fail(500, 'write')
```

with a comment explaining that `accounts.length > 0` was not redundant. Correct then.
The plan limit adds a **second** path that arrives with `written === 0` and a non-empty
`accounts`: every returned account over the limit, so nothing is attempted. That would
have been reported as "every write failed" — a fabricated 500 for behaviour working
exactly as designed, in the log channel a human watches for real outages.

The guard now counts attempts (`written === 0 && attempted > 0`), which states the real
condition directly and covers both paths.

### 15 — the channel refusal landed *after* the OAuth grant · **Fixed**

The sharpest of the three self-review findings, and the one that would have shipped.

6 gated `api/oauth/zernio/return`, which is where enforcement has to live — it is the
only place that knows what Zernio actually handed back. But gating **only** there means
the sequence a customer at their limit experiences is:

1. click Connect → `api/oauth/zernio/start` hands back a consent URL
2. **approve third-party access to their Instagram account on Meta's own screen**
3. return → "Your plan is full."

Step 2 is real, external, and not ours to undo. The brief's own principle — the reason
the sites gate sits before the credit hold — is that a refusal must land before the
commitment. For a paid action the commitment is a credit hold. **For a channel it is the
OAuth grant**, and that grant is the more expensive of the two: credits can be released,
a third-party authorization cannot.

`start` now refuses first, above `ensureZernioProfile` — which *creates* a Zernio profile
for a workspace that has none, and should not run for a connect about to be refused.

The disabled buttons from 11 do not cover this and were never going to: a stale page, a
second tab, or a direct POST all reach the route with no button consulted. Buttons are
courtesy; the route is the gate.

Pinned by `a full plan never sends the customer to Zernio at all` in
`api/oauth/zernio/start/route.test.ts` (a new file — the route had no tests).

### 16 — the gate would have 500'd two pages in an env with no `SUPABASE_DB_URL` · **Fixed**

Found while reviewing my own diff, and worth recording because the gate itself caused it.

`checkCountableLimit` calls `getCheckEntitlement()` → `loadBillingEnv()`, which **throws
by design** when `SUPABASE_DB_URL` is unset. Inside a server action that is fine — the
outer catch maps it to the honest "not fully configured" copy. But 11 put the same call
on the **render path** of `/sites` and `/connections`, where nothing catches it. Two pages
that render perfectly well without billing configured would have become 500s. The cloud
sandbox has no `.env` at all (`CLAUDE.md`), and a Vercel deploy missing the var would hit
it in production.

`checkCountableLimit` now never throws: a failure to construct the gate degrades to
`unknown`, which every caller already handles by failing closed. Nothing is admitted by
the change — the pages just stay up. Pinned by
`a missing SUPABASE_DB_URL degrades to "unknown" instead of throwing`.

### 17 — there is no way to delete a site · Reported

Verified: the only `delete` against `sites` anywhere in `apps/web` is the compensating
cleanup inside `generateSite` itself. There is no `deleteSite` action, no delete control
on `/sites`, no admin path.

Before today that was merely a missing feature. **With the gate mounted it becomes a
trap:** a Starter customer generates one site, gets a draft they dislike, and is now
permanently at their limit — they cannot replace it, cannot free the slot, and per 13
cannot upgrade from inside the product either. Their 100 credits bought one attempt.

This is strictly worse than 13 on its own, and it is created by shipping this gate.
`countSites` counts every row including drafts, which is correct — `sites.status` never
leaves `'draft'` today, so counting only published sites would count nothing at all —
but it means a failed first attempt is indistinguishable from a satisfied customer.

> **Recommendation:** a delete surface on `/sites` is the smaller and more urgent half
> of 13's fix, and it is cheap — members already hold real delete rights on the row
> (the cascade to `site_pages`/`site_sections` exists and `generateSite` relies on it).
> A delete control would need the same "you were charged for this" honesty the rest of
> the module has, but it needs no schema change and no billing work. Out of scope for
> this lane (entitlements and plan-limit UI, not the Sites module), so reported only.

---

### Proof by mutation

Two mutations, because one is not enough here: **the check being present and the check
being correct are different properties, and the free-plan case cannot tell them apart.**

Run 1 — remove the check entirely:

```diff
-    if (limit.kind === 'blocked') {
-      return { ok: false, insufficient: false, message: `${limit.sentence} ${NOT_GENERATED}` }
-    }
```

```
FAIL |lib| src/app/actions/site-generate.test.ts > generateSite — the plan gate >
     a blocked plan refuses BEFORE the hold: no ledger call, no model run
AssertionError: expected [ { …(3) } ] to have a length of +0 but got 1

 ❯ src/app/actions/site-generate.test.ts:347:33
    347|     expect(state.calls.configs).toHaveLength(0)
```

The hold was taken for a site the plan forbids. Restored; suite green again.

Run 2 — keep the check, degrade it to omit the count:

```diff
-  const result = await getCheckEntitlement()({ workspaceId, dimension, currentUsage })
+  const result = await getCheckEntitlement()({ workspaceId, dimension })
```

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
FAIL |lib| src/lib/billing/limit-gates.test.ts > checkCountableLimit — sites >
     starter, one site already: refused — the sibling a missing count would admit
AssertionError: expected 'allowed' to be 'blocked' // Object.is equality
FAIL |lib| src/lib/billing/limit-gates.test.ts > checkCountableLimit — sites >
     growth at 2 of 3 is allowed; at 3 of 3 it is not
AssertionError: expected 'allowed' to be 'blocked' // Object.is equality
FAIL |lib| src/lib/billing/limit-gates.test.ts > checkCountableLimit — channels >
     free plan admits 2 channels and refuses the third
AssertionError: expected 'allowed' to be 'blocked' // Object.is equality

     Tests  3 failed | 3 passed (6)
```

**`free plan cannot generate a site at all` is one of the three that PASSED.** Every
paid tier fell open and the headline case still reported success. That is 7, executable:
a suite covering only the free plan would have signed off on this mutation.

Run 3 — remove the plan refusal from the **start** route (15):

```diff
-    if (limit.kind === 'blocked') return fail(limit.sentence, 403)
```

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
FAIL |lib| .../zernio/start/route.test.ts > the channels plan limit is enforced
     before the consent screen > a full plan never sends the customer to Zernio at all
AssertionError: expected 1 to be +0 // Object.is equality
FAIL |lib| .../zernio/start/route.test.ts > the channels plan limit is enforced
     before the consent screen > a refused connect provisions no Zernio profile
AssertionError: expected 1 to be +0 // Object.is equality

     Tests  2 failed | 3 passed (5)
```

`expected 1 to be +0` is one `connectUrl` call and one `ensureZernioProfile` call that
should not have happened — a consent screen served, and a Zernio profile provisioned, for
a workspace with no room for the channel.

All three mutations reverted.

### Gate state, stated exactly

`pnpm format:check` — clean. `turbo typecheck lint test --force` — 27/27 with `Cached: 0`
on two runs, and `26/27` on three others, each time failing `@sahoda/web#test`.

**Those failures are host contention, not this lane.** Stated rather than waved away:

- A **different** test failed each time — `brand-resolve-source.test.ts`, then
  `intake-step.test.tsx`. Both are onboarding files; `git diff --name-only HEAD` matches
  neither, and both mock only Clerk/workspaces/supabase/report, none of which this lane
  touches.
- Both errors were `Hook timed out in 10000ms`, not assertion failures.
- Each passes in isolation (3/3 and 1/1).
- Run duration for the identical `--force` command drifted 48s → 2m47s → 4m27s, which is
  the actual signal: the host has 15 GB with ~5 GB free and several resident
  Chrome/Playwright MCP instances.
- **`vitest run --maxWorkers=4 --hookTimeout=30000` passes 2917/2917, 205 files.** So does
  an unconstrained direct `vitest run` when the box is quiet.

The honest summary is: every test in this lane passes, the full suite passes under
constrained parallelism, and the default worker count is unreliable on this machine right
now. A CI runner should be watched for the same two files.
