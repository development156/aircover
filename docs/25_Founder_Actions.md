# What only you can do

Everything in this list is blocked on you — not because it is unfinished, but because it needs a
decision, a password, or a person. Ordered by how much it holds up.

**Last checked against the live site and the live database on 19 August 2026.** Two things this page
said last time were wrong, and both are corrected below: your web address is already working, and the
reason the nightly numbers job never ran is not the one we thought.

---

## 0. Get sandbox Cashfree keys — the ones in the repository are production keys

**Blocks: every payment. Nobody can buy anything, and no amount of code fixes it.**

The keys you pasted are **live production keys**, not sandbox ones. Cashfree's secret key
carries its environment in the key itself, and yours says `prod`. The sandbox refuses a
production key, which is why the error is `401 authentication Failed`.

Two separate problems, and both need you:

**a. They are the wrong environment.** Sandbox keys look different — the secret starts
`cfsk_ma_test_` rather than `cfsk_ma_prod_`, and the App ID starts `TEST` rather than `CF`.
Get them from the Cashfree dashboard with the environment toggle set to **Test/Sandbox**,
not Production.

**b. They do not work against production either.** MEASURED 2026-08-20: the same pair was
refused by the production host too, with the same 401. That is a separate thing to chase
with Cashfree — most likely the merchant account is not fully activated, or the App ID and
secret are from different key pairs. Worth asking them directly, because it will block go-live
even after the sandbox keys arrive.

**And they were in the wrong file.** You pasted them into the repository's top-level settings
file. The app reads its settings from the `apps/web` folder, and that file still held the OLD
broken pair — the two 40-character values that were identical to each other. So even correct
keys pasted there would not have reached the app. When you paste the sandbox keys, they need
to go in **`apps/web`**, and the two values must differ from one another.

**How you will know it worked:** the check reports `HTTP 200` instead of `HTTP 401`. Nothing
downstream can be tested against a real order until it does — everything else in the payment
system has been proven against a real database instead, which is as far as it can be taken
without this.

**Also blocked, separately:** the ten `SAHODA_GST_*` settings are unset, so invoices cannot be
issued at all. That one is not a bug — see `docs/29_GST_Questions.md`, which is written to be
handed to an accountant as it stands.

---

## 1. Merge this branch into the one that goes live

## 1. The nightly numbers job has never run, and every day costs you a day

**Blocks: history that cannot be recovered later. This is the most expensive item on the page.**

Sahoda is supposed to write down how your posts performed, once a night. It has never done it. The
27 measurements in the database are the three times somebody ran it by hand. The most recent covers
18 August. Nothing was recorded for today.

This matters more than it sounds. Instagram and Google only ever tell us **today's** numbers. Last
Tuesday's are gone for good, and no amount of asking later brings them back. Every night this does
not run is a permanent hole in every chart you will ever see.

**Why it never ran, stated plainly.** The live site is built from one branch of the code, called
`wt-web`. The numbers job was written on a different branch. It is not that the job is broken, or
switched off, or misconfigured — **the live site does not contain it at all.** We checked by asking
the live site for it: it answers "no such thing", in exactly the same words it uses for a page that
was never written. The five-minute job that publishes your posts sits right next to it on the same
live site and answers normally, so the scheduling itself works fine. One is there and one is not.

**What has to happen: the newer branch has to be merged into the live one.** There is no smaller
version of this. We deliberately did not do it — see item 2.

**Is there a way to start collecting tonight, without that merge?** Yes, one, and it is a stopgap:
the job is an ordinary program that talks to your database directly, so it can be run on a schedule
from somewhere other than the website — a nightly task on a laptop that is switched on, or a free
scheduled job on GitHub. It would collect the same numbers into the same table. It is worth doing
only if the merge is going to wait more than a few days, because it puts a second thing to remember
in a second place.

