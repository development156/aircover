# 55 · Two Brains — Build Plan

**Status:** live plan. Written 2026-08-26 on `claude/lead-research-tz63ld`
(owner girija, `sahoda.lane=wt-girija`) after the audit in this session.

Supersedes nothing. Depends on `docs/51`, `docs/52`, `docs/53`, `docs/54` and on
`apps/web/REQUESTS.md` §22, §25, §29.

**`docs/56` is the companion:** what the store can already do, the four
properties that make it reusable, and the filing rule for deciding whether a
proposed feature routes through it. Read that one before designing a feature;
this one before building a step.

---

## The founder's model, which this plan is organised around

> Sahoda is a brain. The **Marketing Brain is the left hemisphere** and holds
> logic and analytics. The **Brand Brain is the right hemisphere** and holds
> creative insight and originality. Both must hold high-value information only,
> and both must run the operation.

That model produces a filing rule, and the filing rule produces most of this
plan:

| Question | Hemisphere | Because |
| --- | --- | --- |
| Who are we, and what will we never say? | Right | Identity |
| Has our voice drifted from the voice we declared? | **Right** | Consistency with identity |
| What did the audience actually do? | Left | Outcome |
| Which work earned money? | Left | Outcome |
| Should we keep doing this? | Left | Decision from outcome |

**Tone drift is currently in the left hemisphere and belongs in the right.**
See step 6.

---

## The test every measurement must pass, from now on

**Name the decision that changes.** If a customer reads the sentence and does
nothing differently, the measurement does not ship. `tone_drift` fails this
test; it was built first because `docs/53` called it "the cheapest impressive
thing in the product", which was honest and correct as a proof of the
machinery, and is not a reason to keep it in the left brain.

This test is the reason the build order below is what it is.

---

## What is already true, MEASURED 2026-08-26 against `rloztdhzfliyvpvxsgjl`

| Fact | Value |
| --- | --- |
| Workspaces | 33 |
| Workspaces with a Brand Brain | 18, all fully populated |
| Marketing observations ever written | **0** |
| Published posts the tone computer can read | **5, all dated 2026-08-10, span 1 day** |
| `post_metric_snapshots` | **132 rows** — engagement, impressions, reach, per post per channel. **Unread by the brain.** |
| `audience_snapshots` | **46 rows** — follower_count only: gained, lost, total. **Unread by the brain.** No demographics stored anywhere. |
| `leads` | Joins to `site_id`. **No `post_id`.** |
| `workspaces` | No timezone column. No category column. |
| Marketing Brain on `origin/wt-web` (production) | **Absent entirely.** `wt-web` is 215 commits behind `wt-core`. |

**Step 0 is done.** `20260826090000_generated_body_draft_capture` was applied to
production on 2026-08-26: 2 columns, 2 write-once triggers, 2 partial indexes,
`kind` widened to `('tone_drift','edit_distance')`. **0 customer rows touched.**
An ordinary post edit was executed against production inside a transaction and
rolled back, proving the new trigger does not break the edit path;
`updated_at` was byte-identical afterwards. `get_advisors(security)` returns
**0 findings** naming any new object, and the new function does not appear among
the 15 `function_search_path_mutable` warnings because the migration pins its
search path.

---

## Two standing rulings — settled, do not re-litigate

Both were ruled by the founder on **2026-08-26**, in their own words: *"yes brand
has veto, and move tone drift to brand brain"*. They had been open since
2026-08-25.

### RULING 1 · Brand has veto

**When the two hemispheres disagree, the Brand Brain wins.** The right brain is
who the business says it is; the left brain is what its numbers show. If the
brand says "calm and understated" and the best-performing posts are loud, the
brand wins and the measurement is reported rather than obeyed.

Encoded today only as **prompt ordering** in `packages/mesh/src/tasks/plan-week.ts`
— brand block before market block — and pinned by a test. That was correct as an
implementation and is now insufficient as a *record*: an ordering is a
convention a future refactor can quietly reverse. Step 7 must make the rule
explicit and store the conflicts it resolves.

Until then, **the ordering in `plan-week.ts` is load-bearing.** Anyone moving
those two blocks is changing a founder ruling, not tidying an array.

### RULING 2 · Tone drift moves to the Brand Brain

`tone_drift` becomes a **consistency check against the declared voice** — *"you
said you sound calm; your last ten posts do not"* — and stops being a marketing
measurement. It is not deleted. The arithmetic is sound and the sentence is
useful; it is simply a right-brain sentence.

**⚠ SEQUENCING, AND IT IS NOT NEGOTIABLE.** Do not execute this before step 2
lands. `tone_drift` is currently the *only* measurement the Marketing Brain has.
Retiring it first leaves the left hemisphere with **zero** computers and no
ability to produce anything at all. The order is: build the replacement, prove
it, then move this. Step 6 sits where it sits for that reason.

**A second trap for whoever executes it.** Narrowing `kind` back to exclude
`'tone_drift'` needs a NEW migration. `20260825000000` and `20260826090000` are
both applied to production and must not be edited. The narrowed constraint will
also be validated against existing rows, so any `tone_drift` row written between
now and then must be migrated or removed in the same migration, or the
`ALTER TABLE` fails.

---

## The build, in order

Each step names what it unlocks and the mutation that would prove its guard.

### 1 · Promote the code to production

The one gated step in the system. `wt-core` → `wt-web`. Nothing in this plan
reaches a customer until this happens, and after step 0 it no longer carries the
four-feature failure it would have carried before.

**Not startable by a lane.** Founder's act.

### 2 · Open the outcome data we already hold

