# 32 — Deck screenshots

**Every figure in these images is seeded demo data from a local throwaway database. Nothing here is a measurement of a real customer.**

Captured 2026-08-20 from branch `wt-shots` (cut from `wt-redesign` at `af4c734`), running against a
local PostgreSQL that was created for this session and destroyed at the end of it. No production row
was read or written, and nothing was published to any platform.

All frames are light theme at device pixel ratio 2 — desktop `1440×900` (file 2880×1800) and mobile
`390×844` (file 780×1688), so they project without softening.

---

## The business in these images

**Sujata Bake House** — a six-year-old neighbourhood bakery on 8th Cross, Malleshwaram, Bengaluru.
Owner Sujata Rao. It sells bread and cake over the counter, and festive hampers in bulk to offices
nearby. Instagram (2,431 followers) talks to the lane; LinkedIn (611 followers) talks to office
admins who need a lead time and a GST invoice.

That split is the reason the per-channel copy in these images genuinely differs. It is not the same
sentence twice.

The seed holds 18 posts across every status, 468 metric snapshots over 31 measured days, a Brand
Brain with 8 of 15 fields confirmed, a credit ledger with grants, spends and a top-up, two connected
accounts, two campaigns, eight library assets, six planner events and seven inbox conversations.
The numbers are a small shop's numbers on purpose. **All of it is demo data.**

---

## The images

### 1. Home

- `docs/deck/home-desktop.png` · `docs/deck/home-mobile.png`
- The first screen after signing in: what needs attention today, what credits are left, and how much
  of the brand Sahoda is still guessing at.
- Caption: **"Open it in the morning and it tells you what needs you."**
- All figures are demo data.

### 2. Posts

- `docs/deck/posts-desktop.png` · `docs/deck/posts-mobile.png`
- Every post in one list, filtered by state — 18 posts, 2 needing the owner, 5 scheduled, 9
  published, 2 drafts.
- Caption: **"One list. Eighteen posts, and it is obvious which two need you."**
- All figures are demo data.

### 3. Post detail — Instagram (**the important one**)

- `docs/deck/post-detail-desktop.png` · `docs/deck/post-detail-mobile.png`
- One post written for two channels at once. The Instagram tab is open: its own caption, its own
  2,200-character limit at 512 used, and a warning raised by Instagram's own rule. The LinkedIn tab
  beside it carries no warning.
- Caption: **"The same post, judged by each channel's own rules — before it goes out."**
- All figures are demo data.

### 4. Post detail — LinkedIn (**the pair to the one above**)

- `docs/deck/post-detail-linkedin-desktop.png` · `docs/deck/post-detail-linkedin-mobile.png`
- The same post, same moment, LinkedIn tab. Different copy entirely — lead times, box prices, GST —
  a different limit of 3,000 characters at 911 used, and no warning at all.
- Caption: **"Instagram is blocked. LinkedIn is fine. Same post, same second."**
- All figures are demo data.
- Show these two frames together. The editor shows one variant at a time, so the contrast needs both.

### 5. Planner — list

- `docs/deck/planner-desktop.png` · `docs/deck/planner-mobile.png`
- Everything waiting to go out, with what still needs approving and what is already dated.
- Caption: **"What is scheduled, what is waiting on you, in one place."**
- All figures are demo data.

### 6. Planner — month

- `docs/deck/planner-calendar-desktop.png` · `docs/deck/planner-calendar-mobile.png`
- The same plan as a month grid, scheduled posts sitting on their dates with their channels. The
  footer states plainly how many posts have no date yet.
- Caption: **"A month of the shop's marketing on one page."**
- All figures are demo data.

### 7. Analytics

- `docs/deck/analytics-desktop.png` · `docs/deck/analytics-mobile.png`
- Reach over time across 31 measured days, drawn from stored snapshots, with the per-channel table
  beneath it.
- Caption: **"Reach over a month, from what was actually recorded."**
- All figures are demo data — the curve is generated, not observed.
- Three panels on this screen name themselves unavailable rather than showing a number. See
  *Panels that name themselves unavailable* below; that is correct behaviour, not a broken frame.

### 8. Brand Brain

- `docs/deck/brain-desktop.png` · `docs/deck/brain-mobile.png`
- Everything Sahoda believes about the business, and — the part no competitor shows — which of those
  beliefs a person actually confirmed. Eight of fifteen confirmed, seven still the model's guess,
  section by section, with the single most valuable unanswered question surfaced.
- Caption: **"It tells you what it is still guessing, and what that guess is costing you."**
- All figures are demo data.
- This is the strongest frame in the set after the two post-detail frames.

### 9. Inbox

- `docs/deck/inbox-desktop.png` · `docs/deck/inbox-mobile.png`
- The unified inbox. In this environment it is showing its empty state, and the empty state is the
  point: it distinguishes "we asked and got nothing" from "we never asked", and says which.