> **One sentence for the record:** the nightly numbers job has never collected anything because the
> live site is built from a branch that does not contain it, so it starts the night that branch is
> merged, and nothing else needs switching on.

---

## 2. Decide about the merge — and know what it carries

**Blocks: item 1, and everything built in the last several weeks.**

The gap between the branch that is live and the branch with all the recent work is:

| | |
| --- | --- |
| Separate pieces of work | 79 |
| Files changed | 410 |
| Lines added | about 38,700 |
| Lines removed | about 1,300 |

It goes in cleanly — the live branch has nothing on it that the new one does not already have, so
nothing has to be reconciled by hand.

**The honest part: no human being has used any of it.** Every one of those 79 pieces of work was
checked by automated tests, several thousand of them, and they all pass. But a test only asks the
question it was written to ask. Nobody has signed in, written a post, and looked at the result with
their own eyes. That is not a small caveat on a change of this size — it is the single largest
untested thing in the whole product, and it is item 5.

Merging is a decision, not a task, which is why it is yours and not ours.

---

## 3. Give the database tool its password

**Blocks: nothing today, but it makes every future database question slower and more manual.**

One of the tools that is supposed to read and change your database reports **"Unauthorized — please
provide a valid access token"** every single time. It has no password configured, and only you can
add one, in that tool's settings.

Nothing was blocked by this. Everything needed was done another way, by connecting to the database
directly and reading only. **No change was made to your database.** But every question that could
have been one step became three.

---

## 4. Move Clerk off its test keys — this is a one-way door

**Blocks: nothing visibly, until it blocks everything at once.**

Clerk is what signs your customers in. It has two modes: a test mode for building, and a live mode
for real customers. **Your live site is running the test mode right now.** We did not infer this —
Clerk itself says so, in the live site's own browser console:

> "Clerk has been loaded with development keys. Development instances have strict usage limits and
> should not be used when deploying your application to production."

Three things follow, and the third is why this is urgent rather than tidy:

1. **There are usage limits.** A test instance is capped. Fifty beta users will approach that cap.
2. **It is slower for everyone.** A test instance makes each visitor's first request bounce through
   an extra step before the page loads. That step is why one of our own automated checks currently
   fails against a perfectly healthy site.
3. **Switching is one-way, and it gets more expensive every day.** Test-mode accounts do not move to
   live mode. Every person who signs up between now and the switch is an account that has to be
   dealt with by hand or asked to sign up again. **The cheapest day to do this was any day before
   today, and the second cheapest is today.**

---

## 5. Walk the product yourself, as a customer

**Blocks: confidence. This is the largest untested area in the product.**

Nobody has used this as a customer would since Brand Brain shipped. Everything has been proven by
automated checks, and those checks are only as good as the questions they were written to ask.

What no check can tell you is whether the thing is any *good*. Whether the words make sense. Whether
writing a post feels like being helped. Whether a screen you would open every day is laid out the
way you would want it.

**What to do, once item 2 is done:** sign in as yourself and write one real post, end to end. Pick a
channel, choose a format, write the words, attach a picture, set a time. Then look at the analytics
page, the planner, and the inbox.

Write down anything that made you pause. A pause is a defect even when nothing is broken.

---

## 6. Publishing is still switched off, and the reason has changed

**Blocks: posts actually going out.**

Publishing was held back over a specific fear: that sending the wrong account identifier to our
publishing partner would post one customer's content to another customer's feed, and their system
would answer "success" and raise no error.

**That protection turns out to already exist, and it has been proven against your real database.** A
check inside the database works out which customer a post belongs to *from the post*, and refuses to
hand back an account unless that customer genuinely owns it, with a live connection, on the same
channel. It was tested with one workspace's post and another workspace's real, active Instagram
account, with a made-up account, with a mismatched post, with an empty value, and with text designed
to confuse a database. All refused.

