> **SUPERSEDED 2026-09-06 by `docs/52_Beta_Launch_Night_Checklist_2026-09-06.md`.** Written before the audit, the smoke leg and the staging work. Its items are folded into 52 or marked done there. Do not work from this file.

# Everything you have to do yourself

**Nothing on this page can be handed to a session.** Each item needs a human — a login, a payment, a consent screen, a signature, or a judgement only you can make.

Ordered by what blocks the most.

---

# Part 1 · This week

## 1 · Use the product for an hour · nothing else on this page matters as much

You have hundreds of commits and thousands of files that **no human has ever used**. Every green light in every report is a test, a gate, or a database read. Not one is a person trying to get something done.

```
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/<latest branch>
pkill -f "next dev"
rm -rf apps/web/.next
pnpm install
pnpm dev -- -p 3300
```

**Kill the server before deleting `.next`.** If you delete it under a running server, the process holds the deleted files and one page answers normally while everything else dies. It looks exactly like the code is broken. It isn't.

Then, **on your phone**, sign up with a fresh email and try to do this without helping yourself:

1. Get through onboarding
2. Write one post
3. Pick two channels
4. Make the two versions genuinely different
5. Schedule it

**Write down every moment you hesitate.** Not bugs — friction. Where you didn't know what to click. Where you expected something and nothing happened. Where it felt slow.

Every defect that actually mattered in the last twenty sessions was found the moment a human opened a browser. A navigation bar that read "S Sah". A chart that looked broken. Four orange buttons shouting at each other. A month calendar that wasn't a calendar on a phone. **None came from tests, and you have more tests than most funded companies.**

## 2 · Connect one Instagram account · 5 minutes

Go to `/connections` and connect Instagram.

Five screens have never displayed a single real row — the inbox, its four sub-pages, and analytics. They have been built against the *shape* of the data, never against data. And the Loop cannot run at all without a connected channel.

OAuth needs a human at a consent screen. **No session can do this for you.**

## 3 · Upgrade Supabase to Pro · $25/month · 5 minutes

You are on Free. That means **no point-in-time recovery**, a project that pauses after a week of inactivity, 500 MB of database and 1 GB of file storage.

One month of generated images fills that. And a pause on a live product is an outage.

Do it before the first paying customer.

## 4 · Merge and deploy

Production may be well behind your branches. Check:

```
git log wt-web..<latest integration branch> --oneline | wc -l
```

Every fix from every session is **local until this merges**. A green gate on a branch does not fix anything for a customer.

**Order matters and reversing it breaks signup:** deploy first, *then* apply the held migrations. The plan migration in particular — applying it before the deploy breaks account creation, because the live code still reads a plan row the migration removes.

---

# Part 2 · Before real customers

## 5 · Clerk production keys · 30 minutes · one-way door

Your live product runs on a **test** key. Clerk's own console says so.

Two costs, and both grow every day:

- Everyone who signs up before the switch is another account to remap **by hand** afterwards
- Development keys add four to five extra network round-trips to every first page load

The migration machinery is built and rehearsed and has never been applied. It gives every existing user a new ID, and 14 columns across 128 rows have to be remapped. **Get it wrong and everyone signs in successfully to an empty product.**

Do it on a quiet morning, not at the end of a long day. Ask for the migration session; do not improvise it.

## 6 · Restore a backup and time it · 1 hour

**You have never restored this database.** An untested backup is a belief, not a capability — and you are about to hold fifty businesses' data in it.

Restore to a fresh throwaway project. **Write down how long it took.** That number is your real recovery time and right now nobody knows it.

Needs Supabase Pro first.

## 7 · Cashfree — sandbox keys and a support ticket

**Sandbox keys:** in the Cashfree dashboard, switch to Test mode, copy the App ID and Secret from Developers → API Keys. Test keys look like `TEST…` and `cfsk_ma_test_…`. Paste them into `apps/web/.env` — **not** the repo root. Next only reads the app directory.

Then check without printing anything:

```
node scripts/check-cashfree.mjs
```

**Support ticket:** your production keys return 401 against Cashfree's *own production* endpoint. That is account-side and only they can answer it. Sandbox unblocks development meanwhile.

## 8 · A lawyer

Terms of Service, Privacy Policy, Data Processing Agreement.

You cannot take money from businesses without these, and billing is built and waiting.

## 9 · A chartered accountant

