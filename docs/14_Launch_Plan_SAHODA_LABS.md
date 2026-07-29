# 14 — Launch Plan

**Written:** 29 July 2026
**Trunk:** `wt-web` @ `ef50fb6` = production
**Live users:** 26 workspaces, 17 people, on the production database

This document is the handoff. A fresh session should be able to read this file
and `13_Zernio_Integration_SAHODA_LABS.md` and start work without reading the
audit end to end.

---

## 1. Where we actually are

An evidence-based audit ran on 27 July. What it found, in short:

**Genuinely built and working**
- The credit ledger — `app.apply_ledger_entry`, proven correct under concurrency,
  wired at all four AI entrypoints. The strongest code in the company.
- The Model Mesh — real OpenRouter/OpenAI calls, four server actions.
- RLS policies on every table.
- Brand onboarding — used 26 times, real.
- Admin ops console — 20 `ops_*` RPCs, maker-checker, audit log. Live in
  production since 28 July and being used.
- Design system, Brand Skin, Certainty System.

**Cannot do the three things the product exists to do**
1. **Cannot take money.** The wallet is hardcoded to a fixture provider. The
   Cashfree provider exists in `packages/billing` and nothing points at it.
   Zero payment events have ever been processed.
2. **Cannot publish.** No OAuth callback routes exist. `connections` has no
   INSERT policy. Connect buttons ship disabled. Zero tokens stored. Nothing has
   ever been posted to a real platform.
3. **Cannot deploy a site.** ~13.8k LOC generates pages; the piece that puts
   them on the internet was never written. Zero Cloudflare API calls exist.

**Credit where due:** every simulated path is explicitly labelled in the UI. The
product is honest. The dishonesty was in the tooling.

**The tooling problem — now the reason Week 0 exists**
- `lint` was hardcoded to exit 0 in all 8 packages.
- The test cache reported 105 database tests as passing when they never ran.
- No CI exists. Every "gate green" for six weeks was local-only and meaningless.
- A scheduled job crash-looped every five minutes for a full day with nobody
  noticing.

---

## 2. Non-negotiables

These are not negotiable under time pressure. They are the reason the product is
trustworthy.

1. **RLS on every table.** With Zernio in the picture, RLS on `connections` is
   now doing cross-tenant *publishing* safety, not just privacy.
2. **The ledger never lies.** Append-only, no edits, no deletes. Corrections are
   compensating entries. (This was tested by a real mistake on 24 July and held —
   see `docs/incidents/2026-07-24-manual-grant-seq-5374.md`.)
3. **No fake success states.** Nothing reports success without a real external
   effect. `.is-real` keys off `platformPostUrl`, never off which code path ran.
4. **Status codes and exit codes are not evidence.** Assert on content and body.
   Three separate incidents now trace to this: the `exit 0` lint, the unseen cron
   500s, and Zernio's 200-returning HTML catch-all.

---

## 3. The critical path

> **Take money → link one account → publish one real post → prove it.**

That is the product. Not a reduced version of it — the product. Everything else
is downstream of that sentence being true once.

---

## 4. Week 0 — integrity work

**Nothing else starts until this is done.** Not because it is hygiene, but
because without it every day of new work accumulates breakage nobody can see —
which is exactly how 3,692 passing tests coexisted with a product that could not
take a payment.

| # | Task | Done when |
|---|---|---|
| 0.1 | **Phase 3.5** — wt-admin holds SL-020 and SL-042, not on trunk | Both commits on `wt-web`, PR #4 closed |
| 0.2 | **Phase 4** — `main` becomes the trunk by tree adoption | `git diff main wt-web` empty; production branch flipped to `main` |
| 0.3 | **Phase 5** — worktrees removed, branches deleted, **Stop hook re-enabled** | Every abandoned object reachable from an `archive/*` tag; hook restored |
| 0.4 | **Real CI** — replaces the `exit 0` lint; fixes SL-046 (turbo `typecheck` does not depend on `build`) | A deliberately broken PR fails the check |
| 0.5 | **R-02** — `SAHODA_HOLD_SWEEP_MODE` holds an unparseable value; 226 cron 500s in 18.9h = exactly one per tick | Set to `report` first, observe, then `on`. Zero 500s. |
| 0.6 | **Sentry** — `SENTRY_ORG` / `_PROJECT` / `_AUTH_TOKEN` declared in `turbo.json`, never set in Vercel; upload skips silently | Production stack traces de-minified; a test error reaches a human |

