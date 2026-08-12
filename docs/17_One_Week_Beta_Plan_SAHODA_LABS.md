# 17 — One-Week Beta Plan

**Written:** 9 August 2026
**Supersedes:** `15_Beta_Launch_Plan` §5–§8 and `16_Roadmap_Update` §3. Doc 16's
incident record (§1), rules (§1.4) and board cards (§4) stand.
**Companion:** `13_Zernio_Integration` — still current, amended by §8 below.

**Founder decisions this session:** paid from day one · 100+ open signup ·
publishing, analytics, messaging, comments/reviews all non-negotiable · Brand
Brain refinement is the priority · Clerk migration before signup · second
Instagram account this week · legal/KYC started, waiting on a third party ·
team is Divas + Claude Code.

---

## 1. The one thing

> **If only one thing is perfect on day 7, it is Brand Brain onboarding.**

Founder's own answer, and it is the right one. It is the first screen every
design partner sees, it is the moment they decide whether this works, and it is
the part no competitor can copy by renting an API.

The shape: **minimum input, maximum output.** A shop owner should not answer
twenty questions. They should paste a sentence, drop a logo, hand over a menu
PDF or a website URL — and get back a working brand profile they recognise as
their own.

Everything in §4 is sequenced so that this gets the most hours and the most of
the founder's attention.

---

## 2. What is actually true about the timeline

Three facts, stated once, not repeated later:

**Payment cannot go live in a week, and it is not a build problem.** Cashfree
activation is gated on KYC, which is gated on ToS/Privacy/Refund/DPA. Status:
started, waiting on a third party. The code will be complete and tested behind a
flag inside the week. The licence to take money will not be. Nothing in this
document changes that, and no number of parallel sessions touches it.

**"Paid from day one" therefore means "paid from activation day."** The build
target is unchanged; the launch shape is: design partners on free credits from
day 3, payment switch flips when Cashfree clears, open signup at the same
moment.

**Open signup before three things are true is the largest risk in this plan.**
Named in §3. All three are closeable this week.

---

## 3. Three gates before a stranger can sign up

These are not process. Each one is a specific way the product breaks in front of
a customer.

| # | Gate | Why it must precede signup |
|---|---|---|
| **G1** | **Clerk production cutover** | Production runs a test key. Migration remaps 14 columns / 128 rows. Every new user adds rows. Failure mode: users sign in *successfully* to an empty product with no error — indistinguishable from data loss. Cost today: 17 users. Cost at 100: five times that, same migration. Machinery built and rehearsed on staging, including an adversarial proof that the verifier catches a partial remap |
| **G2** | **Cross-tenant proven with a real second account** | One Instagram account is connected. The guard is built, applied, structurally sound — and **cannot be proven wrong with one account**, because there is only one place a post can go. First real test is when customer 2 connects. If it is wrong, customer A's post appears on customer B's feed and you learn it from them |
| **G3** | **Zernio account capacity known, not just topped up** | The cap is a per-account cost line, roughly $4.80/account at volume. 50 users × 2 channels = 100 accounts. Ask Zernio what the cap counts — accounts, or accounts per profile — and what the next tier costs. This determines the free-tier allowance, which the connect UI needs a number for |

G1 and G2 are day 1–2 work. G3 is an email and a top-up.

---

## 4. The week

Three streams. **Not four** — the ceiling is not terminals, it is one founder who
must review every gate *and* be the only person who can click through the
product, connect accounts, and verify anything by hand.

### Day 1–2 — Foundations (serial, everything else waits)

| Task | Owner |
|---|---|
| G1 Clerk cutover — rehearse on staging, cut over production, verify all 17 sign in and see their workspaces | Session |
| G2 Second Instagram Business account acquired | **Founder** |
| G2 Cross-tenant outcome test — publish to the wrong profile, inspect *the other account*, prove nothing appeared | Session |
| G3 Zernio top-up + capacity question answered | **Founder** |
| Connect → publish verified by hand on production, by a human, through the UI | **Founder** |