**What to do:** publishing is your call now, not a technical blocker. Before turning it on, read the
note in the code marked SL-069 — there is a separate, narrower risk about a post going out twice if
a publish is interrupted at exactly the wrong moment, and that one is not closed.

---

## 7. Your web address already works — nothing to do

**Correcting the last version of this page, which listed it as blocked on you.**

`app.sahodalabs.com` is live, is pointed at Vercel, and serves the same site as the temporary
address. We opened it in a real browser: it loads, redirects to the sign-in page, and the page
renders. Your marketing site on `sahodalabs.com` and `www.sahodalabs.com` is a separate Framer site
and is unaffected.

The one blemish is cosmetic: the site has no icon file, so browsers log a small "not found" for it.

---

## 8. Create a Trigger.dev access token — or decide you do not need one

**Blocks: nothing.**

Some background jobs were originally written for a service called Trigger.dev. Nothing has ever been
deployed there, and deploying needs a personal access token only you can create.

**You probably do not need to.** Everything that needs a schedule now runs through the website's own
scheduled requests, which have been firing every five minutes for months. The Trigger.dev route is a
spare nobody is using.

**What to do:** either create the token, or say the word and the unused wrappers can be removed so
nobody wonders whether they are live.

---

## 9. Four features have tables and nothing else

**Blocks: nothing. This is a planning decision.**

Five tables are live and **completely empty** — we counted, on 19 August: templates 0, campaigns 0,
campaign_posts 0, assets 0, asset_usages 0. Templates has since gained a first screen, and nobody
has saved one yet. The other screens still say "coming soon" and show no figures.

The order that costs least:

1. **Campaigns** — small to build, but the useful part is budgets and paid ads, and those need
   approval from Meta and Google that takes as long as it takes.
2. **Assets** — largest. A picture library needs uploads, and a "where is this used?" check before
   anything can be deleted safely.

**What to do:** pick one, or say none of them matter yet.

---

## 10. Two things nobody should run but you

**A backup restore drill** and **a rollback rehearsal**. Both are on the operations list and both are
deliberately left to you: proving a backup restores means restoring it, and nothing automated should
be allowed to practise that on the database your customers are in.

---

## 11. The migration record, repaired — 21 August 2026

`supabase_migrations.schema_migrations` had drifted behind the files. This is what was
found, what was changed, and the one thing left that is yours to decide.

### What was actually true

The brief for this work said production recorded **36** migrations. It recorded **46**.
That number had moved since somebody last looked, which is the whole reason this section
exists: a count written down is a claim about a moment, and the only honest way to use one
is to re-measure it.

Against the 52 migration files the integrated branch carries, **8** were unrecorded. Each
was checked against production for whether its objects are actually there — not whether
its file looks like it ran:

| migration | in production? | action |
|---|---|---|
| `20260819000000_post_variant_version_cas` | `save_post_variant` exists | **recorded** |
| `20260819000100_post_metric_snapshots` | table exists | **recorded** |
| `20260819000200_post_variant_format` | `post_variants.format` exists | **recorded** |
| `20260819000300_templates` | table exists | **recorded** |
| `20260819000400_assets` | `assets` + `asset_usages` exist | **recorded** |
| `20260819000500_campaigns` | `campaigns` + `campaign_posts` exist | **recorded** |
| `20260805000000_clerk_id_remap` | **absent** — no `clerk_id_map`, neither function | left alone |
| `20260811000000_realtime_publish_state` | **absent** — publication exists, neither table added | left alone |

Six rows were inserted. **No DDL was run**, and the script that did it contains none: each
version's objects were re-checked inside the same transaction as its insert, so there is no
moment where a check passed and the thing it checked stopped being true. It also refuses to
write to a database that is not this project, which it proves from the project's own
fingerprint rather than from the connection string it was handed — the first version of that
guard read the ref out of `current_user`, and the pooler reports plain `postgres`, so the
guard refused. A signal that is not there is not a check.

`schema_migrations`: **46 → 52**.