Take `docs/29_GST_Questions.md` to a CA. Eleven questions, each stating what the code currently assumes.

The main ones: the tax rate on software subscriptions, the SAC code, whether your listed prices include tax or add it, and how place-of-supply works when a customer is in another state.

**Until those answers come back, the invoices your system generates are labelled fixtures, not tax documents.**

---

# Part 3 · Switches nobody has flipped

These ship OFF on purpose because arming them spends money. Each is one environment variable.

| Variable | What it does | Cost when armed |
|---|---|---|
| `SAHODA_LOOP_CRON_MODE` | The weekly Loop cycle runs on schedule | 20 credits per cycle plus creations |
| `SAHODA_METRIC_CAPTURE_MODE` | Nightly performance collection | Zernio API calls per connected channel |
| `SAHODA_PLAYBOOKS_CRON_MODE` | Playbook triggers fire | Per-run, varies by recipe |
| `RADAR_FIXTURES` | Competitor tracking nightly pass | Per competitor per day |
| `ZERNIO_WEBHOOK_SECRET` | Webhook receiver verification | Free — but the receiver is deaf without it |

**Metric collection is the one to arm first**, and the reason is that it cannot be backfilled. Every night it does not run is performance history that does not exist and never will. The Loop's Reflect stage has nothing to reflect on until it has been collecting for a while.

**And a webhook needs three steps, not one:** set `ZERNIO_WEBHOOK_SECRET` in Vercel, deploy, then register the endpoint in Zernio's dashboard with the same secret. Skip the third and Zernio never knocks.

---

# Part 4 · Decisions only you can make

## The Radar vendor question

Radar tracks competitors. It needs either **scraping public feeds** — brittle, and against most platforms' terms — or **a social-listening API priced per tracked account**.

Twelve competitors across fifty workspaces is 600 tracked accounts. Your own vendor rule says never rent per-customer.

**This is a margin question before it is an engineering one**, and Radar cannot go further until you answer it.

## Sign-up mode

Clerk is currently **Public** — anyone with the link can create an account. Fine if you want it, but it means item 5 gets more expensive every day.

Restricted means you invite each beta user by hand. For fifty hand-picked businesses that is arguably right.

Either way it should be a decision, not a setting nobody looked at.

## The X post cap

X has no free tier: **$0.015 a post, $0.200 with a link** — and nearly every marketing post carries a link. At the old cap of 40 posts, one workspace could cost you $8 a month on X alone, which is 67% of a Starter plan's revenue.

It is now capped at 12, about three posts a week. Raising it is a pricing decision.

## Autopilot, when it ships

L3 publishes without you in the room. When you arm it the first time: **one channel, one day, one post, and watch it.** The guardrails are built to make that safe; nothing makes it safe to look away on the first run.

---

# Part 5 · Housekeeping, whenever

**Fifty-plus worktrees on disk**, each holding a full `.env` with your service-role key, Clerk secret, token vault key and payment credentials. That is fifty copies of every secret you own. Most are from dead lanes. `git worktree remove` the ones you are done with — but read their reports first, because `.gitignore` has a `*.md` rule and removing a worktree takes its report with it.

**Test debris in production** — a handful of stranded workspaces, some test-origin ledger rows, and leftover Clerk users from suites that were writing to your live database before the guard existed. All counted, none deleted. Your call.

**Your test workspace is still named "Sahoda QA Bakery"** from a rename test.

**Two files claim `docs/13`.** A session told to read doc 13 reads whichever it finds first and builds confidently on the wrong one.

**Two skill files cite a superseded design document** — `.claude/skills/sahoda-ui/` and the `ui-agent` subagent both point at `docs/08_Design_System`, which is v1.0. `docs/37` is current. Fix or delete them, or a session builds confidently wrong. **This has already happened once.**

---

# The order, if you only do five things

1. **Use it for an hour on your phone**
2. **Connect one Instagram account**
3. **Supabase Pro**
4. **Merge and deploy** — then apply the held migrations, in that order
5. **Clerk production keys**

Items 1 and 2 together are sixty-five minutes and they unblock more than anything else on this page.

---

## The one sentence worth keeping

The engineering is ahead of the finish. This product refuses to lie — it distinguishes seven different kinds of nothing, it will not render a figure it cannot prove, and its guards have been audited by other guards.

**What it has not had is a person using it.** That is item 1, and it is the only thing here that nobody else can do for you.
