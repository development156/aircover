# 52 · Beta launch night · everything you do by hand

**Date:** Saturday 6 September 2026, launch tonight. **Expected:** about 50 invited users on the Free plan.
**Supersedes** `docs/DO_THIS_YOURSELF_FINAL.md` (written before the audit, the smoke leg and the staging work; its items are folded in here or marked done).

Every line here needs a person: a login, a card, a consent screen, a decision. Nothing on this page can be done by a session, and a session wrote it from the code as it is on `wt-core` at `973c6534` plus what the dashboards answer (marked **MEASURED**). Where the page could not look (a plan tier, a balance, a dashboard toggle), the line says **CHECK** and tells you where.

**What 50 Free users cost the platform, so the numbers below make sense:** the Free plan is 100 credits a month, 2 connected channels, 0 sites, Loop level 1 (`packages/shared/src/billing/plans.ts`). Fifty users is at most 5,000 credits and 100 connected social accounts a month. The connected accounts are the bill: Zernio charges per connected account and was measured at about 89% of marginal cost (`docs/` pricing memo, 2026-08-17). The AI spend is small by comparison.

---

## 0 · The order, if the evening gets short

1. **Deploy** (§1). Production is 1,246 commits behind the trunk. Nothing else on this page reaches a customer until this does.
2. **The six keys the product cannot run without** (§2, rows marked REQUIRED).
3. **Zernio capacity and the webhook** (§3.4). Without capacity, the eleventh person to connect an account is refused; without the webhook, replies never arrive.
4. **Turn on the two crons that cannot be backfilled** (§4).
5. **Seed your own admin seat and approve the 50** (§5).
6. **Walk the golden path once yourself on your phone, on production** (§6).

Everything after §6 is "before the first paying customer", not tonight.

---

## 1 · Deploy the trunk to production · 45 minutes · the gated step

**MEASURED:** `wt-web` (the branch production deploys from) last moved on 2026-08-31 and is **1,246 commits behind `wt-core`**. Every fix from the audit, the smoke leg, the shell, the wallet and the onboarding parking is on the trunk and not in front of a customer. All 108 migrations in the repository are applied on production (`supabase_migrations.schema_migrations` = 108), so this deploy carries **no schema change**; it is code only.

**MEASURED:** `app.sahodalabs.com` answers from Vercel (`x-vercel-id: bom1::…`), but the only Vercel project this account's token can see (`sahodalabs`, team `development-4417s-projects`, linked to `development156/aircover`) carries no custom domain. The production domain is served by a project on another Vercel account (doc 17 §7 calls it "the old Vercel account"). You have that login; sessions do not.

| Step | Where | Check |
| --- | --- | --- |
| 1. Merge `wt-core` → `wt-web` and push | terminal: `git checkout wt-web && git merge --ff-only wt-core && git push origin wt-web` (if `--ff-only` refuses, stop and ask a session; do not force) | `git log -1 origin/wt-web` shows `973c6534` or later |
| 2. Watch the production build | the Vercel account that owns `app.sahodalabs.com` → Deployments | state READY, target Production |
| 3. Confirm the build is the new one | open `https://app.sahodalabs.com/sign-in` in a private window; the topbar on a phone shows the compact brand control and a 44 px Create button when signed in without a workspace | the shell from `28d2d974` / `973c6534` |
| 4. Confirm the env baked in | Vercel → that project → Settings → Environment Variables → **Production** tab | every REQUIRED row in §2 exists on the Production tab, not only Preview |

**Why the build can silently be the old one:** `NEXT_PUBLIC_*` values bake at build time, and Vercel cancels a build whose diff touches nothing under `apps/web` (REQUESTS §31, 2026-09-05). A merge of 1,246 commits will build; a later env-only change needs a real commit under `apps/web` to take effect.

**The one thing to decide before pressing merge:** the Plan Offer now waits until half the free credits are spent (`a0ddbbfc`, another session, today 12:00). That is the behaviour customers get tonight. If you want the offer earlier, say so before the deploy, not after.

---

## 2 · Keys and subscriptions · the full table