### The count matches and the sets do not, which is the more useful fact

52 files, 52 records. They are not the same 52:

- **2 files are not recorded** — `clerk_id_remap` and `realtime_publish_state`, because they
  genuinely have not been applied.
- **2 records have no file** — `20260812000000_ai_provider_logs_repaired` and
  `20260812000001_resolve_brand_memory_v2`. Both are live in production. Their files exist
  only on the `wt-db3` branch, which is not part of this integration. **A fresh environment
  built from this branch would not have them.** That is worth closing, and it is a
  cherry-pick, not a migration.

### Is `db push` safe now?

**Yes, and here is exactly what it would do:** run those two unrecorded files and nothing
else. Both are fully guarded — `create table if not exists`, `create or replace function`,
`alter table … enable row level security` (a no-op when it is already on), and the realtime
one is a single `do $$ … if not exists … end $$` block. Neither can fail on a database that
already has the objects, and neither drops or rewrites anything.

**The decision that is yours:** `realtime_publish_state` adds `posts` and `post_variants` to
the `supabase_realtime` publication. That is not a schema tidy-up — it turns on realtime
replication for two tables, which is a behaviour change with a cost. Nothing in this
integration needs it. It was left unapplied deliberately rather than swept along with a
`db push`.

---

## 12. `pnpm gate` fabricates failures on this machine — 21 August 2026

Not a code problem and not yours to fix, but it will cost the next person hours if
nobody writes it down.

`pnpm gate` runs `turbo run typecheck lint test` at turbo's default concurrency: 27
tasks at once, on a 12-core box, where `@sahoda/web:test` alone spawns about eleven
vitest workers and several `packages/db` suites boot a real Postgres in-process.
That oversubscribes the machine, and what comes back looks exactly like broken code.

MEASURED across three gates of one **unchanged** tree during this integration:

| what the log said | what was actually true |
|---|---|
| five packages, `Error: Worker exited unexpectedly` | zero crashes re-running the identical command on an idle machine |
| `@sahoda/db` — 4 failures **and 202 → 233 skipped** | 203 passed / 202 skipped standalone, exit 0 |
| two web tests, `Hook timed out in 10000ms` | 12/12 passed standalone |

`--concurrency=2` (with root vitest at `--maxWorkers=4`) ran **27/27 successful** on
the same tree, and every gate from that point on was deterministic.

**The tell is the skip count, not the failure count.** A PGlite suite that cannot
open its box reports `skipped`, not `failed` — so a run like that is not "4
failures", it is 4 failures **and 31 tests that silently did not run**, with the
total unchanged. Always diff passed/skipped against the previous run.

And it is **not** the OOM killer, which is the first thing anyone will suspect here:
`journalctl -k` showed zero kills with 11–12 GB free, every time. Suspecting memory
sends you to `free` and the journal, both of which look fine, and then to the merge
you just made, which is innocent.

**What to do:** decide whether `pnpm gate` should carry `--concurrency=2`
permanently. It is a one-line change to the root `package.json` and it was
deliberately NOT made here — the gate script is a repo-wide contract and this
evidence comes from one machine.

---

## 13. Four migrations applied for the Knowledge Library — 22 August 2026

Applied to the production project (`rloztdhzfliyvpvxsgjl`), one at a time, through
`packages/db/scripts/apply-one-migration.mjs --apply`. These four took
`schema_migrations` from **54 to 58**.

That is a DELTA, not the current total. Other lanes applied five more the same day
(`playbooks` ×3, `radar` ×2) and the count read **63** a few hours later — so a
future reader comparing 58 against the live number will find a gap that is nobody's
mistake. Compare the version stamps, not the count.

