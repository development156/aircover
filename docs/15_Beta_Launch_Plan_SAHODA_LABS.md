# 15 — Beta Launch Plan

**Written:** 30 July 2026
**Supersedes:** `14_Launch_Plan_SAHODA_LABS.md` §5 (slices), §6 (scope), §7 (cut
order). Doc 14 §1–§4 and §8–§11 stand unchanged and are still the record.
**Companion:** `13_Zernio_Integration_SAHODA_LABS.md` — unchanged, still current.
**Trunk:** `wt-web` @ `e2512ec` — one commit ahead of origin, **not pushed**.
Production remains `ef50fb6`.

A fresh session should be able to read this file and doc 13 and start work.

---

## 0. What changed since doc 14

Four founder decisions narrowed the plan:

1. **Beta is core social marketing only.** Inbox, Sites and Workflows are
   deferred until beta ships. They were never in the first 22 days anyway — this
   makes that explicit rather than implicit.
2. **The landing page is owned externally.** SL-047 leaves our critical path.
   It does not leave the risk register — see §9.
3. **Media is two vendors, not one.** OpenRouter for image *generation*, Pixy
   for template *rendering*. These are different jobs; §3 explains why the
   distinction matters.
4. **Credits stay as they are.** No change to the wallet model. The payment work
   is the Cashfree connection only.

**One thing did not change and must not be allowed to drift:** payment code
takes 3–4 days and payment *activation* takes 3–6 weeks of somebody else's
calendar. Building the code early is correct. It does not shorten the wait. See
§9.

---

## 1. What beta is

> **A shop owner pays us, links their Instagram, and a real post goes out on a
> schedule with a live link to prove it.**

Nothing ships as beta until that sentence is true end to end for one real
person who is not us.

---

## 2. Non-negotiables

The first four are carried from doc 14 §2, unchanged. The last two are new, and
both were bought with real time this week.

1. **RLS on every table.** With Zernio in the picture, RLS on `connections` is
   doing cross-tenant *publishing* safety, not just privacy.
2. **The ledger never lies.** Append-only. Corrections are compensating entries.
3. **No fake success states.** `.is-real` keys off `platformPostUrl`, never off
   which code path ran.
4. **Status codes and exit codes are not evidence.** Assert on content and body.
5. **NEW — Scope is verified before it is executed.** Doc 14 said task 0.1 held
   two commits. It held six, three of them features, 5,529 insertions. Nobody
   had run `git log wt-web..wt-admin`. Every task in this document states the
   command that establishes its own scope. Run it before starting the task, not
   after.
6. **NEW — No vendor claim becomes a design assumption without `[LIVE]`.** Doc
   13's marker system (`[LIVE]` / `[DOC]` / `[OPEN]`) now applies to every
   vendor, not just Zernio. Everything in §3 below is marked accordingly.

---

## 3. The vendors, and what each one actually does

Getting these categories wrong costs days, because each one leaves a different
hole in the plan.

| Vendor | Job | Status |
|---|---|---|
| **Zernio** | Publishing transport — the rail to Instagram, Facebook, GBP | Verified, doc 13 |
| **OpenRouter** | Image *generation* — pixels from a text prompt | Already our AI provider |
| **Pixy** | Template *rendering* — swap text and images in a fixed design | New, unverified |

### OpenRouter — the media generator

OpenRouter now exposes a dedicated Image API at `POST /api/v1/images`, separate
from chat completions. `[DOC]`

**Why this is the right choice and not merely a convenient one:** images come
back as **base64-encoded bytes**, not as a URL. `[DOC]` Doc 13 §2.4 rules out
media URLs that redirect, and §9 already decided we upload bytes to Zernio at
schedule time. A generator that returns bytes removes the redirect problem, the
expiry problem and the signed-URL problem in one stroke. Nothing to pre-flight,
nothing to expire at 9am on a Saturday.

Second reason: we already run three cost-isolated OpenRouter keys and the ledger
is already wired at four AI entrypoints. Image generation becomes a fifth
entrypoint following an existing, proven pattern. No new vendor relationship, no
new billing account, no new secret rotation path.

**The catch — aspect ratio.** Instagram's feed accepts 0.8 (4:5) through 1.91
(1.91:1). The aspect ratios documented for OpenRouter image models are 1:1, 3:2,
2:3, 16:9 and 9:16. `[DOC]` Of those, **1:1 and 3:2 are legal for the feed;
2:3 (0.667) and 9:16 (0.5625) are not.** Whether 4:5 — Instagram's
best-engagement ratio — can be requested is `[OPEN]` and is question 3 in §11.