Every variable below is read by the app at runtime or build time (`apps/web/src/lib/env-schema.ts`, `turbo.json` allowlist, `packages/*`). **REQUIRED** means the app refuses to start or a customer-facing path refuses to run without it. **OPTIONAL** means the product degrades honestly (it says the feature is off) rather than failing. Paste each into Vercel → Production; the name is exact.

### 2.1 REQUIRED tonight

| Vendor | Plan you need tonight | Variable(s) in Vercel Production | Where to get it | How to verify | Cost for 50 users |
| --- | --- | --- | --- | --- | --- |
| **Vercel** (the account serving `app.sahodalabs.com`) | **Pro.** The cron schedules in `apps/web/vercel.json` run every 5 and 10 minutes; Hobby allows one run a day per cron, and Hobby forbids commercial use | `NEXT_PUBLIC_APP_URL=https://app.sahodalabs.com`, `CRON_SECRET` (any 32+ random chars; Vercel sends it to the cron routes) | Vercel → Settings → General (plan) · Settings → Cron Jobs (they must be listed and enabled) | Settings → Cron Jobs shows 7 crons; a "Last run" time appears within 10 minutes of the deploy | $20/month |
| **Supabase** (`rloztdhzfliyvpvxsgjl`, ap-south-1, Postgres 17.6) | **Pro ($25).** Free has no point-in-time recovery, 500 MB database, 1 GB storage, and pauses after a week of inactivity. Fifty users' generated images pass 1 GB in a month | `NEXT_PUBLIC_SUPABASE_URL` (bare origin, no path), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (the **session pooler** string, `aws-1-ap-south-1.pooler.supabase.com:5432`, never the direct host: it is IPv6-only and Vercel cannot reach it), `SUPABASE_JWT_SECRET`, `SUPABASE_PROJECT_REF=rloztdhzfliyvpvxsgjl` | Supabase → project → Settings → API and Settings → Database. Billing → Plan | `node scripts/smoke-db-probe.mjs` with `SUPABASE_DB_URL` set prints "signed in to rloztdhzfliyvpvxsgjl" (this is the same probe CI runs; a wrong password cost three CI runs today) | $25/month; add the Compute add-on only if the dashboard shows CPU above 60% |
| **Clerk** (development instance `leading-hyena-7`) | Stay on the **development instance tonight** (see §7 for why production keys cannot be pasted tonight). **CHECK** the instance's user limit and Google sign-in status in Clerk → Configure → SSO connections; a development instance uses Clerk's shared Google credentials, which show a Clerk consent screen | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_…`), `CLERK_SECRET_KEY` (`sk_test_…`), `CLERK_WEBHOOK_SECRET` (Clerk → Webhooks → the endpoint for `https://app.sahodalabs.com/api/webhooks/clerk`, event `user.created`) | Clerk → API Keys; Clerk → Webhooks | sign up with a throwaway email on production; the webhook's "Attempts" tab shows a 2xx for `user.created` | Free up to Clerk's development limits |
| **Zernio** (publishing rail: Instagram, Facebook, GBP, LinkedIn, X) | Enough **connected-account capacity for 100 accounts** (50 users × 2 channels on Free). Doc 17 §3 G3: "ask Zernio what the cap counts". Their answer is the number that decides whether the eleventh, or the hundred-and-first, connection is refused | `ZERNIO_API_KEY` (exactly `sk_` + 64 hex; the schema refuses any other shape so a truncated paste fails at deploy, not at a customer's publish), `ZERNIO_WEBHOOK_SECRET` | Zernio dashboard → API keys; Webhooks | `/connections` on production offers the connect buttons (without the key they say publishing is not set up); after §3.4, Zernio's webhook page shows deliveries | **CHECK** the invoice: roughly $4.80 per connected account per month at volume (doc 17 §3), so up to ~$480/month at 100 accounts. This is the launch's real bill |
| **OpenRouter** (every model call: Brand Brain, captions, variants, images, weekly plan) | A **prepaid balance** and a **spend limit** on each key. Fifty users on 100 credits each cannot spend more than the credit ledger allows, but a runaway loop can; the limit is the backstop | `OPENROUTER_API_KEY_TEXT`, `OPENROUTER_API_KEY_RESEARCH`, `OPENROUTER_API_KEY_IMAGE` (three keys so a bill can be read per purpose) | openrouter.ai → Keys (create three, name them text/research/image) → Credits | Onboarding on production builds a Brand Brain (one model call); Settings → Usage shows the charge | Small: the credit grants were measured at 9–89× the derivable model burn. Load $50 and set a $100/month limit per key |
| **Upstash Redis** | Free tier is enough for 50 users (10k commands/day) but **CHECK** the daily command count after launch night: the palette rate limit, cron heartbeats, the FX cache and the new parked Brand Brain all use it | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com → the database → REST API | Close the tab mid-onboarding on production, reopen: the built brain is still there (that is the park, `102c54e4`) | Free, or $10/month Pay-as-you-go if the count passes 10k |
| **Cloudflare Turnstile** (bot check on sign-up and the public lead form) | Free | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, with **`app.sahodalabs.com` added to the widget's allowed hostnames** | Cloudflare dashboard → Turnstile → the widget | the sign-up page shows the widget and lets you through; the in-tab automation cannot pass it, which is by design | Free |
| **Token vault** | — | `TOKEN_VAULT_KEY` (the AES key every OAuth token is encrypted with). **Never rotate it tonight**: a new key makes every existing connection unreadable | already in the root `.env`; confirm it is on the Production tab | `/connections` lists the 5 live connections (**MEASURED**: 5 active on production) | — |
| **Sentry** | Free tier (5k errors/month) is enough; **CHECK** the alert rule emails you | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (source maps at build), `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` | sentry.io → project → Client Keys; Settings → Auth Tokens | open `https://app.sahodalabs.com/billing/checkout/not-a-real-order`: a 404, and **no** Sentry event (Q-13 made that a 404, not an outage) | Free |

### 2.2 REQUIRED for a customer to get value tonight (the product runs without them, but says the feature is off)

| Vendor | What stops without it | Variable(s) | Get it from | Cost |
| --- | --- | --- | --- | --- |
| **TinyFish** (replaced Firecrawl and Zyte, 2026-09-06) | Tier 3 of the onboarding site read (JavaScript-only sites) and the rendered rung of Radar's website ladder; without it both record a gap and carry on | `TINYFISH_API_KEY` | tinyfish.ai → API key; Fetch is free (150 a minute, 1,000 a day per key), no card needed for Fetch | Free |
| **Resend** | No email at all: the ops alerts (`lib/cron/alert.ts`) and the ops mails (`lib/ops/email.ts`) are silently dropped. **CHECK** the sending domain is verified (SPF/DKIM green) for `sahodalabs.com` | `RESEND_API_KEY` | resend.com → API Keys; Domains | send yourself a test from Resend's dashboard; the domain shows "Verified" | Free (3k/month) |
| **Google (GBP and Google sign-in)** | Google Business Profile connections and, on a production Clerk instance, Google sign-in | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (used by the cron routes for GBP metrics, Loop and Playbooks) | console.cloud.google.com → APIs & Services → Credentials → OAuth client (Web); authorised redirect URIs must include the production origin | Free; **CHECK** the OAuth consent screen is "In production", not "Testing", or every seventh day the tokens die |
| **Meta / LinkedIn / X app ids** | The connect flows for those channels carry the app id into Zernio's OAuth start | `META_APP_ID`, `LINKEDIN_CLIENT_ID`, `X_CLIENT_ID` | each platform's developer console; the app must be **live**, not in development mode, or only your own accounts can connect | Free; X posting is pay-per-use ($0.015 a post, $0.20 with a link); the product caps X at 12 posts per workspace per month for that reason |

### 2.3 Deliberately OFF tonight

| Vendor | Why it stays off | Variable(s) |
| --- | --- | --- |
| **Cashfree** (payments) | The production keys answer 401 from Cashfree's own production host (support ticket, unchanged). Free plan only tonight; the wallet shows "Card payments are not connected yet. Nothing was charged." Leave `CASHFREE_*` **absent** on Production so the sentence is the honest one | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENV` |
| **Stripe / Razorpay** | Never wired past a config name | `STRIPE_*`, `RAZORPAY_KEY_ID` |
| **Cloudflare Sites** (`*.sahoda.site`) | Free plan has 0 sites; the deploy path needs a zone and a token | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |
| **Apify** (Radar's Instagram profile checks) | Radar's vendor question (old doc, Part 4) is unanswered; `RADAR_FIXTURES` stays set so the page shows fixtures labelled as such. Zyte is gone; TinyFish (above) took its rung | `APIFY_TOKEN` · `SAHODA_RADAR_SCAN_MODE` |
| **Trigger.dev** | Not needed: the sweeps, holds and reconciliation run inside the Vercel cron routes (`/api/cron/sweeps` imports `@sahoda/jobs/sweeps`) | `TRIGGER_*` |
| **Gemini / OpenAI direct keys** | The mesh routes through OpenRouter; direct keys are fallbacks nothing selects tonight | `GOOGLE_GEMINI_API_KEY`, `OPENAI_API_KEY` |
| **Ops ingest** | Internal tooling | `OPS_INGEST_URL`, `DEVOPS_INGEST_TOKEN` |

---

## 3 · Platform dashboards · one switch each

### 3.1 Clerk (10 minutes)

- **Sign-up mode.** Clerk → Configure → Restrictions. Tonight is 50 invited people; **Restricted** (allowlist or invitations) means nobody you did not invite creates an account, and every account you do not invite is one more to remap at the production cutover (§7). The old page called this "a decision nobody looked at". Make it now.
- **Allowed origins / redirect URLs** include `https://app.sahodalabs.com`.
- **Webhook endpoint** for `user.created` exists and its signing secret is the `CLERK_WEBHOOK_SECRET` on Vercel Production. Without it the `clerk_id_map` never learns a new user, and the admin seat check (§5) cannot see them.
- **CHECK the development-instance limits page.** Clerk's own console warns that development instances "have strict usage limits". Fifty sign-ups in one night is exactly where a limit shows up; read the number before the invites go out.

### 3.2 Supabase (10 minutes)

- **Plan → Pro.** Then **Database → Backups → enable PITR** (it is a Pro feature and it is off until you turn it on).
- **Authentication → Third-party auth** lists the Clerk development instance (it does; production reads work). Do not remove it.
- **Security advisors, MEASURED tonight:** 0 errors, 77 warnings, 13 info. The warnings are `function_search_path_mutable` ×27 and `authenticated_security_definer_function_executable` ×47, plus 13 `rls_enabled_no_policy` (tables with RLS on and no policy at all, which means **nobody** can read them through the API, which is what the service-role-only tables intend). None blocks launch; a session can clear the 27 search-path warnings in one migration next week.
- **Database → Connection pooling:** session mode, port 5432, is the string the app and CI use.

### 3.3 Vercel (5 minutes)

- Plan is **Pro** on the account serving the domain (the crons need it).
- **Cron Jobs** page shows the 7 schedules from `apps/web/vercel.json` and `CRON_SECRET` is set; a cron route called without the secret answers 401 by design.
- **Deployment Protection** is OFF for Production and ON for Preview (the preview asked the smoke harness for a Vercel SSO login today; production must not).
- **Functions → region** is Mumbai (`bom1`, **MEASURED** from the response header) so the app sits beside the database in ap-south-1.

### 3.4 Zernio (15 minutes, and one email)

1. Top up, and **ask support in writing what the connected-account cap counts** (accounts, or accounts per profile) and what happens at the cap (refused, or billed). Doc 17 §3 G3 has waited since July for this sentence.
2. **Register the webhook**: set `ZERNIO_WEBHOOK_SECRET` on Vercel Production → deploy → then, in Zernio, add the endpoint `https://app.sahodalabs.com/api/webhooks/zernio` with the same secret. Three steps; skipping the third leaves the inbox deaf.
3. **CHECK** the five live connections (**MEASURED**: 5 `active` rows) still show as connected in Zernio; a token that expired during the quiet weeks shows up as `expired` on `/connections` after the first metrics run.

### 3.5 Domains and email (10 minutes)

- `sahodalabs.com` itself did not answer a plain fetch tonight (**MEASURED**: connection failed). If the marketing site is meant to be up, check its DNS and host; `app.sahodalabs.com` is fine.
- Resend: domain verified (SPF, DKIM, and the return-path CNAME).
- Google Workspace / the mailbox `hello@sahodalabs.com` is where Sentry alerts, Resend bounces and Zernio's reply land. Someone reads it tonight.

---

## 4 · The switches that spend money · which to arm tonight

These ship OFF because arming them spends. Each is one Production variable, and each needs a deploy after (or a redeploy of the latest build) to take effect.

| Variable | Arm tonight? | Why | Cost when armed |
| --- | --- | --- | --- |
| `SAHODA_METRIC_CAPTURE_MODE=live` | **YES** | Runs at 01:20 every night (`/api/cron/metrics`). It **cannot be backfilled**: every night it is off is a night of performance history that never exists, and the analytics and the weekly report stay on "nothing measured yet" for every customer | Zernio reads per connected channel; no model calls |
| `SAHODA_PUBLISH_ENABLED=true` + `SAHODA_PUBLISH_MODE=live` + `SAHODA_PUBLISH_DISPATCH_MODE=live` | **YES**, or the launch is a demo | Scheduled posts go out via the 5-minute sweep. Without these, every publish is a labelled fixture and nothing reaches a channel | Zernio per-account; X per post |
| `SAHODA_HOLD_SWEEP_MODE=live`, `SAHODA_RECONCILE_MODE=live` | **YES** | Expired credit holds are released and the ledger reconciled; off, a failed publish keeps a customer's credits held for the lease | none |
| `SAHODA_LOOP_CRON_MODE` | **NO** for the first week | The weekly Loop (Sunday 21:00) spends 20 credits a cycle plus what it creates, for every workspace with the Loop on. Let people write by hand first | 20+ credits per workspace per week |
| `SAHODA_PLAYBOOKS_CRON_MODE` | **NO** | Playbooks are hidden from the rail by the founder's ruling of 2026-08-25 and reachable by URL only | per run |
| `SAHODA_AUTOPILOT_ENABLED` | **NO** | L3 publishes without a person in the room; the old page's rule stands: one channel, one day, one post, and watch it | — |
| `RADAR_FIXTURES` | keep **set** | Radar has no vendor; fixtures are labelled as fixtures | — |

**After arming, prove it:** schedule one post from your own workspace to a channel you own for five minutes ahead, then watch `/posts` move it to published and the channel show it. That is the only proof the publish rail is live.

---

## 5 · Admin seat, the 50, and their credits (20 minutes)

- **Your admin seat.** The `/admin` console fails closed: with no seat, it is a 404 even for you (**MEASURED**: 7 admin rows exist on production, from earlier seeding). Confirm your email is among them; if not, set `ADMIN_BOOTSTRAP_EMAILS` on Production to your email and run `pnpm ops:seed` once against production, then open `https://app.sahodalabs.com/admin`.
- **Beta applications.** `POST /api/public/beta-apply` writes `ops_beta_applications` and `/admin/applications` is where they are approved. **MEASURED**: 0 applications so far. Decide the door: (a) invite-only through Clerk (§3.1) and skip the application page, or (b) public sign-up with the application gate. Do not run both; two doors is how someone gets in through neither.
- **Credits.** Every new workspace gets the Free plan's 100 credits on creation. **MEASURED**: 4,879 credits are outstanding across the 36 existing members' workspaces, accrued when paying was impossible (doc 17 §7). Decide tonight whether the beta users who already have workspaces keep them; the ledger is append-only, so a change is an `ADJUST` entry a session writes deliberately, never a deletion.
- **Test debris.** The 36 members include test users from before the suite's guard existed and a workspace still named "Sahoda QA Bakery". A session can list and erase them with the workspace-erasure RPC; say the word and it happens before the invites.

---

## 6 · The one test that matters · 30 minutes on your phone

After the deploy and the keys, on production, with a fresh invited email, without helping yourself:

1. Sign up → onboarding → let it build the Brand Brain → **close the tab in the middle** → reopen: the brain is waiting (this was the audit's only P1, `102c54e4`).
2. Connect one Instagram account (a consent screen; only a person can).
3. Write one post, pick two channels, make the two versions different, press **Post now** (the composer asks Schedule it / Post now first; that is new today), then **Preview publish**.
4. Schedule a second post five minutes out; watch it go.
5. Open `/analytics`: the worked example shows until the first metrics run tonight; that is correct, not broken.
6. Open `/wallet`: "Card payments are not connected yet. Nothing was charged." That is the honest sentence for tonight.

Write down every hesitation. The last twenty sessions' real defects were all found by a person in a browser.

---

## 7 · NOT tonight, and why

| Item | Why not tonight | When |
| --- | --- | --- |
| **Clerk production keys** | A production instance starts with no users and issues new ids. **MEASURED**: 35 workspaces are keyed to 34 development-instance user ids, and those ids live in **35 columns across 34 tables**. Pasting production keys signs everyone in to an empty product with no error. It needs an id-mapping migration with sign-in paused, a lane of its own | the first quiet morning after the beta week; ask for the migration session |
| **Cashfree / taking money** | 401 from Cashfree's production host; KYC named third party; no CA answer on GST (`docs/29_GST_Questions.md`); no Terms/Privacy/DPA from a lawyer | before the first paid plan |
| **Restore drill** | Needs Supabase Pro first; then restore into a throwaway project and write down the minutes. An untested backup is a belief | this week, not tonight |
| **Radar vendor** | Margin decision: 600 tracked accounts at per-account pricing | when you decide |
| **Rotate the production database password** | Owed since 4 September (it sits in fifty worktrees' `.env` files). Do it **after** launch night, because every worktree, CI secret and Vercel variable must move together | the morning after |
| **Delete dead worktrees and their `.env` copies** | Housekeeping, but fifty copies of the vault key is fifty copies too many | this week |

---

## 8 · Launch night watch · what to look at, every 30 minutes

| Where | What "fine" looks like | What to do if not |
| --- | --- | --- |
| Sentry → Issues | nothing new, or only things you recognise | the event names the route; paste it to a session |
| Supabase → Logs → API | 200s; **no** 401 `PGRST301` (that pattern is Clerk trust missing, seen on staging on Thursday) | Authentication → Third-party auth → the Clerk instance must be listed |
| Supabase → Logs → Postgres / pooler | no `password authentication failed`, no `too many connections` | the pooler string in Vercel is wrong, or the connection count needs the Compute add-on |
| Vercel → the project → Logs | cron routes answering 200 every 5 minutes; no `missing or invalid env var` | the message names the variable; it is on the wrong environment tab |
| Zernio → dashboard | connected accounts count rising; webhook deliveries 2xx | capacity or the webhook secret |
| OpenRouter → Activity | requests rising slowly with sign-ups; nothing in a tight loop | the spend limit stops it; then tell a session which key |
| `/admin` | applications (if the door is the gate), new workspaces, credits | approve, or write an ADJUST |

**If something is wrong for everyone:** Vercel → Deployments → the previous production deployment → "Promote to Production". That is a two-minute rollback and it never touches the database.

---

## 9 · Numbers to have written down before the invites go out

| Thing | Where it comes from |
| --- | --- |
| Zernio connected-account cap and what it counts | their reply (§3.4) |
| Clerk development-instance user limit | Clerk dashboard (§3.1) |
| OpenRouter balance and per-key limits | openrouter.ai → Credits |
| Supabase plan, PITR on, database size, storage size | Supabase → Billing and Database → Usage |
| Vercel plan and the 7 crons' last-run times | Vercel → Settings |
| The production deployment id you launched on, and the one before it (the rollback target) | Vercel → Deployments |
| Your admin seat works (`/admin` opens) | the browser |

---

## What this page did NOT do

- It did not read any secret value, any plan tier, or any balance: dashboards a session cannot open. Every such line says CHECK.
- It did not decide the sign-up door (§5), the Plan Offer moment (§1), or the outstanding 4,879 credits (§5). Those are yours, and each is one sentence back to a session.
- It did not promote `wt-core` to `wt-web`. That is the gated step and it is §1.