| version | what it does |
|---|---|
| `20260822000000_knowledge_library` | `knowledge_documents` + `knowledge_chunks` + the `knowledge_current_chunks` view + five write functions |
| `20260822000100_knowledge_revoke_anon` | takes EXECUTE on those five away from `anon` |
| `20260822000200_propose_memory_event` | lets `apps/web` offer a Brand Brain change as a pending proposal |
| `20260822000300_delete_gate_matches_passage_citations` | the delete gate counts a passage-level citation, not only a document-level one |

**Nothing that was working before can be affected by these.** Both tables are new,
all six functions are new, and the one function that was REPLACED
(`delete_knowledge_document`) had existed for four minutes and had no caller in a
deployed build.

### Three things worth knowing, each measured rather than assumed

**There is no pgvector on this project.** `pg_extension` holds five extensions and
`vector` is not among them; it is available (0.8.2) and not installed. So the
library searches with Postgres full-text search — free, deterministic, no model
call — and `packages/db/CLAUDE.md` was already right that "pgvector HNSW for
`brand_embeddings` is post-Alpha (not in this schema)". The root `CLAUDE.md`'s
stack line still says `db(Supabase+RLS+pgvector)`, which describes an intention
rather than the database.

**The library needs no new storage rules.** `storage.objects` already carries
`tenant_media_{read,insert,update,delete}` scoped by
`(storage.foldername(name))[1]::uuid IN app.member_workspace_ids()` for the `media`
and `brand-assets` buckets. Files go to `media/<workspace_id>/knowledge/<uuid>.pdf`,
so the same policy rows that protect a customer's photos protect their documents.
Verified live: workspace B could not download A's file by its exact path, could not
list A's folder, and could not write into it.

**`revoke all … from public` does not do what it reads like.** It removes the PUBLIC
pseudo-role's grant and leaves the one Supabase's default privileges hand DIRECTLY to
`anon`. Measured right after the first file applied: `resolve_brand_memory`,
`resolve_memory_event` and `upsert_connection` all deny `anon`; all five new functions
allowed it. `20260822000100` is the correction, and it asserts the resulting
privileges at apply time because a revoke that targets nothing succeeds silently.
**`public.delete_asset` has the same gap** and was deliberately left alone: it is
`security invoker`, so an anon caller is refused by RLS rather than by a membership
check, and it belongs to another lane. Recorded here rather than quietly changed.

### Two things you may want to decide

**A defect that shipped before this lane and is now fixed.**
`public.resolve_memory_event` writes new brain versions with `source = 'system'` —
and so does the model-unreachable fallback. `/brain/resolve` renders `'system'` as
"A sample, not your brand… These are not answers about your business", in the danger
palette with an alert role. So accepting a Loop learning told the owner their whole
Brand Brain was a fabricated placeholder. Measured against production on a throwaway
workspace. The fix reads `memory_events.applied_memory_version` to tell the two
apart, rather than adding a fourth value to `BrandMemorySourceSchema` — which would
have meant moving a frozen contract to correct a rendering bug. If you would rather
have the fourth value, that is a schema change and a shared-package change, and it
is your call.

**Ingestion is free and has no entry in `pricing.config.json`.** Parsing is local,
chunking is arithmetic, and search is the database's own index — no model is called
when a document is added, searched or deleted. The one control that DOES spend is
"Read my library", which runs `brand_extract`, and it carries `brand_research`'s
price in its own label. If you want adding a document to cost credits, that is a
pricing decision and nothing in the code assumes either answer.

---

## 14. Nothing in this product is on a schedule yet — 23 August 2026

Five separate switches, all off. None of them is broken and none is waiting on code. Each one
is off because turning it on is a decision somebody has to make, and this is that list.

**The single most important sentence on this page:** GitHub only fires a scheduled workflow from
the repository's **default branch**. The `.github/workflows` folder is not on it. So the three
nightly jobs in this repository — numbers, Radar and audience — are not merely unarmed, they
cannot fire at all, no matter what secrets are set. That is why the nightly numbers job has still
never run.

The Vercel crons are the opposite: all four ARE scheduled and all four ARE now reachable. Two of
them then decline to do anything, on purpose, because of the switches below.