Until that is answered, **the default output for a feed post is 1:1.** Do not
let a 9:16 image reach a feed post. This is not hypothetical: Constraint Engine
defect #2 (doc 13 §10) means a 0.56 image passes validation today.

### Pixy — the template renderer, correctly filed

Pixy's Automations API takes a design ID and a list of modifications — replace
this text, replace this image source, change this fill — and renders the result.
`[DOC]` It is a template renderer. **It is not an AI image generator**, and
booking it as one leaves a hole where the media pipeline should be.

In doc 14 §7 this capability was **cut order #1 — the first thing to drop.**
That was the right call then and the ranking is unchanged now. What has changed
is that renting it costs 1–2 days instead of building Satori for 2–3.

**Where it earns its place:** text-forward branded cards. A restaurant posting
"Today's thali ₹99" on a branded card needs no photograph. For Indian SMBs with
no photo library, that is plausibly the *most* useful media path we have — more
useful than a generated image of a generic meal. It is worth having. It is not
worth blocking on.

**Pricing, against our vendor rule** (rent per-call, per-post or flat; never
per-customer, per-site or per-seat): tiers run $49 / $149 / $299 per month for
1 / 3 / 10 members and 1,000 / 10,000 / 50,000 credits, with overages from $0.03
down to $0.01 per credit. `[DOC]` Per-render pricing passes. **Seats fail our
rule — and are avoidable**, because server-side API calls on one team key means
one seat. Growth at $149 covers roughly 10,000 renders a month.

**The trap is the embed.** The white-label embed — the Pixy editor inside our
product, our logo, our colours — is what "design studio" usually means when a
founder says it. Their FAQ states embed is Scale-only; their own pricing table
lists embed on all three tiers. The page contradicts itself, and Scale is
book-a-demo rather than self-serve. **A demo is another external calendar, and
external calendars are the thing this plan keeps under-costing.** Embed is out
of beta scope. API-only, server-side, one key.

---

## 4. Week 0 — integrity work, amended

Doc 14 §4 listed six tasks. This is eight, with two deferred out of beta.

| # | Task | Done when | Days |
|---|---|---|---|
| 0.0 | **SL-049 + SL-043 containment.** Preview deployments and test runs both write to the production database. One Supabase project, no rehearsal environment. Two cards, one root cause. | Team told, `TEAM_ONBOARDING.md` §4 amended, and the ledger queried for entries originating from preview traffic — the query result is the evidence, not the absence of complaints | 0.5 |
| 0.1 | **Phase 3.5** — merge `wt-admin` into `wt-web` | `git log --oneline wt-web..wt-admin` empty · SL-019, SL-020, SL-042 each present by file:line · board at exactly 49 cards with ID set equal to the union of both inputs · gate table baseline-vs-post-merge | in flight |
| 0.2 | ~~Phase 4 — `main` becomes trunk~~ | **DEFERRED past beta.** Cosmetic. It also invalidates the CI proof from 0.4 and would force re-verification on a new branch. | — |
| 0.3 | ~~Phase 5 — worktrees removed~~ | **DEFERRED past beta.** Actively conflicts with §6: Phase 5 deletes the worktrees the parallel plan runs in. | — |
| 0.4 | **Real CI** — replaces the `exit 0` lint in 8 packages; fixes SL-046 so `typecheck` stops validating stale build artifacts | A deliberately broken PR fails **and** the run prints a test count above a fixed floor **and** at least one database test asserts on a row it wrote and read back | 3–8 |
| 0.5 | **R-02** — `SAHODA_HOLD_SWEEP_MODE` holds an unparseable value; 226 cron 500s in 18.9h | The sweeper **ran and did work**: a row, a count or a log line from a tick where there was something to sweep. "Zero 500s" is also satisfied by a cron that never fires — see non-negotiable 4 | 1 |
| 0.6 | **Sentry** — vars declared in `turbo.json`, never set in Vercel; upload skips silently | A test error reaches a human, de-minified | 1 |
| 0.7 | **Zernio smoke test** — the script exists at `~/zernio-smoke/run-smoke.sh` and has never been run | Doc 13 §11 questions 1, 2, 5 and 6 answered with raw payloads in `raw/` | 1 |
| 0.8 | **Media smoke test** — OpenRouter Image API and Pixy | §11 below answered, raw payloads kept | 1 |