**One variable at a time** on 0.5 and 0.6, so if something moves we know what
moved it.

---

## 5. Build slices

Each slice ends with a binary, human-verifiable gate. No slice starts before the
previous gate passes.

### Slice 1 — Connect
A real shop owner links a real social account and sees it connected.
This has never worked. Nothing else can be proven until it does.

- OAuth callback routes (none exist today)
- INSERT policy on `connections` (missing today)
- Workspace → Zernio profile mapping, 1:1
- **The cross-tenant guard — structural, tested by outcome** (see `13` §3)
- Token expiry tracking: store `tokenExpiresAt`, warn at T-7 (see `13` §8)

**Gate:** I connect a real account in production and the connections page shows
it. Not a fixture. Not a preview.

### Slice 2 — Publish
That post goes out on a schedule and the UI shows proof.
This is where `apps/jobs` runs in production for the first time.

- The Zernio adapter case; typed client generated from the OpenAPI spec
- Status mapping including **`partial`** — per-channel truth (see `13` §5)
- `.is-real` bound to `platformPostUrl`
- Webhook receiver with signature verification and workspace routing
- Constraint Engine fix — split `publishable`, make invalid payloads
  unconstructible (see `13` §10). **This must land before Instagram is
  enabled**, not after.
- Media pipeline — upload at schedule time (see `13` §9)

**Gate:** a post scheduled through the planner appears on a real Instagram
account at the scheduled time, and the UI shows the live link.

### Slice 3 — Money
- Wallet points at the live Cashfree provider, not the fixture
- Webhook: exact public path, signature verified before any work, **live
  provider only** — the fixture provider's HMAC secret is well-known, so
  honouring it on a public endpoint is a credit-forgery path
- Per-post external cost threaded through the ledger

**Gate:** a real rupee moves and the ledger reconciles.

### Slice 4 — The rest
Sites live at a real URL · Loop L1/L2 · Inbox · AI images + branded cards ·
webhooks + public API · Guide tours · dashboard.

**Sites:** evaluate rendering tenant sites from the section tree on a wildcard
subdomain (Vercel Pro is now in place) **before** committing to Cloudflare
Workers for Platforms. Per-tenant isolation at scale is a 10,000-customer
problem, not a launch problem. This may turn weeks into days.

**Inbox:** confirmed viable — Instagram grants `manage_comments` and
`manage_messages`; GBP adds Reviews (list and reply). Start with **GBP reviews**,
which is the use case an Indian SMB cares most about.

---

## 6. Scope

**In:** integrity work · billing · publishing via Zernio · Brand Brain, posts,
variants, planner · Sites live at a real URL · Loop L1/L2 with an honest weekly
report · Inbox · Brand Skin · Guide tours on core paths · dashboard · AI images +
branded cards · webhooks + public API · Google Business Profile

**Out:** Twin · Radar · Remix · Playbooks node canvas · full Studio layered
editor · Agency/white-label · Loop L3 · listed Zapier directory app · WhatsApp
(decide after the first real publish — Zernio supports it)

**Notes on three of those:**
- *Playbooks canvas* is cut because "workflow" meant n8n/Zapier, which is served
  by webhooks + a public REST API with scoped keys. n8n works immediately via its
  HTTP node; Zapier via Webhooks by Zapier. A *listed* directory app is on
  Zapier's calendar — file it after launch.
- *Studio* splits three ways: AI image generation (in — small, and Instagram has
  no text-only post so media is on the critical path), branded card rendering via
  Satori (in if the week allows — 2–3 days), full layered editor (out —
  `packages/render` is currently zero files).
- *Loop L3* — "it learned from your results and changed the plan" needs
  performance data from posts that have run. You will publish your first real
  post around day 12. That claim cannot be true at launch at any staffing level.
  L1/L2 — plan, approve, schedule, publish, report honestly — is most of what
  makes it feel like an employee.