### What was measured, on 23 August 2026, against the live site and the live database

All four Vercel cron paths answer **401** when called without the secret, and **200** with it.
That matters because until recently two of them answered **307** — a redirect to the sign-in
page, which Vercel's cron does not follow — so the schedule fired, got a redirect, and reported
success every single time while doing nothing. The check that proves the difference is that a
path which has **never existed** also answers 307; so a 401 is the route saying "I am here and
you did not identify yourself", and a 307 was the route not being reached at all.

With both switches turned on and the correct secret, run against production:

- the weekly Loop answered `eligible: 1, planned: 0`
- the daily Playbook check answered `due: 0, proposed: 0`
- the credit ledger was unchanged, before and after: 213 entries both times

So arming them today would spend nothing. The reason is section (c) below, and it is the thing
on this page most worth your attention.

### The five switches

| # | Switch | What arming it does | What it spends |
|---|---|---|---|
| a | `SAHODA_LOOP_CRON_MODE=on` | The Sunday 21:00 UTC Loop plans the coming week for every workspace that has opened the Loop screen and not paused it | 20 credits per workspace per week, before anyone sees anything. Drafting the briefs costs 3 credits each and only happens after a person approves |
| b | `SAHODA_PLAYBOOKS_CRON_MODE=on` | The daily 06:00 UTC check looks seven days ahead for festivals and prepares a proposal | **Nothing.** It stops at the cost preview and waits for you |
| c | `.github/workflows` on the default branch | The three nightly jobs become able to fire at all | Numbers and audience: bounded reads, no credits. **Radar spends real money the first night it runs** |
| d | `ZERNIO_WEBHOOK_SECRET` + a subscription registered with Zernio | Comments, reviews and direct messages start arriving in your Inbox | Nothing. Without it the endpoint correctly answers "not configured" and Zernio has nobody to deliver to |
| e | `SAHODA_PUBLISH_ENABLED` | See section 6 — publishing stays off | — |

**All five are the safe direction.** Every one of them requires the exact string `on` (or a real
value), so a typo leaves it off, which is what you want for anything that spends.

### (c) is the one that would surprise you, and (a) is the one that would disappoint you

**Radar's nightly pass spends money on its first run**, before anybody has looked at a single
result. It fetches competitor pages through a paid provider. It has a daily cost cap and a
per-workspace share, and both were checked: when the cap is reached, the provider is **not
called** — verified by deleting the refusal and watching three tests fail because the provider
had been called once instead of zero times. So the spending is bounded. It is still spending you
have not agreed to yet.

**The Loop would plan for nobody, and this is a data problem, not a code one.** Exactly two
workspaces have ever opened the Loop screen:

- **your own workspace** has the Loop switched on — and has **no connected channels and no
  credits**, so there is nowhere to plan for and nothing to pay with;
- **Chai & Chapters (Demo)** has two live channels and 1,260 credits — and has the Loop
  **paused**.

So the one workspace that is eligible cannot be planned for, and the one that could be planned
for is switched off. Turning switch (a) on tonight would change nothing at all. If you want to
see the Loop run on its schedule, the action is not the switch — it is to connect a channel to
your own workspace, or to unpause the demo one.

The Loop itself works. A full cycle was run end to end against production on 23 August 2026 and
did exactly what it claims: it proposed five briefs at 15 credits, a person approved 12 of them,
the fifth was excluded and was **never drafted and never charged**, four drafts were written and
nothing was published. The ledger reconciled to the credit: 1,260 down to 1,228, and all nine
ledger invariants held before and after.

### Two smaller things, so they do not read as bugs later

**A playbook that is waiting for you stops proposing.** A playbook may have one live run at a
time, and a run that has proposed but not been approved is still live. So an unopened preview
blocks that playbook's schedule until you approve it or stop it. That is correct — opening a
second would charge you twice for the same festival — but it looks exactly like a broken
schedule. The screen now says so on the run itself.