**Week 0 total: 8–13 days.** 0.4 is the variance. Turning lint on after six
weeks of `exit 0` in eight packages reveals however many real errors accumulated
behind it, and getting the 105 database tests to actually execute needs a CI
database that does not exist yet. That task is three days or it is eight and
nobody knows which until it starts.

**0.4 is also the highest-leverage task in the document**, because §6 depends on
it. Two parallel streams merging without CI is precisely how 3,692 passing tests
coexisted with a product that could not take a payment.

**One variable at a time** on 0.5 and 0.6.

---

## 5. Slices

Each slice ends with a binary, human-verifiable gate. No slice starts before the
previous gate in its own stream passes.

### Slice A — Money · 3–4 days · *independent, runs in parallel*

- Wallet points at the live Cashfree provider, not the fixture
- Webhook at an exact public path, signature verified **before any work**
- **Live provider only.** The fixture provider's HMAC secret is well known;
  honouring it on a public endpoint is a credit-forgery path
- Per-post external cost threaded through the ledger

**Gate:** a real rupee moves and the ledger reconciles to the paisa.

**Note:** this gate cannot pass until Cashfree is activated (§9). The code gate
that *can* pass beforehand is: a signed test webhook from Cashfree's sandbox
produces correct ledger entries, and an unsigned or fixture-signed one is
rejected. Ship to that, then wait.

### Slice B — Connect · 4–7 days

A real shop owner links a real Instagram account and sees it connected. This has
never worked; nothing downstream can be proven until it does.

- OAuth callback routes — none exist today
- INSERT policy on `connections` — missing today
- Workspace → Zernio profile mapping, 1:1
- **The cross-tenant guard — structural, tested by outcome** (doc 13 §3).
  Type-level or function-level impossibility, not a convention a reviewer must
  remember
- `tokenExpiresAt` stored; warning at T-7 with one-click reconnect (doc 13 §8)

**Gate:** a real account connected in production, visible on the connections
page. Not a fixture, not a preview. **Plus** the permanent cross-profile test:
attempt a publish to another profile's account and prove by inspecting *that
account* that nothing appeared. There will be no error returned — asserting on a
returned error proves nothing.

**Prerequisite you do not own:** a second real Instagram Business account. The
cross-tenant test is unprovable without one. Acquire it during Week 0.

### Slice C — Validity and media · 5–8 days

Must land **before** Instagram is enabled, not after.

- Constraint Engine split (doc 13 §10): `publishable` becomes `rail` (derived,
  never authored) plus `validity`. Invalid payloads unconstructible, not merely
  detected
- OpenRouter Image API as a fifth AI entrypoint, ledger-metered like the other
  four
- Base64 bytes → storage → `MediaSource` seam
- Aspect enforcement: 1:1 default for feed posts until §11 Q3 is answered
- Pixy template rendering — **only if the week allows**, see §8

**Gate:** a caption-only Instagram draft is rejected by a compile error or a
named failing test, not by a runtime check someone can forget. And a generated
image lands in storage at a feed-legal aspect ratio, confirmed by reading the
stored file's dimensions — not by trusting the request parameter.

### Slice D — Publish now · 4–6 days

- Zernio adapter; typed client generated from the OpenAPI spec
- Per-channel status including `partial` — one post, two truths, no single green
  tick (doc 13 §5)
- `.is-real` bound to `platformPostUrl`
- Media uploaded to Zernio at publish time, with a `HEAD` pre-flight asserting
  status **and** `Content-Type`

**Gate:** `publishNow: true` puts a real post on a real Instagram account, and
the UI shows the live link. Verified by opening the link.

### Slice E — Publish scheduled · 3–6 days

This is where `apps/jobs` runs in production for the first time.

- Scheduler dispatch through Trigger.dev; the timer stays ours, not the vendor's
- Webhook receiver with signature verification and workspace routing by profile
- Idempotency: request id derived as `${postId}:${channel}:${scheduledAt}` so
  racing workers mint the same id and Zernio collapses it. CAS claim stays
  primary

**Gate:** a post scheduled through the planner appears on a real Instagram
account at the scheduled time, unattended, and the UI shows the live link.

**Why D and E are separate:** doc 14 combined them into one gate covering two
systems that have never worked — the adapter and `apps/jobs` in production. When
that gate failed you would not know which one broke. Doc 13 §5 gives three modes
on one endpoint precisely so this can be split.

### Slice F — Loop L1/L2 and dashboard · 5–8 days · *stretch*

Plan, approve, schedule, publish, report honestly. This is most of what makes
the product feel like an employee rather than a tool. It is a stretch goal, not
a beta gate — see §8.

---