- Caption: **"When it cannot see something, it says so instead of showing you a zero."**
- Demo data. **Do not caption this as a populated inbox** — see the note below.

### 10. Connections

- `docs/deck/connections-desktop.png` · `docs/deck/connections-mobile.png`
- Which accounts are linked. Instagram and LinkedIn connected; X and Google Business Profile not, each
  saying why.
- Caption: **"Connect an account once. Sahoda handles the rest."**
- All figures are demo data.

### 11. Wallet

- `docs/deck/wallet-desktop.png` · `docs/deck/wallet-mobile.png`
- Credits, and every movement of them — the monthly grant, a purchase, and each AI action with what
  it cost, down to the provider cost behind it.
- Caption: **"Every credit accounted for, including what it cost us to serve it."**
- All figures are demo data — the ledger dates were spread by hand so the history has a shape.

### 12. Settings

- `docs/deck/settings-desktop.png` · `docs/deck/settings-mobile.png`
- Workspace name and address, with profile, integrations and plan alongside.
- Caption: **"Settings, and not many of them."**
- All figures are demo data.

### 13. Campaigns — **placeholder, not a feature**

- `docs/deck/campaigns-desktop.png` · `docs/deck/campaigns-mobile.png`
- On this branch `/campaigns` is a "Coming soon" screen with three hardcoded example cards. It does
  not read the campaigns table, so the two seeded campaigns do not appear on it.
- **Do not build a slide around this as shipped functionality.** If it is used at all, it can only be
  captioned as a design in progress.
- A real campaigns screen exists on lane `wt-camp` and is not on this branch.

### 14. Assets — **placeholder, not a feature**

- `docs/deck/assets-desktop.png` · `docs/deck/assets-mobile.png`
- Same situation. `/assets` is a "Coming soon" screen with hardcoded example tiles and does not read
  the assets table, so the eight seeded library items do not appear.
- **Do not build a slide around this as shipped functionality.**
- A real media library exists on lane `wt-assets` and is not on this branch.

---

## Screens that cannot be shown, and why

Six, not two. Each of these needs to be known before a slide is built around it.

| Screen | Why it cannot be shown |
|---|---|
| **Weekly plan** | The button exists on `/planner` ("Plan my week · 20 credits") but the Loop behind it is unbuilt — `plan-week.ts:116` says so. Pressing it produces nothing to photograph. |
| **Audience Twin** | `/brain/audience` is a `ComingSoon` component. There is no implementation anywhere in the repository. |
| **Signal Resolution Console** | `/brain/resolve` returns "This page isn't here" on this branch. It was built on lane `wt-signal` and was never merged here. |
| **An open inbox thread** | Every inbox read surface — messages, comments and reviews alike — calls the Zernio API. It does not read `inbox_threads`, which the code itself describes as a local table that ships empty. Showing a populated thread would mean pointing the app at live customer accounts and photographing real people's messages. That was not done. |
| **Campaigns (real)** | Placeholder on this branch, as above. |
| **Assets (real)** | Placeholder on this branch, as above. |

Nothing above was mocked to fill a gap.

---

## Panels that name themselves unavailable

Three panels on `/analytics`, and the performance strip on `/home`, do not show numbers. That is not
a capture failure and not a seeding failure.

Follower counts, account reach and per-post platform metrics are read live from Zernio, our
publishing partner, not from our own database. The Zernio key was deliberately removed from this
environment so that taking screenshots could not reach out to real connected accounts or pull a real
customer's figures into a deck. With no key, those panels say so.

The historical reach curve on `/analytics` is ours and is stored, which is why it renders.

If the deck needs a populated follower panel, that is a decision to run a capture against live Zernio
with a real account attached — worth deciding deliberately rather than by accident.

---

## Two things worth fixing before this deck is shown again

1. **The channel-rule warning reads generically.** `violation-copy.ts` keeps an allowlist of violation
   codes, and `MEDIA_REQUIRED` and `MEDIA_ASPECT` are not on it. So the engine's precise sentence —
   "Instagram needs at least one photo, there is no text-only post" — degrades to "This does not meet
   the channel rules." on screen. The frame in image 3 would be markedly better after adding those two
   codes. Not changed here: this branch ships no code.

2. **`/campaigns` and `/assets` are placeholders on the branch the deck is being cut from**, while real
   versions sit on `wt-camp` and `wt-assets`. Worth merging before the next capture, or the deck is
   showing less than the product has.

---

## Reproducing these images

The whole environment was disposable and is gone. To rebuild it: run `packages/db/scripts/pgbox.mjs`
(carried onto this branch from `wt-pay2`) to get a local Postgres with all 42 migrations, apply the
Supabase-equivalent grants that pgbox does not create, run PostgREST in front of it with Clerk's JWKS
as its JWT secret, and point `NEXT_PUBLIC_SUPABASE_URL` at a small proxy that strips `/rest/v1`. The
seed, proxy and capture scripts were session scratch files and are not committed; this document plus
the pgbox script is what remains.