**Radar's screen reads nothing yet.** The tables are in the live database and are empty, the
ingestion side is built and tested, and the screen is deliberately connected to nothing rather
than to guessed column names — an earlier attempt guessed `competitors.name`, the real column is
`competitors.display_name`, and every visit to `/radar` returned an error. One file connects it,
and the real column names are now recorded in the code so nobody has to guess again.

---

## 15. The Sunday job has been failing since 23 August, and four things stand between you and a customer's first planned week — 28 August 2026

**The headline: arming the Loop would not have worked.** Its one query named a
table that does not exist, so every tick since 23 August raised an error before
it looked at a single workspace. That is fixed on `claude/advisor-qvz5wn`. The
four items below are what is left, and none of them can be done from a session.

### What was wrong

`/api/cron/loop` reads every workspace and decides who to plan for. That read
asked for `loop_autonomy`; the table is called `loop_channel_autonomy`, and only
the migration FILE is named the short way. MEASURED against production on
28 August, running the query's own fragment:

```
ERROR:  42P01: relation "loop_autonomy" does not exist
```

So the job answered "the Loop cron failed" every time, for five days, and would
have gone on doing so however the switch was set. Nothing was watching, because
the only test of that function replaces the database with a stub that accepts
any text at all. There is now a test that sends the real query to a real
Postgres with every migration applied.

### 15a · Apply one migration

`packages/db/supabase/migrations/20260828100000_loop_reflect_reason.sql` adds one
nullable column, `loop_cycles.reflect_reason`. It records WHY a week produced no
learning. Six different reasons existed and only one of them was stored, so five
of them reached the screen as the same silence.

`pnpm db:push`. It is additive and touches no existing value. Until it runs, the
Loop keeps the sentence it had — the code deliberately retries without the
column rather than failing the write, because that write is what moves a cycle
from one stage to the next.

### 15b · Confirm the switch in Vercel

`SAHODA_LOOP_CRON_MODE` must be the exact string `on`. It is NOT set in this
sandbox's environment files, and what Vercel holds cannot be read from here. See
the table in section 14 for what arming it spends. With the fix above it will
now do something; before it, nothing.

### 15c · The fix has to reach the branch the schedule runs from

Scheduled jobs run against the DEFAULT branch and production serves `wt-web`.
This work is on `claude/advisor-qvz5wn`. A green gate on a lane changes nothing
a customer or a cron can see.

### 15d · Resume one workspace, and you have your first real cycle

MEASURED on 28 August, every workspace that has ever opened the Loop:

| workspace | on? | channels | credits | weekly budget | brain |
|---|---|---|---|---|---|
| `6473b616` | **paused** | Google Business + X, both live | **1,196** | 150 | resolved |
| `8846b067` | paused | Instagram + LinkedIn, both live | 0 | **0** | resolved, 4 of 15 confirmed |
| `01061fe0` | on | none | 4 | 150 | resolved |
| `526a15f9` | on | none | 7 | 140 | resolved |
| `7be165c3` | on | none | 50 | 150 | resolved |

Three have nowhere to plan for. Two are paused. Nobody is eligible, which is why
the last real tick reported `eligible: 1, planned: 0` — and until this week the
product said none of that out loud.

**`6473b616` needs one click.** It has two live channels, a resolved brain and
1,196 credits against a 150 budget. Resume it and the next Sunday tick plans its
week. Its current week is already reported, so nothing is lost by waiting for
Sunday rather than pressing Plan my week today.

`8846b067` is the Instagram workspace and needs two things rather than one:
credits, and a weekly budget above zero.

### What you should watch when you do it

The cycle stops at a cost preview and charges nothing until somebody approves it.
The ledger's nine invariants were checked against production on 28 August and all
nine hold with zero violations, so the balance you see before the run is the
number to compare against afterwards.