## 6. Two streams, and the rule that keeps them safe

**Two, not four.** The ceiling is not terminals, it is founder review bandwidth.
Every gate needs explicit approval from one non-technical person; four streams
means four times the review load on the actual bottleneck.

| | Stream 1 | Stream 2 |
|---|---|---|
| Worktree | `wt-billing` | `wt-web` → `wt-pub` |
| Work | Slice A | Slices B → C → D → E |
| Owns | `packages/billing/`, wallet routes, Cashfree webhook route | everything else |

**Path ownership is the collision guard.** Neither stream edits the other's
paths. Where both need a shared file — `packages/shared/src/index.ts` is the
likely one — Stream 2 owns it and Stream 1 requests the edit.

**Two hard conditions:**

1. **Neither stream starts until 0.1 reports.** The payment slice touches the
   ledger — the most safety-critical code in the product. If the merge gate
   comes back showing the database tests skip, you are writing ledger-adjacent
   code with no test signal, and you need to know that before you write it.
2. **Neither stream pushes until 0.4 is green.** Local work in parallel is fine.
   Merging two unreviewed streams into a production branch with no CI is the
   documented failure mode of this project.

---

## 7. Scope

**In beta:** integrity work · Cashfree payments · Connect (Instagram first, then
Facebook and GBP) · publish now and scheduled via Zernio · Constraint Engine fix
· OpenRouter image generation · token expiry warnings · Brand Brain, posts,
variants, planner · Brand Skin

**Deferred until beta ships, in this order:** Inbox (GBP reviews first, then
Instagram comments and DMs) · Sites · webhooks and public API · Pixy branded
cards if cut · Loop L3 · guide tours

**Out, unchanged from doc 14 §6:** Twin · Radar · Remix · Playbooks node canvas
· full Studio layered editor · Agency/white-label · listed Zapier directory app
· WhatsApp · Pixy embed

---

## 8. Cut order

Doc 14's cut order listed five items that were all in Slice 4 and none of which
was landing inside a month anyway. It gave you nothing to cut from the work that
actually consumes the time. This one does.

1. **Pixy branded cards.** Rented, small, genuinely useful, and entirely
   severable. First to go.
2. **Loop L1/L2 and dashboard** (Slice F). Reduces beta to publishing without
   the weekly report. Painful, survivable.
3. **Facebook and GBP as beta channels.** Instagram alone proves the rail.
   Facebook's 13-scope consent screen (doc 13 §6) is a conversion risk we have
   not solved anyway.
4. **Scheduled publishing** (Slice E). Ship publish-now only. This is the last
   honest cut — below here the product stops being what §1 says it is.

**Never cut:** the cross-tenant guard · the cross-profile outcome test · the
Constraint Engine fix · token expiry warnings · CI · RLS tests · signature
verification on the Cashfree webhook.

---

## 9. Other people's calendars

Zero build days. Every day at zero adds a day to the end. **All still unstarted
as of 30 July.**

| Item | Owner | Lead time | Status |
|---|---|---|---|
| ToS, Privacy, Refund, DPA | **UNNAMED** | days–weeks | ⬜ Name someone today |
| Cashfree KYC → live activation | Founder | 3–6 weeks, gated by the above | ⬜ Not started |
| Second Instagram Business account | Founder | 1 day | ⬜ Needed for Slice B's gate |
| Google OAuth consent verification | ⬜ | unknown | ⬜ Not started |
| Google Business Profile verification | ⬜ | postcard/phone/video, weeks | ⬜ Only if GBP stays in beta |
| Ask Zernio: can Facebook's 13 scopes be narrowed? | Founder | days | ⬜ An email |

**Landing page — externally owned, still ours to de-risk.** Name the owner, get
a date, and decide the handoff shape now. If it serves `/` from a separate host,
that is routing config in our app, and whoever touches that route can put the
product behind a 404 again. SL-047 leaves our build plan, not our risk register.

**Launch date policy, carried from doc 14 §8 and sharpened:** the commitment is
*capability* — a real user completes the journey and sees honest proof. Payment
is a switch that flips when Cashfree clears. That framing is a sound de-risk and
it has, so far, functioned as permission to leave the legal owner unnamed for
three days. It stops being a de-risk the moment it becomes an excuse.

---

## 10. Open decisions