Two new computers reading tables that exist and are populated today. **No new
collection.** This is the step that converts the left brain from "how you write"
to "what worked".

- **`channel_return`** — outcome per channel per post, from
  `post_metric_snapshots`. Decision it changes: *which channel deserves my
  evening.*
- **`audience_growth`** — followers gained against lost over a window, from
  `audience_snapshots`. Decision it changes: *am I growing or just busy.*

Both plug into the existing contract: same gates, same evidence receipt, same
decline vocabulary. `OBSERVATION_KINDS` and the `kind` CHECK both widen; they
must move in the same commit, and `check-constraints.test.ts` already adjudicates
that pair.

**Mutations that must go red:** drop the `workspace_id=eq.` term from the metrics
read (tenant boundary); let a single channel with one post clear the floor;
report a follower loss as growth.

### 3 · Content attributes at publish time

Store, per post: opener kind, length, whether it asks a question, whether it
carries an image, and the local hour it went out. Cheap, computed at publish,
never inferred later.

This is the **join key** that turns metrics into advice. Without it step 2 gives
a dashboard; with it the product can say *what to do next.* Unlocks `docs/53`
moment 1 and, negatively, "what to stop doing" — the finding nobody ships.

**Depends on step 4 for the hour to be honest.**

### 4 · `workspaces.timezone` and `workspaces.category`

Two columns. Neither exists. No claim about posting time can be made without the
first, and no cohort comparison without the second. Cheapest structural step in
the plan.

### 5 · `leads.post_id` and the attribution path

**The highest-value item here, and the only one that is broken rather than
missing.** Today `leads` joins to `site_id` and carries a free-text `source`, so
Sahoda cannot answer *which post brought me a customer* — the question that
survives a bad month.

Needs a column plus plumbing so a click from a post carries its origin through to
the form. Larger than it looks; it crosses `packages/publishing`, Sites, and the
lead capture path. **Do not fake it with a `source` string parse.**

### 6 · Move tone drift to the Brand Brain

**Founder ruling, 2026-08-26.** See RULING 2 above for the full statement, the
sequencing constraint and the migration trap. In short: relocate it as a
consistency check against the declared voice, retire `tone_drift` from
`OBSERVATION_KINDS`, narrow the CHECK in a NEW migration, and **do not start
this until step 2 has landed** or the left hemisphere is left with nothing.

### 7 · The connective tissue

Today the two hemispheres meet in exactly one place: prompt ordering inside
`plan-week`. There is no stored arbitration, no record that a conflict occurred,
and no channel for the left brain to propose a change to the right brain other
than the general `memory_events` queue, which nothing currently uses for this.

Build: a recorded conflict, its resolution, and the rule that resolved it. The
rule is settled — **brand has veto**, RULING 1 above — so this step encodes a
decision rather than making one. What it must add is durability: an ordering
inside a message array is a convention, and a convention cannot tell you that a
conflict happened, how often, or which way it went.

That record is also what makes the disagreement findings of step 9 possible.
A conflict nobody stored is a conflict nobody can learn from.

### 8 · The feedback loop — the step that makes it a brain

**Nothing in either hemisphere records whether an observation was seen, believed
or acted on.** Not shown-versus-unshown, not "that is wrong", not "I did what you
said and it worked".

This is the difference between a brain and a filing cabinet. Both hemispheres
currently only accumulate; neither is ever corrected by outcome. A brain survives
because being wrong costs it something, and ours cannot currently be wrong in any
way it would notice.

Store, per observation: displayed at, dismissed at, disputed with reason, and any
action taken that cites it. Then the thresholds in `tone-drift.ts` and
`edit-distance.ts` stop being constants somebody chose and start being numbers
the product earned.

### 9 · Audience make-up collection

`audience_snapshots` holds follower counts only. Demographics are stored nowhere.
Collecting them unlocks the strongest sentence a two-brain system can produce:

> "You describe your customer as a young professional. The people who actually
> engage are families at weekends."

Neither hemisphere can say that alone. It is also the finding most likely to
change positioning, which is why it is worth the collection work.

### 10 · Store the declines and the runs

Every week the pass computes why each workspace produced nothing, then discards
it into an HTTP response. There is also no row anywhere recording that the pass
ran at all — only one Upstash key with a 30-day TTL.

**The history of not knowing is the asset that cannot be copied by a competitor
starting today.** It is also the only way to ever show a customer that Sahoda has
been watching since March and first had enough to speak in June.

### 11 · Cross-customer cohorts

Deliberately last. The privacy constraint belongs in the schema, not in the
query. Depends on step 4's category column.

---

## What this plan does NOT cover

The founder's chain is Brand Brain → Marketing → Creative → Leads → CRM →
Business Growth. This session audited **two of those six stages**. Nothing is
known, measured, about what Creative, Leads, CRM or Growth store, whether they
would feed either hemisphere, or whether the chain connects at all. Step 5 pokes
at the Leads boundary and will probably surface more.

Audit those four before treating this as a whole-product plan.

## Standing traps for whoever picks this up

- **The gate has been runner-starved repo-wide since 2026-08-26 11:07:46Z.** Every
  `gate` job completes in 2-5 seconds with `runner_id: 0`. A long run *duration*
  is the gap between attempts, not recovery — read the job record.
- **Playwright cannot run in a cloud sandbox.** Chromium completes no outbound
  HTTPS request. REQUESTS §25.
- **A turbo leg under one second is a cache replay.** Use `--force` or you have
  verified nothing. This caught me in this very session.
- Adding one table turns six existing repo guards red, each naming its remedy.
  Budget an hour and do not reach for `PERF_BUDGET_WRITE=1`.