**Nothing in Day 3–5 starts until connect-and-publish works by hand.** Every
automated gate has been green for a week — build succeeded, 29 routes,
typechecks clean, ~2,000 tests passing — while the feature did not work. The
walkthrough is the only evidence that counts.

### Day 3–5 — Build (three parallel streams)

**Stream 1 — Brand Brain (the priority, founder's own attention)**

Ingest anything: free text, website URL, PDFs, logo and brand-kit images.
Produce a brand profile the owner recognises without a questionnaire.

⚠️ **This is a new AI entrypoint, not a form change.** Every task in the mesh
currently sends and receives text. Image generation needed separate routing
because images fit neither direction; document and image *ingestion* is the same
problem in reverse. Reading a PDF or extracting a palette from a logo is a vision
call. New route, new ledger metering, same pattern as `IMAGE_ROUTES`. Real work.

Non-negotiable: **it must fail honestly.** If a PDF yields nothing useful, say
so and fall back to asking — never invent a brand voice and present it as
extracted. That is a fake success state on the first screen a customer sees.

**Stream 2 — Read surfaces**
Analytics (impressions, reach, engagement, follower tracking) · Messaging (DMs) ·
Comments and reviews. All four channels. Zernio documents these as unlimited on
every account. Doc 13 records no verified read API for any of them — **each needs
a `[LIVE]` smoke check before code depends on it.**

**Stream 3 — Money and generation**
Cashfree provider wired, webhook with signature verified before any work, **live
provider only** (the fixture's HMAC secret is well known — honouring it on a
public endpoint is a credit-forgery path). Per-post external cost through the
ledger. Plus carousels and video via OpenRouter, extending the image route that
already exists.

**Path ownership is the collision guard.** Streams do not edit each other's
paths. `packages/shared` is Stream 1's; others request.

### Day 6–7 — ALPHA gate and QA

Fix the known defects, then walk the whole journey as a new user on a clean
workspace: sign up → Brand Brain → connect → compose → attach or generate →
schedule → publish → see the live link → check analytics → reply to a comment.

**Retire doc 05's Alpha Gate.** Written 17 July for a two-day sprint; it targets
Stripe, X, GBP and `sahoda.site`, and `00_README:20` still calls it "the plan you
execute" — so a fresh session reading the README as instructed starts executing
a superseded sprint. Two lines in the README fix it.

Three criteria from it are worth carrying: *fresh signup → resolved Brand Brain
in under 10 minutes* (a whole-journey, time-boxed gate — doc 15 has none), *a
forced failure releases the hold* (asserts the failure path), and *no fake
states anywhere*.

---

## 5. Known defects to clear in the ALPHA gate

| ID | What |
|---|---|
| SL-033 | No CI. Five packages carried `lint: exit 0` |
| SL-050 | **Closed this week.** ~2,000 tests across five packages had never run — including the ledger's 221. All passed when finally collected. Luck, not design. A collection guard now prevents recurrence |
| SL-047 | `/` returns 404. Landing page externally owned — get a date and a handoff shape |
| SL-049 / SL-043 | Preview deployments and test runs write to production. **Staging now exists**; the Vercel Preview variable split (plan §3.5–3.7) has not been done, so both stay open |
| SL-051 | **Fixed.** QA hook counted skipped tests as passed |
| SL-057 | Repository public. Secret scan clean — no credential ever committed. Routine, not urgent |
| — | `app.sahodalabs.com` held by the old Vercel account. Needs a dashboard release by whoever owns it |
| — | Trigger.dev is unreachable from this repo; scheduling runs on Vercel cron with a CAS claim |

---

## 6. Cut order

If the week slips, cut in this order. Decided now.

1. **Carousels and video** — image generation alone is enough to launch
2. **Analytics** — the least load-bearing of the four read surfaces
3. **Messaging (DMs)** — comments and reviews matter more to an Indian SMB
4. **Payment UI polish** — the code must be right; the screen can be plain

**Never cut:** the cross-tenant guard and its outcome test · Clerk cutover before
signup · Cashfree signature verification · Brand Brain failing honestly ·
`.is-real` bound to `platformPostUrl`.

---

## 7. Founder-owned, zero build days

Every day at zero adds a day at the end. None of these move without you.

| Item | State |
|---|---|
| Legal → Cashfree KYC | Started, **waiting on a named third party** — get a name and a date; it is the only critical-path item no session can touch |
| Second Instagram Business account | This week — gates G2 |
| Zernio top-up + capacity answer | Gates G3 and the free-tier number |
| Free-tier channel allowance | Connect UI needs a number. Default to 1 in a config row so a later change is a value, not a screen |
| Existing credit balances on 17 workspaces | Accrued when paying was impossible. Ledger is append-only, so whatever you decide is entries someone writes deliberately. Decide before the payment switch |
| `app.sahodalabs.com` release | Old Vercel account |

---

## 8. Doc 13 amendments from the 31 July live run

Fold these in — they are `[LIVE]`, backed by raw payloads in `~/zernio-smoke/raw/`:

- §5 — `publishNow` is **not synchronous for Instagram**. Returns 201 "Post
  published successfully" with `status: processing`, `pendingContainerId`, and
  **no `platformPostUrl`**. The URL appears ~14s later. Their spec claims
  otherwise; their spec is wrong.
- §5 — idempotency is `x-request-id`, 5-minute window; a duplicate returns
  **200 with `existingPost`**, not an error. An adapter that does not unwrap it
  reads a legitimate duplicate as success-with-no-URL.
- §9 — the HEAD pre-flight **must send a browser User-Agent** or Cloudflare's
  browser-integrity check (error 1010) 403s it against Zernio's own CDN. A
  server-side `fetch()` with a default UA is exactly the failing shape.
- §10 — **fourth Instagram defect: format is not checked.** A `.webp` passes
  `violations: []` and shows green in the editor, then fails at Instagram.
- §2 — `?profileId=` filters; a non-match returns **404 with `accounts: 0`**,
  not an empty 200.
- New — `POST /v1/tools/validate/media` exists. Useful as a second opinion; it
  does **not** replace the Constraint Engine fix, which requires invalid
  payloads to be *unconstructible*.

---

## 9. How we work this week

Loosened deliberately, because staging now exists and the product is reversible
in a way it was not two weeks ago.

**Dropped:** exhaustive test-writing, security review passes, adversarial review
on reversible work, approval between every phase.

**Kept, because each one has already paid for itself:**

- **Staging for migrations. Never production ref `rloztdhzfliyvpvxsgjl` from a
  test run.** This stopped a live write once already.
- **Founder approval before production migrations and pushes.**
- **`.is-real` keys off `platformPostUrl`.** The vendor returned 201 and the
  words "published successfully" for a post that was not published.
- **Assert on content, never status codes.** Fourth and fifth instances landed
  this week.
- **"Does anything actually call this?"** — highest-yield question of the last
  three sessions. The tenant guard had no caller. The schedule RPCs had no
  caller. The reconcile sweep queried one channel of four. Green tests on an
  unreachable path look identical to green tests on a working feature.
- **"Where else does this pattern appear?"** — scheduling was fixed in the post
  editor and left broken in the Planner, the screen named for scheduling.
- **Any guard whose set can be emptied needs a test asserting it is non-empty.**
  Two instances in one week.
- **Verify with the consumer's own command, not the producer's.** Four
  credential handoffs failed because the check that passed was never the check
  that mattered.

---

## 10. What launch day actually looks like

**Day 7, honestly:** a shop owner signs up, uploads a logo and a menu PDF, gets a
brand profile they recognise, connects Instagram, composes a post with a
generated image, schedules it, watches it publish with a live link, sees the
engagement, and replies to a comment. On free credits, on `sahodalabs.vercel.app`,
as one of 5–10 design partners.

**Open signup and payment flip together** when Cashfree clears — and by then G1,
G2 and G3 are long closed and you have a week of real usage behind you.

That is not a smaller launch. It is the same launch with the incident reports
removed.