---

## 7. Cut order — decided in advance

If something slips, cut in this order. Decided now, not at 11pm on day 24.

1. Branded card rendering (Satori)
2. Guide tours beyond the two core paths
3. Public API / webhooks (n8n integration slips to post-launch)
4. Inbox beyond GBP reviews
5. Sites

**Never cut:** the cross-tenant guard, RLS tests, the Constraint Engine fix,
token expiry warnings, CI.

---

## 8. On other people's calendars

These are the only true schedule risks — everything else is within our control.
**All three are unstarted as of 29 July.**

| Item | Owner | Status |
|---|---|---|
| Cashfree KYC / live activation | Founder | ⬜ Not started |
| ToS, Privacy, Refund policy, DPA | **Unnamed** | ⬜ Not started — name someone today |
| Google Business Profile verification (if no listing exists) | ⬜ | Postcard/phone/video, days to weeks |

Legal docs gate Cashfree activation. Do not write them yourself — use an Indian
SaaS template service plus a lawyer review. Add two questions to that
engagement: the AGPL position if we ever self-host Postiz, and the DPA with
Zernio (they publish SOC 2 + GDPR paperwork via their trust portal).

**Launch date policy:** the commitment is *capability* — a real user completes
the whole journey and sees honest proof. That is within our control. Payment is
a switch that flips when Cashfree clears, and it can flip a few days later
without anything being a failure.

---

## 9. Open decisions

| # | Decision | Notes |
|---|---|---|
| 1 | Free tier channel allowance | Per-account cost makes 2 free channels a real cost line. **Parked by founder — revisit week 3.** |
| 2 | X link-post metering | $0.200/req vs $0.015 for a plain post. **Parked — revisit week 3.** |
| 3 | Facebook 13-scope consent | Ask Zernio if scope sets can be narrowed. If not, pre-explain on the connect screen. |
| 4 | Sites: wildcard subdomain vs Cloudflare | Cost both before committing. |
| 5 | WhatsApp in or out | Decide after the first real publish. |

---

## 10. Defect register

| ID | Defect |
|---|---|
| SL-033 | No CI exists |
| SL-044 | Admin console design-guard drift — 16 contrast + 4 eyebrow files, in a ratcheted exceptions file |
| SL-045 | `media-pane.test.tsx` quarantined flaky |
| SL-046 | turbo `typecheck` does not depend on `build`; validates against stale artifacts. CI inherits this trap. |
| SL-047 | `/` returns 404 in production — bare domain serves a Next.js 404, no landing or sign-in. **Launch-blocking.** |
| SL-048 | `OPS_INGEST_URL` absent from Vercel; ops sync ships non-functional |
| SL-049 | **Preview deployments write to the production database.** One Supabase project, no preview override — and `TEAM_ONBOARDING.md` instructs non-technical teammates to click through previews. Credit spends there are permanent. |
| R-01 | *Fixed.* Tests could write to production. Destination guard now denies by project ref (not host — the pooler form defeats a host check) and throws rather than skips. |
| R-02 | `SAHODA_HOLD_SWEEP_MODE` unparseable → cron 500 on every tick. **The hold sweeper has never run.** No damage: reconciliation shows zero outstanding holds. |
| — | Constraint Engine: three Instagram defects + LinkedIn. See `13` §10. |
| — | Sentry vars declared in `turbo.json`, never set in Vercel; upload skips silently. Commit `ba32a3f` is half-landed. |

---

## 11. How we work

- **Every prompt specifies model and effort.** Opus 5 / high for design and
  surgery; Fable 5 / xhigh for adversarial review; Sonnet 5 / medium for
  mechanical work.
- **Phase-gated execution.** Stop between phases. An unexpected output is a full
  stop, not an improvisation.
- **Adversarial review before anything irreversible.** The branch reconciliation
  plan was ruled EXECUTE-WITH-AMENDMENTS by a Fable pass that caught an
  unrecoverable ordering error the original plan would have shipped.
- **Evidence or nothing.** Every "done" needs a file:line, a named passing test,
  a migration number, a git SHA, or a live URL. Anything else is UNVERIFIED.