| # | Decision | Needed by | Notes |
|---|---|---|---|
| 1 | **What is the customer paying for on activation day?** | before Slice A ships | If publishing is not live, they are buying AI-written posts they publish themselves. Honest and sellable — but the refund policy and the landing copy must both say so. Non-negotiable 3 forbids the alternative |
| 2 | **Existing credit balances on 26 workspaces** | before Slice A ships | Accrued when paying was impossible. The ledger is append-only, so whatever you choose is a set of entries someone writes deliberately |
| 3 | Free tier channel allowance | **Slice B**, not week 3 | Cannot ship a connect UI without it. Default to 1 channel in a config row so a later change is a value, not a screen |
| 4 | X link-post metering | post-beta | $0.200/req vs $0.015 for a plain post |
| 5 | Pixy plan tier | before Slice C | Growth ($149) if API-only. Do not buy Scale |

---

## 11. `[OPEN]` — must be answered by 0.8 before any code depends on them

**OpenRouter Image API**

1. Per-image cost for the chosen model, and how it meters through the ledger.
2. Sync or job-based? Latency at p95 — this sits in a user-facing flow.
3. **Can 4:5 (0.8) be requested?** If not, 1:1 is the feed default and the
   Constraint Engine must refuse anything below 0.8.
4. Does the returned base64 decode to the dimensions requested? Verify by
   reading the file, not the request.

**Pixy**

5. Does render return bytes or a URL? If a URL: does it redirect, and when does
   it expire? A `302` is unusable (doc 13 §2.4).
6. Can it output feed-legal dimensions — 1080×1350 or 1080×1080?
7. Sync or job-based? Rate limits?
8. Will it fetch a Supabase signed URL as a replacement image source?
9. How long do rendered images stay retrievable?
10. Embed — Scale-only or not? Get it in writing. (Answer changes nothing in
    beta; it changes the year-two plan.)

---

## 12. Defect register — delta from doc 14 §10

| ID | Change |
|---|---|
| SL-033 | No CI — now Week 0 task 0.4, gate strengthened |
| SL-043 | Single Supabase project: every test run writes to the customer database, every migration is a production migration with no rehearsal. **Same root cause as SL-049.** Merged into task 0.0 |
| SL-046 | `typecheck` does not depend on `build` — folded into 0.4 |
| SL-047 | `/` returns 404 — **owner transferred externally.** Still launch-blocking; see §9 |
| SL-049 | Preview deployments write to production — task 0.0 |
| R-02 | Hold sweeper has never run — task 0.5, gate rewritten to assert work done |
| — | Constraint Engine: three Instagram defects + LinkedIn — Slice C |
| — | **NEW.** Two `ops-qa-*` server actions arrived on `wt-admin` — new network-reachable entry points. "No auth code changed" is not "the new endpoints check authorization." The last admin RPC surface shipped a client-controllable privilege escalation. Verify before the 0.1 push |

---

## 13. How we work

- **Every prompt specifies model and effort.** Opus 5 / high for design and
  surgery; Fable 5 / xhigh for adversarial review; Sonnet 5 / medium for
  mechanical work.
- **Phase-gated execution.** Stop between phases. An unexpected output is a full
  stop, not an improvisation.
- **Verify scope before executing it.** State the command; run it first.
- **Adversarial review before anything irreversible.** Local work is reversible;
  a push to a production branch is not.
- **Evidence or nothing.** A file:line, a named passing test, a migration
  number, a git SHA, or a live URL. Anything else is UNVERIFIED.
- **Simulate before you try.** `git merge-tree --write-tree` performed a full
  three-way merge and printed the conflict set without creating a commit,
  moving `HEAD`, or touching a file. On a repo whose working branch is
  production, that is the difference between a scoped decision and a gamble.

---

## 14. The honest timeline

Working days. One session per stream. Founder review time excluded, and founder
review time is real.

| | Days |
|---|---|
| Week 0 | 8–13 |
| Slice B — Connect | 4–7 |
| Slice C — Validity and media | 5–8 |
| Slice D — Publish now | 4–6 |
| Slice E — Publish scheduled | 3–6 |
| **Beta capability** | **24–40** |
| Slice A — Money | 3–4, parallel, hidden inside the above |
| Slice F — Loop and dashboard | 5–8, stretch |

**A month is 22 working days. Beta capability is 24–40.** The optimistic end
misses by two days and assumes CI lands at three days rather than eight, no
slice overruns, and the second Instagram account arrives on time.

The month is achievable for a narrower claim: **Week 0, Connect, validity and
media, and publish-now.** A real post on a real Instagram account with a live
link, plus payment code sitting ready for the day Cashfree clears. Scheduling
lands in week five.

That is not the full sentence in §1. It is the honest version of it, and it is
the first time the product will do the thing it exists to do.
