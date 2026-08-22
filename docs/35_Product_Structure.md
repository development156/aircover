# 35 — Product Structure

**A structural and data reference for the interface design.**
Written 22 August 2026. Everything here was read out of the running product's
code and its production database, not out of a specification.

---

## 0. How to use this

### What this is, and what it deliberately is not

This document contains **no design opinion**. Not one colour, font, spacing value,
motion curve, hierarchy suggestion or layout recommendation. That is your work and
this document has nothing useful to add to it.

What it contains is the part you cannot see from outside the code:

- every screen that exists, and every screen that does not;
- what is on each screen, and where each value comes from;
- every state each screen has, including the several different kinds of "nothing";
- what a person can do on each screen, and what it costs;
- and the figures the product **cannot** produce, several of which the current
  reference displays today.

**The one rule: where this document and the current UI package disagree, this
document is current.** The package is roughly forty working sessions behind. It
shows screens that no longer exist, misses most of the screens that do, and
displays data the product cannot produce.

### The headline numbers

| | Current reference | The product today |
|---|---|---|
| Navigation destinations | 10 | **21**, in five named groups plus two ungrouped and three pinned to the bottom |
| Screens | 21 route entries | **57 page routes** — 44 signed-in application screens, 6 staff-only, 1 onboarding, 2 sign-in/sign-up, 1 public marketing page, 1 internal design-system page, 2 embeddable widgets |
| Machine endpoints (no screen) | 0 | **15** — scheduled jobs, webhook receivers, OAuth returns, publish |
| Publishing channels | 13 services listed | **4**: Instagram, LinkedIn, X, Google Business Profile |
| Screens with no counterpart in the reference | — | **26 of the 44** |

### The renames

Two of the reference's own screens have moved, and keeping the old names will
produce a mismatch that is hard to spot later:

- **"Brand" → "Brand Brain"**, and the URL is `/brain`, not `/brand`. Its
  sub-screens are `/brain/identity`, `/brain/voice`, `/brain/audience`,
  `/brain/competitors`, `/brain/knowledge` and a new one, `/brain/resolve`.
- **"Conversations" → "Inbox"**, at `/inbox`. It is no longer one omnichannel
  list: it splits into **comments**, **messages** and **reviews**, each with its
  own screen.
- **Credits have left Settings.** They are their own top-level destination,
  `/wallet`.

### One screen in the reference has been deleted outright

`/campaigns/new` — the eight-step campaign builder with the AI health gate and
the budget slider. Campaigns in this product do not have budgets, spend, revenue
or a health score. See §8.

### One thing about where this was read from

**The product is currently spread across nine branches of the codebase**: a main
integration branch, plus eight lanes of work finished but not yet merged into it. This
document describes **the assembled product** — the integration branch plus those eight
lanes.

The practical consequence: **if you check out the integration branch alone, Radar,
Playbooks, the Knowledge library, Remix, Leads, the crop offer, the webhook receiver and
the rebuilt onboarding will look different or absent.** They are built; they are queued.
Where that changes what a screen shows *today*, the route's entry says so.

### Two things to know before reading §2

**First: "built" and "in the menu" are two different facts, and on three screens
they currently disagree.** Every route entry below therefore carries two lines:
what the screen actually is, and what the navigation currently claims about it.
Design to the first; the second is a switch someone flips.

**Second: the product is deliberately visible about its roadmap.** Unbuilt
sections appear in the menu marked as not yet available, because a hidden feature
teaches nobody what the product is for. The condition is that *visible* must never
read as *available*, and an unbuilt screen may **never** display a figure. Design
these fully — §7 lists them — but do not put a number on one.

## 1. The product in one page

### Who it is for

Someone who runs a small business themselves — a dental clinic, a bakery, a
one-person consultancy, a five-person agency serving them. They have no marketing
team, they cannot afford an agency, and marketing is the thing that gets dropped
when the week gets busy.

### The job, start to finish

**1. It learns the business once.**
On first run the person hands over one thing — a website address or a social
handle — and the product **reads it**: what the business sells, who it is for,
how it writes, what colours it uses. It asks a small number of questions to fill
the gaps. What comes out is a **Brand Brain**: a set of named fields about the
business, each one either *confirmed by the owner* or *suggested and still
unconfirmed*. Everything the product later writes is written from these fields.

**2. It writes, and the owner decides.**
A post is one idea. Underneath it, the product keeps **one version per channel** —
Instagram's caption, LinkedIn's post, X's thread, the Google Business Profile
update — each with its own words, its own format and its own rules. The owner can
write all four by hand, or ask for them and edit what comes back. Every request
that spends credits says what it will cost before it spends.

**3. It publishes, or waits to be told.**
A post can go out now, or be scheduled, or sit in a queue waiting for approval.
Each channel goes out on its own, so one can succeed while another fails, and the
failure names its reason and offers the retry.

**4. It measures only what it was actually told.**
After publishing, the product reads back what each platform reports. Where a
platform reported nothing, the screen says so rather than printing a zero. This
restraint is the product's most distinctive behaviour and it runs through every
screen.

**5. It answers the people who reply.**
Comments, direct messages and Google reviews arrive in an inbox, and can be
answered from there.

**6. And then it starts doing the whole thing on its own.**
This is the part the current reference has never seen. **The Loop** is a weekly
cycle — collect what happened, reflect on it, plan the week, cost it, create the
posts, test them, stage them, report. An **Autonomy Dial** set per channel decides
how much of that the product may do without asking. There is a weekly credit
budget, a cost approval step before anything expensive runs, and a kill switch.

### The one sentence that governs every screen

> **The product never renders a figure that no query produced.**

Not for reach, not for revenue, not for predicted performance, not for a
competitor count, not for a score. If the data is not there, the screen says which
kind of "not there" it is — and there are eight distinguishable kinds (§6). This
is a structural constraint, not a stylistic one: it decides what can be on a
screen at all.

## 2. Every route that exists

### 2.0 How to read this section

Each entry gives: the path · what a person does there · its navigation group ·
**two** build-status lines (what the screen is, and what the menu claims) · every
tab · every piece of data with its source · every action · every state · and what
changes structurally at phone width.

**"NEW" means there is no counterpart in the current reference.** 26 of the 44
signed-in screens are marked NEW.

### 2.0.1 Three widths, not two — read this before anything else

The product compiles **exactly two breakpoints**, and Tailwind's stock ones are
wiped, so no others exist:

- **`narrow` = 700px**
- **`wide` = 1180px**

That produces **three distinct layouts**, not two:

| Band | Layout |
|---|---|
| below 700px | Phone. No side rail at all. A fixed bottom bar. |
| **700px – 1179px** | Rail present, collapsed to icons. **This band is a third layout, not an interpolation.** |
| 1180px and up | Rail at full width with labels. |

Two things follow. First, several code comments in the repository say "768px" —
they are stale, and 700 is what compiles. Second, **a design set of 1440 and 390
misses the entire middle band**, which has already produced real defects: labels
that disappeared from the accessibility tree, and a workspace name squeezed to
`S Sah` before it was removed instead of shrunk.

The rule the product follows in that middle band and below is: **carry fewer
things, not smaller ones.** When something does not fit, it is removed and its
destination stays one tap away — it is never shrunk until it is unreadable.

---

### THE APP SHELL — the frame around every signed-in screen

**Not a route.** It wraps every screen in the signed-in group and is on screen at
all of them.

**BUILT.** Every part of it runs real reads.

#### What it contains

**The side rail** (700px and up), in this order: the wordmark; two ungrouped
destinations; five named groups; then a rule and three foot destinations. Group
headings are **labels, not controls** — they do not collapse and cannot be
clicked, because nothing should be reachable only after remembering you collapsed
it.

The 21 destinations, in rail order, each with its verbatim label, its verbatim
one-line hint, and what the menu currently declares:

| # | Group | Label | Hint | Menu says |
|---|---|---|---|---|
| 1 | — | Home | *Today, and what needs you* | live |
| 2 | — | Brand Brain | *What Sahoda knows about your business* | live |
| 3 | Create | Posts | *Write, approve and publish* | live |
| 4 | Create | Campaigns | *Group posts under one push* | live |
| 5 | Create | Assets | *Photos you can reuse on any post* | live |
| 6 | Create | Studio | *Carousels and quote cards, locked to your brand* | **soon** |
| 7 | Create | Remix | *Turn one long piece into a week of posts* | **soon** |
| 8 | Publish | Planner | *The schedule, week by week* | live |
| 9 | Publish | Approvals | *Everything waiting on your decision* | live |
| 10 | Publish | Sites | *Generate a website from your Brand Brain* | live |
| 11 | Publish | Ads | *Paid spend, beside the posts it supports* | **soon** |
| 12 | Customers | Inbox | *Comments, messages and reviews* | live |
| 13 | Customers | Leads | *Enquiries, from first message to sale* | **soon** |
| 14 | Results | Analytics | *What went out, and how it did* | live |
| 15 | Results | CMO Report | *The Monday read on your week* | **soon** |
| 16 | Results | Radar | *What the businesses beside you are doing* | **soon** |
| 17 | Automate | The Loop | *The weekly cycle, and how much it may do alone* | **soon** |
| 18 | Automate | Playbooks | *When this happens, write that* | **soon** |
| 19 | foot | Connections | *Channels and accounts* | live |
| 20 | foot | Wallet | *Credits, and what each one bought* | live |
| 21 | foot | Settings | *Workspace preferences* | live |

A 22nd row, **Admin**, appears only for staff. It is not in the navigation map and
therefore never appears on a phone.

The five group names are deliberately the plainest word for the job rather than
the marketing-tool word: *Create · Publish · Customers · Results · Automate* — not
"Engage" and "Measure". Home and Brand Brain sit above the groups because the
Brand Brain is what every screen below writes from, so it belongs to all five
groups and therefore to none.

**"Soon" rows are real working links, never disabled controls.** All eight
navigate to a page that exists and says plainly that the section does not work
yet. Screen readers hear *", not built yet"* appended to the label at every width.
Greying them out would break the product's position that the roadmap must be
visible but must never read as available.

**The rail scrolls.** Twenty-one rows plus headings plus the brand block plus the
foot come to roughly 1050px against a 900px viewport, so the navigation region
scrolls on its own while the brand block and the foot stay pinned.

**The rail foot** carries the credits balance, the word *Credits left*, a *Usage*
link to the Wallet, and the signed-in person's initials, name and role. The role
is one of exactly four words: **Workspace owner · Editor · Approver · Viewer**.

**The top bar**, at every width: the workspace switcher · the command palette
trigger (*Search Sahoda*, with a `⌘K` hint) · the Brand Brain pill · the credits
pill · the theme button · the account avatar.

- **The Brand Brain pill** shows a fraction like `12/15` and the word *confirmed*,
  with a ring arc at confirmed ÷ 15. **It counts confirmed fields only**, never
  filled ones — see §2's Brand Brain entry. Hovering shows the question behind the
  highest-priority unconfirmed field, or, when all are confirmed, *"Every field is
  confirmed — Sahoda writes from your answers."*
- **The credits pill** shows *available* credits — total minus what in-flight
  actions are holding — never the total.
- **The workspace switcher** lists every workspace the person belongs to. There is
  deliberately **no "create workspace" item inside the open menu**: creating a
  second workspace is not a flow this product has.

**The command palette** (⌘K / Ctrl+K) holds exactly 22 rows: *Create*, then all 21
destinations in rail order with their hints, each carrying *Soon* if that is its
state. It filters on label **and** hint, so typing `week` matches both Planner and
The Loop. **It searches pages only and runs no database query at all** — there is
no content search anywhere in this product.

#### Actions
Nothing in the shell costs credits and nothing in it asks for confirmation. The
only things it writes are the active-workspace cookie and, in the no-workspace
case, the workspace itself.

#### States
- **No workspace yet** — the switcher is replaced by a **Create workspace** button.
  This is the state every brand-new account is in, because signing up does not
  create a workspace.
- **A read failed** — each shell read degrades on its own. The workspace switcher
  becomes a plain non-interactive block rather than a button, because the remedy is
  to reload and this control cannot reload anything.
- **A zero is never a stand-in for a failure.** Showing `0 credits` to a funded
  person stops them working; showing `0/15` for an unreadable Brand Brain reports
  every confirmed field as unconfirmed. Both are forbidden.

#### Phone (below 700px)

**The rail is removed from the document, not narrowed.** With it go: the wordmark
(a small square mark reappears in the top bar), the credits number and *Usage*
link, the person's name and role, and the **Admin** row.

**A fixed bottom bar appears**, 56px plus safe-area padding, holding five slots:
`Home` · `Inbox` · a round **+** button (accessible name *Create a post*) lifted
above the bar's edge so it reads as an action rather than a fifth destination ·
`Planner` · `More`. The page gains bottom padding so the bar cannot cover the last
row, and toasts lift to clear it.

**`More` opens a bottom sheet titled *All sections*** capped at 80% of viewport
height, holding **all 21 destinations** in the same groups and order as the rail —
and, unlike the rail, each row carries **its one-line hint under the label**,
because a phone has more room for a line of explanation than a 64px icon rail
does. The sheet closes itself on navigation.

**Brand Brain is not a bottom-bar tab** — it was demoted to make room for *More*,
and is the first row in the sheet.

Also on a phone: the palette trigger is **hidden entirely** (the keyboard shortcut
still works, but there is no on-screen way in); the Brand Brain pill is **hidden
entirely**; the credits pill stays at a 44px minimum; the theme button and avatar
grow from 32px to 44px.

**Structural consequence worth flagging: a phone user cannot see how many
approvals are waiting.** The count badge is a rail-only feature — it is on neither
the bottom bar nor the sheet.

#### Between 700 and 1179
The rail is present at 64px, icons only. Labels and group headings become
screen-reader-only rather than hidden, because hiding them once left nine
navigation links with no accessible name. The word *Soon* becomes a **hollow
ring**; the Approvals count becomes a **filled dot** — filled means something is
waiting, hollow means nothing is, and the distinction survives greyscale. The
rail foot's whole credits block disappears; only the initials circle survives. The
brand lockup is **cropped, not scaled**. The workspace name goes
screen-reader-only at **1180**, not at 700, deliberately so the crowded middle band
is covered rather than stepped over.

#### What the shell cannot show
- **A credits meter, gauge or "X of Y" fraction.** There is no denominator: the
  wallet is a balance that is granted and topped up, not an allowance being drawn
  down. This was tried and produced `of —` on every screen in the product. Both the
  bar and the words are now deleted. **Do not design one.**
- **Any badge other than Approvals.** There is no notification bell.
- **A Brand-Brain fullness percentage.** The ring counts confirmed fields, because
  a single automated pass fills all fifteen at once and a fullness meter would read
  100% the moment the model answered — the exact claim the product exists to refuse.
- **Content search.**
- **A tour, a mascot or any in-app guidance in the frame.** The database holds six
  seeded tours and a progress table, and the app is annotated with tour anchors,
  but **nothing reads either table and no tour engine exists.** The mascot artwork
  appears in exactly two page-level places — the Home greeting and the coming-soon
  screens — and never in the frame.
- **Anything about connected channels.**

#### Three absence marks that must stay distinguishable without reading

This is a structural rule, not a visual one, and it recurs on every screen:

| Claim | What renders |
|---|---|
| **does not exist** | **nothing** — the slot is deleted, not filled with a dash |
| **not yet measured** | a mark in the number's place, with a spoken sentence such as *"Reach has not been measured yet"* |
| **could not be read** | a *different* mark, with its own spoken sentence such as *"Your credit balance could not be read"* — never a bare dash and never a zero |

---

### `/home` — Home

**BUILT.** Menu says live. They agree.
**Group:** ungrouped, at the top. Also the first slot on the phone's bottom bar.
`/` redirects here, so it is the screen every signed-in person lands on.

**What a person does here.** Checks, between customers, whether anything is
waiting on them — a post sent for review, or one that failed to go out — and opens
it. Sees what is scheduled for the next seven days, how many credits are left and
what the last few went on, and whether the product has drafted anything this week.
If nothing is waiting, the one thing they can start is writing a post.

**Tabs / toggles:** none. Every window is fixed in code — spend is 30 days,
Instagram is 30 days, the week strip is 7 days starting today. **The person cannot
change any window from this screen.**

#### What is on it, and where each value comes from

**Greeting banner.** A greeting line — one of exactly three strings, *Good
morning* (before 12:00), *Good afternoon* (12:00–16:59), *Good evening* (17:00 on)
— computed from the clock in Asia/Kolkata, not from any table. Under it, one
sentence assembled from up to three counts:

- *"N drafts waiting"* — a count of posts whose status is `draft` or `idea`.
- *"N posts approved"* — a count of posts with status `approved`.
- *"N posts out"* — a count of **successful, live** publish log entries. Runs
  against the fixture rail are counted separately and never appear here.

When all three are zero the line is exactly: *"Nothing in flight yet — plan a week
and it starts filling in."* When a read failed it is exactly: *"Some of your
workspace couldn't be read just now."*

**Needs your attention.** A count beside the heading of posts whose status is
`review`, `failed` or `partial`. Up to four rows, each showing the post title (or
the literal *Untitled post*), a status word — only three can appear here: *In
review* · *Failed* · *Partly published* — a two-line body preview (or *No content
written yet.*), and the post's channel list rendered as short names joined by ` · `:
*Instagram · LinkedIn · X · GBP*.

**Performance.** Four fixed slots, always in this order: **Reach · Views ·
Accounts engaged · Interactions**. Each is a raw value Instagram reported for a
30-day window, fetched live. **There is no delta, no comparison to a previous
period and no sparkline here, deliberately** — no prior-period read exists. A key
Instagram did not return renders the not-measured mark; a key it returned as zero
renders `0`.

**Instagram · last 30 days.** A large follower number — the last point of the
follower series. A change line computed as last minus first, rendered *"+N over M
days"* / *"-N over M days"* / *"No change"*, where M is the number of days
Instagram actually returned, not necessarily 30. A line chart of the series,
scaled between the window's own minimum and maximum rather than from zero, with
those two numbers printed beneath so the zoomed scale is readable. And a delay
note stating the platform's own lag: *"Instagram reports on a delay of about a
day, so recent days may be missing."*

**Credits spent · last 30 days.** A sum of debit ledger entries over 30 days
(holds and releases deliberately excluded). An area chart of the same sum bucketed
by calendar day, zero-filled to exactly 30 days. Horizontal bars, one per action
type, largest first, each labelled with a human name — *Caption rewrite · Inbox
reply · Post variants · Twin preflight · Standard image · Premium image · Carousel
· Video script · Site edit · Plan my week · Playbook run · Radar scan · SEO article
· Remix pack · Campaign plan · Brand research · Site generation · Voice minute*.

**This week.** Seven day cells starting with today, keyed to Asia/Kolkata calendar
days. Inside each, posts scheduled on that day, showing the title or *Untitled
post*. Two marks can appear on an entry: one whose accessible name is *"Drafted by
Sahoda"* (present only when the post came from a week plan), and the word
**Simulated** (present only when the post's channel rows say it went out through
the fixture rail rather than for real).

> **A structural point worth carrying into every post surface: what a post's
> status column says is not what the screen trusts.** Each entry carries one of six
> certainty levels — *real · committed · proposed · simulated · failed · neutral* —
> computed from the post's status **plus its per-channel rows**, never from the
> status alone. `real` requires the channel rows to prove a live publish actually
> happened.

**Recent activity.** The four newest credit ledger entries, each with a label
drawn from its type — *Credits purchased · Performance reward · Credits returned ·
Credits expired · Manual adjustment · Welcome credits · Plan credits · Correction
· Credits added by Sahoda · Credits added* — and its raw amount, with a leading `+`
when positive.

**Available credits.** Total balance minus held balance. A sub-line reads *"N held
by actions in progress"* when anything is held, otherwise the literal *"credits to
spend"*.

**Brand Brain card.** *"N of 15 fields confirmed"* — a count of fields a person has
confirmed, out of a fixed registry of 15 editable fields. Beneath it, a fixed
sentence: *"Confirmed means a person checked it. The rest are still Sahoda's
reading of what it found."* Then exactly two labelled values: **Brand voice** and
**Writing style**.

**Connections card.** With nothing connected: four fixed tiles in this order —
*Instagram · LinkedIn · X · Google Business Profile* — each reading *Not
connected*. With connections: one tile per connection, each reading either
*Connected* or *Needs attention*.

**This week, from Sahoda.** Posts the product drafted itself inside the same
seven-day window. When it has drafted nothing, a button reading **"Plan my week ·
20 credits"** — and the 20 is read from the price list, never written into the
button.

#### Actions
Every action on this screen is a link. **Nothing on Home spends credits.**

*Create post* → the composer. *View all* (attention) → Approvals. A post row →
that post. *Details* → Analytics. *Open connections* → Connections (only in the
Instagram reconnect state). *See your credit activity* → Wallet. *View all*
(activity) → Wallet. *View all* (Brand Brain) → Brand Brain. *Manage* → Connections.
*Plan my week · 20 credits* → the Planner — **it is a link, and the charge happens
there, not here.**

The one exception is **Create workspace**, which is a real form submit: it creates
the workspace, its owner membership, the profile and the free signup credit grant
in one transaction, then sends the person to onboarding. It is idempotent — a
second press returns the workspace that already exists.

#### States — Home has more distinct empty states than any other screen

Each is a different sentence for a different condition:

| Condition | Exact wording |
|---|---|
| Nothing waiting on a person | *"Nothing is waiting on you. Anything sent for review, or that fails to go out, shows up here."* |
| Nothing scheduled this week | *"Nothing scheduled this week yet. Anything you approve or schedule shows up here."* (an individual empty day carries no visible text at all — only a spoken *"Nothing planned"*) |
| No ledger entries at all | *"Nothing has happened yet. Credits you spend or receive show up here."* |
| No spend in 30 days | *"Nothing spent yet. Your first AI action shows up here, broken down by what it was for."* |
| Fewer than three days had spend | *"Spend shows as a trend once a few days have activity. So far one day has."* |
| Nothing drafted this week | *"Sahoda hasn't drafted anything this week."* + the Plan-my-week button |
| No Brand Brain yet | *"Sahoda doesn't know your brand yet."* |
| Instagram connected, no follower history | *"No follower history to show yet."* or *"Instagram hasn't reported follower history for this window."* |
| Instagram connected, no insight tiles | *"Instagram has not reported these for this window yet."* |
| **Nothing connected** | The Connections card lists all four platforms as *Not connected*, followed by: *"You can write and plan without one. Connecting is what lets a post actually go out."* The Performance strip says *"Connect a channel to start measuring."* **The Instagram card renders nothing at all — no card, no heading, no placeholder.** That is deliberate. |
| **Connection expired** | *"Reconnect Instagram to see followers and reach."* + *"The connection expired, so we can't read metrics until it's renewed."* + an *Open connections* link. The Performance strip says *"Reconnect Instagram to start measuring again."* |
| **Not configured** (connected, but this deployment has no metrics key) | *"Sahoda can't read Instagram metrics here."* + *"Your account is connected. This environment has no metrics connection, so no request went out. Nothing is wrong with your account."* **and no retry is offered.** |
| **No workspace yet** | Replaces the whole dashboard. Heading *"Create a workspace to get started"*; body *"Everything in Sahoda lives in a workspace — your Brand Brain, your posts and your credits. Nothing has failed and nothing was charged; there is simply nothing to show until one exists."*; the Create workspace button; and a tip line *"Sahoda: Your free signup credits land the moment the workspace exists."* |

**Loading** is a skeleton holding the page's shape — greeting strip, attention
queue, four-slot performance grid, rail. It contains **no text and no numbers by
rule**; its only wording is a spoken *"Loading your home screen"*. All the reads
share one wait, so there are no per-card spinners.

**Error is per block, never page-wide.** There is no whole-page error screen.
Balance unreadable → *"Your credit balance could not be read."* Spend unreadable →
*"Sahoda could not read your spending just now. Nothing has been charged, and
reloading will try again."* — with **no action link**. Brand Brain → *"Couldn't
read the Brand Brain just now."* Connections → *"Couldn't check your connections
just now."* Instagram → *"Couldn't read this right now. Try again in a moment."*

**Suppressed by the platform is not a named state here.** Instagram withholding
data collapses into the empty branch, and the wording is written to survive both
readings. If a distinct suppressed state is wanted on Home, it does not exist today.

**"Could not check today" does not apply.** Home has no scheduled or cached read —
every figure is fetched live when the page renders.

#### What Home cannot show
No predicted performance. No revenue, conversions or ROAS. No score. No
week-over-week delta on the Performance strip. No credits allowance or fraction.

#### Gotchas
- **A failed posts read is invisible.** It returns an empty list, so the attention
  queue, the week strip and the Sahoda rail all render their *empty* sentences
  rather than an error. The same is true of the ledger read.
- The top bar above this screen renders the same credits figure and Brand Brain
  ring, so they appear in any screenshot of Home but belong to the shell.

---

### `/brain` — Brand Brain (with `/brain/identity`, `/brain/voice`, `/brain/competitors`)

**BUILT.** Menu says live. They agree.
**Group:** ungrouped, at the top, beside Home.
**Only `/brain` is in the menu.** The sub-screens are reachable only from the tab
row inside it, or by typing the URL.

**What a person does here.** They check what the product believes about their
business *before* it writes anything in their name, and correct what it got wrong.
Every one of the fifteen answers has already been filled in by the product's own
reading. **Nothing here is a form to fill from blank — it is a proof-reading job
over a draft somebody else wrote.**

The page's own subtitle states the frame: *"Everything Sahoda knows about your
business, and where it learned it."*

#### Tabs

One tab row, present on every Brand Brain screen. **Each tab is a different URL,
not a different view of the same data**, and the active one is decided by an exact
URL match rather than a prefix.

1. **Overview** → `/brain`
2. **Resolve** → `/brain/resolve` — NEW
3. **Identity** → `/brain/identity`
4. **Voice & Tone** → `/brain/voice`
5. **Audience** → `/brain/audience` — NEW, and a different feature entirely (real
   Instagram follower data, not brand fields)
6. **Knowledge** → `/brain/knowledge` — NEW

**There is no Competitors tab.** It was deliberately removed. `/brain/competitors`
still exists but only as a redirect to `/radar`, so an old bookmark does not break.

#### The field model — the structure to design around

There are **exactly 15 editable fields**, in **5 sections**. Every field is in one
of three conditions:

| Condition | Chip it wears | Meaning |
|---|---|---|
| **Confirmed** | `Confirmed` | a person read this exact wording and agreed to it |
| **Guess** | `Guess` | the product's own reading, not yet checked by anyone |
| **Not set** | (chip unaffected) | the value box shows the words `Not set` |

**Confirmed is not the same as filled.** Every field is filled the moment the
product resolves the brand; confirmation is a separate, human act. This is why the
completeness figure counts confirmed fields and not filled ones — a fullness meter
would read 100% the moment the model answered.

The five sections, with their exact titles, sub-lines and field counts:

| Section | Sub-line | Fields | On |
|---|---|---|---|
| **Voice** | *How every caption sounds before it says anything.* | 4 | Voice & Tone |
| **Brand persona** | *Who the brand is when it speaks.* | 3 | Identity |
| **Customer persona** | *Who it is speaking to.* | 4 | Identity |
| **Hook** | *The promise each post leans on.* | 3 | Identity |
| **Red lines** | *What Sahoda steers away from.* | 1 | Voice & Tone |

The fifteen fields, with their exact labels and shapes:

- **Voice** — `How it sounds` (a block of text) · `Never say` (a list, **up to 40**)
  · `Signature phrases` (a list of **exactly 3**) · `Register` (one short line)
- **Brand persona** — `Archetype` (short line) · `As a person` (block of text) ·
  `Core values` (**exactly 3**)
- **Customer persona** — `Pain point` (short line) · `Who this is for` (block) ·
  `Fear` (short line) · `Wants to become` (short line)
- **Hook** — `Core promise` (block) · `Primary emotion` (short line) ·
  `Sample hooks` (**exactly 3**)
- **Red lines** — `Red lines` (a list, **up to 40**)

Each field also has a **question**, shown only while that field is being edited.
Verbatim examples: *"What does a customer get from you that they cannot get next
door?"* (Core promise) · *"What problem sends someone looking for you in the first
place?"* (Pain point) · *"How should you sound to someone reading you for the first
time?"* (How it sounds) · *"What must Sahoda never say on your behalf?"* (Red lines)
· *"If your brand were a person, what kind of person would it be?"* (Archetype) ·
*"Who is your best customer, in one sentence?"* (Who this is for).

**Size limits.** The three-entry lists render **no Add and no Remove button at
all** — three is not a maximum, it is the shape. The open-ended lists cap at 40,
and at 40 the Add button is disabled beside this exact sentence: *"That's the
maximum of 40 — remove one to add another."* **There is no character limit on any
individual field**; the only cap is on the whole brain, and exceeding it says:
*"That Brand Brain is too long to save — trim the longest fields or list entries
and try again."*

#### What is on the Overview

**Brand confidence** card: `{confirmed}/15` · a split bar at that percentage, whose
remainder is drawn as a **hatched texture rather than left blank** · *"{n} confirmed
by you"* · *"{n} still Sahoda's guess"* · and a fixed sentence that is the whole
product's argument in one line:

> *"Every caption, campaign and reply is written from these fields. A guess Sahoda
> got wrong is wrong in everything it writes until someone corrects it — and
> correcting one costs nothing."*

**Sections** card: the five rows above, each with its own `{n}/{n} confirmed` and
its own small split bar, linking to the tab that holds it.

**Confirmed fields** card: the same count again — deliberately stated twice on one
screen — plus *"Version {n} · every edit writes a new one"*, which is a stored
version number, not a count. Then **Worth answering next**: the question behind the
first still-unconfirmed field, under a line reading *"Sahoda guessed {Field label}
for you. Editing it costs nothing."* When everything is confirmed that block is
replaced by *"Every field is confirmed — Sahoda writes from your answers, not its
guesses."*

There is also a fixed line distinguishing the two ways to change the brain:
*"Editing a field here is free and marks it confirmed. Re-running the whole resolve
is a separate, paid action that rewrites every field — including the ones you have
already confirmed."*

**Signal lock** card: labelled **`Derived — not counted`**. It shows one of exactly
three stored values — *Strong signal lock* · *Moderate signal lock* · *Weak signal
— inputs conflict* — plus a free-text sentence written at resolve time, plus a
*Drawn from* list repeating the five sections' confirmed counts. It is explicitly
**outside the 15-field denominator**, and the card says so.

#### Actions

**Everything on these three screens is free. Nothing calls a model and nothing
touches the credit ledger.**

- **Edit** (one per field, 15 across the two tabs) — swaps that field's value for an
  input, re-reading the stored value each time so a stale draft never resurfaces.
- **Confirm · free** — the label the save button wears when the text is unchanged
  and the field is still a guess. Pressing it records that a person agreed to this
  exact wording. Helper line: *"Saves this wording as yours, exactly as written."*
- **Save · free** — the same button when the text has changed. Writes the new text
  and marks the field confirmed.
- **Cancel** · **Add {field}** and **Remove {field} {n}** on the two open-ended
  lists only. **Remove asks for no confirmation.**
- Pressing save on unchanged, already-confirmed text writes nothing — the button
  stays enabled and the helper line reads *"Already confirmed — edit the text to
  change it."*

Every save supersedes the current record and writes a **new version**, so the
history is append-only.

The only paid thing reachable from here is a text link — *"Re-running the whole
resolve"* — which goes to `/onboarding`. **The 50-credit price is not printed on
this screen**; the link only says it is "a separate, paid action".

#### States

**Four distinct empties:**

1. **No brain yet, on Overview** — *"Sahoda doesn't know your brand yet"* / *"The
   Brand Brain is what every caption, campaign and reply is written from. Give
   Sahoda a spark and it will resolve a first draft you can correct."* / button
   **Set up your Brand Brain** / tip *"Sahoda: You approve and correct what it
   resolves — you never start from a blank form."* Below it, the Sections card is
   still drawn — **with no percentage, no fraction, no ring and no dash.** Each row
   ends in a mark whose only content is the spoken sentence *"{Section} has not been
   measured yet"*.
2. **No brain yet, on Identity / Voice** — *"Nothing has been resolved yet. These
   are the fields every caption, campaign and reply is written from."* Then every
   section card drawn with its field **labels and no values**. **No "0/4 confirmed"
   eyebrow is rendered** — measuring a brain that does not exist is explicitly
   refused.
3. **One field blank** — the value box reads `Not set`.
4. **Everything confirmed** — as above.

There is also a one-off notice shown only when the confirmed count is exactly zero:
*"Nothing is confirmed yet. Sahoda only started recording who wrote each field in
this version of the app, so any corrections you made during setup are not counted
here — edit a field below and it becomes yours."*

**No workspace yet** has two different wordings. On Overview: *"Create a workspace
to build a Brand Brain"* / *"A Brand Brain belongs to a workspace and you don't
have one yet. Nothing failed — there is simply no brain to show."* with a **Create
workspace** button. On Identity / Voice: *"Sahoda doesn't know your brand yet"* /
*"These fields are what every caption, campaign and reply is written from. There is
nothing to show until the Brand Brain has been resolved once."* — **and no button
at all.**

**Read failed:** *"Could not read your Brand Brain just now — reload to try again.
Nothing has changed and nothing was charged."* No retry button; the remedy named is
reloading. In the top bar, the ring shows **no number at all** — not a zero, not a
dash.

**A save failed** keeps the editor open so the typing survives, and shows one of
sixteen exact sentences, including: *"This list holds exactly three entries."* ·
*"Keep this list to 40 entries or fewer."* · *"Your role cannot change the Brand
Brain — ask an owner or editor."* · *"The Brand Brain changed while you were
editing — reload and try again."*

**A crash** shows the signed-in app's boundary with the shell still around it:
*"This screen didn't load"* / *"Something broke on our side, not yours. Try again
in a moment — if it keeps happening, contact support."* / **Try again** / an
optional *"Reference: {id}"*.

**Not connected, not configured and suppressed-by-platform do not exist here.**
This screen reads one table and makes no external call.

#### What it cannot show
No per-section quality percentage (the fractions are confirmed-counts, not quality
judgements). No alignment or match score against generated copy. No document or
competitor count — those live on their own screens.

---

### `/brain/resolve` — the Signal Resolution Console  · NEW

**BUILT.** **Not in the menu at all** — no rail row, no phone sheet row, no
command-palette entry. The only way in is the **Resolve** tab inside Brand Brain.
That is a reachability gap worth an owner decision (§11).

**What a person does here.** Works through everything the software assumed about
their business and says, one item at a time, whether it is right. **Some of it the
software was never entitled to answer** — what your customers fear, what you must
never say, what you promise — and those come first.

#### The idea that shapes the whole screen: entitlement

Each of the fifteen fields is one of two kinds, and this drives the queue order:

| Kind | Count | What the row says |
|---|---|---|
| **asked** | 11 | *"Only you know this."* → *"Sahoda is not entitled to answer this one — it filled it in so the Brain would work at all, and its guess here is worth less than yours on any day."* |
| **negotiated** | 4 | *"Sahoda proposed this."* → *"This is the kind of field Sahoda is meant to draft: you have the instinct, it has the craft. Keep it, or say it differently."* |

The four negotiated ones are **How it sounds · Never say · Signature phrases ·
Register**. Everything else is asked.

#### The origin panel — one of exactly four statements

Read from where the current version came from:

| Heading | Paragraph |
|---|---|
| **Resolved by Sahoda** | *"A model read what you gave it and wrote every field below in one pass. None of it is your answer until you say so."* |
| **Last edited by hand** | *"The most recent version was written by a person on this screen. Fields nobody has confirmed are still Sahoda's."* |
| **A sample, not your brand** | *"The model could not be reached, so Sahoda saved an example Brand Brain to show you the shape of one. These are not answers about your business. Re-run the resolve before confirming anything here."* |
| **Not recorded** | *"Nothing was recorded about how this version was written. Treat every unconfirmed field as a guess, which is what the count below already does."* |

The third is the loudest thing this screen can say, and it is a real state.

Beside the heading: *"Version {n}"*. And one fixed paragraph, always shown, which
is an unusually candid refusal worth preserving verbatim:

> *"Sahoda cannot show which sentence produced which field. It reads everything
> you give it in one pass and writes the whole Brain at once, so nothing links a
> field back to a line in your document — and it will not invent one."*

#### The finding panel
*"{A} of {B} fields are still Sahoda's guess"* — where B is always 15. Then one of
two paragraphs: *"{N} of them are things only you can actually know — what your
customers fear, what Sahoda must never say, what you promise. Those come first in
the list below, because a guess there is worth the least."* or *"What is left are
the fields Sahoda is meant to draft — how you sound, how formal to be, which
phrases are yours. Keep them or say them differently."* Two legend items follow:
*"{N} only you can answer"* and *"{N} Sahoda is meant to draft"*.

#### The queue
Heading **Unresolved**, with *"{A} of 15"* beside it, and a standing instruction:
*"Tick the guesses you have read and agree with. Confirming is free and never
re-runs the model."*

Each row: a checkbox (its accessible name is the field label) · the field label ·
a badge reading **Guess** (hover: *"Sahoda inferred this. Nobody has confirmed it
yet."*) or **Confirmed** (*"A person confirmed this value."*) · the entitlement
line · the current value, **with lists rendered one entry per line and never joined
with commas** · and, while editing, the field's question.

Below the queue sits a collapsible disclosure, **closed by default**, labelled
**Confirmed by you** with a count. It is not a filter — both lists are always
present when both have rows.

#### Actions — every single one is free

*Select all {N}* / *Clear selection* — **and blank-valued rows are excluded**, so
on a brain with one blank field the label reads *Select all 14*. · a per-row
checkbox, disabled on a blank row · **Confirm selected · free** / **Confirm {N}
selected · free**, which marks every ticked field confirmed and **never changes any
wording — it saves the exact payload it read** · a per-row **Confirm · free** ·
**Correct**, which is labelled **Write it** when the field is empty · **Save ·
free**, which reads **Confirm as written · free** when the draft is byte-identical
to what is stored · **Cancel** · **There are none**, offered only on the two
open-ended lists and only when they hold something — it saves an empty list *and
marks the field confirmed*, so an explicit "nothing to say" counts toward the total
· **Add** / **Remove** on open lists only.

**There is deliberately no Reject and no Delete control anywhere on this screen.**

At the foot, a link — *"Re-running the whole resolve"* → onboarding. **This page
renders no credit figure of its own.**

#### States
- **No workspace** — *"Create a workspace to resolve a Brand Brain"* / *"A Brand
  Brain belongs to a workspace and you don't have one yet. Nothing failed — there is
  simply nothing to resolve."*
- **No brain yet** — *"There is nothing to resolve yet"* / *"The console is where
  you settle what Sahoda guessed about your brand. It has not guessed anything yet,
  because it has not read anything yet."* / tip: *"Sahoda: Sahoda resolves a first
  draft from a link, a PDF or one sentence. Everything it writes lands here as a
  guess for you to confirm."*
- **Queue clear** — *"Nothing left to resolve"* / *"All 15 fields carry an answer a
  person stood behind. Sahoda writes from your answers, not its guesses. Re-running
  the resolve would rewrite every one of them."*
- **A blank field** — the value reads `Not set`, the Confirm button is replaced by
  the sentence *"Nothing to confirm — it is empty"*, and the checkbox is disabled.
- **Nothing ticked** — under the disabled button: *"Nothing selected yet."*
- **Read failed** — *"Could not read your Brand Brain just now — reload to try
  again. Nothing has changed and nothing was charged."* and **nothing else on the
  page renders**.

**Not connected, not configured, suppressed and could-not-check-today do not exist
here.**

#### Phone
Brand Brain is not a bottom-bar tab, so this screen is two taps away — **More**,
then Brand Brain, then the Resolve tab. The Brand Brain confirmed-count ring is
hidden from the header below 700px.

---

### `/brain/audience` — Who follows you  · NEW

**BUILT.** **Not in the menu** — reachable only through the **Audience** tab inside
Brand Brain.

**What a person does here.** Finds out who actually follows their Instagram
account — age, gender, cities, countries — and whether the follower count is
rising. **For most accounts on this product today the answer is "Instagram will not
tell you yet, because you have fewer than 100 followers"**, so what the owner
mostly does here is see how far they are from that threshold and, at their own
measured pace, how long it will take. **Nothing is created, edited or spent here.**

**Heading:** *Who follows you* / *"Instagram reports the shape of your following
for @{username}, and Sahoda keeps a copy each day so you can watch it change."* —
where the handle comes from the stored connection. **The handle is never invented**;
when it is missing the clause is dropped entirely.

#### Eight branches, deliberately

This screen has **eight distinct states**, and a test renders all eight and asserts
they produce eight different screens. Collapsing any two is the defect that test
exists to catch. This is the single best example in the product of §6's principle.

**1. Suppressed by the platform — the state the whole screen is designed around.**
Condition: the platform answered successfully with every dimension empty *and* the
live follower count is below 100.

- The follower count as a large number, then *follower* / *followers* (singular at
  exactly 1).
- A progress track from **`now`** to **`100`**, spoken as *"{n} of the 100 followers
  Instagram requires before it reports audience details"*. **A non-zero count always
  paints at least a sliver, so "one" never draws as "none".**
- Heading: *"{n} more before Instagram describes them"* — or, exactly at the
  threshold, *"Instagram reports who follows you"*.
- Body, verbatim: *"Instagram starts reporting age, gender, cities and countries
  once an account passes 100 followers. That is a rule on their side. Nothing is
  wrong with your account and there is nothing to fix here — the details appear on
  their own once you cross."*

> **How suppression is detected, because this is the part most easily got wrong.**
> The platform does **not** report that it is withholding. A withheld account comes
> back as a success, with every dimension an empty array — **byte-indistinguishable
> from an account that genuinely has no data.** So the screen *infers* suppression,
> and only ever with a follower count in hand from a second, separate call. Without
> that count it refuses the diagnosis and falls back to a different sentence. A test
> asserts this state never uses the words "error", "failed" or "problem with".

**2. Real data.** A large follower number, *"Instagram's figures cover
{timeframe}"* — read as free text because the vendor's own example echoes a value
outside its declared list — then up to four breakdown cards: **Age · Gender · Top
cities · Top countries**.

- Each row's label is spelled exactly as the platform spelled it (`25-34`, `New
  York, New York`, `US`). Gender is the one exception: stored `F` / `M` / `U` are
  rendered *Women* / *Men* / *Not specified*, and an unknown code is printed exactly
  as it arrived.
- The number is a raw account count. **The percentage is computed against the total
  follower count, not against the sum of the buckets**, because the platform returns
  only its top 45 buckets so the parts do not add up to the whole. **When the total
  is unknown, no percentage is printed at all** and the bars scale against the
  largest bucket instead.
- Each card shows at most 6 rows, with *"{n} more not shown."*
- **A dimension the platform did not report gets no card at all** — not an empty
  card, not a card of dashes. A test asserts the heading does not exist.

**3. Not connected.** *"No Instagram account is connected"* / *"Instagram is the one
channel that reports who follows you. Connect an account and Sahoda starts keeping a
daily record of it."* / **Connect Instagram**.

**4. Connection lapsed.** *"Your Instagram connection has lapsed"* / *"The account
is still linked, but the permission Instagram gave Sahoda has run out. Sign in again
on Connections and the daily record picks up where it stopped."* / **Reconnect
Instagram**.

**5. Account no longer resolvable.** *"Instagram no longer recognises this account"*
/ *"Sahoda asked and Instagram answered that it cannot find the account this
workspace is linked to. That usually means the login behind it changed. Linking it
again on Connections restores it. Everything already collected is kept."* — and it
still renders everything already collected.

**6. Not configured.** *"This copy of Sahoda cannot reach Instagram"* / *"Your
account is connected. This deployment is missing the credential Sahoda uses to ask
Instagram anything, so no request went out. Nothing failed and nothing here is
wrong — it is a setting on our side."* It still renders what was already collected,
under a section headed *"What Sahoda last collected, on {date}"*.

**7. Reported nothing, and the follower count does not explain it.** *"Instagram
reported nothing for this period"* / *"The account is connected and Instagram
answered, but it sent no age, gender, city or country figures for {timeframe}."*
followed by either *" Your {n} followers are above the 100 Instagram needs, so that
is not the reason. Sahoda will not guess at what is."* or *" Sahoda has no follower
count for this account either, so it will not guess at why."*

**8. Read failed.** *"Instagram did not answer just now"* / *"The request went out
and nothing came back. Try again in a moment — this is the only thing on this page
a retry can fix."* **This is the only place on the whole screen the words "try
again" appear**, and a test asserts the other seven branches never say it.

#### The kept record, and the line below which nothing is reported

A follower trend chart, one dot per day, drawn from what the product itself stored
— **only consecutive calendar days are joined, so a missing day is a visible break
rather than a zero or a straight line through it.** Two dates beneath, and *"+{n}
across the days kept"* / *"-{n}"* / *"No change across the days kept"*.

Then a collection note that quietly states the product's whole posture:

> *"Kept by Sahoda: {days} days, {first} to {last}. Instagram reports only today;
> the record is ours."*

And a labelled dividing line — **"Below here, Sahoda is working it out"**, spoken as
*"Below this line, Sahoda is working things out rather than reporting them"*.
Everything below it carries the eyebrow **Worked out**.

Below the line sits one panel: *"How long until Instagram describes your
audience"*, standing on *"{n} days of follower counts"* or *"{n} followers gained
over {m} days"*. **It refuses to project in three named cases**, each with its own
sentence:

- *"Sahoda needs at least 7 days of follower counts before it will estimate a pace.
  It has {n}."*
- *"Your follower count has not gone up across the days kept, so there is no pace to
  work from. This will fill in once it moves."*
- *"You are past the threshold, so there is nothing to count down to."*

#### Actions
**There are no writes on this screen at all** — no form, no save, no delete, no
refresh, no export, and **no retry button in any state, including the failure
state**. The only clickable things are *Connect Instagram*, *Reconnect Instagram*,
an inline *Connections* link, and the six Brand Brain tabs. The underlying table is
read-only to members by design: a database trigger blocks updates and deletes
outright.

#### Phone
The Brand Brain tab row becomes **horizontally scrollable** rather than wrapping,
with the scrollbar hidden and each tab given a 44px minimum tap height. The
breakdown cards go from two columns to one.

#### Gotchas and gaps
- **No workspace has no distinct wording here.** It collapses into *"No Instagram
  account is connected"*. And a workspace read that *fails* collapses into
  *"Instagram did not answer just now"* — even though Instagram was never asked.
- **"Could not check today" has no state and no wording.** The daily collector is
  written and runnable but **nothing schedules it** — arming it is an owner action.
  A stall shows up only as an old last-collected date and a gap in the chart.
  Whether a sentence should appear when the record is more than three days old is an
  open question (§11).
- **The "real data" branch has never rendered against a live payload**, because
  every workspace on this deployment is under the follower floor.

---

### `/brain/knowledge` — the Knowledge library  · NEW

**BUILT.** **Not in the menu** — reachable through the **Knowledge** tab inside
Brand Brain, from the Knowledge figure on Home, and from an evidence block under a
Brand Brain field.

**What a person does here.** Hands over the written material the business already
has — the menu, the rate card, the returns policy, the answer to the question
customers keep asking — **so that when a post names a price or an opening hour, it
is naming one the owner gave it rather than one it guessed.** They can then look up
a fact by typing a word and getting back the exact sentence from the exact document
it appears in. And they can pay for the library to be read once, producing
suggestions that wait on their agreement rather than being applied.

**Intro paragraph, verbatim:** *"The documents Sahoda has read about your business,
and the passages it can quote. A post that names a price uses one from here, or it
does not name one. Adding a document is free."*

**Closing paragraph, verbatim:** *"Sahoda never shares anything in your library
between workspaces, and never trains on it. What it already knows about your voice
and promise is on the overview."*

**Tabs / toggles:** none. The list is always newest-added first and there is no
control to change it.

#### Adding a document

**Add to library** opens a dialog with a three-way chooser labelled *"What are you
adding?"*:

| Choice | Its one-line description |
|---|---|
| **A PDF** | *"A menu, a rate card, a policy, a brochure. Sahoda reads the text in it."* |
| **A web page** | *"Sahoda fetches the page and keeps the words, not the navigation."* |
| **Something you type** | *"Opening hours, a question customers keep asking, anything you would say yourself."* |

The PDF cap sentence, verbatim: *"Up to 2 MB. Sahoda reads the text layer — a menu
saved as a picture has none, and it will say so rather than store an empty
document."*

**All three are free.** The buttons are **Add PDF** · **Read this page** · **Save
this**, and all three read *Reading…* while working. A PDF's bytes are parsed first
and only uploaded if text actually comes out. **Re-adding a web address the library
already holds replaces the existing document rather than creating a second one; two
uploads of the same PDF stay two separate documents.**

Success: *"Read and indexed — {n} passages Sahoda can now quote from."*

#### Search
One box, placeholder and accessible name *"Find a price, an hour, a policy"*. The
typed words go into the URL, so a search is shareable and reloadable. Each result
shows **the whole passage** — not a snippet, not highlighted — under a line reading
*"{document title} · passage {n}"*, where the number is a position within the
document counting from 1. **At most 20 results, with no "show more".**

#### The one paid action

**"Read my library · 50 credits"**, shown only when at least one document is
indexed. Beside it: *"Sahoda reads what you have added and suggests what it says
about your business. **It changes nothing on its own** — every suggestion waits for
you on the resolution console, with the passage it came from underneath it."*

**There is no confirmation dialog** — the price is in the button label and the
sentence beside it says what it will and will not do. It writes suggestions as
pending, and **it cannot write to the Brand Brain**: the database function it uses
has no parameter for doing so. At most 25 passages reach the model in one run
however large the library.

The charge is **held first and released, not taken**, if the model cannot be
reached, if it returns nothing usable, or if no suggestion could be saved.

Outcome sentences:
- *"Sahoda read {n} documents and has {m} suggestions for you. Nothing has changed
  in your Brand Brain — each one is waiting for you to agree with it."*
- *"Sahoda read your library and found nothing it could turn into a Brand Brain
  field. That is an honest outcome — a menu of prices says a lot about what you sell
  and little about how you sound. You were not charged."*
- Not enough credits — **the shortfall is named in three numbers rather than
  "insufficient credits"**: *"Reading your library costs {n} credits and you have
  {m}. You are {short} short. Nothing was read and nothing was charged."*
- Model unreachable: *"Sahoda could not reach the model, so it has nothing to
  suggest. Nothing was written and you were not charged — try again."*

#### One document row

The name · a state word · where it came from (**PDF · Web page · Typed**) · the
address or filename (never shown for a typed document) · and *"{n} passages"*,
**shown only when the document is actually indexed**, so a failed document never
advertises passages that may not exist.

Header above the list: **"Everything you have given Sahoda"** and *"{a} of {b} ready
to quote from"*.

**The five state words:** `Indexed` · `Waiting` · `Reading` · `Stopped` · `Could
not read`.

Every state except *Indexed* carries an explanation sentence. The per-document
failure sentences, verbatim:

- *"Sahoda opened this and found almost no text — the words are probably part of
  the design rather than typed into it. A menu exported as a picture reads this way.
  Try a version you can select text in, or paste the text yourself."*
- *"This is far longer than Sahoda stores in one go — about {n} passages against a
  limit of 2,000. Nothing was saved, because storing half a document and calling it
  read would be worse. Split it into sections and add them separately."*
- *"This file did not open as a PDF. It may be damaged, or it may be something else
  with a .pdf name on it. Nothing was saved."*
- *"Sahoda will not fetch that address. It points somewhere private rather than to
  a page on the open web — a home network, or a machine only this server can see.
  Check the link and try a public page."*
- *"The page did not answer. Sahoda cannot say whether it is usable, because it
  never arrived. Nothing was saved — try again."*
- *"Sahoda cannot read this kind of file yet. PDFs, plain text and a web page all
  work. Nothing was saved."*
- *"Sahoda stopped part-way through reading this and cannot say whether it is
  usable. That is a fault at our end, not with your file. Nothing was saved and
  nothing was charged — read it again."*
- *"Sahoda could not read this and did not record why. Try reading it again."*

**`Stopped` is derived, not stored** — a process that is killed does not get to
record anything, so any document still claiming to be mid-read more than five
minutes after it was last touched is shown as Stopped, with a retry.

**Read it again** appears only where a retry is a real remedy. Pressing it on a
typed note says: *"This one was typed rather than read from a file or a page, so
there is nothing to re-read. Delete it and paste it again to change what it says."*

#### The prompt-injection observation

When a document contains text written as if addressing an assistant, the row says:

> *"This document contains text written as if to address an assistant — {n} places.
> Sahoda reads those as words on a page, the same as any other sentence in it, and
> never as instructions. Nothing it says can confirm anything about your brand on
> its own."*

Underneath, up to three quoted fragments of the document's own words, each cut off
at 120 characters.

**Zero is deliberately never rendered as a reassurance.** The line appears only
when the count is above zero, on the stated grounds that a scanner finding nothing
is not a claim that there is nothing.

#### Delete — and why the confirmation is not the screen's decision

**The first press calls the delete directly. It is refused if anything in the Brand
Brain cites this document, and that refusal is what opens the dialog.** When nothing
cites it, the document is simply deleted with no dialog at all.

Dialog title: *"Delete "{name}"?"* Body: *"Sahoda keeps what it already learned
from this document. What goes is the document itself, so a field that came from it
will no longer be able to show you the passage it came from."* Buttons: **Keep it**
and **Delete anyway**.

The description line is computed: *"{n} fields in your Brand Brain came from this
document. Deleting it does not undo what Sahoda already learned — those stay
exactly as they are. What goes is the document behind them, so you will no longer
be able to open the passage a field came from."* — with *", and {n} suggestions
waiting on you quote it"* appended when that is also true.

Success: *"Deleted, along with everything Sahoda had indexed from it."* or
*"Deleted. Sahoda has kept what it already learned from it — {n} fields in your
Brand Brain no longer name a document you can open."*

#### Where a passage becomes a reason

That block lives on `/brain/resolve`, not here. It reads: **"Sahoda read this in"**
+ the document name as a link back to this library + *"· passage {n}"* + the
passage's own words as a quotation cut off at 400 characters. When the document has
since been deleted, the name is replaced by the words **"a document you have
deleted"** and the block says: *"That document is no longer in your library. Sahoda
kept what it learned from it — this value is unchanged — but the passage behind it
can no longer be opened."*

#### States
- **Empty library** — *"Give Sahoda something to read"* / *"Your menu, your rate
  card, your returns policy, the answer to the question customers keep asking.
  Sahoda keeps the words and remembers which document each one came from."* / tip:
  *"Sahoda: A post that names a price should be naming one you gave me, not one I
  guessed."* **The Add button appears twice in this state — once in the header, once
  in the empty state — and that duplication is deliberate.**
- **Search found nothing** — *"Nothing in your library mentions "{words}". Sahoda
  searched the words in every document it has read — a document still being read is
  not in there yet."*
- **Documents exist but none is readable yet** — the paid-read block is **silently
  withheld**. There is no sentence; the block simply does not render, on the stated
  grounds that offering to read an empty library is a button that can only
  disappoint.
- **List read failed** — *"Sahoda could not read your library"* / *"This is not a
  claim that it is empty — the list did not come back. Reload the page."* **No Add
  button appears anywhere in this state.**
- **Search read failed** — *"Sahoda could not run that search just now. This is not
  a claim that your library has nothing matching — the search did not come back. Try
  again."*
- **No workspace** — *"Create a workspace to build a library"* / *"A library
  belongs to a workspace and you don't have one yet. Nothing failed — there is
  simply nowhere to put a document."*

**Not connected and suppressed-by-platform do not exist here. "Could not check
today" does not either** — there is no scheduled read; a document is only ever read
when a person presses a button.

#### Phone
Below 700px the search box and its button stack; the Add button and the paid-read
button become full width. **Below 1180px each document row becomes a single
vertical column** — name and state, then origin, then explanation, then buttons —
and **the small origin icon is hidden entirely rather than shrunk**, because the
origin is already stated in words. At every width the Brand Brain tab row scrolls
horizontally rather than wrapping.

#### What it cannot show
File size · file type beyond the three words · a PDF's page count (the parser
returns it and the code discards it) · when a document was added or last read ·
who added it · a character or word count · **a link to open or download the
original PDF** · a relevance score, a match rank or a highlighted phrase · a count
of search results · a list of every passage in one document — passages surface only
by searching.

---

### `/posts` — Posts  · NEW

**BUILT.** Menu says live. They agree.
**Group:** Create. Label *Posts*, hint *"Write, approve and publish"*.
Not a phone bottom-bar tab — reached through **More**.

**What a person does here.** Sees every post they have, newest first, filters to
the ones needing something, and opens one. This is the list that leads into the
composer.

#### Filters — five, and they are links, not buttons

Each changes the URL, so it is reloadable and can be opened in a new tab. The row
is labelled *Filter posts*.

| Label | Shows |
|---|---|
| `All` | every loaded post |
| `Needs you` | `review`, `failed`, `partial` |
| `Scheduled` | `approved`, `scheduled`, `publishing` |
| `Published` | exactly `published` — **`partial` is deliberately excluded and lives in Needs you** |
| `Drafts` | `draft`, `idea` |

Each label carries a count **of the posts loaded on this page**, not of the
workspace — the read is capped at 100 with no pagination. A count renders only if
it is above zero **or** its filter is selected. Filtering happens over the
already-loaded list; it issues no second query.

**There is no sort control, no search box, no bulk select, no date-range picker,
no list/grid/calendar switch and no pagination.** Order is always
most-recently-updated first and the person cannot change it.

When exactly 100 posts come back, one line appears: *"Showing the 100 most
recently updated posts — older ones may not be on this page."*

#### One post card

- **Title** — or the literal *Untitled post*, which is common rather than an edge
  case. The title is the link into the composer, and it stretches invisibly across
  the whole card. **The card is not itself one big link** — every other control
  (channel chips, delete) sits in a raised layer above it. Anything added to a card
  must join that layer or it becomes unclickable.
- **A "Drafted by Sahoda" mark** before the title, present only when the post came
  from a week plan. A hand-written post shows nothing.
- **Excerpt** — the body, cut to 220 characters (counted by code point, so an emoji
  is never split) with an ellipsis, and clamped to two lines. When there is no body:
  *"No content written yet."*
- **Status chip** — see the two vocabularies below.
- **Channel chips** — one per targeted channel, labelled *X · GBP · LinkedIn ·
  Instagram*. When none are picked: *"No channels picked yet"*.
- **Scheduled time**, when set — always rendered in India Standard Time with an
  explicit `IST` suffix, e.g. *14 Aug 2026, 06:30 pm IST*.
- **An auto-publish note**, conditionally — see States.
- **Metric lines, one per channel.**

#### Two status vocabularies, and a third axis

**Post-level status — ten values.** The stored value, the word the user sees, and
the spoken hint appended after it:

| Stored | Word | Spoken hint |
|---|---|---|
| `idea` | Idea | *not started* |
| `draft` | Draft | *still being written* |
| `review` | In review | *waiting on a person* |
| `approved` | Approved | *cleared, not yet dated* |
| `scheduled` | Scheduled | *booked for a time* |
| `publishing` | Publishing | *going out now* |
| `published` | Published | *it went out* |
| `partial` | Partly published | *out on some channels, not all* |
| `failed` | Failed | *nothing went out* |
| `expired` | Expired | *its time passed* |

Published is a **double tick** and Approved a **single tick** — a deliberate
borrowing of the messaging-app convention.

**Three of those ten are never written by the app today**: `idea`, `review` and
`expired`. Which means two of the five filter tabs — *Needs you* and *Drafts* —
can in practice be permanently thinner than they look.

**Per-channel status — six values**: `pending` · `scheduled` · `publishing` ·
`published` · `failed` · `skipped`. On this list these are **never shown as
words**. The chip shows the channel name and a glyph, and spells the state only
for screen readers: *" — did not go out"* · *" — published, no link yet"* · *" —
going out now"* · *" — not sent yet"*.

> **A channel chip is a clickable link only if the platform actually gave back a
> URL.** A published Instagram post can sit in the platform's own processing with
> no permalink. So the chip has a fourth appearance to design: **published,
> coloured as success, and not clickable.**

**Certainty** is a third, orthogonal axis carried structurally rather than as
words — six levels: *real · committed · proposed · simulated · failed · neutral*.
Only *simulated* ever forces a visible word onto the chip.

#### Metric lines

Each begins with the channel's short name, then either three numbers or one
sentence saying why there are none. The three labels are exactly `Impressions`,
`Reach`, `Engagement`.

- Impressions and Reach are **raw counts** from the platform for that one post,
  over no defined window — whatever was last synced.
- Engagement is **computed**: a sum of whichever of likes, comments, shares and
  saves the platform actually reported. **If it reported none of the four, this is
  absent, not zero.**
- Anything not reported renders `—`, **never `0`**.
- Numbers are grouped Indian-style (`1,00,000`).

When there are no numbers, the line shows one of these exact headlines: *Not
available yet* · *Can't be resolved* · *Simulated run* · *Not connected* ·
*Reconnect needed* · *Couldn't load metrics* · *Not loaded here*. (An eighth,
*Not published*, exists but is filtered off the list and appears only on the post
itself.)

#### Actions
**Nothing on this screen spends credits.** Every paid action lives inside the
composer.

*Create post* → the composer (it appears in the header **only when at least one
post exists**; when the list is empty the empty state owns the only copy of the
button). A title → that post. A filter tab → a URL. A linked channel chip → the
published post on the platform, in a new tab.

**Delete** is a two-step inline confirmation — not a browser dialog and not a
modal. Step one is an icon whose accessible name is *"Delete {title}"*. Step two
appears in place: *"Delete "{title}" for good?"* with **Cancel** and **Confirm
delete**, and the confirm button reads *Deleting…* while it runs. **The armed
state disarms itself after 8 seconds.** Success shows a toast: *"Deleted the
post."* Failure shows the reason inline, followed by the literal sentence *"The
post is still here — try again."*

#### States

| Condition | Wording |
|---|---|
| **No posts at all** | *"Nothing drafted yet"* / *"Start a post here, then let me write the per-channel versions for you."* / **Create post** / tip: *"Sahoda: Write the idea once. Sahoda reshapes it for each channel, so you never rewrite the same thought four times."* |
| **This filter is empty but the workspace is not** | A *quieter* card-level state — no heading, no icon, no button, and deliberately no Create-post offer: *"No posts in needs you right now. The other filters still have your 12 posts."* |
| **Read failed** | *"Couldn't load your posts just now — reload to see them. Nothing has been lost."* In this state there is **no filter row and no Create post button** — just the heading and this line. |
| **Nothing connected** | A banner: *"Connect a channel to post for real"* / *"You can write and plan without one. Connecting is what lets a post actually go out."* / **Connect a channel**. It does not appear if even one channel is connected, and not at all if the connections read failed. |
| **No workspace** | *"Create a workspace to start writing"* / *"Posts belong to a workspace and you don't have one yet. Nothing failed — there is simply nowhere to keep a draft until one exists."* |

**Loading** is a shaped skeleton — title bar, five-pill filter row, five card
shapes with a title line, two body lines and a chip. **No text at all**; the only
wording is spoken: *"Loading your posts"*.

**Not configured** shows up as the **auto-publish note**, which flips on a server
setting. With scheduled auto-publish off, a dated post's card says one of:

- *"Won't post itself — scheduled auto-publish isn't live yet. Copy it across at that time to post it."*
- *"This time has passed and nothing was published — scheduled auto-publish isn't live yet. Copy it across to post it."*
- *"Out on some channels and not on others — scheduled auto-publish isn't live yet, so the rest will stay put. Send those from the post rather than publishing it again."*
- *"Nothing reached a platform — this ran as a simulation, and scheduled auto-publish isn't live yet. Copy it across to post it for real."*

With it on, the same four slots read: *"Goes out on its own at this time."* /
*"This time has passed and it has not gone out yet — check the channel status on
the post."* / *"Out on some channels and not on others — check the channel status
on the post."* / *"Nothing reached a platform — this ran as a simulation. Send it
again to post it for real."*

These render **only** for a post actually making an auto-publish promise. A dated
draft says nothing. The "time has passed" wording waits out a grace window rather
than firing on the stroke of the clock, because in production every healthy
delivery landed 73–199 seconds late.

**Could not check today** appears in two forms. The screen follows a running
publish and then **stops**, saying so: *"Stopped watching for updates — a publish
has been running for a while. Reload to see where it got to."* — after 12 minutes.
And a metric line can read *Not loaded here* because the list caps how many
external calls one render may make at six; that is explicitly **not** a failure and
deliberately does not say "try again".

#### Phone
The page's own structure barely changes: no accordion, no sheet, no horizontal
scroller, nothing hidden. Filter pills and the delete control grow to 44px minimum
touch targets; everything else reflows by wrapping at every width equally. What
changes is the shell around it.

#### What it cannot show
A total count of posts in the workspace (only the loaded page is countable) · page
numbers or "load more" · a **post-level** metric — metrics exist only per channel,
and a post live on two channels produces two independent lines, never a sum · a
zero · an engagement *rate* (it is fetched but not rendered here) · who wrote or
published a given channel's post · when a post was created or last edited · when it
actually went out · **why** a channel failed (the reasons render in the composer) ·
a retry button · attached photos · campaign membership or tags.

#### Gotchas
- **The status column is what a person decided, not what happened.** The publish
  path writes the channel rows and leaves the post row alone, so a post live on
  every channel can still read `approved` in the database. The chip's word is
  derived from the channel rows and falls back to the column only when the rows say
  nothing. Designing this as "just show the status" reproduces a defect that shipped
  three times in this codebase.
- **"Simulated" is a first-class outcome, not a lesser "published".** A post can
  read published on every channel while nothing ever reached a platform.

---

### `/approvals` — Approvals

**BUILT.** Menu says live. They agree.
**Group:** Publish. Label *Approvals*, hint *"Everything waiting on your
decision"*. **The only navigation row in the product that carries a number badge.**

**What a person does here.** Says yes. Everything sent up for a decision is
gathered in one list; they tick what they are happy with and approve in a single
go, or open one to read it first. Underneath sits a **second, separate list**: the
posts that were supposed to go out and did not, which need fixing rather than
approving.

**Header:** *Approvals* / *"Everything waiting on a decision from you, in one
place."*

**Tabs / toggles:** none. No filter, no sort, no search. Order is fixed and
invisible — most recently updated first — and nothing on screen says so.

#### The two lists

**They are two stacked sections, not one list with a filter.** Both render at once
when both have rows.

1. **Waiting for you** — a count and the word *post* / *posts*. Only posts with
   status `review`. Each row: title (or *Untitled post*), the channel line joined by
   ` · `, and the status word, which here is always *In review*.
2. **Did not go out** — same shape. Only `failed` and `partial`, so the status word
   is always *Failed* or *Partly published*. **This list has no checkboxes and no
   bulk action, deliberately** — the approve write refuses those statuses outright,
   so a checkbox there would offer an action that does nothing.

A footer paragraph renders in **every** state, including the empty and the failed
one:

> *"How much Sahoda may do before asking you is the autonomy setting. It is not
> built yet, so every post reaches this queue."*

— where *autonomy setting* links to `/loop`.

#### Actions
**Approving spends nothing.** There is no cost preview and no balance here.

Tick a row (accessible name *"Select {title}"*) · a header checkbox whose
accessible name flips between *"Select every post below"* and *"Clear the
selection"* and which **covers the first list only** · **Clear** · and **Approve
{n}**.

**Approve has no confirmation step.** One click on *Approve 12* changes twelve
rows. It caps at 100 per press, de-duplicates first, and afterwards forces
Approvals, Planner, Posts and Home to re-read — the row is not spliced out in the
browser.

**The result is three numbers, not a success or a failure.** The toast is
assembled from up to three fragments joined by ` · `:

- *"{n} approved"*
- *"{n} had already moved on"* — **not a failure.** The list was stale; the remedy
  is to reload.
- *"{n} could not be saved"* — a real failure; the remedy is to retry.
- *"Nothing was selected, so nothing changed."* when all three are zero.

A real combined sentence reads: *"4 approved · 1 had already moved on"*.
Collapsing these into one message would send people to do the wrong thing.

#### States
- **Empty** — *"Nothing is waiting on you"* / *"Anything sent for review, and
  anything that failed to go out, appears here. That is a real answer — not a
  screen that has yet to load."* / tip: *"Sahoda: Posts you are still writing live
  under Posts. They are not waiting on a decision, so they are not here."* **No
  button.**
- **One half empty** — **no wording at all.** That entire section, its heading, its
  count and its card simply do not render. There is no "0 posts" and no placeholder.
  **Do not draft copy for it; there is no slot.**
- **Read failed** — and it is explicitly **not** treated as empty: a spoken line
  *"Your queue could not be read"*, then *"Sahoda could not read what is waiting on
  you"* / *"The queue did not come back this time. Reload — this is not a sign that
  nothing needs you."* No retry control.
- **No workspace** — *"Create a workspace first"* / *"Posts belong to a workspace,
  and so does the queue of ones waiting on you."*
- **Not connected, not configured, suppressed and could-not-check-today do not
  exist here.** Every value is a row in the product's own table.

#### Phone
The page's own structure does not change at all — the only responsive rule is a
taller touch target on the select-all row. What changes is the shell. **Approvals
is not one of the four bottom-bar slots**, so on a phone it is reached only through
**More** — and, as noted in the shell entry, **the waiting count is invisible on a
phone**.

#### What it cannot show
When a post is due to go out · how long it has been waiting · who wrote it or sent
it · the post's own text (deliberately — Home shows a snippet, this screen does
not) · any reach or performance figure (the screen this replaced had a reach slot
and it was removed as fictional) · **which** channel failed and why · a cost · the
autonomy level · a `0` badge · **a Reject or Send-back action — only approve is
written from this app.**

#### Gotchas
- **The queue is silently capped at 100 posts, and unlike Posts and Planner this
  screen does not say so.** Both counts and the navigation badge can under-report in
  a busy workspace with nothing telling the user.
- The navigation badge and the on-screen counts are guaranteed to agree, because
  the rail and the page share one read inside a single request. Do not design
  anything implying they could differ.
- A draft is deliberately not in this queue, which is why the empty state's tip
  line pointing at Posts is load-bearing copy rather than filler.

---

### `/posts/{id}` — THE COMPOSER  · NEW

**BUILT.** **Not in the menu** — the nav entry that covers it is **Posts**. It is
reached from `/posts`, `/planner`, `/approvals`, `/home`, the phone's **+** button, and
`/create`.

**This is the product's one real differentiator. §3 is its data model and its limits;
this entry is the screen.**

#### `new` is a value of the id, not a second route

`/posts/new` and `/posts/{uuid}` are **one screen**. The reason is written into the
file and is worth carrying:

> *"Because there is one screen, and **two route files is how there came to be two
> editors**. `/create/post` held a five-step wizard that could not generate variants;
> `/posts/[id]` held a three-pane editor that could not be reached without a row. Both
> are gone."*

**And the row is not created when the screen opens.** *"Opening a screen is not intent.
Creating on open is what left "Untitled post" debris behind every abandoned click."* The
post is created by **the first save that has something to write**, and **the address bar
is rewritten from `new` to the real id at that moment.**

#### The anatomy, top to bottom — and the order is the argument

1. **The header** — one field, **"Name this post"**, under the hint **"Only you see
   this"**.
2. **Your post** — the source. A ten-row box (see phone), placeholder **"Write it the
   way you would say it. Sahoda adapts it per channel."**, with the line **"Select any
   part to rewrite just that piece."** underneath.
3. **The versions stack — the centre of the screen.**
4. **Extras**, per channel, where a channel has any.
5. **Media and templates.**
6. **Finish** — schedule, dry run, publish.
7. **A sticky commit bar**, pinned to the bottom at every width.

The vertical order is deliberate and was measured: *"MEASURED at 768px with both in one
pane: the versions — the only thing on this screen that no competitor has — were the
last thing on the page, below an empty media well. **Order is the argument, and at every
width it now reads: write it, see each version, then attach and reuse.**"*

#### The source is its own thing, and is not "the first channel"

> *"Because it is what the writer means, and the channel versions are what each
> platform will accept. Collapsing the two — writing straight into Instagram and copying
> outward — is what every competitor does, and it makes the first channel silently
> authoritative. **Here, the post has no limit, no format and no publish state; only its
> versions do.**"*

**So there is no character meter on the source box. There is one on every version.**

#### The versions stack — not a tab strip

> *"ONE BODY PER CHANNEL. Instagram's caption is not LinkedIn's; each has its own limit,
> its own rules and its own publish state, and each publishes on its own. So the
> per-channel versions are **the CENTRE of the screen — a stack the writer scrolls
> through — not a side panel and not a tab strip that hides three of four**."*

**This is the structural correction to make.** Every channel's version is on screen at
once. There is no channel switcher, because nothing is switched away from.

The pane's own statement of purpose: **"I write once, pick channels, and Sahoda shows me
each version to approve."** And its empty state gets **exactly one sentence** — *"docs/27
counted six different ways of saying 'nothing yet' on one screen; this pane gets exactly
one."*

**Each version card carries:**
- the channel's name and its **format** picker — **the format lives on the card, because
  it belongs to the version**;
- its own body box;
- **a character meter** labelled **Characters**, spoken as *"{n} of {max} characters
  used"*;
- **its objections** — the live, per-channel rule violations;
- **the relink control**, *"Follow the post again"*, when and only when that channel has
  detached and its text actually differs (§3.4);
- **its own publish state, its own permalink, and its own last error**;
- **and it scores the post's attached files against ITS OWN format** — the same photo can
  be fine on one card and refused on another.

#### Channels
A **Channels** picker, whose tiles can carry **"not connected"** and **"preview only"**.
A channel with no live connection is still writable — *"You can write and plan without
one."*

#### Extras, per channel
Only where a channel has any: **poll options**, **Google Business Profile options** and
its **topic type**, a **hashtag field** (normalised so the meter, the validator and the
published text all count the same tokens), and **thread preview** for X.

#### What AI does here, and what it does not — stated on the screen

**Selection rewriting is real and priced**, with **exactly three instructions** —
*rewrite*, *shorten*, and *sharpen the hook*. It runs against **the current body, not
the one captured when the request was made**: the box stays editable while the model
works, **and if the selected text has moved the rewrite is refused rather than applied
blind — and the paid result is still shown so it is not thrown away.**

And then a block naming what is absent, verbatim:

> *"Sahoda can rewrite, shorten or sharpen the hook of any piece you select. **Writing a
> first draft from a brief, changing the tone, expanding a line, suggesting hashtags and
> describing a picture are not built** — each needs a new kind of AI task, and the list
> of tasks it can run is fixed for now."*

The reasoning is worth copying: *"Named where they would be, rather than left out.
**Leaving them out reads as never planned; a disabled button would be a control that
exists and refuses.**"*

**Generate variants** (3 credits) and **Generate image** (6, or 12 premium) are the
other paid actions. Every one states its cost in its own label before it runs — §3.6.

#### The commit bar
Sticky at the bottom at every width. It carries the save state — **"nothing written
yet"** · **"Saved"** · **"· 2 versions not saved"** — and **Save all versions**.

**And it deliberately does not contain Publish.** It carries a *link* down to the finish
panel instead:

> *"Publishing is irreversible and per channel, and it needs its own room… **A one-tap
> Publish floating over the writing surface is how a half-written post goes out on a
> phone.** The sticky bar links here instead. **A link that scrolls is honest
> navigation; a button that opens a sheet that contains the real button is not.**"*

#### Finish — three things, in this order
**Schedule · dry run · publish for real.** *"The rehearsal comes before the performance,
and the two are never merged."*

- **Schedule** — a time at least five minutes ahead, and **the panel says whether that
  time will actually fire**, because that depends on a deployment setting (see Planner).
- **The dry run** — a simulated publish that **writes nothing and sends nothing, and is
  labelled as a simulation everywhere it reports.** It surfaces each channel's
  objections without spending anything.
- **Publish now** — beside it, the per-channel status list, the connection warnings and
  the retry, **rather than behind it**. When a targeted channel has no connection:
  *"{Channel} isn't connected yet, so this can't go out there."* / *"{A} and {B} aren't
  connected yet, so this can't go out there."*

**The pre-publish refusal gate** sits in front of it, and its note offers a way through
rather than a wall: it names the objection, offers **"Try instead:"** with a concrete
alternative, and — where the rule is ours rather than the platform's — **"publish
anyway"**.

#### States
- **No workspace** — *"Create a workspace to start writing"* / *"A post belongs to a
  workspace and you don't have one yet. Nothing failed — there is simply nowhere to keep
  what you write until one exists."* **It is asked only on the new-post path**, and
  deliberately **before** the work rather than after it — reaching an existing post at
  all means a workspace exists.
- **A missing post is the only condition that produces a not-found page.** *"Every other
  read below degrades to empty rather than throwing — an empty variant or media list is a
  legitimate state the composer renders on its own."*
- **Someone else moved this post** — both versions kept, two real choices, neither styled
  as the safe one (§3.7).
- **The save failed** — its own retry, because *"the debounced save only re-fires on the
  next edit"*.
- **A per-variant conflict** — **"Use the saved version"**.
- **Publishing / published / partially published / failed** — per channel, never merged.

#### Phone
The writing box **shrinks to a fixed shorter height below 700px**, and the number was
measured rather than guessed: *"MEASURED at 360×800 with ten rows: the writing box ran
to y=570 and **the first version card's body was below the fold, so the screen that
exists to show you each version showed you none of them until you scrolled**. Resizing is
still on, so anyone who wants the taller box drags it — **the default is what a phone
opens to, not a ceiling**."*

The sticky commit bar **lifts to sit above the phone's bottom navigation bar** rather
than under it.

**Nothing collapses into a sheet or an accordion. The versions stack stays a stack.**

#### What it cannot show
A predicted result · a "best time to post" · an engagement estimate · a tone or
readability score · a Twin score (the price exists; the task does not) · a per-post
metric summed across channels · a preview that shows the platform's own rendering.

---

### `/campaigns` and `/campaigns/{id}` — Campaigns

**BUILT.** Menu says live. They agree.
**Group:** Create, second. Label *Campaigns*, hint *"Group posts under one push"*.

**What a person does here.** Gives a name to a push they are doing — *"Diwali week"*,
*"New menu"* — and pulls posts they have already written into it, so the whole push
can be read in one place. On the campaign's own screen they answer the
Tuesday-morning question: **which of these posts is out, on which channel, and which
ones still have nothing written for a channel they picked.**

> **A campaign here is a grouping, not a budget.** The product's own note says
> grouping posts is *"perhaps a tenth"* of what most people mean by a campaign, and
> that budgets, ad platforms and paid reporting are deliberately not built. **There is
> no budget field, no spend, no revenue, no ROAS and no health score, and those
> columns do not exist in the database.** See §8.

**Nothing moves a campaign between stages on its own.** The person sets the stage
when they decide it. The list says so under the table: *"Nothing moves a campaign
between stages on its own — you set the stage when you are ready."*

#### The list
Header: *Campaigns* / *"Group posts under one push, and read them together."*

**One filter, five links** — real links that change the URL, so the choice survives a
reload and can be opened in a new tab. Row labelled *"Filter campaigns by stage"*:

**All · Draft · Running · Finished · Called off**

Each carries a count of the campaigns loaded on this page. **A stage with none shows
`0`.** The row is not rendered at all on the empty, no-workspace or failed-read
screens.

> **The labels are not the stored values.** Stored: draft, active, finished,
> cancelled. **There is no "Completed" anywhere** — an earlier drawing of this screen
> used that word and the database has never accepted it.

Columns: **Campaign** (its name, plus the optional "what it is for" line beneath) ·
**Stage** · **Runs** · **Posts** · **Channels**.

- **Runs** has three forms — *"5 Nov – 12 Nov"*, *"From 5 Nov"*, *"Until 12 Nov"* —
  and **when neither date is set the cell is empty**, with the sentence *"No dates
  set"* available to screen readers only. Dates are forced to UTC, because a
  local-time render would show the previous day west of Greenwich.
- **Posts** is a count, right-aligned, in fixed-width digits. **Zero is a real,
  rendered value.**
- **Channels** is the **set union** of the member posts' channels, de-duplicated and
  always ordered Instagram, LinkedIn, X, GBP. When nothing targets a channel the cell
  is empty, with *"No channels — nothing in this campaign targets one yet"* spoken.

Order: newest first. **The creation date itself is never shown.**

#### One campaign — the grid

**The rows are posts. The columns are channels.** And the column set is the **union
of every member post's channels**, not the channels of the post in that row — so a
post that does not target LinkedIn still gets a LinkedIn column if any other post in
the campaign does. Column order is always Instagram, LinkedIn, X, GBP.

Each row's leading cell: the post title (or *Untitled post*), linking to that post,
plus a status chip whose word is **the post's stored status overridden by the
evidence in its channel rows** — the same rule as everywhere else in the product.

**A cell is one post on one channel, and it is exactly one of four things:**

| The cell holds | What it means | Spoken |
|---|---|---|
| **nothing at all** | this post does not target this channel — **deliberately blank, not a dash** | *"Not on Instagram — this post does not target it"* |
| **`No body yet`** | the channel is picked and nobody has written its own text | *"Instagram is picked and has no caption of its own"* |
| **a status word** | a channel row exists | *"on LinkedIn"* |
| **a "could not be read" mark** | the read failed — **never the same object as an empty cell and never the same as "No body yet"** | *"This post's Instagram status could not be read"* |

The six status words a cell can show: **Not sent yet · Booked · Going out · Live ·
Did not go out · Skipped**. And when a publish ran against fixtures rather than a real
platform, **the extra visible word `Simulated` is added — this is required, never
optional.**

A cell with a status word may also carry a link out to the published item, **but only
when a real URL exists** — a fixture marker is treated as no link at all.

Under the grid, one figure and one sentence:

> *"3 of 8 channel slots are live on a platform."* — the second number counts every
> non-empty cell, the first counts the subset a real platform confirmed. **Not a
> percentage, on purpose.**
>
> *"Every channel publishes on its own — a column can be out while another is still
> waiting."*

#### The dialogs
**Create campaign / Edit campaign** — *"A campaign groups posts under one push, so you
can plan and read them together."*
- **Name** — *"What you would call this push out loud — "Diwali week", "New menu"."*,
  placeholder *Diwali week*, required, max 120 characters, unique within the workspace.
- **What it is for** — *"Optional. In your words — nothing reads this but you."*,
  placeholder *Fill the Saturday lunch slot*, max 200.
- **When it runs** — **Starts** and **Ends**, both optional, under *"Optional. Nothing
  starts or ends a campaign on its own — you move it when you are ready."*
- **There is no budget field, deliberately.**

**Add posts to this campaign** — *"Pick the posts that belong to this push. **Adding
one does not change the post.**"* One checkbox per post not already a member, each
showing its title and a line like *"Draft · Instagram, LinkedIn"* — or *"· no channels
picked"*. A running line reads *"Nothing picked yet"* or *"3 picked"*, gaining
*" · showing your most recent posts only"* when the read was capped.

#### Actions
**Nothing on either screen costs a single credit.** No path here touches the ledger.

**Create campaign** → a toast *"Campaign created"* and straight into the new
campaign. The stage dropdown writes immediately. Adding and removing posts write
membership rows only.

Refusal sentences include: *"Give the campaign a name."* · *"The end date comes before
the start date."* · *"A campaign with that name already exists — pick another name."*
· *"That campaign or post no longer exists — reload to see the current list."* ·
*"Created, but the response was unreadable — reload to confirm."*

#### What it cannot show
**Budget · spend · revenue · ROAS · a health score · clicks · reach.** None of those
columns exists. Also: the creation date, and who created it.

---

### `/assets` — Assets  · NEW

**BUILT.** Menu says live. They agree.
**Group:** Create, after Posts and Campaigns. Label *Assets*, hint *"Photos you can
reuse on any post"*. Not a phone bottom-bar tab — reached through **More**.

**Header:** *Assets* / *"Every photo you have added, and which posts are using
it."*

**What a person does here.** Keeps every photo of the business in one place, so a
photo is uploaded once and used on as many posts as they like. They rename it,
write the sentence a screen reader will read for it, and check which posts are
using it before throwing it away. **When a photo is used by a post that has already
gone out or is about to, the screen refuses to delete it and names the post to go
and fix first.**

#### Search and filters
One search field (accessible name *"Search your library"*, placeholder *"Search by
name or description"*) which filters the already-loaded tiles in the browser and
matches **only the name and the screen-reader description**.

Four kind chips, single-select: **All** · **Photos** · **Videos · not yet** ·
**Documents · not yet**. The last two are **inert** — rendered as plain text rather
than disabled buttons, so they are not announced as controls at all. What they wait
on is an upload path that can prove a video's or document's type from its own bytes;
today only JPEG, PNG, WebP and GIF are recognised, and those four are the union of
what every channel accepts.

Under the filters, a count: *"12 files"* or *"4 files of 12"* — the second half
renders only while a filter is narrowing. **Neither number is a database count**;
both are the length of what was fetched. When the list was truncated, the line
gains: *" — showing the most recent 200. Older files are not in this list."*

#### Uploading
**Add photos** opens the file picker and accepts several at once. Beside it:
*"Photos only, up to 8 MB each. Adding a photo spends no credits."* — and **the 8
is computed** as the largest media cap across the four channels, not typed in.

The server reads each file's **actual bytes** to establish its type, size and pixel
dimensions rather than trusting what the browser claimed.

Outcomes: *"Added 1 photo."* / *"Added N photos."*, and — importantly — **a photo
some channel cannot use is still accepted into the library**: *"Added, and kept.
These channels will not use it:"* followed by a per-channel list.

Per-refused-file reasons, verbatim: *"Upload a JPEG, PNG, WebP or GIF — this file
is not an image type the channels accept."* · *"Re-upload this file to check it —
it looks incomplete, so it cannot be checked against the channel limits."* · *"That
file is larger than 8 MB, which no channel accepts."* · *"Could not store that file
— try again."*

#### One tile
The picture (through a short-lived signed link to private storage) · its alt text,
which is the description when set and otherwise the literal sentence *"{name} — no
description added"* — **it never invents a description** · the file name, or
*Unnamed file* · a usage sentence · an **In use** badge when something locks it ·
and the file size.

**The usage sentence has exactly four forms:**

- *"Not used yet"* — **there is deliberately no "In 0 posts".**
- *"In 1 post"* / *"In N posts"* — used, but nothing locks it.
- *"In "{post}" — {reason}"* for exactly one locking post, where the reason is one
  of: *already published* · *publishing right now* · *scheduled to go out* ·
  *already published on a channel* · *publishing on a channel right now* ·
  *scheduled on a channel*.
- *"In N posts that have gone out or are going out"*.

#### The detail drawer
The name · a large picture · **Type** (the raw file type) · **Size** ·
**Dimensions** (sniffed from the file's own bytes at upload, not what the browser
claimed) · **Added**. Any of those four that is missing renders the not-measured
mark with a spoken *"{label} has not been measured yet"* — **never a dash and never
a zero**.

Then two fields: **Name** (placeholder *"What you call this photo"*, trimmed to 120
characters) and **Description for screen readers** (placeholder *"Describe what is
in the photo"*, trimmed to 300, with the help line *"Written once here, and carried
onto every post that uses this photo."*). **Save details** is disabled until
something changes.

Then **Used in**, one row per post, each naming the post (or *an untitled post*) and
either its lock reason or the words *still being written*, each linking to that post.

#### The delete gate — the structurally interesting part

**Delete file** sits at the bottom of the drawer only. **There is no delete on a
tile and no multi-select or bulk action anywhere.**

**The first press is always a real server call — it never guesses from what is on
screen.** While it runs the button reads *"Checking where it is used…"*. Three
outcomes:

1. **Nothing uses it** → deleted immediately, **no confirmation**. The stored file
   goes, and every cropped copy of it is swept out of storage too.
2. **Only unpublished posts use it** → a dialog. Title *"Delete "{name}"?"*, body
   *"Deleting this file removes it from N posts: "A", "B" and "C". Those posts keep
   everything else."* — at most three are named and the rest counted. Then a heading
   **Loses this photo** and the list. Buttons: **Keep the file** and **Delete and
   remove from those posts**.
3. **A post that has gone out, is going out, or is queued uses it** → **refused, with
   no override.** *"This file is used by 2 posts that cannot lose it: "Diwali offer"
   (scheduled to go out), an untitled post (already published). Remove it from those
   posts first, or keep the file."*

**What counts as locking:** the post's own status is `scheduled`, `publishing`,
`published` or `partial`; **or** any one of its per-channel versions is `scheduled`,
`publishing` or `published`. **`approved` deliberately does not lock**, and neither
does `failed` or `expired`.

> **The gate is enforced twice.** The same rule runs as a database trigger before
> any delete, so a second browser tab cannot walk past it — and when the database is
> the one refusing, its own sentence is shown instead. There is also a refusal for
> the case where the check itself failed: *"Sahoda could not check where this file
> is used, so it was not deleted. Reload."* **The product refuses to delete on "we
> could not check."**

Deleting costs nothing. So does uploading, renaming and attaching.

#### The crop offer  · NEW

**It is not on this screen — it lives in the composer**, and it is the reason
`/assets` exists in this section at all.

When a photo is refused for a channel's shape, a dialog offers a crop:
*"Crop this photo to fit?"* / *"Sahoda can cut this photo to a shape the channels
accept. Nothing is saved until you accept."*

- Two frames, **Now** and **After the crop**, each with a pixel readout. **Both draw
  the same file** — the "after" is the original shown through a window, not a second
  render. "Now" is the original's dimensions *after camera rotation has been
  applied*.
- Sliders **Move across** and **Move up and down**, each with a percentage. **An
  axis is offered only when the crop is genuinely narrower than the original on that
  axis.** The starting position is computed by asking where the busiest part of the
  picture is, falling back to dead centre. Beside them: *"Point at the subject, or
  use the sliders. The original is kept, uncropped."*
- One row per channel on the post, each with the channel name, the format word that
  channel's version declared, a sentence, and the resulting pixel size or a dash. The
  sentence is **composed from what that channel actually declares, never invented**:
  *"Needs inside the 0.75–1.91 shape range, at least 320×320."* (Instagram) ·
  *"Needs at least 250×250."* (Google Business Profile) · *"Needs at least 4×4."* (X)
  · *"States no size or shape rule — takes it as it is."* (LinkedIn declares nothing)
  · *"Will not take this file — cropping cannot fix it."*
- **The pixel figure is the same on every fixed row by construction** — one cropped
  file is sent to every channel.

**Keep it as it is** calls nothing and writes nothing; the refusal that opened the
dialog is still on the page and the post still has no photo. Escape and the backdrop
do the same.

**Use this crop** is the only thing in this lane that writes. The browser sends back
**two numbers only** — where the subject is, as fractions — and the server
recomputes the rectangle itself, cuts the file, **re-checks the cut file against
every channel before storing it**, and records the crop as a *child of the original*.
**The original file and its record are never modified.** Repeating the exact same
crop of the same photo mints nothing new.

Success depends on which door was used: *"Cropped this photo for the post. The
library still holds the original."* or, from a fresh upload, *"Cropped this photo
for the post. The original is in your library, uncropped."* — because accepting a
crop on a not-yet-saved file **also adds the original to the library**. If channels
still refuse, a follow-up block says *"These channels still will not use it:"*.

**When a crop would not help**, a quiet sentence appears instead of the offer:
*"These channels want shapes that cannot both be met by one photo, so there is no
crop that works for all of them."* · *"Cropping can only make a photo smaller, and
this one is already under a channel's minimum size. Use a larger photo."* · *"This
photo is too small to crop into a shape the channels accept."* · *"These channels
accept no file type in common, so one photo cannot be sent to all of them."* ·
*"This is a moving image. Cropping it would freeze it into a still, so Sahoda
leaves it alone."* · *"Sahoda could not read this file well enough to offer a
crop."* — and one case that deliberately shows **no sentence at all**.

#### States
- **Empty library** — *"Your library is empty"* / *"Add photos above and use them on
  as many posts as you like. Sahoda checks each one against every channel before you
  publish."* **The uploader stays above it, deliberately outside the empty block.**
- **Filter matches nothing** — *"Nothing here matches "{text}". Try a shorter word,
  or clear the filter."*
- **Read failed** — *"Sahoda could not read your library"* / *"This is not a claim
  that it is empty — the list did not come back. Reload the page."*
- **No workspace** — *"No workspace yet"* / *"Your library belongs to a workspace.
  Finish setting one up and your photos live here."* **The uploader is not rendered.**
- **Preview could not be loaded, but the file exists** — a mark and the words
  *"Preview unavailable"*. The tile still shows its name, usage and size, and the
  file is still deletable and attachable. In the crop dialog: *"Preview unavailable —
  the crop can still be made."*
- **Not connected, not configured, suppressed and could-not-check-today do not exist
  here.** A photo can be added and kept with zero channels connected.

**Loading** has three forms: the shared page skeleton; *"Checking each photo, then
adding it to your library…"* with the button reading *Adding…*; and the delete
gate's *"Checking where it is used…"* / *Deleting…*.

#### Phone
The tile grid is **2 columns below 700px, 3 at 700px, 4 at 1180px**. The kind chips
become a **horizontally scrolling strip that bleeds to the screen edges** rather
than wrapping. **Add photos** becomes full width. **The detail drawer does not
become a bottom sheet** — it stays a right-hand full-height panel, just narrower, so
the page still shows down the left edge. In the crop dialog the two frames **stack
below 520px** and each is height-capped so both frames, the sliders and the channel
rows fit without a long scroll and the footer buttons cannot fall off the bottom.

**Nothing on this screen is hidden entirely at phone width, and nothing collapses
into an accordion.**

#### What it cannot show
**Anything about crops** — this screen never reads them, so there is no "3 crops of
this photo", no crop thumbnails, no "cropped for Instagram" marker, and no way to
re-open a crop from the library · **which channels can use a photo** (the check runs
once at upload, is shown in that upload's outcome, and is never stored — a resting
tile cannot say "Instagram will not take this one") · which channel's version uses
the file · **a true library total** ("200 of 1,432" is impossible — no count query
is ever run) · total storage used · who added a photo · when it was last edited ·
folders, tags, collections or albums — **no such thing exists** · any video or
document tile.

---

### `/create` and `/create/post` — the chooser  · NEW

**BUILT — and deliberately thin.** **Not in the menu.** Reachable from exactly one
place: the command palette, where it is hand-added as the first row above the 21
destinations, labelled **Create** with the hint *"Start something new"*. **It carries
no "Soon" marking**, because that word only comes from a nav section's state and this
row has none.

**`/create/post` renders no interface whatsoever.** It is a single redirect into the
composer. A person never sees it.

> **How the three entry points relate, because this is the thing most easily got
> wrong.** `/create` is a **chooser**. `/posts/{id}` is the **composer**. `/posts`
> is the **list**. The phone's `+` button goes **straight to the composer**, not to
> the chooser — the two entry points land in different places.

**Heading:** *Create* / *"Post is ready. The rest are on the way and are shown here
so you can see what is coming."*

**Nine tiles. One works.**

| Tile | Its note | State |
|---|---|---|
| **Post** | *Write once, adapt per channel* | **works** — goes to the composer |
| Story | *Vertical, 24 hours, tap-through* | Coming soon |
| Campaign | *Many posts under one goal* | Coming soon |
| Ad | *Paid placement with a budget* | Coming soon |
| Broadcast | *One message to a subscriber list* | Coming soon |
| Article | *Long-form, published to a channel* | Coming soon |
| Email | *A campaign sent to your own list* | Coming soon |
| Report | *What happened, written up* | Coming soon |
| Automation | *A rule that runs without you* | Coming soon |

**The eight are inert by construction** — not buttons, not *disabled* buttons, and
carrying no disabled marker at all. They render as plain blocks so a screen reader
announces them as **text, not as a broken control**. Each carries a chip reading
**"Coming soon"**.

**No counts, no percentages, no "most used", no "recommended for you" anywhere. That
is an explicit rule, not an omission.**

#### States
**There are none.** The nine tiles are constants, so the screen renders identically
for every account — including an account with **no workspace**, which sees the same
nine tiles. **The refusal happens one step later, at the composer**, and it was moved
there deliberately: *"Create a workspace to start writing"* / *"A post belongs to a
workspace and you don't have one yet. Nothing failed — there is simply nowhere to
keep what you write until one exists."*

**A shipped test asserts this route never renders the words "reload", "try again",
"refresh" or "couldn't read" on a healthy account. Do not add a retry affordance to
any empty state here.**

For completeness, the product's page-not-found state, reachable only by mistyping a
URL: *"This page isn't here"* / *"The link may be old, or whatever it pointed at may
have been deleted. Nothing has gone wrong with your account."* / **Go to Home** /
tip: *"If you followed a link from inside Sahoda, tell us — that one is ours to
fix."*

#### Gotcha
**One of the eight "Coming soon" tiles names a feature that is already built and
reachable elsewhere: Campaign.** That is an inconsistency, not a design decision
(§11).

---

### `/studio` — Studio

**A DRAWN PLACEHOLDER.** Menu says *soon*. **They agree.**
**Group:** Create, after the three built ones and before Remix.
Label *Studio*, hint *"Carousels and quote cards, locked to your brand"*.

**The one thing it waits on:** a picture renderer — code that takes a locked template
plus the workspace's brand values and produces an image file. The page says so in its
own words: *"Nothing here renders yet."*

**What it will do.** Make the picture that goes with the caption, using layouts that
already carry the business's own colours, type and logo — so a carousel or a quote
card comes out looking like it came from that business without anyone arranging
anything.

**Heading:** *Studio* / *"Make the picture, not just the caption — templates that
already know your colours, your type and your logo."*

**The banner** carries a marker reading **Coming soon** and a sentence specific to
this screen, followed by **two sentences that are identical on every unbuilt screen
in the product**:

> *"Studio will render carousels, quote cards and post images from templates locked
> to your brand. **This is the screen as it will be. Nothing on it is connected yet,
> and no numbers are shown because there is nothing to measure.**"*

**Filter chips** — *All · Posts · Carousels · Quote cards · Stories*. They are
pictures of chips: pressing them does nothing. **None carries a count**, and the
reason is structural — a count would be a count of a table this product does not
have, and a zero would claim the collection exists and is empty.

**The shapes it makes** — *"One idea, cropped and re-laid-out for each place it has
to fit. Same rule your captions already follow: a separate version per channel, not
one stretched to fit them all."* Four empty frames: **Feed post** (square) ·
**Portrait post** (4:5) · **Story** (9:16) · **Wide card** (16:9). **The proportion
is the content** — the frames hold no image and no number.

**What you can change, and what you cannot** — the trade this feature is built on.

*Yours to edit* — *"The parts that carry your message. Everything here is a field,
not a layer."*
- **The words** — *"Headline, body and the call to action, each with a length the
  layout can actually hold."*
- **The picture** — *"From your library, from your phone, or generated — dropped into
  a slot that already knows its crop."*
- **The slides** — *"Two to ten, reordered, duplicated or dropped. A carousel is a
  sequence, so the order is yours."*

*Locked to your brand* — *"The parts that keep every design looking like it came from
the same business."*
- **Colour and type** — *"Read from your Brand Brain and checked for contrast before
  it renders, the same guard the app itself passes through."*
- **Layout and spacing** — *"Fixed by the template. This is the trade: you cannot move
  a box, and nothing you export can come out off-brand."*

Closing: *"There is no free canvas and no layer panel. Predictable output beats an
open editor for a business with no designer."*

**Cost** — *"Exports are free, because the renderer is ours"* / *"A PNG or JPEG costs
nothing — drawing it is our own code, not a model call, so there is nothing to charge
for. Only the parts that call a model cost credits: a generated image into a slot at
its usual price, and a carousel at 8 credits."*

**That 8 is the only live value on the entire page** — read from the price list. And
one price is deliberately absent: *"A short video slideshow will be priced too. Its
rate is not set in the price list yet, so this page does not quote one."*

**Closing note:** *"Nothing here renders yet. There is no gallery of designs to
browse and no picture saved to your library — the starting points you can save in the
composer are captions, not layouts. Pictures you already have live in Assets, and
that part works today."*

#### The rule this screen demonstrates
Notice that *"Two to ten"* and *"no layer panel"* are written as **words, not
digits**. That is enforced: **a test forbids any digit on this page except the one
allowed price.** A spec reference containing a "4" was removed from the copy by that
test. See §7 for the general rule.

#### What it cannot show
No template count · no "used N times" · no popularity order · no export count · no
recent designs. There are no templates rendered and no exports have happened, so
every one of those would be a number about nothing.

---

### `/remix` — Remix  · NEW

**BUILT.** Menu says live. They agree.
**Group:** Create, fourth — after Posts, Campaigns and Assets.
Label *Remix*, hint *"Turn one post into a week of them"*.

**Header:** *Remix* / *"Turn one thing you already wrote into a week of posts."*

**What a person does here.** Someone who already wrote one long post gets more posts
out of it without writing them again. They pick that post, tick which sorts of
rewrites they want and which channels they go to, **read the exact credit total**,
and press one button that agrees to that number and spends it. What comes back is a
set of **unpublished drafts** sitting in Posts, which they still have to read and
approve themselves.

**Tabs / toggles:** none. **What looks like a view switch is a branch the server
picks**, not a control:

- An unsettled batch → the cost panel shows and the planner does not.
- A settled batch → the planner shows *and* the outcome panel shows below it.
- No batch and no usable post → an empty state instead of the planner.

**There is no way back to the planner while a batch is waiting — it has to be run
first.**

#### The planner
*"Start with one thing you already wrote"* / *"Pick a post with more in it than one
caption can hold. Nothing is written and nothing is charged until you approve the
total."*

**The post to remix** — a picker over the workspace's posts, **only those with a
body**, cut to the first 30. Each shows its title, or the first 60 characters of the
body, or the words *An empty post*.

**What to make** — four rewrite kinds:

| Kind | Its sentence | Price |
|---|---|---|
| **One post per channel** | *"The same idea said the way each channel wants to hear it, inside its own limits."* | 3 credits |
| **A short version** | *"Tighter, for the channels and the readers that will not sit through the long one."* | 1 credit |
| **A version that opens harder** | *"The same post with its first line rewritten to stop a thumb. The rest is untouched."* | 1 credit |
| **An X thread** | *"The long argument split across posts, at X's real limit, in order."* | 1 credit |

Under each, the channels it can reach with the current ticks — or *"No channel
picked can carry this."*

**Where they go** — the four channel ticks.

**The price sentence, which is the structural point:**

> *"This would write N drafts for M credits. **Adding a channel adds a draft, not a
> credit — one writing pass covers every channel it is for.**"*

With everything ticked that is **13 drafts for 21 credits** — the four rewrite
prices plus a batch fee of 15.

#### The cost panel
*"What this batch will cost"* / *"Nothing has been spent on these yet."*

An attribution line — *"Remixed from "Spring menu" in this workspace."* or *"Remixed
from an untitled post."* — **composed and stored at planning time so it survives the
source post being edited or deleted.**

One block per rewrite kind: its name and sentence · its price, **or the words
*trimmed out*** when every channel under it is unticked · one tick per channel
showing the channel and the format · and *"· needs a photo"* on any tick whose
format is not text or thread — in practice every Instagram row.

Totals: *"N drafts to write"* · *"The remix pack, charged when it runs — 15 cr"* ·
*"In total"*. And the rule restated: *"Unticking a channel takes away a draft and not
a credit — one writing pass covers every channel it is for. Unticking a whole row is
what changes the total."*

#### The outcome panel
One of three headings: **"This batch stopped part-way"** · **"Nothing was written"**
· **"The drafts are written"**.

- *"Nothing came back that could be saved, and the writing that failed was not
  charged."*
- *"N drafts are waiting in your posts. **Every one is a draft — read it, change it,
  and approve it yourself before it goes anywhere.**"*
- *"N rows came back empty and were not charged."*
- *"N credits charged."* — and this figure is **recomputed from the price list rather
  than reported back by the model call.**

#### "What Remix cannot make yet" — shown on every branch, including no-workspace

*"Each of these needs one specific thing, named. **None of them is a button that
would do nothing.**"* Six entries, each beginning with the word *Needs*:

- **A carousel outline** — *"Needs a mesh task named carousel_outline. There is no
  task that returns slides, and the carousel format needs two or more photos before
  it can publish, so an outline in words could not go out as a carousel even once it
  was written."*
- **A reel script** — *"Needs a mesh task named video_script — the price already
  exists in pricing.config.json and the task does not. No channel declares a video
  mime either, so nothing could publish the result yet."*
- **A quote card** — *"Needs the picture pipeline bound to a derivative.
  image_generate exists and writes one picture for one post; making it part of a
  batch is the work."*
- **An email** — *"Needs somewhere to send it. Sahoda publishes to four channels and
  email is not one."*
- **A blog outline** — *"Needs a mesh task named seo_article — priced in
  pricing.config.json, not written — and a place to put the result."*
- **A WhatsApp broadcast** — *"Needs WhatsApp as a channel. It is not one of the
  four."*

This panel is the clearest example in the product of how an unbuilt thing should be
stated: **a named blocker in a sentence, never a control that would do nothing.**

#### What it cannot show
The wallet balance (that lives in the frame; this screen prints it only inside a
shortfall sentence) · a history of past batches — only the newest is read · any
prediction about how a remix will perform.

---

### `/leads` — Leads  · NEW

**BUILT.** Menu says live. They agree.
**Group:** Customers, second — after Inbox.
Label *Leads*, hint *"Enquiries, from first message to sale"*.

**Header:** *Leads* / *"Everyone who got in touch, in one list, from first message
to whether they bought."*

**What a person does here.** Sees everyone who has got in touch and keeps track of
who they have and have not answered, moving each enquiry along four steps. They also
come here to **copy the code that puts a contact form on the website they already
own**, which is how most enquiries get in.

#### The board — four fixed columns

**New · Contacted · Won · Lost.** Always all four, always in that order. Search and
the filter work *within* the columns; they never change which columns exist.

Each heading carries a count **of the cards currently shown**, after search and
filter — not a workspace total. **It is not shown at all when it is zero.**

An empty column shows one sentence instead of a number:

| Column | Sentence |
|---|---|
| New | *"Somebody left their details and nobody has answered yet."* |
| Contacted | *"You replied. The clock is now on them."* |
| Won | *"They bought, booked or walked in."* |
| Lost | *"They did not."* |

#### Search and filter
One search box, placeholder *"Search a name, a number or an email"*, matching the
name, email, phone and message — **but not the "where it came from" line**. And a
mutually-exclusive three-way filter: **All** · **Needs a reply** · **This week**
(the last seven days counted back from the moment the browser renders).

There is **no sort control**; the order is always newest first.

#### One lead card
The name — or the constant *"No name given"* · the email and phone, **each rendered
only when present** · what they said, **in full with no truncation**, up to 4,000
characters · and one short line saying where it came from, which has exactly four
forms:

- *"Your site"*
- *"Your inbox · {channel}"*
- *"Your inbox"*
- **"Not recorded"** — for anything else, including every lead created before either
  door existed. **This is deliberate: the code refuses to default to "Your site",
  because that would be a guess.**

Below the board, only when the read filled up: *"Showing the most recent 200."*

#### Actions
**Every action is free, and none asks for confirmation.**

**Contacted** appears only on a card in New. **Won** appears only on a card in
Contacted. **Lost** appears on every card that is not already Lost. Each moves the
card and stamps the time it was read.

> **A card in Lost carries no button at all — nothing follows Lost and there is no
> way back. A card in Won carries exactly one button, Lost. There is no drag and
> drop; movement is only by these buttons.**

#### How someone gets in — a section present on every state, including both failures

*"How someone gets in"* / *"Two ways, and both of them work."*

**1. A contact form on your site.** *"Paste this into any page you already have. It
carries a captcha and a rate limit, and an enquiry lands here the moment it is
sent."* — followed by the actual snippet to copy, built from the workspace's most
recent site.

**2. A message in your inbox.** *"A comment, review or message that turns out to be
somebody wanting to buy becomes a lead from the inbox, with the conversation
attached. **Doing it twice does not make two leads.**"*

And a precise note about why two fields stay empty: *"A platform conversation carries
a handle rather than an address or a number, so those two stay empty rather than
being filled with something that is not one."*

And a stated gap: *"A Sahoda site does not yet carry this form of its own. It needs
two things: an address the public can reach, which Sites v0 does not deploy to yet,
and a captcha widget inside the generated page — a plain HTML form cannot carry a
token, and an enquiry endpoint without one would be open to anybody."*

#### `/embed/lead` — the public form  · NEW · not in the menu

What a visitor to the shop's own website sees, inside the pasted frame.

*"Get in touch"* / *"Leave your details and they will come back to you."* Four
fields with real limits: **Your name** (120 characters) · **Email** (254) · **Phone**
(40) · **What do you need?**, a four-row text area (4,000). Under them: *"Leave an
email address or a phone number so they can reply."* Then a captcha challenge, and
**Send enquiry**.

There is also **a hidden fifth field labelled "Website"** — a bot trap, positioned
off-screen, removed from the tab order and hidden from screen readers. A human never
sees it, and any value in it is rejected.

#### What it cannot show
A lead's value, deal size or revenue · a follow-up date or reminder · notes on a
lead · who on the team owns it · any figure about conversion — **there is no
"conversion rate" and no funnel percentage anywhere.**

---

### `/planner` — Planner

**BUILT.** Menu says live. They agree.
**Group:** Publish, first of four. Label *Planner*, hint *"The schedule, week by
week"*. **One of the four phone bottom-bar tabs**, to the right of the create button.

**Header:** *Planner* / *"Plan, schedule and stay ahead."*

**What a person does here.** Looks at what they have committed to post and when. They
can **hand the week over** — one click drafts five posts and puts a time on each —
then walk the list approving the ones they are happy with and moving or clearing the
times on the ones they are not. They also come here to find out whether a post that
was supposed to go out actually went out, and on which channels.

#### Three views — and the default is not the first one

A segmented control labelled *"Planner view"*, rendered only when the workspace has at
least one post:

- **Calendar** — a Monday-first 6 × 7 grid of 42 days beginning on the Monday on or
  before the 1st of the month. **Days belonging to the neighbouring months are still
  drawn and still show their posts.** Each cell shows the day number and a stack of
  titles with a channel line under each.
- **Week** — a **rolling** seven columns starting with today, headed like *"Mon, 25
  Aug"* with *" · Today"* appended to today's. Posts with no date fall under a heading
  **Unscheduled**; posts dated outside the seven days fall under **Outside this week**.
- **List** — one row per post, most-recently-updated first. **This is the default, even
  though Calendar is the first segment**, because approve and reschedule exist only on
  list rows.

**No filters, no sorts, no search, no status tabs, no channel filter.**

#### Plan my week
*"Plan my week"* / *"Five drafts, grounded in your Brand Brain, placed across the
coming week."*

- **Goals for the week (optional)** — up to 500 characters, placeholder *"More weekend
  footfall, launch the monsoon menu…"*.
- Four channel chips: **X · Google Business Profile · LinkedIn · Instagram**. **X and
  Google Business Profile are pre-selected**, and the selection is not persisted
  anywhere.
- **Plan my week · 20 credits** — the number comes from the price list.

It inserts **exactly five drafts**. A model-suggested time is kept only if it is at
least **5 minutes** ahead and no more than **14 days** out; otherwise it is replaced by
a deterministic time and counted as *moved*.

Success: *"Planned 5 drafts · 20 credits used · 1380 left"* — **and the first number is
counted from what the database actually returned, not assumed.**

#### One list row
Title (or *Untitled post*) · a *"Drafted by Sahoda"* mark when it came from a week plan
· a status chip · campaign labels, when the post belongs to any · channel chips · the
scheduled time, always with an explicit `IST` suffix, or the words **Not scheduled** ·
and the auto-publish sentence.

The status chip follows the same rule as everywhere: **the post's own status is what a
person decided; the channel rows are what actually happened, and evidence outranks
intent.** A simulated publish carries the extra word **Simulated**.

Each chip carries a spoken suffix naming what happens next: *" — not started"* · *" —
still being written"* · *" — waiting on a person"* · *" — cleared, not yet dated"* ·
*" — booked for a time"* · *" — going out now"* · *" — it went out"* · *" — out on
some channels, not all"* · *" — nothing went out"* · *" — its time passed"*.

#### Actions
- **Plan my week · 20 credits** — no confirmation; the price is on the button. **The
  hold is released and nothing is charged** if the model fails, returns nothing usable,
  or the five drafts fail to save.
- **Approve** — free, no confirmation. **It appears only on a post that is still an
  idea, a draft or in review.** On anything already approved or further along, **no
  button renders at all**, and the write itself refuses, so a post the publisher has
  picked up cannot be clobbered.
- **Schedule / Reschedule / Close** — one button whose word changes. **It will not
  commit a time less than five minutes from now**: *"Pick a time at least 5 minutes
  from now. Nothing was saved."* Clearing the field cancels the schedule.

The calendar month heading and every time on this screen are in India Standard Time,
and the calendar says so: *"Times are shown in IST, the zone every schedule is stored
in."*

#### States
- **No posts** — *"Your week shows up here"* / *"One click up there drafts five posts
  and places them across your coming week."* / tip: *"Sahoda: Add goals first if you
  have a push this week — the plan bends toward them."*
- **Calendar, some posts undated** — *"3 posts have no date yet, so they cannot appear
  on a calendar. See them in the list."* — **and the verb agrees with the count.**
- **Nothing selected in the channel picker** — *"Pick at least one channel before
  generating variants or previewing a publish."*
- **No time set** — *"No schedule set — this post stays a draft."*
- **Read failed** — *"Couldn't load your plan just now — reload to see it. Nothing has
  been lost."* **and the Plan-my-week panel is still shown, deliberately.**
- **Nothing connected** — the same banner as `/posts`. **If the connections read
  itself failed, no banner renders at all — silence, deliberately**, because a banner
  would be claiming something it did not check.
- **Per-channel, inside the schedule field** — *"Nothing goes out at that time —
  LinkedIn isn't connected."* or *"This goes out on its own at around that time — but
  LinkedIn isn't connected, so it won't go out there."* Two or more names read *"X and
  LinkedIn aren't connected"*.

**Loading** has three forms: a silent page skeleton spoken as *"Loading your
planner"*; the paid action's rotating line — *"Reading your Brand Brain…"* →
*"Planning five posts across your week…"* → *"Placing each one at a sensible time…"* →
*"Still working — if this fails you will not be charged."*, which **stops on the last
rather than looping**; and, in the schedule field before the browser clock is
available, *"Checking the schedule against the channel lead times…"*.

**Write failures are toasts**, and the wording distinguishes a stale list from a real
failure: *"Can't approve this post from its current state — reload to see where it
is."* · *"Approved, but the response was unreadable — reload to confirm."* · *"Only an
owner or editor can schedule a post."* · *"This post is already going out — you can't
change its time now."*

**And the one that matters:** *"The model ran, but we could not confirm whether it was
charged. Check your wallet balance before you run this again."* — **this one fires with
the five drafts already on screen.**

#### The setting that rewrites half this screen

**Whether a scheduled post actually goes out by itself depends on a per-deployment
setting that defaults to off.** Half the sentences on this screen are written twice,
once for each answer, and the design needs both:

| Situation | Setting **off** (the default) | Setting **on** |
|---|---|---|
| a dated post | *"Won't post itself — scheduled auto-publish isn't live yet. Copy it across at that time to post it."* — short form **Not auto-posted** | *"Goes out on its own at this time."* — short form **Auto-posts** |
| its time has passed | *"This time has passed and nothing was published — scheduled auto-publish isn't live yet. Copy it across to post it."* — **Missed · not posted** | *"This time has passed and it has not gone out yet — check the channel status on the post."* |
| out on some channels | *"Out on some channels and not on others — scheduled auto-publish isn't live yet, so the rest will stay put. Send those from the post rather than publishing it again."* — **Partly out** | *"Out on some channels and not on others — check the channel status on the post."* |
| a simulated run | *"Nothing reached a platform — this ran as a simulation, and scheduled auto-publish isn't live yet. Copy it across to post it for real."* — **Simulated only** | *"Nothing reached a platform — this ran as a simulation. Send it again to post it for real."* |
| inside the schedule picker | *"Setting a time doesn't publish it — scheduled auto-publish isn't live yet. Copy it across at that time to post it."* | — |

**The short forms exist because the Calendar and Week cells have no room for the long
one.** Both need designing.

#### What it cannot show
Drag to reschedule — **there is none; times change only through the picker** · a
conflict warning between two posts at the same time · anything past the most recent 100
posts · who wrote a post · a month other than the current one — **there is no month
navigation.**

---

### `/sites` — Sites

**BUILT for generating and previewing. Deploying to a real address does not exist.**
Menu says live, and that is honest for the half it claims.
**Group:** Publish, third of four. Label *Sites*, hint *"Generate a website from your
Brand Brain"*.

**What a person does here.** Types the name of their business and, optionally, one
line about what the site is for. The product writes a **one-page website** in their
own brand voice and shows it on the same screen, exactly as a visitor would see it.
**They cannot yet put it on the internet — this is a draft you look at, not an address
you can give a customer.**

**What the deploy half waits on:** a hosting client. No code exists that can upload a
bundle anywhere. There is **no deploy button, no publish control, and no "make it
live"** — and nothing on this screen writes a published state.

#### The generate panel
*"Generate your site"* / *"A one-page site draft, written in your brand voice.
**Preview only for now — publishing to a real address is coming.**"*

- **Site name** — up to **80 characters**, placeholder *Sharma Dental*. Required; the
  button stays disabled while it is empty.
- **Goal (optional)** — up to **500 characters**, two rows, placeholder *"Book more
  appointments from Instagram traffic…"*. Leaving it blank makes the model infer the
  goal from the Brand Brain.
- **Generate site · 100 credits** — the only paid action, and **the most expensive
  single action in the product**.

#### The plan gate, stated before any money moves
The panel checks the workspace's plan and its existing site count **before** anything
is charged, and says which of four things is true:

- *"Sites are on Starter and above — your Free plan doesn't include one."*
- *"Your Starter plan includes 1 site and you're using 1. Growth includes 3."*
- *"Your Growth plan includes 3 sites and you're using 3. Agency includes 10."*
- *"Your Agency plan includes 10 sites and you're using 10."* — **and no upgrade is
  named, because none exists.**

With a **See plans** link beside it.

#### The preview
Header: the site's name, and the constant line **"Draft preview · not published
anywhere yet"**.

Inside the frame is a **fully rendered web page**, rebuilt on every screen load from
the stored rows. Five section kinds and no others: **hero · features · offer · faq ·
contact**.

Two refusals worth carrying into the design:

- **The model is explicitly forbidden from inventing a customer quote, review, rating
  or testimonial — and a testimonial section is thrown away on arrival even if it
  produces one anyway.**
- **The contact section's enquiry form is deliberately not rendered.** The renderer
  returns nothing rather than ship a form that would throw the visitor's message away.
  (The working form is the embeddable one on `/leads` — see that entry.)

The preview's fonts and colours come from the workspace's own saved brand theme, and
fall back to defaults for a workspace that never uploaded a logo. Every text field is
capped at 4,096 characters, and anything longer is **rejected rather than truncated**.

#### A page switcher that can never appear
There is a row of page-path buttons in the code, but it renders only when a site has
more than one page — and generation is hard-capped at **one page**. So it is
unreachable today.

#### Actions
Beyond the two fields and the Generate button, there is **no rename, no edit, no
regenerate-this-one, no delete, no download, no copy-link, no deploy, and no way to
open a site in a new tab.** None of them exist.

**Generate has no confirmation dialog.** One click starts it; the cost is in the label
instead. If any of the three writes fails, the site record is deleted and the credit
hold released.

#### States
- **Nothing generated yet** — *"Your site shows up here"* / *"Generate a one-page draft
  above and preview it right here. Publishing to a real address is still being
  built."* / tip: *"Sahoda: Resolve your Brand Brain first — the site is written in
  whatever voice it finds."* **The generate panel stays visible above it.**
- **While generating** — the button is replaced by a line that advances every 1.8
  seconds through four sentences **and then stops on the last one; it does not loop**:
  *"Reading your Brand Brain…"* → *"Writing your homepage, section by section…"* →
  *"Building the page with your brand tokens…"* → **"Still working — if this fails you
  will not be charged."** Both fields are disabled while it runs.
- **Could not read the list** — and note what this sentence protects against:
  *"Couldn't check your sites just now — reload before generating. **You may already
  have a site, and generating again costs credits.**"*
- **Sites exist but could not be rendered** — *"Your recent site drafts could not be
  read back. Reload first; if this persists, generate again — you were only ever
  charged for drafts that saved."*
- **No workspace** — the generate panel is **hidden entirely**, and the screen shows
  *"Create a workspace to build a site"* / *"Sites belong to a workspace and you don't
  have one yet. Nothing failed — and nothing has been charged."*
- **Not connected, suppressed and could-not-check-today do not exist here** — a site is
  generated from the Brand Brain, not from a connected platform.

#### Every outcome of the paid action, as its own state
- **Success**, as a toast: *"Generated your site draft · 100 credits used · 1400
  left"*.
- **Partial success**, quietly under the button: *"3 parts of the draft were unusable
  and left out."*
- **Not enough credits**: *"Generating needs 100 credits and you have 40. Nothing was
  generated and you were not charged."* + **Top up your wallet**.
- *"The model could not complete this. You were not charged — try again."*
- *"The model returned no usable site. You were not charged — try again."*
- *"The site could not be saved. You were not charged — try again."*
- *"This deployment is not fully configured for AI actions yet — nothing ran and you
  were not charged."*
- *"Couldn't check how many sites you already have. Nothing was generated and you were
  not charged. Reload and try again."*
- **And the one that matters most:** *"The model ran, but we could not confirm whether
  it was charged. **Check your wallet balance before you run this again.**"* — **this
  is the only failure message in the product that does not invite a retry**, and it
  deserves its own treatment.

#### Phone
**On the page itself, nothing restructures** — the panel is already one column at
every width and both fields and the button are already full width. The preview frame
is full width **at a fixed 560px height at every screen size**; there is no phone
branch for it, no expand control and no full-screen mode.

One thing worth knowing: **the content inside the frame is itself a responsive web
page** with its own viewport rules. On a 390px phone the frame is about 360px wide, so
the previewed site renders in its *own* mobile layout inside a phone-sized box.

#### What it cannot show
Whether a site is published, or where · a visitor count, a page view or any traffic
figure · a domain · more than one page · a version history · an edit surface.

---

### `/wallet` — Wallet  · NEW

**BUILT for reading; a labelled dead end for paying.** Menu says live.
**Group:** the bottom foot, with Connections and Settings. Label *Wallet*, hint
*"Credits, and what each one bought"*.

**What a person does here.** Finds out how many credits they can still spend, and
checks what the last fifty things the product did on their behalf actually cost.
**It is the receipt drawer.**

**Tabs / toggles:** none. The history is always newest-first and **cannot be filtered
by type, date, action or amount.**

#### Available credits
The large number is **total minus held**. Beside it, *"credit to spend"* at exactly
one, otherwise *"credits to spend"*. Under it: *"{total} total · {held} held"*.

- At zero: *"You have no credits to spend right now. Top up below to start an AI
  action."*
- When credits are held: *"{n} credits held by actions in progress. Released when
  they finish or fail."*
- **And a stalled-hold warning** that is worth designing for: *"{n} holds have passed
  their expiry — those credits are held by stalled actions and are not released
  automatically. They stay held until those actions are settled."*

#### Credit activity
Three columns: **When** · **Activity** · **Credits**.

**When** is always pinned to India Standard Time and Indian formatting **for every
viewer regardless of where they are**. An unparseable timestamp reads *"Date not
recorded"*.

**Activity** is one of these labels: *Credits purchased* · *Performance reward* ·
*Credits returned* · *Credits expired* · *Manual adjustment* · *Welcome credits* ·
*Plan credits* · *Correction* · *Credits added by Sahoda* · *Credits added* — or, for
a spend, the human name of the action. **An action name the code does not recognise
but that is well-formed is turned into readable words; anything malformed becomes the
words "AI action".**

Two markers can appear on a row:
- **A "Sahoda did this on its own" mark**, shown only when the entry was written by a
  background job rather than a person.
- **A `Reserved` badge** on a hold that nothing on this page settles.

The detail line under the label is assembled from up to four pieces:
- a fixed sentence per type — *"Added from a credit purchase."* · *"Earned from post
  performance."* · **"Reserved while this action runs — returned in full if it does
  not complete."** · **"Returned in full. The action did not complete, so you were not
  charged."** · *"Unused credits expired."* · *"Adjusted by Sahoda support."* ·
  *"Included free when you signed up."* · *"Included with your plan."* · *"Issued to
  correct an earlier entry."* · *"Added by Sahoda, not by a plan or a payment."* ·
  *"Added to your wallet. Where these came from was not recorded."*
- a reference · a model tier (one of *Nano · Economy · Standard · Premium ·
  Research*) · and a provider cost in US dollars, where **a real amount smaller than
  $0.0001 renders as "under $0.0001" rather than rounding to zero**.

> **Two of those last fields are empty on every row today**, because nothing writes
> them. Where the model tier is missing on a charge, the line says *"Model tier not
> recorded"* rather than nothing.

**The sign is rendered from the entry type, not from the stored number.** Grants,
purchases and rewards render `+n`; charges and expiries render `-n`; and **holds and
releases render a bare number with no sign at all, because neither moves the wallet
total.**

#### Corrections are grouped
Several entries written together appear under one heading, **Correction**, with a net
effect line — *"No change to your balance"* / *"+n credits to your balance"* /
*"-n credits from your balance"* — and the explanation *"These entries were written
together to correct an earlier one. Nothing was charged for them."* When only half of
a pair falls inside the window: *"Part of a correction to an earlier entry. Its other
half is outside the entries shown here."* Any row a correction supersedes is marked
*"Corrected by a later entry. See the correction above."*

#### Three footnotes
- *"Showing the 50 most recent entries. Older activity is not listed here."*
- *"Provider cost recorded on {n} of these {m} entries: ~${x}. The rest recorded none,
  so they are not counted here."*
- *"{n} entries could not be displayed — they did not match the ledger contract. Your
  balance above still counts them."* — **the product would rather admit it dropped a
  row than silently show a total that does not add up.**

#### Top up credits
A radio group labelled *"Choose a plan"* with three options, **Starter preselected**.
The **Free** plan is deliberately excluded because there is nothing to check out for.

| Plan | Line shown |
|---|---|
| Starter | *"₹499 per month (about $12) · 1,500 credits granted each month"* |
| Growth | *"₹1,499 per month (about $29) · 5,000 credits granted each month"* |
| Agency | *"₹3,999 per month (about $79) · 15,000 credits granted each month"* |

Under the list: *"Starts a checkout session for {Plan} — ₹{price} per month. Nothing
is charged and no credits are added until a payment completes."*

**What the paying half is waiting on:** a working payment step. The checkout page
exists and reads the real order but never hands the payment session to the browser,
and it says so on screen. So the disagreement here is narrow and precise: **the menu
says live for a screen whose Top up button cannot, in this deployment, result in a
payment or in any credits arriving.**

#### What it cannot show
**A price.** The history shows what was actually charged, never what something costs —
prices are shown at the point of spend, on other screens. **A monthly allowance or an
"X of Y" fraction** — see the shell entry; the wallet is a balance, not a quota. No
spend chart (that is on Home). No filter by action.

---

### `/ads`, `/ads/creative`, `/ads/targeting`, `/ads/budget`, `/ads/performance` — Ads

**FIVE DRAWN PLACEHOLDERS.** Menu says *soon*. **They agree.**
**Group:** Publish, last of four. Label *Ads*, hint *"Paid spend, beside the posts it
supports"*. **Only `/ads` is in the menu**; the four sub-screens are reachable only
from the tab strip inside the section.

**Read §8 before designing these.** Ads functionality is on the deliberately-dropped
list, and the founder's own roadmap position governs whether these five screens should
be maintained at all.

**What a person does here today: nothing.** They read the whole shape of the job laid
out **with every figure left out**, plus a plain statement of the three things in the
way. The only thing they can actually do is walk the five screens and follow one link
back into Analytics, which does work.

**Header, shared by all five:** *Ads* / *"Paid campaigns on Meta and Google, planned
in the same place as your posts."* Then the banner: *"Ads will put paid spend next to
the posts it supports, under one goal and one report. **This is the screen as it will
be. Nothing on it is connected yet, and no numbers are shown because there is nothing
to measure.**"*

#### The one real control in the section
A tab strip, in the layout so it appears identically on every route, with the
accessible name *"Ads sections"*. Every tab is a real link:

**Overview** → `/ads` · **Creative** → `/ads/creative` · **Audience** →
`/ads/targeting` · **Budget** → `/ads/budget` · **Results** → `/ads/performance`

**Note the label/URL mismatch on two of them**: the tab reads *Audience* but the URL
is `targeting`, and *Results* but the URL is `performance`.

#### Everything else is inert
- On Overview: four chips, first drawn "on" — **All · Running · Paused · Finished**.
  **They carry no counts, deliberately — not even a zero.**
- On Results: **This week · This month**. A note records that *"Last 7 days"* used to
  be here and **was removed because it carried a digit**.
- On Budget: **Even, every day · Fast, then stop**.
- On Audience: **Walking distance · A short drive · The whole city**.

Every table on the section is passed a literally empty row list.

#### The blanket fact
**Not one value anywhere in this section comes from a database, an API or a user.
There is no number displayed anywhere on any of the five screens — not a count, not a
sum, not a percentage, not a raw value.** An automated check reads every placeholder
control on all five routes and fails if it finds a digit.

**There is no ads table in the database at all.** The one related table, `campaigns`,
was shipped deliberately **without a budget column**.

#### The three things in the way — stated on the screen itself
1. *"Posting to your Instagram and running an ad from your ad account are two separate
   grants. Sahoda has the first one. The second needs a business account set up on the
   platform's side, and it is yours to give — nothing here can arrange it for you."*
2. *"Meta and Google review both an app's ads access and every individual ad. Those
   reviews take as long as they take and can be refused."*
3. The money-handling build.

---

### `/analytics` — Analytics

**BUILT.** Menu says live. They agree.
**Group:** Results, first of three. Label *Analytics*, hint *"What went out, and how
it did"*. Not a phone bottom-bar tab.

**What a person does here.** Finds out whether the things they already posted did
anything — how many people saw them, which channel is worth their time, which single
post did best — and separately checks the Instagram account itself. **They cannot
change anything here; every control goes somewhere else.**

**Tabs / toggles:** none. **Three things a designer would mistake for toggles are
fixed in code and cannot be changed by the person:**

- *Best performing* always ranks by **Reach**.
- The trend chart always draws **Reach**.
- *By post* is always ordered on **impressions, descending** — and the heading says
  so: *"By post · ordered on impressions"*.

The windows are fixed too: **30 days** for both Instagram account reads and for the
trend chart.

**Header:** *Analytics*, with a line beneath such as *"7 published posts · 12
channels"* — two counts, rendered only when at least one channel has published.

#### Performance
Four slots: **Reach · Views · Accounts engaged · Interactions** — each a raw value
for the whole 30-day window, straight from the platform. **A key the platform did
not return shows the not-measured mark; a key it reported as literal `0` keeps its
tile and shows `0`.** That distinction is the honesty rule made visible.

#### Instagram account · last 30 days
A large follower number (the last point of the series) · *"No change"* or *"+N across
{days} days"*, **where `days` is the count of points, not calendar days** · a line
scaled to the window's own minimum and maximum rather than to zero · the two axis end
labels · and three separate figures:

- **Gained** — a sum of the platform's own gained series, **never derived by
  differencing the follower count**.
- **Lost** — a sum of the platform's own lost series.
- **Over** — a count of days, **stated separately because this window can be shorter
  than the follower chart's.**

Plus **two lag sentences**, each computed from that endpoint's own declared delay:
*"Instagram reports on a delay of about two days, so recent days may be missing."*
(48 hours or more) / *"…about a day…"* (24–47) / *"…about {n} hours…"* (under 24).

#### Performance over time
*"Reach, running total since each post went out"* — and that sentence is doing real
work: **the stored value is a running lifetime total since each post went out, not
that day's activity.**

One point per day, each a sum across every post-channel measured that day. **The path
lifts wherever a day is missing, so no segment is ever drawn across a gap.** Beneath
it: *"{first} to {last} · {n} measured days"* and *"{min} to {max}"*.

And when the number of contributing post-channels varied across the window, one more
sentence — which is the single most careful line on the screen:

> *"Measured across {min} to {max} post channels a day, so part of the movement is
> how many reported rather than how they did."*

#### Best performing
*"by reach"*. At most five entries: rank · post title (or the body cut to 60
characters, or *Untitled post*) · channel name · the reach value. **Rows with no
reach number are not ranked at all — they are not placed last.**

#### By channel
Columns: **Channel · Impressions · Reach · Engagement · Posts**.

Impressions, Reach and Engagement are **sums** across that channel's published
post-channels. **Engagement is itself computed** — the sum of whichever of likes,
comments, shares and saves the platform reported, and **null when it reported none of
the four**. Any total renders an em dash when no row carried the number, **never
`0`**.

**Beside a figure, a coverage fraction such as `2/5`** — how many rows carried a real
number over how many were in scope — rendered only when those differ.

Row order: by impressions, descending; **channels with no impressions total go after
every channel that has one.**

#### By post
Columns: **Post · Channel · Impressions · Reach · Engagement** — raw per-post,
per-channel values. **A row present in this table can still show an em dash in a
column**, because "ready" means *the payload was a measurement*, not *every field
arrived*.

Below it: **"Not ranked — no measurement yet ({n})"**, and each unranked entry gives
the post title, then *"{Channel} · {headline}"*, then an optional full sentence.

#### The complete per-row "no number" vocabulary

| Headline | The sentence beneath it |
|---|---|
| **Not available yet** | *"{Channel} reports metrics on a delay. Expected after {date}."* |
| **Not available yet** | *"{Channel} reports metrics on a delay."* |
| **Not available yet** | *"{Channel} has this post but has not returned its metrics yet."* |
| **Not available yet** | *"{Channel} has not reported metrics for this post."* |
| **Not available yet** | *"{Channel} hasn't reported anything for this post yet, and doesn't publish how far behind its metrics run."* |
| **Measured** | *"Last updated {date}"* — reachable when a row was measured but its impressions field specifically was absent |
| **Can't be resolved** | *"{Channel} can't tie this post back to a connected account, so its metrics can't be looked up."* |
| **Can't be resolved** | *"{Channel} didn't return a post id, so there's nothing to look metrics up with."* |
| **Simulated run** | *"This post was published in test mode, so it has no real metrics."* |
| **Not published** | *(no sentence)* |
| **Not loaded here** | *"Open the post to see its metrics."* — **deliberately not "try again", because nothing failed** |
| **Couldn't load metrics** | *"We couldn't read them just now. Refresh to try again."* |
| **Not connected** | *"Connect {Channel} to see metrics."* |
| **Reconnect needed** | *"Reconnect {Channel} to see metrics."* |

**Five of those share one headline — *Not available yet* — because to the reader
they are one situation: there is no number to act on, nothing is wrong, don't act.
Only the reason differs, and the reason is what stops the wait feeling like a fault.**

#### A cap notice
*"Metrics are read for the first 24 published channels on this page. The rest are
listed as not loaded — open a post to read its own."*

#### Actions
**There are no buttons on this screen that submit anything.** Every interactive
element is a link. Nothing costs credits, nothing writes, nothing calls out.

#### States
**Six distinct empties plus a page-level one:**

- **Nothing published anywhere** — *"Nothing published yet"* / *"Analytics start once
  a post goes out on a channel. Until then there is nothing to measure — **which is
  different from measuring nothing**."* + a **Create post** button. It replaces the
  two tables; the strip, the account card and the chart still render above it.
- **Connected, window held nothing** — *"Instagram has not reported these for this
  window yet."*
- **No follower history** — *"No follower history to show yet."* or *"Instagram
  hasn't reported follower history for this window."*
- **Exactly one reading** — *"One day of history so far — not enough to show a
  trend."*
- **Nothing to rank** — *"Nothing has been measured yet, so there is nothing to
  rank."*
- **No post reported** — *"None of your published posts has reported metrics yet."*
- **History kept but empty** — *"Sahoda has started keeping a history. Nothing has
  been measured yet — the first readings arrive once your published posts report."*
- **Fewer than three measured days** — and this one states its own reasoning:
  *"One day measured so far. **A trend needs at least 3, because a line through two
  readings shows a direction neither of them measured.**"*

**And in every non-empty case, a positive coverage statement** — *"All {n} channels
reported."* — **rendered even when coverage is complete, deliberately**, so that the
partial form (*"{counted} of {of} channels reported."*) means something when it
appears.

**Error is per section, and the three sections fail independently by design**: a
broken Instagram connection costs the account card and the strip and nothing else.
*"Could not read these just now. Refresh to try again."* · *"Couldn't read your
account insights just now."* / *"Refresh to try again."* · *"Sahoda could not read
the history for this chart. Reload to try again."*

**Not connected** and **needs reconnecting** are two different states, told apart by
reading the stored connection status:
- *"Connect a channel to start measuring."* / *"Connect Instagram to see followers
  and reach."* + *"Account insights come from the connected account, not from your
  posts, so there's nothing to show until one is linked."*
- *"Reconnect Instagram to start measuring again."* / *"The connection expired, so we
  can't read metrics until it's renewed. **Your posts and their own metrics are
  unaffected.**"*

**Not configured** is deliberately separate from error: *"This environment has no
metrics connection, so no request went out."* / *"Sahoda can't read account insights
here."* + *"Your account is connected. This environment has no metrics connection, so
no request went out. Your posts and their own metrics are unaffected."* — **and no
action is offered, because refresh cannot conjure a key.**

**No workspace is handled inconsistently across the four sections**, and this is a
real gap worth designing a fix for (§11): the trend chart has a purpose-built line —
*"A history belongs to a workspace, and this account does not have one yet."* — while
the strip and the account card fall through to *"Connect Instagram…"*, and the tables
fall through to *"Nothing published yet"*.

**Could not check today has no state.** The trend chart's day gaps are the only
trace.

**Loading** is a shape-only skeleton reproducing the four-slot strip, the account
card and the two-column split, with one spoken announcement: *"Loading your
analytics"*.

#### Phone and the middle band
**Below 1180px** the two-column split collapses to one stacked column and the
Performance strip goes from one row of four to **two rows of two**. The loading
skeleton makes the same switch **so the cards do not jump**.

**Below 700px** the shell changes as described in the shell entry.

**At every width, both tables scroll horizontally inside their own container rather
than letting the page scroll** — 420px minimum for the channel table, 520px for the
post table — and the trend chart sits in its own horizontal scroller too.

**Nothing on this page collapses into an accordion or a sheet, and no section is
hidden at any width.** Every responsive change is a layout rule, so the same markup
is delivered at all widths.

#### What it cannot show
**Conversions and revenue** — there is no order, no attribution and no currency
anywhere in the schema, so a slot for either could only ever be filled by a
fabrication · a chosen date range · a chosen metric · a post-level total across
channels · an engagement **rate** · a competitor or industry benchmark · a
week-over-week delta on the Performance strip.

---

### `/report` — CMO Report  · NEW

**BUILT — and the menu disagrees.** The screen runs seven real reads on load and has
no inert controls at all; **the menu still says *soon*** and announces it to screen
readers as *"not built yet"*. The nav list was not updated when the screen went live.

**Group:** Results, second of three. Label *CMO Report*, hint *"The Monday read on
your week"*.

**What a person does here.** Opens it on a Monday to read **one page** that says how
last week's posts did, what the product concluded from them, what has been written for
the coming week, and what the week cost. **They read it; they do not operate it.**
Every decision it refers to is taken on another screen, and this page only links out.

**Header:** *CMO Report* / *"The Monday read: what last week did, what Sahoda learned
from it, and what it plans to do next."* Then *"Week 34, 2026"* — **and that names the
week the cycle planned for, not the day it ran.**

**Tabs / toggles:** none. **There is no week picker** — the page renders one fixed
vertical sequence for exactly one cycle.

#### The six blocks, each with its own eyebrow

**1. "Last week" → How it went**
*"{N} of your posts were measured between {date} and {date}."* — **N counts distinct
posts, not measurement rows.** The window is the seven days before the cycle started.

**2. "Then" → The post that reached the most people**
The post's title (or the literal *Untitled*), then *"{value} {metric} on {channel}."*

- The value is **the single highest reading that post reached in the window — a
  maximum, deliberately not a sum.**
- The metric is always the word **impressions**.
- **The channel is printed exactly as stored — `x`, `gbp`, `linkedin`, `instagram` —
  with no friendly-name mapping.** That is a rough edge worth fixing in the design.

**3. "And" → The one that reached the fewest**
The same three fields from the other end of the list, and then one constant sentence
that is the product's whole posture in nine words:

> *"Sahoda has not worked out why, and will not guess."*

**4. "The part that changes things" → What Sahoda learned**
Each learning's sentence — itself generated by arithmetic, in the form *"Your
{channel} posts reached {N}× what your {channel} posts reached."* — with a status line
beneath it:

- *"You added this to your Brand Brain — version {N}"*
- *"You turned this down. Your Brand Brain is unchanged."*
- *"Waiting for you on the Loop screen. Nothing has been written into your brand."*

**5. "Ends with" → This week's plan**
Each planned item's title, then its channels, then one of two suffixes: *" — scheduled,
waiting for your approval"* or *" — a draft in your Planner"*. **Only briefs that
actually became a draft appear.**

**6. "And what it cost" → Credits used**
*"Spent on this week"* — a running sum, **which can legitimately be `0`** — and *"Your
weekly budget"*, **copied onto the cycle when it planned rather than read live**, so a
budget changed since then does not rewrite history. That row is omitted entirely when
no budget was set.

#### Actions
**There are no buttons, no forms, no menus and no writes of any kind.** Three
hyperlinks: *The Loop* and *Analytics* (both only in the no-cycle state), and *"See
every charge in your wallet"* at the foot of the credits block.

#### States — seven distinct empties, and each says something different

| Condition | Wording |
|---|---|
| **No workspace** | *"Finish setting up your workspace and your reports appear here."* — this replaces the whole page |
| **No cycle has ever run** | *"No week has been reported yet"* / *"A report is written at the end of each Loop cycle. Run one from The Loop and this page fills in. What you can read today is on Analytics, which reports what actually went out."* |
| **A cycle exists, nothing measured** | *"Nothing of yours has been measured yet, so there is nothing to report on last week. This fills in once posts have gone out and the numbers have come back."* |
| **Fewer than two posts measured** | *"Fewer than two of your posts were measured last week, so there is no best and worst to name — **with one post, the same post is both**."* — and when this fires, the best and worst blocks **are not rendered at all** |
| **Nothing learned, and nothing could have been** | *"Nothing — there was nothing to learn from. No post of yours has been measured, so Sahoda ran no insight pass at all **rather than inventing one**."* |
| **Nothing learned, but the numbers were read** | *"Nothing this week. Sahoda read your numbers and found no difference big enough to be worth acting on, **which is a real answer and not a failure**."* |
| **Nothing written for the week** | *"Nothing has been written for this week yet."* |

**Those last two are the pair worth studying.** They describe the same visible result —
an empty learnings block — and they are different claims, and the product refuses to
merge them.

**Loading and error are both inherited**, not written for this screen.

#### What it cannot show
Any week other than the most recent cycle · a comparison to the week before · a
forecast · a channel's friendly name in the best/worst blocks · any figure the Loop did
not produce. **And with no Loop cycle ever run — which is every workspace where the
weekly job is not armed — this page shows exactly one sentence.**

---

### `/radar` and `/radar/{id}` — Radar  · NEW

**PARTLY BUILT, and this is the subtlest status in the product.** The screen — watch
list, add form, day-grouped feed, change cards, detail page and a paid draft action
— is **fully written and tested**. But **the read is deliberately unbound**: it
returns a constant that says "no collector", issues no query, and the add and remove
functions refuse.

**So in every real environment today, `/radar` renders exactly one panel and nothing
else** — no watch list, no add form, no feed. The full screen appears only behind a
development flag.

**Menu says:** *soon* — which is correct about the weekly scan and understates a
screen whose feed, detail view and paid action are all written.

**The one thing it waits on:** one file bound to the collector's real column names.
A first attempt guessed them from a document that names tables and not columns; the
table existed, so the missing-table branch never fired, and the screen returned an
error. **Design the full screen — it will arrive intact.**

**Group:** Results, after Analytics and CMO Report.

**Header:** *Radar* / *"What the businesses beside you are doing, and what your
brand would say about it."*

**What a person does here.** Names the shops down the road they want watched — a
website, an Instagram page, a Google listing — and comes back to read **what
actually moved**: a price that is not what it was, an offer that appeared, a posting
rhythm that shifted. Beside each move, the product says what their own positioning
would answer with, and offers to write a draft reply.

> **You never see a list of a competitor's posts. You only see the difference
> between two looks.** That is the deliberate design: a feed of someone else's
> content is the commodity half of this category, and a change is the only thing a
> shop owner can act on this week.

**Tabs / toggles:** none anywhere in the feature. The feed is always every day,
newest first.

#### What the screen shows today

Heading **"The weekly scan is not built yet"**, then two paragraphs, verbatim:

> *"Radar reads a handful of public pages once a week and tells you what changed — a
> posting rhythm that shifted, an offer that appeared, a price that is not what it
> was. Then it says what your own positioning answers with, out of your Brand Brain.
> Nothing is being collected yet, which is why there is no watch list here to add
> to."*
>
> *"What it will never do is put a number on a business it cannot see. No revenue,
> no ad spend, no customer count, and no engagement rate it did not measure — those
> are the figures every tool in this category prints and none of them can know."*

Then: *"One scan per business per week, at 5 credits each. A page that will not load
is skipped and not charged."* and a link to the Brand Brain.

**There is deliberately no add form in this state**, because a control that cannot
store anything reads as a broken app.

#### The full screen, when it is bound

**Who you are watching** — *"A public website, Instagram page or Google listing.
Each one is read once a week at 5 credits a scan. A page that will not load is
skipped and not charged."* Each row: the name **the person typed** · a kind label,
one of **Website · Instagram · Google Business Profile** · and either *" · read
YYYY-MM-DD"* — the last **successful** read — or the literal *" · not read yet"*.
The add form has three fields: *"What do you call them?"* (placeholder *Sunrise
Bakery*), *"What kind of page is it?"*, *"Their public address"*.

**What changed** — a date heading per day, newest first. **The date is a fact about
Sahoda's own scanning — the day it looked — not about the competitor.**

Each change card carries:
- the business's name;
- a kind label, exactly one of **Posted · Posting rhythm · Price · New offer · Offer
  ended · Page edited**;
- the chip **Seen**, whose tooltip reads *"Radar read this on a public page, on the
  date shown."*;
- **one sentence of what was seen, composed by pure arithmetic over two snapshots —
  no model is ever called — and the rule is that this sentence may not contain a
  digit**;
- zero or more figure tiles, each with a label, a raw value that **arrives already
  computed and is printed as-is**, an optional unit, and the line *"Read on
  YYYY-MM-DD"*. **A figure not backed by that change's own evidence renders nothing
  at all** — no number, no placeholder;
- optionally an interpretation block, chipped **Our read** with the tooltip
  *"Sahoda's interpretation. Nobody observed this."*, one sentence, and — only when
  it exists — the line *"Grounded in your Brand Brain — {field}: "{value}""*. **The
  interpretation has no numeric field at all.**

Two chips, two different claims: **Seen** is observed; **Our read** is inferred.
That distinction is the screen's spine.

**Every day accounts for every other watched business**, in one of three ways:
*"Could not check {name} — {reason}"*, where the reason is the collector's own words
(*http 403*, *challenge: cloudflare interstitial*) rather than a flattened "failed" ·
*"Checked {name} — nothing changed"* · and a third outcome, *not attempted*, which
**renders nothing at all**.

#### `/radar/{id}` — one business
A back link **All of Radar** · the name and kind · **Open their page**, which opens
their address in a new tab **with the referrer deliberately stripped so their server
is not told which Sahoda screen the visit came from** · the same feed filtered to
them · **Prices we have seen**, with the line *"Each of these was printed on their
own public page on the date beside it. Radar has no view of what anything actually
sells for."* · and **Every read Radar has**, under this paragraph:

> *"This is the whole sample. Anything they put up and took down between two of
> these dates is invisible to Radar, so there is no "posts per week" figure on this
> page — it would be a count of what we happened to catch, dressed as a measurement
> of what they did."*

And a closing four-item list, **What Radar will never tell you about them**:
*"— What they spent on anything."* / *"— Anything behind a login, a private account
or a paywall."* / *"— Their revenue, their customer count, or how they are doing."* /
*"— How many people saw or responded to any of it."*

#### Actions
**Add to the watch list** — free, no confirmation. **Remove** (accessible name
*"Stop watching {name}"*) — free, no confirmation; it drops the workspace's
subscription and **never the shared competitor record, which belongs to every
subscriber**.

**Draft a reply to {name} · 3 credits** — on every change card. **No confirmation
dialog; the price in the label is the confirmation.** Above it: *"Writes a draft
grounded in your Brand Brain and adapts it for {channels}. It stays a draft until
you approve it — nothing about this is published for you."* **The charge is flat
regardless of how many channels are written for, and the draft row is written before
the charge on purpose: if credits run out, the customer keeps the draft and pays
nothing.**

**There is deliberately no publish, no schedule and no "approve all" anywhere on
this screen.** After a successful draft: *"Wrote a draft for 3 credits."* and a link
**Read it and approve it**. On a shortfall: **Top up your wallet**. On another
failure: **The draft is still here**.

#### States
Four distinct empties, and keeping them apart is the screen's stated purpose:

1. **The collector does not exist** — today's state, quoted above.
2. **Watching nobody** — *"You are not watching anyone yet"* / *"Name a business
   above and Radar reads its public pages once a week, then tells you what moved — a
   new offer, a price that changed, a posting rhythm that shifted — and what your own
   brand would say back."* / tip: *"Sahoda: Watch the shop your customers compare you
   against, not the biggest name in your category."*
3. **Watching, but the readings are not wired in** — *"Your watch list is stored, and
   the weekly readings are not wired into this screen yet. This is not "nothing
   changed" — it is Radar not being able to tell you either way, and those are
   different things."*
4. **Wired, nothing read yet** — *"Nothing has been read yet. The first scan runs
   within the week, and what it finds appears here newest first."*

On the detail page, two more: *"Radar has read this page and found nothing that
moved."* and *"No successful read yet."*

**Not connected** applies only to the draft control, never to the screen: *"Connect
a channel and Radar can draft a reply to this from your Brand Brain."* **The feed
itself renders normally with no channels connected** — Radar reads other people's
public pages, which needs no account of yours.

**When there is no confirmed positioning in the Brand Brain**, the card **omits the
"Grounded in" line rather than printing a generic one**.

#### What it cannot show
A competitor's revenue, spend, customer count or engagement rate · anything behind a
login or paywall · a posts-per-week figure · a competitor's post feed · **a
competitor name that nobody typed** — which would be the worst invention on this
screen: not a number, but the same class of claim.

---

### `/playbooks` — Playbooks  · NEW

**BUILT — and the menu disagrees.** The screen runs live queries, writes real rows
and spends real credits, and the repository's own honesty test has removed it from
its list of drawn placeholders. **The menu still says *soon*.**

**But only one of the five recipes is operable**, and that is a genuine partial, not
a disagreement.

**Group:** Automate, second of two.
**Header:** *Playbooks* / *"Small standing instructions: when this happens, write
that. You fill in a few blanks and turn it on."*

**What a person does here.** Leaves a standing instruction — *"when a festival my
customers keep is coming up, write me something about it"* — and walks away. They
pick one of five ready-made instructions **off a shelf**, fill in two or three
blanks, and switch it on. **When it fires it spends nothing**: it comes back with a
list of what it wants to write and what each line would cost, and the owner ticks
lines off and approves before a single credit moves.

> **This is a curated library, not a canvas.** The person is not authoring a rule.
> They pick a recipe and fill in its blanks. There is no node editor, no trigger
> builder and no condition language.

**Tabs / toggles:** none. Do not mistake the form inputs for view switches — the
checkboxes and dropdowns change what is **stored**, not what is **shown**.

**All five cards always render, in a fixed catalogue order, whether or not any are
switched on** — because *"a library that only showed what you had already chosen
would be a settings page"*.

#### The five recipes

Each card has three fixed rows labelled **When · Makes · Lands in**.

| Recipe | Group | When | Makes | Lands in |
|---|---|---|---|---|
| **The festival calendar** *(the only operable one)* | Calendar | *A festival or holiday your customers keep is coming up.* | *A draft tied to what you actually sell, not a stock greeting.* | *Your Planner, early enough to change your mind.* |
| **New article, new post** | Content | *Something new appears on a feed you follow — your own blog, an industry site.* | *A short post in your voice, with your take rather than a summary.* | *Your Planner as a draft.* |
| **New review, reply ready** | Reviews | *A review arrives on Google Business Profile.* | *A reply written for that review, in your voice, never sent on its own.* | *Your Inbox, as a draft reply you approve.* |
| **New product, small campaign** | Commerce | *You add a product, or a form on your site tells Sahoda one has landed.* | *A three-post run: the tease, the launch, the reminder.* | *A campaign, with the three posts grouped under it.* |
| **A quiet post, remade** | Content | *A post does clearly worse than your own recent average.* | *A handful of different angles on the same idea, through Remix.* | *Your Planner as drafts, for you to pick from.* |

**The four blocked cards render no control of any kind — no switch, no form, no
button, not even a disabled one.** Just the heading, the three rows, and one sentence
naming what they wait on. The stated reason: *"a disabled switch is a dead end in the
costume of a control."* The database enforces the same thing — those four cannot be
switched on at all.

Each names its own blocker, verbatim:
- *"a feed reader that is safe to point at any address you type, which is a piece of
  security work rather than a piece of drafting work"*
- *"a receiver that can hear a review or a comment arriving from a platform, which is
  being built separately"*
- *"somewhere for Sahoda to learn that a product exists — a catalogue connection or a
  form on your site"*
- *"the Remix engine, which turns one piece into many and is not merged yet"*

The operable card shows **On** / **Off** — and **Off** is also what shows when no
row exists at all.

#### The festival form
- **Which calendars** — *"Fixed-date observances only. The moving festivals are named
  below and are not covered."* Two checkboxes: **India** and **Global**, both
  pre-checked when nothing is stored.
- **Which channels** — *"Where the drafts are written for. Your Autonomy Dial still
  decides what happens to them."* Four checkboxes: Instagram, LinkedIn, X, Google
  Business. **This list is fixed in code and is not read from the workspace's
  connected accounts.**
- **Days of warning** — a number, minimum 1, maximum 30, defaulting to 7.
- **When it runs** — three options: *Only when I press Run* · *Every day* · *Every
  week*.
- **Run it now · 5 credits** — computed as the run price (2) plus one item (3). **The
  item half is 0 when the governing autonomy level is Suggest**, so the label then
  reads *Run it now · 2 credits*. Beside it: *"That price covers the run and one
  draft. If more than one festival falls inside your window the preview below will
  say so before anything is charged."*
- And a refusal stated plainly: *"Fixed dates only. Diwali, Holi, Eid al-Fitr, Eid
  al-Adha, Easter, Raksha Bandhan, Ganesh Chaturthi, Navratri and Dussehra move every
  year and Sahoda will not guess one, so they are not in this calendar yet."*

The twelve fixed dates it does know: New Year's Day · Republic Day · Valentine's Day
· International Women's Day · Earth Day · International Workers' Day · World
Environment Day · Independence Day · Gandhi Jayanti · Halloween · Christmas · New
Year's Eve.

#### The cost preview
Heading **"Before anything is spent"**, becoming **"Approved, and ready to run"**
once approved. Body: *"This is what the run found and what writing each one would
cost. Nothing has been charged. Uncheck anything you do not want."* → after approval:
*"You approved this list. Running it writes the drafts and charges what is shown."*

Each item: its title · its channels · its own credit figure. Totals: **Writing the
drafts** (a sum, recalculated as boxes are unticked) · **Running the playbook** (a
constant 2) · **Total** · and **"N dropped"**. A shortfall names **two** numbers: the
total needed and the spendable balance — total minus what other work in flight is
already holding.

#### Run history
Heading **"What your playbooks have done"**. Each run: the recipe's name · an ending
phrase mapped from seven statuses — **Finished** · **Found nothing in the window** ·
**Waiting for you to approve the cost** · **Working out what to make** · **Writing**
· **Stopped** · **Stopped on an error** · optionally *" · on its schedule"* · the
start date · and either *" · spent N credits"* or *" · nothing charged"*.

Each item within a run gets one of six phrases: *draft in your Planner* ·
*scheduled, waiting for your approval* · *suggestion only* · *dropped from the
preview* · *could not be written* · *proposed* — plus an **Open it** link when a post
exists.

#### What it cannot show
**No figure on this screen is windowed.** Nothing is over 7 days, 30 days or "this
month". Every number is a credit price from the config file, a sum of those prices, a
count of rows, or a date stored on a row. There is no success rate, no "posts
generated this month", and no forecast.

---

### `/loop` — The Loop  · NEW · the largest thing the reference has never seen

**BUILT — and the menu disagrees.**
**What the screen actually is:** fully wired. Five real reads on every page load,
buttons that charge real credits and call a real model, and a weekly scheduled job
behind it.
**What the menu claims:** *soon*. The rail shows the word **Soon**, and screen
readers hear *", not built yet"*.
**These disagree, and it is the most consequential of the three disagreements in
this product.** Design it as a real screen.

**Group:** Automate, first of two. Label *The Loop*, hint *"The weekly cycle, and
how much it may do alone"*.

**Header:** *The Loop* / *"A weekly cycle that plans, writes, tests and reports —
as far as you let it go on its own."*

**What a person does here.** Decides how much of next week's posting the product
may do without them, **one channel at a time**, and presses the button that makes it
think about the week. They read the priced list of what it proposes to write, cross
off anything they don't want, and **agree to the number before a single draft is
written**. If something goes wrong they come here to stop everything at once.

**Tabs / toggles:** none. One column, fixed order. The only thing that opens is a
collapsible block labelled **"What each level means"**, closed by default.

#### The seven steps

Heading *"One week, seven steps"*. Intro: *"The Loop runs the same seven steps every
week. You decide how far it gets on its own before it needs you — that is the dial
below."*

| # | Name | Its one line | What actually happens |
|---|---|---|---|
| 1 | **Collect** | *"Last week's numbers, unanswered messages, and anything Radar picked up."* | Reads the product's own measurement rows for a seven-day window. **Free.** Note: the description mentions messages and Radar; the code reads only post measurements. |
| 2 | **Reflect** | *"What that adds up to, written as learnings you can accept or reject."* | **Pure arithmetic — no model call at all.** Free. See the four floors below. |
| 3 | **Plan** | *"Briefs for the week ahead, put on the days and times that have worked."* | The one paid step before the halt. A model call that must return **exactly five briefs**. **20 credits.** |
| 4 | **Create** | *"Each brief becomes a draft, with a separate body for every channel."* | Reached only after a person approves. **3 credits per brief written.** |
| 5 | **Test** | *"Each draft is read by your Audience Twin before anyone else sees it."* | **UNVERIFIED as implemented.** No code path sets the `testing` state; the cycle moves from creating straight to staging. Treat the Twin as not yet running. |
| 6 | **Stage** | *"Where it lands depends on your dial: your Planner, your approvals, or the queue."* | The branch on the Autonomy Dial. |
| 7 | **Report** | *"Monday morning: what worked, what did not, and what Sahoda learned."* | Marks the cycle reported. The report itself lives on `/report`. |

Exactly one step can carry the word **Now**, derived from the cycle's state. When
there is no cycle, or it was cancelled or failed, **no step is marked**.

Closing sentence, which is the product's whole argument: *"Then it starts again —
and it starts from a Brand Brain that now knows what happened last week. That is
the part that makes it a loop rather than a schedule."*

> **The halt between step 3 and step 4 is deliberately not drawn as an eighth
> step.** The strip marks it on Plan instead.

#### Running the Loop

**Plan my week · 20 credits** — the number is read from the price list, not typed
into the button. Beneath it, **exactly one of four helper sentences**:

- *"Connect a channel first — Sahoda has nowhere to plan for."*
- *"The Loop is paused. Turn it back on to plan a week."*
- *"A cycle is already running for this week."*
- *"Stops at a cost preview. Nothing is written until you approve it."*

**Weekly budget** — a whole number the person types, **minimum 0, maximum 5,000**
(the same ceiling the database enforces), stepping by 10, defaulting to **150** when
no setting exists. It saves when the box loses focus. Out of range: *"Pick a weekly
budget between 0 and 5000 credits."*

**Schedule** — a button reading **Pause the Loop** or **Turn the Loop on**.

#### The cost preview — the halt

Shown at exactly one moment, and while it shows, the ordinary summary panel is
hidden and this sits above everything else.

Heading *"What this week will cost"*, with the side note *"Nothing has been spent
on these yet."* and the sentence *"Sahoda planned N posts. Uncheck any you do not
want and the total below follows. Nothing is written until you approve it."*

One row per brief: a model-written title · a body line · the channel names joined by
` · ` — **drawn only from channels the workspace has actually connected** · and a
per-row figure such as `3 cr`.

Totals: *"N posts to write"* (a sum, recalculated in the browser as boxes are
unticked) · *"Planning this week, already charged"* (always 20) · *"The week, in
total"* · *"Your weekly budget"* — **and that last row is omitted entirely when no
budget is set**, rather than showing a dash.

Over budget: *"This is N credits over your weekly budget. Uncheck a post to fit, or
approve it anyway — the budget is yours to set."*

**Write this week · N credits** — and this is the structurally important part:

> **The number on the button is not a display. It is sent to the database, which
> recomputes the total from the rows itself and refuses if the two disagree**, saying
> *"The plan changed while you were looking — check the new total."* A second,
> independent gate sits in front of the writing step and refuses unless approval is
> actually recorded: *"Approve the cost preview first — nothing has been spent."*

Untick everything and the button is disabled beside: *"Keep at least one post, or
stop the Loop below."* A viewer is refused: *"Your role cannot approve spending."*

Afterwards the panel is replaced by **"This week is written"** and one of:
*"Nothing was written — every brief is on a channel set to suggest only."* or
*"Wrote N drafts for N credits."*

#### This week

Heading, one of four: **"This week was stopped"** · **"This week did not run"** ·
**"This week is done"** · **"This week is running"** — with *"Week N, YYYY"* beside
it. Then one of four body sentences:

- *"Sahoda has nowhere to plan for. Connect a channel and run it again. Nothing was
  charged."*
- *"Sahoda could not finish planning this week, and you were not charged for the
  part that failed."*
- *"You stopped this cycle. Anything it had written is still in your Planner."*
- *"Sahoda planned N posts for this week."*

Then a reflection line, one of two:
- *"It had nothing to reflect on — no post of yours has been measured yet, so there
  was nothing to learn from."*
- *"It read last week's numbers before planning."*

Then *"Spent this cycle"*, *"Weekly budget"* (omitted when empty), and — only when
the cycle is reported — a link *"Read the report for this week"*.

#### What Sahoda noticed

**The entire section is absent when there is nothing pending** — not an empty card.

Heading *"What Sahoda noticed"*, then: *"Each of these would change your Brand
Brain. None of them has. Accepting one writes a new version you can see in the
Brain; turning it down leaves the Brain exactly as it is."*

**At most three cards.** Each card's sentence is **generated by arithmetic, not by a
model**: *"Your {channel} posts reached {N}× what your {channel} posts reached."*
Under it, the evidence: *"From N posts over N days, measured by {metric}."*

**Reflect refuses to make a claim unless it clears four floors:** at least 3 posts
per side · at least 2 channels · at least a 25% gap · and the leading channel's
average at least 10. Anything it does emit is written as **pending** and never
applied.

When the evidence is missing, the card says *"This one did not record what it was
computed from."* — **zeroes are deliberately never printed here.**

Two buttons per card, both free and neither confirmed: **Add it to my Brain** →
*"Added to your Brand Brain."*, and **Not right** → *"Turned down. Your Brand Brain
is unchanged."*

#### The Autonomy Dial — one setting per channel

Heading *"How much it does without asking"*, then: *"One setting per channel. You
can have Sahoda draft for Instagram and publish for Google Business Profile — they
do not have to move together."*

One card per **connected** channel. A channel with no saved setting reads *"Not set
— running at draft"*.

| Level | Name | What it says | What it needs | What it actually does |
|---|---|---|---|---|
| **L0** | `Suggest` | *"Sahoda brings you ideas and briefs. It writes nothing."* | *"Nothing. This is the quietest setting."* | Produces the brief and nothing else. **No draft is written and no credits are charged for that brief.** |
| **L1** | `Draft` | *"Sahoda writes full drafts and leaves them in your Planner."* | *"Nothing. Everything still waits for you to open it."* | Writes a draft with **no scheduled time**. **This is the default.** |
| **L2** | `Approve to publish` | *"Sahoda schedules the week and publishes each post once you approve it."* | *"Your approval, before the slot passes. Anything you leave expires rather than going out."* | Writes an approved post with a scheduled time — the state the sending job looks for. |
| **L3** | `Autopilot` | *"Sahoda publishes without asking, inside the limits you set."* | *"Not built. Publishing to your accounts with nobody watching is a different risk from everything above it, and Sahoda will not offer it until a person has walked the whole cycle first."* | **Cannot be selected.** |

**L3 is refused in three separate places**, which is why it should be designed as a
statement and never as a control:

1. The list of accepted values in code holds only 0, 1 and 2.
2. **A database constraint — `loop_channel_autonomy_level_check`, defined as
   `CHECK (level >= 0 AND level <= 2)`. MEASURED directly against the production
   database.** A level 3 is physically unstorable.
3. The screen renders it as **prose with a padlock and the appended words "— not
   available"**, deliberately *not* as a disabled button, so a screen-reader user is
   never offered a control that does nothing. **It appears only inside the "What each
   level means" block — never in the per-channel picker.**

If a level 3 somehow reaches the save anyway: *"Autopilot is not built yet. Sahoda
will not publish without asking."*

> **How a brief with several channels resolves: by the lowest level among them.** A
> brief on Instagram-at-L2 and LinkedIn-at-L0 is treated as L0 and nothing is
> written. A channel with no saved setting counts as L1.

#### The kill switch

The last panel, headed **"Stop everything"**: *"Takes every post the Loop scheduled
off the calendar and pauses it. Your drafts stay in the Planner — nothing is
deleted."*

**It asks first.** Dialog *"Stop the Loop?"* / *"Every post the Loop scheduled comes
off the calendar and goes back to being a draft. Nothing is deleted and nothing is
published. The Loop stops planning until you turn it back on."* Buttons: **Stop the
Loop** and **Leave it running**.

In one transaction it cancels every unfinished cycle, returns the affected posts to
draft with their times cleared, returns their channel rows to pending, marks the
briefs skipped, and pauses the Loop. **Anything already published or already sending
is left untouched.** Reserved-but-unspent credits are handed back afterwards.

**It scopes its work through the brief-to-post link rather than through the post's
own origin**, specifically so a post a person made themselves is not swept up.

The result sentence is assembled from counts the database returns: *"1 cycle
stopped, 5 posts taken off the calendar. The Loop is paused."* — with *"N reserved
credits released"* inserted only when that is not zero. **Zeroes are reported as
zeroes.**

#### The ten states a cycle can be in

`collecting` · `reflecting` · `planning` · **`awaiting_cost_approval`** (the halt) ·
`creating` · `testing` · `staging` · `reported` · `cancelled` · `failed`.

Three are treated as over: reported, cancelled, failed. **`testing` is never set by
any code path** — see step 5. Only one live cycle can exist per workspace per week,
and the rule deliberately ignores cancelled and failed ones **so that pressing the
kill switch does not lock the customer out of the rest of the week**.

A brief separately carries one of six states — `planned` · `suggested` · `drafted` ·
`awaiting_approval` · `skipped` · `failed` — and **none of those six words appears
anywhere on this screen.** They are stored and never rendered.

#### How a cycle starts

**Both ways**, and which one is recorded.

- **Manually**, from the button on this screen.
- **On a schedule**: 21:00 UTC every Sunday, planning *next* week rather than the
  week that just ended.

**The scheduled run is off unless deliberately switched on**, by a setting that must
equal exactly the text `on` — any typo leaves it off. Whether it is on in production
is **UNVERIFIED**. Even when on, it only touches workspaces that already have a
settings row and are not paused, so **a workspace that has never opened this screen
is skipped entirely — turning the Loop on is an act with a row behind it.**

#### What it cannot show
A per-brief state word · a history of past cycles (only the most recent is read) ·
any predicted result of the week · a Twin score.

---

### `/inbox` and its four sub-screens — Inbox  · NEW (was "Conversations")

`/inbox` · `/inbox/comments` · `/inbox/comments/{account}/{post}` ·
`/inbox/threads/{account}/{conversation}` · `/inbox/reviews`

**BUILT.** Menu says live. They agree — **and the parts that have never been exercised
are stated on the screen rather than hidden.**
**Group:** Customers, first. Label *Inbox*, hint *"Comments, messages and reviews"*.
**One of the four phone bottom-bar tabs.**

**What a person does here.** Sees who has spoken to the shop — a direct message, a
comment under a post, a star rating — and writes back **without opening Instagram,
Facebook or Google separately**. On a conversation they read the exchange in order and
type a reply, **but only while the platform still permits one; when it does not, the
screen says so before they write anything.**

#### The three-column frame
Every route is: **list · thread · customer**. The right-hand column is present on every
route and contains **one constant sentence and nothing else**: *"Open something from
the list and what Sahoda knows about that person appears here."* **No customer data of
any kind is fetched for it.**

#### Tabs
A tab bar on all five routes, labelled *"Inbox sections"*: **Messages · Comments ·
Reviews**. Messages stays marked current on a thread; Comments stays current on a
post's comments.

Inside `/inbox` only: a search field (*"Search conversations…"*) that filters rows
already on the page and **sends no new request**, and channel chips beginning with
**All** — **which render only when more than one channel is present.**

**No sort control, no status filter and no unread-only toggle anywhere.**

#### Where the data comes from — and this is unusual
- **`/inbox` reads the product's own store first**, then adds a live call to the
  publishing partner as *history*, **given two seconds before it is abandoned**.
- **The other four are live-only.**

**Two things are wired and have never been exercised, and the product says so:**
**reviews have never returned a single row** (no Google Business Profile has ever
connected), and **no reply of any kind has ever been accepted** from this codebase.

#### The reply window — the most distinctive thing on this screen

Above the composer sits a badge with one of five exact labels: **Replies open ·
Tagged replies only · Template only · Replies closed · Window not known** — computed
from the platform plus **the timestamp of the newest *incoming* message**, against the
current time. Beside it, *"Closes {date} IST"* or *"Narrows {date} IST"*.

And a sentence explaining it, verbatim:

- *"Replies are open — {platform} allows a free-form reply for 24 hours after the
  customer's last message."*
- *"WhatsApp closed the 24-hour service window on this thread. Only a pre-approved
  template message can be sent until the customer writes again."*
- *"The 7-day HUMAN_AGENT window on this {platform} thread has lapsed. The customer
  needs to write again before a reply is possible."*
- *"{platform} closed the free-form reply window 24 hours after the customer's last
  message. Only a {TAG}-tagged reply is allowed from here."*
- *"{platform} closed the free-form reply window 24 hours after the customer's last
  message. A reply now has to carry one of its message tags."*
- *"Sahoda does not model a reply window for {platform} yet."*
- *"Sahoda has not read this thread's messages yet, so the reply window is not known.
  Open the thread to check."*
- *"This thread's last message has no readable timestamp, so the reply window is not
  known."*

The real numbers: **free-form is 24 hours on all three modelled platforms**; the
`HUMAN_AGENT` tag lasts **168 hours**; the other tags are untimed. **Instagram has one
tag; Facebook has four; WhatsApp has none and falls back to templates.**

**The window is re-checked at the moment of sending, not only when the page loaded.** A
page left open past the boundary still shows a live-looking box, and the send is
refused with the window sentence.

#### Replying
- **A direct message** — field **Reply**, placeholder *"Write a reply"* or, when it
  cannot send, *"Replying is not available on this thread"*. Three rows, not resizable.
  **No character limit exists anywhere on this field.** When the free-form window has
  lapsed but tags remain, a tag chooser appears labelled **Message tag** under this
  sentence: *"The free-form window has closed, so this reply has to declare why it is
  allowed. **Choose the one that is actually true — the platform audits these.**"* The
  button reads **Send reply**, or **Send tagged reply**, or *Sending…*.
- **A comment** — collapsed by default behind a **Reply** trigger, then **Your reply**
  / **Send reply** / **Cancel**. The trigger is disabled when the partner explicitly
  says the comment cannot be replied to; **a missing permission is treated as unknown
  and the control stays enabled.**
- **A review** — the same control, and **the trigger is disabled when a reply already
  exists, because Google keeps exactly one reply per review and a second would
  overwrite the first.**

**Nothing in the inbox costs credits.**

#### Every refusal, verbatim
*"Sent. The platform's id for this reply is {id}."* — **and the typed text is cleared
only here.**

*"Write a reply before sending it."* · *"{TAG} is not available on this {platform}
thread."* · *"That is not a message tag Sahoda knows."* · *"Sahoda could not tell which
platform this thread belongs to, so it will not send a reply it cannot check the rules
for. Reply from the platform's own app."* · *"Sahoda could not reach the platform to
send that reply. Try again in a moment."* · *"Replying is not available right now. Try
again shortly."*

**And the one that is a warning rather than an error, and must not invite a retry:**
*"Sahoda could not confirm this reply was delivered — the platform did not return an id
for it. **Check the conversation on the platform before sending again.**"*

#### States — two separate vocabularies, and they share no sentences

> **This is the single most important structural fact about the inbox. `/inbox` speaks
> the store's vocabulary; the other four speak the live-read vocabulary. "Nothing here
> yet" is literally a different sentence on `/inbox` than on `/inbox/comments`.**

**Vocabulary A — the live read** (Comments, Reviews, and both detail routes). Ten
heading/body pairs from eight internal state names. Each sentence takes two blanks:

| Surface | its noun | what has to be connected |
|---|---|---|
| Messages | *conversations* | *an Instagram, Facebook or WhatsApp account is connected* |
| Comments | *comments* | *an Instagram or Facebook account is connected* |
| Reviews | *reviews* | *a Google Business Profile is connected* |
| one thread | *messages* | *an Instagram, Facebook or WhatsApp account is connected* |

1. **Not configured** — *"Sahoda has not read your {noun} yet"* / *"The connection to
   our publishing partner is not configured in this environment, so no request went
   out. This is not a reading of your {noun}."*
2. **Never connected** — *"Connect an account to see {noun} here"* / *"Sahoda has not
   asked any account for this workspace, so it has nothing to show yet — this is not a
   reading of your {noun}. Your {noun} appear here once {connect}."* **This is the only
   state that offers a button.**
3. **Could not ask** — *"Sahoda could not reach your connected accounts"* / *"The
   request went out but came back without an answer, so this is not a reading of your
   {noun}. Nothing was charged. Refresh to try again."*
4. **Could not ask, with a count** — *"Sahoda could not reach 3 connected accounts"*,
   same body.
5. **Could not resolve** — *"Sahoda could not resolve your connected accounts"* /
   *"This workspace has 2 connected accounts for {noun}, but our publishing partner did
   not recognise any of them and sent no request at all. This is not a reading of your
   {noun}. Reconnect the accounts to fix it."* **Deliberately not "nothing connected"
   and not "nothing there".**
6. **Cannot confirm completeness** — *"Sahoda could not confirm this {noun} view is
   complete"* / *"Sahoda cannot tell whether every connected account answered, so some
   {noun} may be missing from this list. Refresh to try again."* **Rows are still
   shown, under a warning strip.**
7. **Cannot confirm, more exists elsewhere** — same heading, different body: *"There is
   nothing on this page, but our publishing partner reports more to read. Refresh to
   try again."*
8. **Partial** — *"Showing part of your {noun}"* / *"2 of 5 connected accounts did not
   answer, so some {noun} may be missing from this list. Refresh to try again."*
9. **Genuinely empty** — *"No {noun} yet"* / *"Every account Sahoda asked answered, and
   there is nothing waiting. New {noun} land here automatically."* **This is the only
   sentence in the whole vocabulary that makes a claim about the customer's business.**
10. **Fine** — *"Showing your {noun}"* / *"Every account Sahoda asked answered."*

**Vocabulary B — the store**, used only on `/inbox`:

1. **The store could not be read** — checked before everything else, **so no later
   claim is allowed**: *"Sahoda could not read your conversations"* / *"This is not a
   reading of your conversations — the attempt itself failed. Try again in a moment."*
2. **Rows exist, history could not be fetched** — *"Showing your recent
   conversations"* / *"Older conversations live on the platform and could not be reached
   just now. Everything since Sahoda started listening is here."*
3. **Rows exist, all fine** — *"Showing your conversations"*, with no body at all.
4. **Nothing connected** — *"No conversations yet"* / *"Sahoda will show conversations
   here once an Instagram, Facebook or WhatsApp account is connected."*
5. **Connected, listening, nothing has ever arrived** — **the state this whole file
   exists for, and the state every workspace is in today**: *"Nothing has come through
   yet"* / *"Sahoda is listening, and new conversations will appear here as they
   arrive. This is not a reading of your conversations — it is what has reached Sahoda
   so far, which is nothing."*
6. **Events have arrived and none were conversations** — *"No conversations yet"* /
   *"Sahoda is listening and has been receiving updates — none of them
   conversations."*

**Note that 4 and 6 share a heading and differ entirely in body.**

#### Three columns, three weights of "nothing"
**The middle panel carries the heading, the explanation and the one button. The list
column and the customer column each get one quiet line and nothing else** — *"Nothing
read yet — see the panel beside this one."* Three columns each shouting "nothing" was
measured as reading like a broken screen.

And when the list has rows but none is open, the middle panel says: *"Pick a
conversation to read it and reply."* / *"Pick a post to read its comments."*

#### Phone and the middle band — three genuinely different layouts
- **1180px and up** — three columns side by side.
- **700–1179px** — **the customer column is removed entirely**, not collapsed and not
  moved. Two columns remain. **A back arrow appears in the detail panel header at these
  widths and only these**, because above 1180 the list is visible beside it.
- **Below 700px** — **exactly one of list or thread survives. They do not stack and
  they do not both appear.** Which one survives is decided per route: on the three
  lists, **the list when there is at least one row, and the middle panel when there are
  none** — because the middle panel is the one carrying the reason and the button. On
  the two detail routes, always the thread.

Also below 700px: the panes lose the page gutter and run edge to edge while the heading
and tab bar keep theirs; tabs get a 44px minimum tap height. **Each pane scrolls inside
itself at every width; the document never scrolls.** Nothing collapses into an
accordion, nothing becomes horizontally scrollable, and the tab bar wraps rather than
scrolling.

#### What it cannot show
**Order count and lifetime spend for the person** — there is no orders table and no
spend record, and showing *"Orders 0 · Lifetime ₹0"* would be a false statement · an AI
summary of the customer, a suggested reply, or that person's previous conversations ·
internal notes · **the total number of reviews and the average star rating — the
partner does send both and the product deliberately does not read them** · a
reply-window badge on a *list row*, because a window is measured from the newest
incoming message and a list only knows last activity in either direction — **which our
own reply advances** · a thread status, assignee or snooze time (the columns exist and
**no screen reads or writes them**) · a permalink for a comment, a review or a thread ·
**hide, delete or like a comment — the partner sends permission flags for all three and
there is no handler behind any of them, so they are not offered** · any count badge on
Comments or Reviews.

#### Gotchas
- **`/inbox/comments` is a list of POSTS, not of comments.** Posts with zero comments
  are filtered out, and opening a row is a **second, separate request**. A designer
  drawing "the comments inbox" as a flat list of comments is drawing something the data
  cannot produce in one step.
- **A locally stored conversation row currently cannot be opened** — the store keys a
  thread by conversation rather than by account, so half of its link is empty. Live
  history rows open normally. **UNVERIFIED at runtime.**

---

### `/connections` — Connections

**BUILT.** Menu says live. They agree.
**Group:** the bottom foot — *"the plumbing, pinned to the bottom of the rail"* — with
Wallet and Settings. Label *Connections*, hint *"Channels and accounts"*. **Not a
phone bottom-bar tab**; on a phone it is in the More sheet's final group, whose
screen-reader name is *"Account and setup"*.

**Header:** *Connections* / *"Connect the places you post, and see what each one can
do."*

**What a person does here.** Hooks up the places they actually post, so a post they
write can genuinely go out instead of sitting in a draft. They also come here when
something has stopped working — **a linked account whose access has run out, which is
why their scheduled posts quietly stopped** — and to find out what a channel will cost
them and whether their plan has room for one more.

**Tabs / toggles:** none. The two headed groups always both render and neither can be
collapsed.

#### Eight tiles, in two groups

**Connect now — all four genuinely connectable today:**
**Instagram · LinkedIn · X · Google Business Profile**

**Coming soon — none connectable, and none carries any control at all:**
**Facebook Pages · YouTube · Pinterest · Telegram**

**Those four cannot even be stored.** The four-value channel list is enforced by a
database constraint on **seven** tables, so a fifth channel is a migration, not a
feature flag.

Every tile carries the channel's mark, its name, and **what the channel is for** — one
of *Feed* · *Local listing* · *Short video* · *Boards* · *Broadcast*.

#### The readiness chip — a claim about Sahoda, not about the customer

Exactly three phrases, and this distinction is unusual enough to be worth preserving:

| Chip | Channels |
|---|---|
| **Publishes today** | Instagram, LinkedIn |
| **Not proven live** | X, Google Business Profile |
| **Coming soon** | the four planned ones |

> ***Not proven live* means the product has never successfully published to that
> channel in production** — not that the channel is broken. The assignments come from a
> one-off production measurement (Instagram 6 live successes, LinkedIn 1, X 0, GBP 0)
> and are **hand-maintained constants; no query re-derives them at render time.**

Below the dividing line, a connectable tile shows one of three things: **Connected** ·
**Needs you** · or the plain words **Not connected**. Plus **"{N}d left"** when the
connection is healthy and an expiry is stored, and the account's own handle — or, when
none came back, the literal words **Connected account**.

**A "Coming soon" tile shows one sentence and nothing else: *"Sahoda can't post here
yet."* — deliberately not "Not connected",** because the person has done nothing wrong
and there is nothing for them to do.

The **Connect now** heading carries *"{N} of 4 connected"*. **The Coming soon heading
deliberately carries no count.**

#### The health banner
Appears only when a stored connection is in trouble. Headed *"A channel needs
attention"* or *"Channels need attention"*, then one line per account, **ordered worst
first**:

- *"Reconnect {Channel} — {reason}."* — where the reason is the platform's own words
- *"Reconnect {Channel} to keep posting."* — when no reason was given
- *"Reconnect {Channel} — its access has run out and scheduled posts will not go out."*
- *"Reconnect {Channel} today — access ends tomorrow."*
- *"Reconnect {Channel} within {N} days — access ends then."* — from 2 to 7 days

And always, as the last line: *"Scheduled posts on a channel that has run out will not
go out."*

> **The expiry countdown is a real number and it matters.** The publishing partner
> issues 60-day access with **no automatic renewal and no warning signal** — so the
> product computes the countdown itself, and it is refreshed by a background sweep
> that is **off by default**. See the machine-routes entry.

#### The plan gate
One sentence, built from the plan catalogue and a live count: *"Your Free plan
includes 2 channels and you're using 2. Starter includes 4."*

Channel allowances: **Free 2 · Starter 4 · Growth 8 · Agency 8**. The "using" figure
counts **every** stored connection, **whether or not the account still works**. The
recommended upgrade is the cheapest plan with room for one more.

#### The X spend meter — unique in the product

**On the X tile only, whether or not X is connected**, and absent entirely when there
is no workspace:

> **X posts this month** — *"{used} of 12"*
>
> *"{remaining} left. **X bills Sahoda $0.015 a post, and $0.20 when it carries a link,
> so this allowance is ours rather than X's.**"*
>
> and at zero: *"None left this month. **Sahoda holds the rest until the month turns
> rather than spending on them.**"*

**The 12 is Sahoda's own policy number, not the platform's**, and the screen says so.
The count is of real live successes in the current calendar month, in UTC.

#### Actions
**Nothing here costs credits.**

- **Connect {short name}** — sends the whole browser away to the partner's own consent
  screen. **The person leaves Sahoda entirely, and the partner — not Sahoda — holds the
  resulting credential.** The label becomes *"Opening {name}…"* while waiting. No
  confirmation.
- **Reconnect {short name}** — the same trip to the same place. **There is no
  "refresh"**: the partner's access lasts 60 days with no renewal, so reconnecting
  means consenting again from scratch. **Nothing is deleted first** — the same account
  lands back on the same row with a fresh expiry.
- **Disconnect** — **the only control on this screen that asks for confirmation**, and
  it does so as a **two-step in-place change rather than a dialog**. The armed button
  reads **Confirm disconnect**, and **the armed state disarms itself after 8 seconds**.
  Deleting the connection removes the sealed credentials with it — **this is the only
  way the app can make them disappear.**

When the button is unavailable it is a real unavailable button with an explanation
under it: *"Your plan has no room for another channel."* or *"Publishing key isn't set
in this environment."*

#### States
- **The return trip from the consent screen** has five outcomes, each with its own
  pair of sentences: **Connected** · **Some accounts didn't finish connecting** ·
  **That connection didn't finish** · **Your plan is full** · **Nothing new to
  connect** (*"No new account came back from the platform — you may have closed its
  screen before approving."*). **An unrecognised value renders nothing at all**, and a
  second technical parameter is deliberately never displayed — it exists only for
  whoever reads the server logs.
- **A failed return trip** has its own fallback page, titled *"Connection didn't
  finish"*, with either *"That connection didn't finish. Go back to Connections to try
  again."* or *"Some of your accounts connected and some didn't. The list on Connections
  shows which."*
- Every refusal is a sentence rather than a silent disabled state: *"Only an owner or
  editor can connect an account."* · *"This workspace is already linked to a different
  publishing profile."* · *"Connecting isn't available right now — the publishing key
  isn't set."*
- **Disconnect failure**: *"Couldn't disconnect this account — reload and try again."*

#### What it cannot show
Follower counts or any account statistic · what a channel has published · when it last
posted · a per-account spend other than X's · **whether a token will actually still
work** — only when it is scheduled to expire.

---

### `/settings`, `/settings/profile`, `/settings/integrations`, `/settings/plan`, and `/billing/checkout/{order}`

**BUILT** — with one clearly labelled unbuilt step inside checkout.
**Group:** the bottom foot. Label *Settings*, hint *"Workspace preferences"*.
**Only `/settings` is in the menu.** The other three exist only in the settings rail
inside the screen, and the checkout page is in no list at all.

**Wrapper:** *Settings* / *"Your workspace, and where everything else is configured."*

**The rail — four items, matched on an exact URL:** **Workspace · Profile ·
Integrations · Plan & credits**.

#### `/settings` — Workspace
- **Name** — *"What this workspace is called in the switcher."* Editable, max 80
  characters. **Save** stays unavailable until the box has actually changed. On
  success: *"Saved. The switcher now reads {name}."* — **and the row is re-read back as
  proof the write landed.**
- **Address** — *"Its stable identifier. Used in links and never reused."* Read-only,
  with no control beside it.

#### `/settings` — Your data
*"Take a copy of everything in this workspace, or ask for it to be deleted."*

**Download a copy**, described in one sentence that is worth quoting in full because it
is the product's honesty rule applied to a file:

> *"One JSON file: your posts and their per-channel wording, your Brand Brain, your
> conversations and enquiries, every credit movement, and how your posts performed.
> **The file also lists anything it could not include, and why — so you can tell an
> empty section from a missing one.**"*

**The file covers 30 tables: 29 included, and 1 named as excluded with its reason.**
Each is stamped with a plain-words description — *your posts · the per-channel wording
· your Brand Brain · your picture library · where each picture is used · your campaigns
· posts inside campaigns · your linked accounts · your credit balance · every credit
movement · conversations · messages and comments · enquiries from your site · changes to
your Brand Brain · your planner · pictures attached to posts · how your posts performed
· every publish attempt · your websites · the pages of your sites · the sections on
those pages · your plan · your saved templates · which tours you have seen · who is on
this workspace · your colours · the publishing profile id · credit top-up requests · a
record of admin actions*.

**The one excluded table names its own reason:** *"This table has no read policy for
members, so the app cannot read it on your behalf. **It is not empty — it simply cannot
be included from here.** Ask Sahoda for it directly."*

Each included table is capped at 5,000 rows, **and the file carries a per-table flag
saying whether that cap was hit.**

Afterwards: *"Saved sahoda-export-2026-08-22.json."* and a count — *"{n} things are
listed in the file as not included, with the reason."*, or **"Nothing was left out."**

**Delete everything** is deliberately not self-serve: *"Email support@sahodalabs.com
from the address you signed up with and ask for this workspace to be deleted. **It is
done by hand today, not self-serve.**"* Followed by a statement of what survives, and
why:

> *"Your posts, pictures, Brand Brain, conversations, enquiries and linked accounts are
> removed. **Your credit and payment record is kept — it is what proves what you paid
> and what you were charged, so it is not ours to erase.**"*

#### `/settings/profile`
Three rows and **no control at all**: **Email** (*"You sign in with this."*, or the
literal *Not recorded*) · **Name** (*"Shown on anything you approve."*, or *Not set*) ·
and **Password and sessions** — *"Managed by our sign-in provider. Open the avatar menu,
top right, to change either."*

#### `/settings/integrations`
One row per connection: the channel's name, its mark, and either **Connected** or
**Needs attention** — **and the three unhealthy stored values all collapse into those
same two words here.** Plus a permanent row, **Manage channels** — *"Connecting,
reconnecting and disconnecting all live on one screen."*

**No count is displayed on this tab** — no "3 connected", no limit, no "3 of 8".

#### `/settings/plan`

**Your plan** — the plan name, then a status word: **Active · Payment failed ·
Suspended · Closed**. *(Payment failed covers two underlying conditions.)* When a lapsed
account has dropped to a lower set of limits, the line appends *" · running on {plan}
limits"*.

**A workspace with no subscription record is treated as Free by contract, not as an
error.**

The price, then **Includes** — a list of allowances joined by ` · `. **An allowance of
zero is dropped from the line entirely rather than shown as "0 sites".**

| Plan | Price | Credits/month | Channels | Sites | Seats |
|---|---|---|---|---|---|
| **Free** | ₹0 — *free, forever* | 100 | 2 | 0 *(omitted)* | 1 |
| **Starter** | ₹499 a month | 1,500 | 4 | 1 | 1 |
| **Growth** | ₹1,499 a month | 5,000 | 8 | 3 | 3 |
| **Agency** | ₹3,999 a month | 15,000 | 8 | 10 | 10 |

**Each plan also carries an autonomy level and a persona count that are never displayed
anywhere** — and the autonomy levels are where the plan catalogue and the database
disagree (§11).

Then **Renews** or **Ends**, and — only when a payment has failed — **Closes** / **Plan
stops applying** / **Card tried again**, each computed from a real timestamp plus a fixed
offset. **The failed-payment notice carries a mark that is literal rendered text — one
exclamation mark at the two payment-failed stages, two at suspended and closed.**

**Change plan** — four tiles. **Picking one is what makes the cost preview appear at
all; nothing is shown before a pick**, and picking a different one replaces it.

**The cost preview**, labelled *"If you make this change"*, and **every figure is
computed on the server, nothing in the browser**:

- *"{Plan} for the rest of this month: ₹{amount}."*
- *"Less the ₹{amount} of {Plan} you have already paid for and will not use."* — **only
  when there is unused value to set off**
- *"Nothing to pay today."* or *"You pay ₹{amount} today, then ₹{amount} a month."*
- *"{n} credits land as soon as the payment clears."* — **only when credits would be
  granted**
- Moving down: *"You keep {Plan} until {date}, with everything it includes."* and
  *"{Plan} starts on {date}. **Nothing is charged today and nothing is refunded — you
  have already paid for this month and you keep all of it.**"*
- *"You are already on {Plan}."*

**And when the workspace holds more than the target plan allows**, a line beginning
*"What you keep."* with real counts in the shape *"5 of 3 channels"*, **taken by
counting the actual rows at the moment the preview is built**, then:

> *"**Nothing is removed** — every channel, site and post stays exactly where it is. You
> just cannot add more until you are back under the limit."*

A scheduled change reads *"Moving to {Plan} on {date}. Until then you keep everything
you have now."*

**Invoices** — a table of up to 24, newest first. Columns **Issued · Document · Number ·
Amount**. The Document cell is two lines: one of *Tax invoice* · *Credit note (refund)*
· *Credit note (chargeback)*, then the tax split and place — *CGST + SGST at 18%* ·
*IGST at 18%* · *Zero-rated export* — joined by ` · `. **A credit note prints with a
leading minus sign.**

**Billing details** — and the note above them is a real constraint on the design:

> *"These go on every invoice Sahoda issues from now on. **Invoices already issued do
> not change — a tax invoice cannot be edited, and a correction is a separate credit
> note.**"*

**Where your business is registered** is a three-way choice that **swaps which single
extra field is shown — and the other two are removed from the page entirely, not
disabled**:

| Choice | The field it reveals |
|---|---|
| *A business in India with a GSTIN* | **GSTIN** — max 15 characters, forced upper case, placeholder *"15 characters"*, under the hint *"Sahoda reads your state from the GSTIN, so the invoice charges the right tax and you can claim it back."* |
| *A business or person in India without a GSTIN* | **State** — a dropdown of **38 entries**, first option *"Choose a state"* |
| *Outside India* | **Country** — two letters, forced upper case, placeholder *"Two-letter country code, e.g. US"* |

Plus **Legal name** (*"The name the invoice should be made out to"*) and **Address**
(*"Optional"*).

**Credits** — **Available** (total minus held, **clamped so it can never be negative**,
and an em dash when it could not be read) · **Held**, shown only when above zero, under
*"Reserved by actions in progress. Returned in full if they do not complete."* · and
**Activity and top-ups**, *"Every entry, what it was for, and what it cost."*

#### `/billing/checkout/{order}`

*Checkout* / *"Your order is open"*, then **Order · Plan · Amount · Status**.

- **Amount is never invented** — it comes either from the order's own prorated figure or
  from the catalogue price, **and when neither is readable the row is not rendered at
  all.**
- **Status prints the payment provider's own raw word, unchanged and unmapped** to any
  Sahoda status name.

And then the labelled unbuilt step, verbatim:

> **"The payment step is not connected yet"**
> *"Your order exists and nothing has been charged. Sahoda cannot collect the payment
> from this page yet, so no credits have been added and none will be until a payment
> actually completes."*

**What it waits on:** the payment collection step. In this deployment, the two payment
credentials hold the identical value and a real order creation is refused, **so no order
can be opened from here at all.**

#### Actions
**Nothing on any of these five routes costs credits, and nothing asks for a confirmation
step of any kind — including scheduling a plan downgrade.**

#### What it cannot show
Usage against any allowance on the Integrations tab · a team-member list or an invite
flow **(seats are a plan number with no screen behind them)** · a notification
preference · a language or timezone setting · a self-serve delete.

---

### `/onboarding` — the rebuilt first run  · NEW (completely rebuilt)

**BUILT.** **Not in the menu.** It is where a new account is sent after a workspace
exists, and it is linked from the Brand Brain when there is no brain yet.

> **A warning for anyone reading the code: there are two onboarding trees in the
> repository and only one is live.** The route renders the **stage** flow described
> below. An older four-screen flow — *You · The door · One question · Reveal* — is still
> present as dead code and is **not** what a customer sees.

**Nine screens in order: an intro, six numbered steps, an optional rivals step, and a
result.** The progress counter reads *"01 — 06"*; **on the rivals step it holds at 06
and goes full width rather than inventing an "07"**, and it is absent on the intro and
the result.

Beside the steps, on the right, is **an orb receipt**: a label naming what was just
taken in — *Brand name · Website · Positioning · Category · Audience · Logo · Brand
colour · Guidelines · Reference · Taste · Knowledge · Competitor*, or *Learned* when
nothing matches — over a signal count. **It appears only when a new signal arrives and
disappears after 2.6 seconds.**

#### The intro
**First run:** eyebrow *"Sahoda Brand Brain"*, heading *"Let's teach Sahoda your
brand."*, body *"Give us a little context. We'll turn it into a Brand Brain that
understands what your business does, who it is for and how it looks."* Buttons **Build
my Brand Brain** and **I'll do this later**. Footnote: *"Takes about three minutes. You
can stop and come back."* followed by **either** *"Building it is free the first
time."* **or** *"Rebuilding it uses 50 credits, shown again before you spend them."* —
**and the server decides which, because a client that can say "free" would say it every
time.**

**Returning:** *"Your Brand Brain is ready."* / *"Sahoda already has one for {workspace}.
Open it to read or change what it knows — nothing to rebuild and nothing to spend."*
Buttons **Review Brand Brain** and **Build a new one**, under *"Building a new one uses
50 credits and replaces what is there."*

#### The six steps

**01 — Brand basics.** *"What's your brand called?"* Two fields: **Brand name**
(required, placeholder *Sahoda Labs*) and **Website** (optional, placeholder
*https://yourbrand.com (optional)*). At two characters a line appears: *"Nice. Let's
understand what {name} means beyond the logo."*

**02 — Positioning.** *"What does your brand actually do?"* A multi-line box,
placeholder *"Tell us like you're explaining it to a smart friend."* Then **Closest
fit** — six single-choice chips: **SaaS · E-commerce · Agency · Creator · Local business
· Other**. **Pressing the chosen chip again clears it.** On choosing: *"Got it —
{chip}. I'll weight channels and formats that actually work for that."* Continue needs
**either** the box **or** a chip.

**03 — Audience.** *"Who are you trying to reach?"* One required field, **Ideal
customer**. Then a disclosure — *"Want to tell us more?"* — opening **Age range ·
Location · Role or title · Interests**. **That disclosure does not exist at all until
the audience answer reaches three characters**, or one of the four already has a value.
On answering: *"Noted. Everything I write will be aimed at {answer} — not at
everyone."*

**04 — Visual identity.** *"Let's make sure Sahoda sees your brand the way you do."*
A logo drop area (*PNG · SVG · JPG*) that **only takes an image**, showing the file
name and *"Click to replace"* once taken. Then **Brand colours** — three pickers,
**Primary · Secondary · Background** — and a second drop area for **brand guidelines**
(*Optional · PDF · PPT · DOCX · ZIP · Images*, multiple files, each listed with its
name and size). **Nothing here is required.**

**05 — References.** *"Show us what "good" looks like."* / *"Websites, Instagram
accounts, Pinterest boards, competitors — anything you admire."* Paste a URL and press
Enter; **an identical repeat is silently dropped.** Each card names what it is — one of
*Instagram account · Pinterest board · Design reference · TikTok account · YouTube
channel · LinkedIn page · Website* — followed by *"· queued for analysis"*, with a
remove control. Plus a note field, *"What do you like about these?"*

**06 — Knowledge.** *"What should your AI already know?"* / *"Tell Sahoda where your
brand knowledge lives. **It is recorded on your Brand Brain now and read when that
source is connected.**"* Eight multi-select tiles: **Website** *(Crawl your pages)* ·
**Instagram** *(Read your posts)* · **Brand guidelines** *(Use uploaded files)* ·
**Product catalog** *(Names, prices, copy)* · **Notion** *(Selected pages)* · **Google
Drive** *(Selected folders)* · **Shopify** *(Products and orders)* · **Manual upload**
*(PDFs and docs)*.

> **A selected tile's sub-line becomes "Queued". It never says "Connected", because
> nothing is connected here.**

**The rivals step** — eyebrow **Optional**. *"Want Sahoda to understand your market
too?"* / *"Entirely optional. It sharpens positioning, but your Brand Brain works
without it."* Add competitors by pressing Enter; each card reads *"Competitor · tracked
for positioning"*. **There is no remove control on these cards.**

#### The door — reading the business, invisibly

**It runs the moment the person leaves step 01, in the background, while they answer
steps 02 to 06. It is never blocking, and nothing about it is shown while it runs.**
Going back and changing the address starts a new read; an unchanged address is not
re-read.

**From this screen it can submit a website address and nothing else.** The endpoint
itself also accepts a PDF and a typed sentence, **and neither path is reachable from
here today.**

**A social handle is not accepted.** Anything with a space, anything that is not
http/https, and any host without a dot is rejected **before any request is made**.

Measured production timings recorded in the code: **half of reads finish in 26.3
seconds, nine in ten within 37.0 seconds.**

**The server streams a sentence for each stage it completes — and this screen throws
all of them away**, keeping only the final answer. The outcome surfaces in one cell on
the result card, plus a sentence above it when it failed.

#### The signal count — how it is actually derived

**It is not a running tally. It is recomputed from the answers every time they change,
so clearing an answer removes its signal.** One signal for each of: a brand name of 2+
characters · a website of more than 4 characters (**with no check that it is a valid
link**) · a positioning sentence of more than 12 characters · a category chip · an
audience of 3+ characters · each of the four optional audience fields · a logo file ·
**one per colour swatch the person actually moved — an untouched default never counts**
· one per guidelines file · one per reference · the taste note · one per knowledge tile
· one per competitor.

#### The build — a paid overlay, not a step

**Build my Brand Brain** costs **50 credits — except that it is free when this
workspace has no Brand Brain yet.** **No confirmation dialog; the cost was stated on the
intro.**

> **"Skip for now", the other button on that row, calls exactly the same thing.
> Nothing is skipped and the same 50-credit action runs.** That is a real trap in the
> current design.

It waits up to **45 seconds** for the background website read, then runs the model. **A
credit hold is placed and debited only on a genuine result** — an error or a sample
releases the hold and charges nothing. **It writes nothing to the database at this
point.**

The overlay: *"Sahoda Intelligence"* / *"Building your Brand Brain."* / *"Sahoda is
turning everything you shared into a living brand intelligence system."* with a status
line rotating through six sentences — *Understanding your positioning · Mapping your
audience · Reading your visual identity · Organising your brand knowledge · Building
your creative guidelines · Connecting everything together* — **or a seventh, "Reading
your website", if the site read has not landed.** **No percentage is shown anywhere on
this overlay, deliberately.**

#### The result card

Headed *"Sahoda Brand Brain"* with a **Ready** marker, then *"Complete"* / *"Your Brand
Brain is ready."* / *"Sahoda now understands your brand, what you do, who you sell to
and how you look."*

| Cell | What it shows |
|---|---|
| **Brand** | what was typed, or `—` |
| **Category** | the chip, or `—` |
| **Audience** | what was typed, or `—` |
| **Website** | **one of five values**: *Not given* · *Reading* · the site's host · *"{what they typed} · not read"* · *"{what they typed} · read did not run"* |
| **Primary** | the primary colour as a hex string — **always rendered, even when nobody opened the picker** |
| **Knowledge** | a count of tiles plus files: *"{n} sources"*, or **None yet** |
| **References** | *"{n} queued"*, or **None yet** |
| **Confidence** | a bar and one of three words — **High · Medium · Getting started**. **The percentage behind it is never printed.** |

Then **"What Sahoda learned"** — composed only from what was actually given, **and a
sentence whose ingredient is missing is dropped entirely**:

- *"What you do: {positioning}."*
- *"You speak to {audience}[ in {location}]."*
- *"I'll plan for a {category} business."*
- *"I read {host} and kept what it says about you, in its own words."*
- *"I have {n} knowledge sources to draw on[, plus {n} references to study]."*
- **and always last, on every workspace**: *"I have not settled on a tone of voice yet
  — set that in Brand Brain and everything I write follows it."*

#### Saving
**Enter Sahoda** is what actually writes. It writes the workspace theme **only when
there are colours to save** — the two the person moved, or failing that the ones the
site declared, and **if neither exists no theme is written at all** — then writes the
Brand Brain as a new version, clears the saved answers from the browser, and goes to
Home. **Review Brand Brain** does the identical save and goes to the Brand Brain
instead.

**Save & exit** is on every step and saves the answers to the browser. So does **I'll
do this later**. Keyboard: Escape saves and exits, Alt+Left goes back, Enter advances —
**except inside the positioning box, where it types a newline, and inside the reference
and competitor fields, where it adds a card.**

#### States

**No workspace** — *"Make a workspace first"* / *"Your Brand Brain belongs to a
workspace, so there has to be one to put it in. This takes a second and costs
nothing."*

**Nothing is shown while the website read runs.** No spinner, no stage text, no
sentence. Its only in-progress appearance is the word **Reading** in one result cell.

**The build failed** — the overlay becomes *"Your Brand Brain was not built."* /
*"Everything you entered is still here. Nothing was charged."*, with one specific
reason, **Back to my answers** always, and **Try again only where retrying can work**.
*"Not enough credits to resolve your Brand Brain."* is offered **no Try again at all**.

**A sample was shown instead** — the build succeeds and a sentence sits above the
result: *"Showing a sample Brand Brain — the model could not be reached, so nothing was
charged. Retry to resolve yours."*

**The website read reached a verdict about the page** — one of, and each is a genuine
statement about the site:
- *"Check that website address — we could not read it as a link. Or tell us in your own
  words instead."*
- *"Your site loads its text with JavaScript, so we could not read it — tell us in your
  own words instead."*
- *"Could not reach that website — check the address, or tell us in your own words
  instead."*
- *"Read {n} pages, but there was not enough writing to learn your voice — tell us in
  your own words instead."*

**The read never reached a verdict** — a separate family, **and these deliberately
never say the site was unreadable**:
- *"The request did not reach Sahoda, so your website was never opened. **This is not a
  verdict on the site** — it will be tried again when you build."*
- *"The connection dropped while Sahoda was reading your website, so it has no verdict
  about the page either way."*
- *"Your sign-in expired before Sahoda could start reading. **Nothing about your link or
  PDF was the problem.**"*
- *"That upload was too large to reach Sahoda, so it was never opened."*
- *"Too many reads in a row, so this one was turned away before your link or PDF was
  opened. Wait a minute…"*

**The read was still running when the build finished** — *"Sahoda was still reading
your website when this was built, so it was built without it. That is not a verdict on
your site — open Brand Brain to add what it says."* **No retry is offered.**

#### What exists at the end
**A workspace with a Brand Brain whose fifteen fields are filled and, mostly,
unconfirmed** — which is what `/brain/resolve` exists to work through. **Not a
connected channel, and not a first post.**

#### Gotchas
- **Signing up does not create a workspace**, so the true first screen a new account
  sees is the no-workspace state on `/home`.
- **"Skip for now" runs the paid build.** See above.
- **Two of the failure sentences tell the person to "press Read this" — a button that
  does not exist anywhere in this flow.**
- **Nothing on the Knowledge step connects anything.** It records an intention.

---

### The five screens outside the app — `/`, `/sign-in`, `/sign-up`, `/embed/beta`, `/design-system`

**None is in the menu, and none renders the product's navigation shell at all** — no
rail, no top bar, no phone bottom bar.

#### `/` — a redirect, and nothing else
**There is no marketing page anywhere in this product.** A person who types the bare
address is forwarded to sign-in if signed out, or to Home if signed in.

#### `/sign-in` and `/sign-up`
**The working part is not ours.** Each page is a frame — the product's mark and **one
sentence** — around a card supplied by the identity service.

The sentence, verbatim, and it is the only piece of positioning copy anywhere in the
product:

> **"The marketing team that runs itself, and asks before it spends."**

**The identity service's own heading and mark are deliberately suppressed**, because it
draws *"Sign in to SAHODA LABS"* and *"Welcome back! Please sign in to continue"*, which
would have put the brand on screen twice in two voices.

**Three parts of the card are styled by the product, which tells you which parts
exist**: a form field, a primary button, and a social-provider button. **The exact field
list and the social providers offered are UNVERIFIED** — they are configuration in the
identity service, not in this repository.

**No number of any kind appears on these screens.**

#### `/embed/beta` — the beta application form
An embeddable form for someone else's web page. **It performs the only genuinely public
write in the application.**

*"Request early access"* / *"Tell us where to reach you and we'll be in touch."*

Four fields with real limits: **Your name** (120) · **Business name** (160) · **Email**
(254, must be valid) · **Phone** (20 in the field; the server additionally requires 7–20
characters drawn only from digits, spaces, `+`, `(`, `)` and `-`, **with between 7 and
15 actual digits**).

Plus **a hidden fifth field labelled "Website"** — a bot trap, hidden from sight, from
screen readers and from keyboard order. **Anything in it fails the submission, and it is
never stored.** And a captcha challenge, **which appears only when a site key is
configured**.

The address bar can carry a source marker. **It is never shown to the visitor** and is
stored with the application.

**No number appears on this screen. Nothing links away from the form.**

#### `/design-system` — the team's own reference, and worth your time

**Not a customer screen.** It renders **the real interface parts and the real token
file**, in every state they ship with, so the rules can be checked against what the
product actually draws. **It is public because it reads no customer data.**

It has exactly one working control: a button reading **"View in greyscale"**, and once
pressed **"Restore colour"** — *"Toggle greyscale to check that nothing depends on
hue."*

**This page is the canonical statement of two systems this document has referred to
throughout, and it is the fastest way to see them:**

**The Certainty System** — *"How real a thing is. Four rungs, each with a structural
signature — fill, edge, texture — so the meaning survives greyscale, recolouring and
colour blindness."*

| Rung | What it claims | Its structural signature |
|---|---|---|
| **Real** | *"It happened. A platform has it."* | solid fill, no edge |
| **Committed** | *"It will happen. Someone decided."* | tint + hairline edge |
| **Proposed** | *"Sahoda suggests it. Nobody has agreed."* | dashed edge |
| **Simulated** | *"Not real. A fixture, never a platform."* | diagonal hatch **+ a word** |

And the sentence that ties it to the composer: *"Certainty sets the fill and the edge;
the glyph says what happens next. Both are structural, which is why Approved, Scheduled
and Published stay apart even though all three sit on the same rung — **evidence, not
intent, is what earns 'real'**."*

**The absence vocabulary** — *"Three different claims that used to render as one em
dash. A solid rule means the reading has not arrived; a broken rule means we asked and
got nothing. A quantity that does not exist gets no slot at all."*

| Claim | What it means | The example it ships with |
|---|---|---|
| **Not yet measured** | *"The slot is real. The reading has not arrived."* | *"Reach, before anything has published."* |
| **Unreadable** | *"We asked and got nothing back. Different from having none."* | *"A balance read that threw."* |
| **Does not exist** | *"There is no such quantity. **Delete the slot — do not fill it.**"* | *"A monthly allowance, for a wallet that is a balance."* — and the page literally renders the text **"(nothing renders)"** |

**Measured, and worked out** — the two-layer treatment from `/brain/audience`, shown
side by side: *"Above the line, every figure came from a platform and is drawn with a
SOLID fill. Below it, every figure is Sahoda's arithmetic on those figures, drawn dashed
and unfilled — and each panel states the evidence it stands on and refuses when there is
not enough."*

> **Every figure on this page is demonstration data, and the page says so in as many
> words** — *"It is Zernio's own published example payload, not a plausible-looking
> invention."* Even the reference page refuses to invent a number.

One of its examples is worth copying outright: a six-point follower line where **the
12th is deliberately missing**, with the note *"A day nothing was collected leaves a
break in the line — it is not drawn as a zero and it is not joined across."*

#### `/embed/lead`
Covered in the Leads entry.

---

### `/admin`, `/admin/dev`, `/admin/qa`, `/admin/applications`, `/admin/credits`, `/admin/team` — staff back office

**BUILT.** **Not in the menu, and no state value exists for them** — do not read them
as *live* or *soon*; the field does not exist. A row labelled **Admin** appears at the
bottom of the rail **only for staff** and is simply absent for everyone else. **It is
also absent from the phone's More sheet, so on a phone these screens are reachable
only by typing the URL.**

**This is the staff back office, not the customer product. A shop owner never sees
any of it.** None of these screens shows a shop's marketing work; they show the state
of the company running it.

Inside the console there is a second strip of five text links labelled *"Admin
sections"*: **Dev · QA · Applications · Credits · Team**, with the word *Admin* and
the viewer's own seat role (*owner* / *admin* / *viewer*) beside it.

- **`/admin` → `/admin/dev`** — how the build is going and what is stuck. Four
  collapsible sections, all closed on first visit: *Session and checks · Board ·
  Changelog · Charts*. What you leave open is remembered per person in that browser.
- **`/admin/qa`** — what staff checked by hand and whether it worked. Five filter rows
  (*Suite · Status · Who · Card · When*), and **a filter row is hidden entirely when
  it has fewer than two options.**
- **`/admin/applications`** — letting a business that applied for the beta in. Six
  filter pills with counts, and a search box.
- **`/admin/credits`** — topping a customer's credits up when something went wrong for
  them. Two fixed sections: *Waiting for approval (N)* and *Decided*.
- **`/admin/team`** — who can open this console at all.

One structural detail worth carrying over even though it is staff-only, because it is
the same discipline the customer product uses: the dev screen's freshness line reads
either *"Last synced X ago"* or **"Last sync unknown — nothing on this page can be
trusted to be current"**, and it is computed from the newest timestamp across five
tables **deliberately rather than being reported by the sync job itself** — a job
cannot be trusted to report its own liveness.

---

### The 15 machine endpoints — no screen, but they decide what your screens can say

**Not in the menu.** A person never visits any of them. Seven run without anybody
present; one is what happens when a shop owner presses Publish.

**This is the section to read alongside §6.3's "could not check today", because it
answers the question a designer cannot otherwise answer: what does a screen look like
when the job behind it stopped?**

> **The general answer, and it is uncomfortable: the owner is not told.** Their
> numbers stop growing, their held credits stay held, their inbox stops filling, and
> their weekly plan simply never appears — **and every one of those looks, on screen,
> exactly like "nothing happened this week."**

#### The four scheduled jobs

| Job | Cadence | Armed by default? |
|---|---|---|
| **Sweeps** | every 5 minutes | **No** — three separate switches, all defaulting to off |
| **Metrics** | daily, 01:20 UTC | **Yes** — the only one on unless deliberately switched off |
| **The Loop** | weekly, Sunday 21:00 UTC | **No** |
| **Playbooks** | daily, 06:00 UTC | **No** |

**A not-armed job is, from the screen's point of view, indistinguishable from one
that does not exist.** That is the honest version of "placeholder" here.

**Sweeps** does three jobs in one tick:

1. **The dispatch sweep** — sends scheduled posts, up to 4 per tick (the ceiling is
   wall-clock: an Instagram publish spends about 36 seconds polling for its live URL
   plus the media upload). **If it does not run, a scheduled post simply never
   leaves.** Its status stays whatever it was, and **nothing on any screen says "this
   should have gone out an hour ago." There is no "missed" state.** (This is why the
   auto-publish note on `/posts` exists — see that entry.)
2. **The hold sweep** — returns credits reserved by an action that crashed. **This is
   the sharpest example in the product of a screen asserting a stopped job's state as
   permanent fact.** The Wallet currently says, verbatim: *"{N} holds have passed
   their expiry — those credits are held by stalled actions and **are not released
   automatically. They stay held until those actions are settled**."* — and that
   sentence is true exactly while the sweep is off, which is the default.
3. **The reconcile sweep** — asks the platform which connected accounts have quietly
   stopped working, and how a post that was "still processing" actually ended. **If it
   stops, a dead account keeps showing as healthy until someone tries to publish**,
   because the platform issues 60-day tokens with no refresh and no expiry signal —
   nothing tells the product the day a token dies. And a post stuck mid-flight is
   never resolved: the record and the customer's account disagree, permanently.

**Metrics** asks the platforms for impressions, reach and engagement of up to 120
published post-channels a night. **The stored number is a running total since the post
went out, not a per-day figure.** It never writes a number it was not given: **an
unmeasured day produces no row, drawn as a gap, never a zero.** A missed night is
permanent — no platform will ever report that day again.

Its absence produces, on a new account: *"Sahoda has started keeping a history.
Nothing has been measured yet — the first readings arrive once your published posts
report."* And on the Loop: *"It had nothing to reflect on — no post of yours has been
measured yet, so there was nothing to learn from."*

**The Loop cron** charges 20 credits per workspace per week **before any person has
seen anything**, which is exactly why it defaults to off. Its own stated reason: *"A
default of `on` would mean the deploy that adds the schedule silently starts charging
every workspace in the database on the next Sunday."* It skips, and charges nothing,
for a workspace with no connected channel — *"charging 20 credits to plan for nowhere
is the wrong half of that."*

> **If the Loop cron does not run, the cost-preview panel and the cycle summary simply
> do not appear. There is no error, no spinner and no "we could not check" — the
> screen renders the dial and the kill switch and nothing else. This absence is the
> single easiest thing for a designer to get wrong.**

**The Playbooks cron** charges nothing at all: reading a calendar is deterministic and
free. **Every credit that feature ever charges is downstream of a person pressing
Approve.** Its absence has the same shape as the Loop's — the run preview simply never
appears, and **nothing says a festival was missed.**

#### The receivers

**The platform webhook** verifies a signature over the exact bytes, stores one row per
event, and files it onto a surface — **all inside one transaction, with a hard
five-second budget and no outbound call on the path.** Of the platform's 49 event
types, **43 are stored and filed nowhere, deliberately.**

Only four channels can be represented, and an event from any other platform the
partner supports is **stored and honestly marked unfileable**: *"A Reddit comment is a
real event we genuinely cannot file, and saying so is the honest answer — inventing a
channel would put a Reddit thread in the Instagram tab."*

**No subscription is known to be registered in production**, so the inbox store is
empty for every workspace, and the inbox says: *"Nothing has come through yet"* /
*"Sahoda is listening, and new {conversations} will appear here as they arrive. **This
is not a reading of your {noun} — it is what has reached Sahoda so far, which is
nothing.**"*

**The payment webhook** applies the plan's monthly credit grant, **and the amount comes
from the plan catalogue, not from the payment.** If it is unconfigured, **a customer
who has paid sees no new credits and nothing anywhere says a payment was received.**
The route is deliberately built so that a wrong secret does not look like a rejected
payment.

**The sign-up webhook** creates the person's profile record.

**The publish endpoint** is the only one a person triggers: it is what happens when
Publish is pressed, and the owner waits about **fifteen seconds** for a link back.

#### What a designer should take from this
Three of these produce a screen state that looks like emptiness and is not. **A "we
could not check today" treatment does not exist anywhere in the product yet** (§11) —
and these four jobs are precisely where one is owed.

## 3. The composer, in full

The composer is the product's one real differentiator, and the current reference
gets its structure wrong in a way that cannot be fixed by restyling. This section
is the correction. Every number in it was read directly from the production
database or from the rule file the editor and the publisher both consume.

**Where it lives.** The composer is the screen at `/posts/{post id}`. It is
reached by opening a post from the Posts list, from the Planner, from Approvals,
or straight after creating one. `/create` and `/create/post` are *choosers* that
lead into it; they are not the composer.

### 3.1 The four channels, and only four

The product publishes to exactly four channels. This is not a convention — the
database refuses any other value in the channel column of both a post variant and
a per-channel autonomy setting.

| Channel | Name shown to the user |
|---|---|
| `instagram` | Instagram |
| `linkedin` | LinkedIn |
| `x` | X |
| `gbp` | Google Business Profile |

Everything is published through a single upstream partner rather than through
each platform's own developer programme, which is why these four arrived together
and why adding a fifth is a partner question rather than a Meta-app-review one.

Facebook, TikTok, YouTube, Google Ads, Meta Ads, Shopify, WhatsApp, Telegram,
Email, Google Analytics and Search Console are **not channels in this product**.
Two of the four real channels — **X and Google Business Profile** — are absent
from the current reference entirely.

### 3.2 One post, many variants — the structure to fix

A **post** is one idea. Underneath it sit **variants**, one per channel. The
relationship is not decorative; almost everything the writer does happens on a
variant rather than on the post.

The post itself holds: a title, a canonical body, an overall status, the list of
channels it is going to, a scheduled time, and where it came from (typed by hand,
produced by a week plan, or produced by a playbook).

Each variant holds, **independently of every other variant**:

- **its own body text** — Instagram's caption and LinkedIn's post are two
  different strings on two different rows;
- **its own format** — see §3.3;
- **its own extras** — the per-channel controls that only make sense on that
  channel (a poll's options, a Google Business Profile call-to-action);
- **its own character count**;
- **its own publish state**, its own published permalink, its own platform post
  id, and **its own last error**;
- **a follow flag** (see §3.4) and **a version number** (see §3.8).

#### The three claims the reference gets wrong

**1. One body per channel.** *Confirmed against the schema.* The canonical body
lives on the post; each channel's own body lives on its variant. They are separate
columns on separate rows. A writer can adapt Instagram without touching LinkedIn.

**2. One format per channel.** *Confirmed against the schema.* Format is a column
on the **variant**, not on the post. The same idea can be an Instagram Story and
an X thread at the same time. The current reference models Format as one global
step in a linear create wizard — **that is the structural error to fix.** Format
is not a step; it is a property of each channel's version of the post, chosen
inside that channel's editing surface.

**3. Independent publish state.** *Confirmed against the schema.* Each variant
carries its own publish state, so Instagram can be published while LinkedIn has
failed and X is still a draft. This is why the post has a status of its own that
includes **partial** — see §3.7.

### 3.3 Formats, per channel

The format column accepts exactly six values, and it may also be empty, which
means "nobody has said yet":

`text` · `image` · `carousel` · `story` · `thread` · `video`

Which of the six are offered depends on the channel:

| Channel | Formats offered | Notes |
|---|---|---|
| Instagram | image, carousel, **story** | Story is Instagram's only channel-specific format here. There is no text-only Instagram post — media is required. |
| X | text, image, **thread** | Thread is X's channel-specific format; it is planned and split by the product (see §3.9). |
| LinkedIn | text, image, carousel | |
| Google Business Profile | text, image | Carries its own extras: a call-to-action type, and offer posts. |

**Deliberately absent, and each for a stated reason:** Instagram **Reel**,
LinkedIn **document**, **poll**, and Google's **event** and **offer** post types.
Each needs something the product does not have yet — most commonly a video
pipeline. They are absent from the picker on purpose: an unpublishable entry in
that list is a choice that saves one thing and publishes another. `video` is in
the six but the surrounding pipeline is still image-only, so treat video as
**coming soon** rather than available.

### 3.4 Follow and detach — how a channel tracks the post

Every variant carries a **follow flag**. This is the mechanism the reference has
no equivalent for, and it is what makes one-body-per-channel bearable rather than
five times the typing.

1. A new channel **follows the post**. Whatever the writer types in the canonical
   body appears as that channel's body.
2. The moment the writer edits that channel's own text, it **detaches**. From
   then on it keeps its own words and ignores later changes to the post.
3. A detached channel offers a control labelled **"Follow the post again"**.
   Choosing it mirrors the post's current body back into that channel.

**Relinking never destroys the writer's words, and it is not a confirm — it is an
undo.** The swap happens immediately, and a line appears saying:

> *"{Channel} follows your post again. Its own copy is kept until you save —
> nothing was written."*

beside a button labelled **"Put my {Channel} copy back"**. That is safe because
relinking writes nothing: the mirrored text lands in the unsaved buffer, and the
stored per-channel copy survives until the writer saves.

The control is **hidden when it would do nothing** — a channel that already
follows the post has nothing to relink, and a channel whose text already matches
the post would swap a string for itself.

### 3.5 Live validation, per channel, as the writer types

Validation is per channel and continuous. The exact limits below are read from
the single rule file that both the editor's meter and the publisher consume, so
what the meter says and what the publisher enforces cannot drift apart.

| | Instagram | LinkedIn | X | Google Business Profile |
|---|---|---|---|---|
| **Character limit** | 2,200 | 3,000 | **280** | 1,500 |
| **How links count** | discouraged | counted normally | **any link counts as a fixed 23 characters**, whatever its real length | counted normally |
| **Hashtag cap** | 30 | — | — | — |
| **Media required?** | **Yes — always** | no | no | no |
| **Images per post** | up to 10 | up to 9 | up to 4 | 1 |
| **File size cap** | 8 MB | 5 MB | 5 MB | 5 MB |
| **Accepted types** | JPEG, PNG | JPEG, PNG | JPEG, PNG, WebP, **GIF** | JPEG, PNG |
| **Smallest image** | 320 × 320 | — | 4 × 4 | 250 × 250 |
| **Aspect ratio** | **0.75 to 1.91** | — | — | — |
| **Posts per day** | 25 | 10 | 100 | 10 |
| **Earliest schedule** | 5 minutes from now | 5 minutes | 5 minutes | 5 minutes |

Two details worth designing around:

- **The Instagram aspect floor is 0.75, and it was measured at the boundary**
  against the platform's own validator: a 750 × 1000 image is accepted, a
  749 × 1000 image is refused. An ordinary upright phone photo at 1080 × 1920
  (0.5625) is **too tall for an Instagram feed post** and needs a crop — which is
  what the crop offer in §9 exists for. An Instagram **Story** relaxes this: the
  story rule replaces the channel's aspect range rather than adding to it, and
  only refuses an image that is wider than it is tall.
- **The over-limit message is exact:** *"{channel} allows {N} characters; this
  has {M}."*

Hashtags are normalised before they are counted, so the meter, the validator and
the published text are all looking at the same tokens: blank entries are dropped,
a missing `#` is added, duplicates are removed, and the writer's order is kept.

### 3.6 Every AI action states its cost before it spends

Costs come from one configuration file and are rendered from it, never written as
a literal in a button. The complete list:

| Action | Credits |
|---|---|
| Rewrite a caption / a selection | 1 |
| Reply in the inbox | 1 |
| Generate one variant per selected channel | 3 |
| Video script | 3 |
| Edit a site section | 3 |
| Preflight check | 4 |
| Radar scan | 5 |
| Standard image | 6 |
| Carousel | 8 |
| SEO article | 10 |
| Premium image | 12 |
| Remix pack | 15 |
| One Loop cycle | 20 |
| Campaign plan | 25 |
| One minute of voice | 25 |
| Brand research (the onboarding "door") | 50 |
| Generate a site | 100 |

**Before** the action runs, the button carries the cost — *"Generate variants for
3 channels · 3 credits"*, *"Uses 1 credit"*. **After** it runs, the result line
states what was actually charged and what is left — *"Rewrote the selection ·
1 credits used · 99 left"*.

**When the balance is too low, the product states the shortfall rather than
disabling the button silently:** *"An image needs 6 credits and you have 0."*

**Users are never charged for a failure.** When something fails before doing any
work, the message says so explicitly: *"Your post body could not be saved, so
nothing was generated and no credits were charged — try again."* Where a partial
charge is possible, the product reports the real number rather than claiming zero.

### 3.7 Every state, named

**A post can be in ten states:** `idea` · `draft` · `review` · `approved` ·
`scheduled` · `publishing` · `published` · **`partial`** · `failed` · `expired`.

`partial` is the state that only exists because variants publish independently:
some channels went out and some did not.

**A variant can be in six:** `pending` · `scheduled` · `publishing` · `published`
· `failed` · **`skipped`**.

`skipped` is a real outcome, not an error — a channel deliberately left out of a
send.

**Two further composer-level states are about the writing, not the publishing:**

- **Someone else moved this post.** The product cannot say *who* — it can only
  say that the row changed at a moment this session did not produce. So it names
  no culprit and offers two genuine choices, neither presented as the safe one:
  **"Load that version"** and **"Keep mine and save"**, under the line
  *"Both versions are still here — choose which one to keep."*
- **The save failed.** This gets its own retry, because a writer who has stopped
  typing has no other way back: the automatic save only re-fires on the next
  keystroke.

### 3.8 Concurrent editing

Each variant carries a version number, and a save that was written against a stale
version is refused rather than silently overwriting. What the writer experiences
is the notice above — both versions preserved, an explicit choice — rather than
losing words to whoever saved last.

### 3.9 Threads

An X thread is not typed as separate boxes. The writer writes one body; the
product **plans the split** into segments at the per-segment character limit,
deriving the link weight from the same rule file, and shows a preview of the
resulting thread before it goes.

## 4. What data the product actually has

**75 tables exist in the production database.** This section is a plain-language map
of what each holds and which screens read it, so you can tell at a glance what a
screen is *allowed* to show.

**Every row count below was measured directly against the production database on 22
August 2026.** They are included because they answer the question that matters most
for design: *is this screen's populated state the normal one, or the rare one?* On
most of these screens today, **the empty state is the normal one.**

Three structural notes before the tables:

1. **Almost every table is scoped to a workspace**, and the database enforces it
   rather than the application. Three are deliberately not: the competitor registry is
   shared across all customers (a competitor is a real business, not one workspace's
   property), the plan catalogue is global, and the staff tables belong to Sahoda.
2. **Several tables are append-only, enforced by the database.** Brand Brain versions,
   competitor snapshots and changes, the credit ledger, publish logs and audience
   snapshots are never updated or deleted — a correction is a new row. This is why
   "Version N · every edit writes a new one" appears on the Brand Brain, and why a
   correction in the Wallet is a pair of entries rather than an edit.
3. **A number is stored only when a platform actually reported it.** There is no
   zero-filling anywhere.

---

### The business itself

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `workspaces` | 27 | One business. Its name and slug. | everywhere |
| `workspace_members` | 28 | Who belongs to a workspace, and their role: **owner · editor · approver · viewer** | the shell, Settings |
| `users_profile` | 26 | A person's profile, created on sign-up | the shell, Settings |
| `brand_memory` | **38** | **The Brand Brain.** One row per version; the newest active one is the current brain. Its whole content — all fifteen fields plus who confirmed each one — lives in a single JSON column, capped at 32 KB. | `/brain` and all its tabs, and everything that writes copy |
| `brands` | **0** | Vestigial. The Brand Brain lives in `brand_memory`. | nothing |
| `memory_events` | 3 | A proposed change to the Brand Brain, waiting on a person: pending, accepted or rejected. **Nothing here is ever applied automatically.** | `/loop` ("What Sahoda noticed"), `/brain/resolve` |
| `workspace_themes` | 7 | A workspace's colour tokens, derived from its brand | the shell's theming |
| `knowledge_documents` | **0** | A document the owner gave the product to read: a menu, a rate card, a policy. Its title, where it came from, and whether it indexed. | `/brain/knowledge` |
| `knowledge_chunks` | **0** | The passages inside those documents — what a search returns and what an evidence block quotes. | `/brain/knowledge`, `/brain/resolve` |
| `audience_snapshots` | **10** | One kept reading of who follows an account, per day. **Today every row is a follower count** — gained, lost and total — for Instagram. Age, gender and location dimensions have never been written because every account on this deployment is under the platform's reporting threshold. | `/brain/audience` |

### Content

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `posts` | **123** | One idea. Title, canonical body, overall status, which channels it targets, when it is scheduled, and where it came from (**manual · plan_week · playbook**). | `/posts`, `/posts/{id}`, `/home`, `/planner`, `/approvals`, `/campaigns`, `/analytics` |
| `post_variants` | **47** | **One channel's version of a post** — its own body, its own format, its own extras, its own publish state, its own permalink, its own last error, and a follow flag. **This is the table the composer is built on.** See §3. | the composer, and every screen that shows a channel's state |
| `post_media` | 23 | Which photo is attached to which post, and optionally which crop of it | the composer |
| `assets` | 5 | One uploaded photo. Its stored file, type, size, pixel dimensions, name and screen-reader description. | `/assets`, the composer's library picker |
| `asset_derivatives` | **0** | **A crop of a photo, cut for particular channels.** A *child* of the original — which is what makes the delete gate keep working. | the crop offer; **`/assets` never reads it** |
| `asset_usages` | 0 | Which posts use which photo — **written by the database from the attachment, never by the app** | the delete gate |
| `templates` | 2 | A saved starting point for a caption | the composer |
| `campaigns` | 2 | A named push. Name, what it is for, stage, optional start and end dates. **No budget, no spend, no revenue, no health.** | `/campaigns` |
| `campaign_posts` | 2 | Which posts are in which campaign | `/campaigns` |
| `planner_events` | 9 | The calendar's own entries | `/planner` |

### Publishing

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `post_publish_logs` | **21** | **Every publish attempt, with whether it went to a real platform or a simulator.** This is the only table that knows what actually went out — a post's status column does not. | `/home`, `/analytics`, the reconcile sweep |
| `jobs` | 0 | Background work records | staff only |

### Channels and accounts

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `connections` | **6** | One connected account. Its platform, its status, the account's own name, what permissions were granted and when they expire. | `/connections`, `/posts`, `/home`, `/analytics`, `/loop`, `/brain/audience` |
| `connection_secrets` | 0 | The encrypted tokens. **Never read into any screen, ever.** | nothing user-facing |
| `zernio_profiles` | 6 | The publishing partner's own identifier for a workspace | the publishing path |
| `zernio_webhook_events` | **0** | Every event the partner has delivered. **Zero, because no subscription is registered** — which is why the inbox is empty. | the inbox's store-backed read |

### Customers

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `inbox_threads` | **0** | One conversation — a set of comments on a post, a direct-message thread, or a review | `/inbox` and its three lists |
| `inbox_messages` | **0** | One message inside a thread, incoming or outgoing | `/inbox` |
| `leads` | **3** | One enquiry: name, email, phone, what they said, where it came from, and its stage (**new · contacted · qualified · won · lost**) | `/leads` |

### Measurement

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `post_metric_snapshots` | **63** | One measured number for one post on one channel on one day. **Only three metric names exist in production: `impressions`, `reach`, `engagement`** — and **only Instagram and LinkedIn have any rows at all.** X and Google Business Profile have never reported a single figure. **The stored value is a running total since the post went out, not that day's activity.** | `/analytics`, `/report`, the Loop's reflect step |
| `audit_logs` | 10 | Who did what | staff only |

### Money

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `credit_ledger` | **203** | **Every movement of credits**: grants, reservations, charges, releases, expiries and corrections. Append-only. | `/wallet`, `/home` |
| `credit_balances` | 27 | The running total and what is currently held | the shell, `/wallet`, `/home` |
| `plans` | **4** | The plan catalogue — **Free · Starter · Growth · Agency** — with each one's price, monthly credit grant, and limits on seats, channels and sites | `/wallet`, `/settings/plan` |
| `subscriptions` | 1 | Which plan a workspace is on | `/settings/plan` |
| `billing_profiles` | 0 | Billing details | checkout |
| `invoices` / `invoice_serials` | 0 | Issued invoices | `/settings/plan` |
| `billing_webhook_events` | 0 | Payments the provider has told us about | no screen |
| `ledger` | 1 | Superseded by `credit_ledger` | nothing |
| `ai_provider_logs` | 227 | What each model call cost us | staff only |

### Automation

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `loop_cycles` | **5** | One week's run of the Loop, with its state, what it estimated, what a person approved, and what it spent | `/loop` |
| `loop_briefs` | **20** | One proposed post inside a cycle: title, body, channels, its own price, and whether it was kept | `/loop`'s cost preview |
| `loop_settings` | 2 | Per workspace: paused or not, the weekly credit budget, and when it plans | `/loop` |
| `loop_channel_autonomy` | **1** | **The Autonomy Dial — one row per channel.** The level column is constrained to 0–2, which is what makes L3 unselectable. | `/loop` |
| `playbooks` | **0** | A standing instruction the owner switched on, with its filled-in blanks | `/playbooks` |
| `playbook_runs` | **0** | One firing of a playbook | `/playbooks` |
| `playbook_run_items` | **0** | One thing a run proposes to write, with its own price and outcome | `/playbooks` |
| `remix_batches` | **0** | One remix job, with the total a person approved | `/remix` |
| `remix_derivatives` | **0** | One rewrite in a batch, for one channel | `/remix` |
| `guide_tours` | **6** | Six seeded guided tours | **nothing — no tour engine exists** |
| `tour_progress` | **0** | How far someone got through a tour | **nothing** |

### Competitors

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `competitors` | **0** | **A shared registry of businesses being watched — deliberately not scoped to a workspace**, because a competitor is a real business, not one customer's property | `/radar`, once bound |
| `competitor_subscriptions` | **0** | Which workspace is watching which competitor, and what they call it | `/radar` |
| `competitor_sources` | **0** | One place a competitor is watched — a website, a social page | the collector |
| `competitor_snapshots` | **0** | One reading of one source on one day. Append-only. | `/radar/{id}` |
| `competitor_changes` | **0** | **The difference between two snapshots** — this is what Radar actually shows | `/radar` |
| `radar_fetch_log` | **0** | Every attempt, with what it cost. **No customer can read this at all — it has no read policy.** | staff only |
| `radar_limits` | 1 | A single row holding the daily spend caps — **US$2.00/day across all customers and US$0.05/day per workspace** | the collector |

### Websites

| Table | Rows in prod | What it holds | Read by |
|---|---|---|---|
| `sites` | **5** | One generated website: name, slug, goal, status, theme and deploy state | `/sites`, `/leads` (for the embed snippet) |
| `site_pages` | **6** | A page within a site | `/sites` |
| `site_sections` | **31** | One section of a page — the unit the generator writes and the unit an edit rewrites | `/sites` |
| `elements` | 0 | Vestigial. Note it uses a different tenant column from every other table. | nothing |

### Internal / staff

`ops_admins` (7) · `ops_audit_log` (8,942) · `ops_beta_applications` (0) ·
`ops_changelog` (11) · `ops_copy_watermarks` (0) · `ops_credit_requests` (2) ·
`ops_qa_artifacts` (0) · `ops_qa_runs` (1,043) · `ops_roadmap_items` (45) ·
`ops_sessions` (30) · `ops_tasks` (84) · `app_settings` (0).

These back the six staff screens. **A customer never sees any of them.**

---

### 4.1 The single most useful reading of this table

**Nine surfaces have never had a row in production:** the inbox (threads and
messages), competitors (all five tables), knowledge (both tables), playbooks (all
three), remix (both), asset crops, delivered webhooks, and tour progress.

**That is not a bug — it is where the product is.** It means the screens you design
for those surfaces will, for every real customer today, render their empty state and
nothing else. **Design the empty state first, and design it as the primary state, not
as a fallback.**

And where rows *do* exist, the amounts are small and honest: 123 posts, 47 channel
versions, 63 measured numbers across two channels, 6 connections, 5 sites, 3 leads.
**A screen that only looks right with hundreds of rows will not look right for
anybody using this product this month.**

## 5. What the product cannot show, and why

This is the section to read first, because the current reference displays several
of these today and the product will never be able to fill them.

### 5.1 The rule the product actually enforces

**No figure appears unless a query produced it.**

Anything that is a claim about the user's own business — reach, revenue, predicted
performance, competitor counts, audience age, engagement rate, a score — is
rendered only when a real row exists. When there is no row, the product does not
render a zero and does not render a plausible-looking number. It renders one of
three things:

- an em dash `—` in the number's place,
- a sentence saying precisely what is and is not known, or
- nothing at all, with the surrounding card explaining why.

There are two small components every number on the Analytics surfaces passes
through, and they exist specifically so that writing an honest screen is easier
than writing a dishonest one. One of them turns a missing value into `—`. The
other refuses to print a total without the coverage it was computed from, so a
total drawn from three of eight channels is printed as the number with `3/8`
beside it and the sentence *"3 of 8 channels reported."* underneath. When every
channel reported, the sentence is *"All 8 channels reported."* — it is printed
either way, because a note that only appears when something is wrong is a note
readers learn to stop looking for.

A related distinction runs through the whole product and is worth stating on its
own, because it is the difference between two sentences that describe the same
empty API response:

> **"0 impressions" and "not available yet" are not the same claim, and only one
> of them is ever true.** Being told zero is a fact. Being told nothing is a
> different fact. The product never converts the second into the first.

### 5.2 Figures in the current reference that have no source

Each entry below names a figure the current package renders, says whether the
data exists, and says what the product renders in its place.

| Figure in the reference | Where it appears | Does the data exist? | What the product renders instead |
|---|---|---|---|
| **"Reach 68K–81K · engagement 4.1% · best posting time 10:00 AM"** (predicted performance) | Create flow, review step | **No, and it cannot.** Nothing in the product predicts the performance of an unpublished post. There is no model, no training data and no table for it. | Nothing. There is no predicted-performance surface anywhere. After publishing, real metrics arrive from the platform and are shown with their measurement window. |
| **`predict: { reach, engage, conv }`** on every approval | Approvals list and detail, marked in the spec as part of "the highest-value contract" | **No.** Same as above. This is the single most load-bearing invention in the reference: the contract marks it non-optional. | The approval surface shows what the post actually is and what it will cost in credits. It makes no claim about how it will perform. |
| **`reach: '~74K'`** on an approval row | Approvals list | **No.** Reach for an unpublished post does not exist. | Omitted. |
| **"14 templates matched to your industry"** | Create flow, "Use a template" | **Partly.** A `templates` table exists and holds **2 rows in production**. Nothing matches templates to an industry — there is no industry-matching mechanism at all. | The real count of templates available, or an empty state if there are none. Never a match claim. |
| **"Your audience peaks between 9:40 and 10:20"** | Create flow, smart defaults; approval AI note | **No.** Nothing in the product produces a best-time-to-post figure, and nothing stores per-hour follower activity: the only audience dimension ever written is a daily follower count. *(Whether the upstream partner could supply an hourly figure at all is **UNVERIFIED** — no code in this repository asks for one.)* | Nothing. Scheduling offers no "best time" claim. |
| **"Instagram drives 38% of your revenue"** | Create flow, smart defaults | **No.** The product holds **no revenue data of any kind** and has no commerce connection. There is no revenue column in any table. | Nothing. Revenue does not appear anywhere in the product. |
| **"Competitors · 12 tracked"** | Home tile, Brand Brain overview and at-a-glance | **The table exists; it is empty.** `competitors`, `competitor_snapshots` and `competitor_changes` all hold **0 rows in production**. | The real count, which is currently zero, with an empty state inviting the user to name a competitor. A competitor *name* would be the worst invention on that screen — not a number, but the same class of claim. |
| **"Knowledge · 120 docs"** | Home tile, Brand Brain overview | **The table exists; it is empty.** `knowledge_documents` and `knowledge_chunks` hold **0 rows in production**. | The real count of documents the user uploaded, and an empty library otherwise. |
| **"Audience · 25–45 yrs"** | Home tile, Brand Brain overview, Audience tab | **Not as a demographic.** No platform in this product returns an age distribution. The audience surface is built from real audience snapshots (**10 rows in production**) plus what the user typed during onboarding — never from an inferred demographic. | Whatever the user actually stated, marked as theirs; or a real measured figure with its window; otherwise an empty state. |
| **Household income `₹6L–₹18L`, interests, pains, goals, "Researches on Google, validates on Instagram, books over WhatsApp"** | Brand Brain → Audience | **Only if the user typed it.** These are legitimate as *user-stated* fields. They are not legitimate as *derived* ones, and the reference presents them without attribution. | The same fields, but each carrying its provenance: whether the user confirmed it, or the product suggested it and it is still unconfirmed. |
| **Marketing Score — "87 / Excellent"** | Home, header ring | **No.** There is no score in this product. No table, no formula, no column. | Nothing. There is no composite score anywhere. |
| **Brand completeness "92%"** and per-section percentages (Identity 100%, Voice 95%, Audience 90%, Competitors 88%, Knowledge 84%) | Brand Brain overview | **A completeness figure exists, but it is not these.** The real one counts fields the user has **confirmed**, against the total number of fields — not a weighted quality judgement. There are no per-section quality percentages. | One completeness figure with a real numerator and denominator, and a per-field list showing which fields are confirmed, which are suggested-but-unconfirmed, and which are empty. |
| **"Brand Brain Audit — 98% Match", "Tone Alignment 99%", "Vocabulary / Cliché Avoidance 100%", "Target Audience Resonance 96%"** | Brand Brain → Voice | **No.** Nothing scores generated copy against the brand. There is no alignment model and no stored score. | Nothing. |
| **"Reading 120 documents… Comparing against 12 competitors…"** (retraining progress) | Brand Brain, retrain modal | **No.** The counts are invented and the retrain step list is invented. | Real progress against real counts, or no step list. |
| **"Fear of hidden costs … appears in 34% of first messages"** | Brand Brain → Audience | **No.** `inbox_messages` holds **0 rows in production**; nothing classifies message topics. | Nothing. |
| **"28% of your bookings come from parents aged 30–40"** | Brand Brain, suggested improvement | **No.** The product has no bookings data and no age data. | Nothing. |
| **"Generated by Sahoda AI · 92% confidence"**, "Sample size 4,182 sessions", "Confidence 92%", "Window Last 30 days" | Analytics, AI insight evidence panel | **No.** No confidence score is computed or stored, and there is no session data — the product has no web analytics connection. | Where a recommendation is shown, the actual evidence behind it: which posts, which metric, over which window, and how many reported. |
| **"LinkedIn generated 24% more qualified traffic", "Instagram Reels outperform static posts 3.1x", "Google Ads spend is front-loaded to low-intent hours"** | Analytics insights | **No.** All three are invented, and two describe channels the product does not publish to. | Comparisons the product can defend from its own metric snapshots — and it refuses to make one when the sample is too small to mean anything. |
| **"18.4K reach", "4.2K reach", "31% reply rate"** (Best performing) | Analytics | **The shape is real; the numbers are not.** Real post metrics exist (**63 metric snapshots in production**). Reply rate is not among them. | Real per-post figures, with `—` where the platform reported nothing. |
| **Followers 18.2K, Reach 245.6K, Conversions 2.45K, Revenue ₹24.8K, ROAS 4.2x** with sparklines and week-over-week deltas | Home performance strip | **Two of five, partly.** Followers and reach can come from real snapshots. **Conversions, revenue and ROAS do not exist anywhere in the product** — there is no conversion tracking and no commerce or ads connection. | Only the metrics the platforms actually returned, each with `—` when nothing was reported, and a coverage line saying how many channels reported. |
| **Campaign metrics: reach 128K, conversions 842, revenue ₹9.4L, ROAS 4.8x, health 92, budget ₹45,000, spent ₹31,200, "Clicks 12.4K"** | Campaigns list and detail | **No.** Campaigns in this product group posts under one push. They carry **no budget, no spend, no revenue, no ROAS and no health score** — those columns do not exist. | The posts in the campaign, per channel, and whatever real metrics those posts returned. |
| **Channel performance table: per-channel reach, engagement %, conversions, revenue, "share 38%"** | Analytics | **Reach and engagement partly; the rest not at all.** Revenue and conversions do not exist. Revenue "share" cannot be computed from data the product has. | Per-channel figures for what was actually measured, each with its own reporting window, and a coverage line. |
| **"~214K people" audience size, "Dayparting recommended … saves roughly ₹6,200", "Conversion rate between 1–5 AM is 0.4%"** | Campaign builder | **No.** All are invented, and they belong to paid advertising, which the product does not do. | Nothing — this whole flow is described in §8. |
| **Plans: Starter ₹2,999 · 100 credits · 1 workspace / Growth ₹7,999 · 300 credits · 3 workspaces / Scale ₹19,999 · 1,000 credits · unlimited** | Settings → Billing | **The plans are real; every number is wrong and one plan does not exist.** Measured from the production `plans` table: **Free ₹0 · 100 credits · 1 seat · 2 channels · 0 sites**; **Starter ₹499 · 1,500 credits · 1 seat · 4 channels · 1 site**; **Growth ₹1,499 · 5,000 credits · 3 seats · 8 channels · 3 sites**; **Agency ₹3,999 · 15,000 credits · 10 seats · 8 channels · 10 sites**. There is no "Scale" plan. Plans limit **seats, channels and sites** — not workspaces. | The real four plans with their real limits. |
| **Credit top-ups: 100 credits ₹1,499 / 300 ₹3,999 / 1,000 ₹11,999** | Settings → Credits | **UNVERIFIED.** Top-up packs are not in `pricing.config.json`; only per-action prices and plan grants are. | See §3.6 for the real per-action credit prices. |
| **"Generate · 6 credits" for an image**; per-approval "Cost: 6 credits" | Assets, Approvals | **This one is right.** A standard image is 6 credits, and a premium image is 12. | Unchanged — but see the full price list in §3.6, which is longer than the reference knows. |
| **Thirteen connected services** — Instagram, Facebook, LinkedIn, TikTok, YouTube, Google Ads, Meta Ads, Shopify, WhatsApp, Telegram, Email, Google Analytics, Search Console | Connections, and platform marks throughout | **Four exist.** The product publishes to exactly four channels: **Instagram, LinkedIn, X and Google Business Profile**. This is enforced by a database constraint, not a convention. Facebook, TikTok, YouTube, Google Ads, Meta Ads, Shopify, WhatsApp, Telegram, Email, Google Analytics and Search Console are not channels in this product, and **X and Google Business Profile — two of the four real ones — are missing from the reference entirely.** | See §3.1. |
| **"80% of desk workers experience postural strain by 3 PM"**, "90% of desk-related back spasms", `$120` / `$85` consultation prices, "60–80% insurance cover" | Sample generated copy in the multichannel studio and voice simulator | These are sample *content*, not product figures, so they are not the same category of problem. They are flagged only because they read as researched facts inside a product that is careful never to state one. | — |
| **Sample data throughout** — "Meera Patnaik", "Sunrise Dental", named customers with order counts and lifetime spend (`orders: 3, spend: ₹18,400`) | Everywhere | Customer order history and lifetime spend **do not exist** — there is no commerce connection. | Contacts appear only when a real message arrives from a connected account. |

### 5.3 The three categories, summarised

**Does not exist and cannot be built with what the product connects to:**
predicted reach, predicted engagement, predicted conversions, best-posting-time,
audience age and income, revenue, ROAS, conversions, clicks, ad spend, campaign
budget and health, session counts, confidence scores, Marketing Score, per-section
brand quality percentages, tone-alignment scores, message-topic percentages.

**Could exist — the table is there and it is empty today:**
competitor counts and competitor changes (0 rows), knowledge documents (0 rows),
inbox messages and threads (0 rows), playbook runs (0 rows), remix batches (0
rows), lead pipeline beyond the 3 rows that exist, asset crops (0 rows), delivered
webhooks (0 rows). Every one of these needs a real screen for its empty state
before it needs a screen for its populated state.

**Exists today, with real rows in production:**
posts (123), post variants (47), post media (23), publish logs (21), post metric
snapshots (63), planner events (9), campaigns (2) and their posts (2), assets (5),
brand memory fields (38), audience snapshots (10), connections (6), credit ledger
entries (203), credit balances (27), workspaces (27), sites (5) with pages (6) and
sections (31), loop cycles (5) and briefs (20), leads (3), templates (2), plans (4).

## 6. The states every screen needs

The current reference mostly shows populated screens. **In this product the populated
screen is the rare one.** Measured against production today: no inbox messages, no
competitors, no knowledge documents, no playbook runs, no remix batches, no asset
crops. Several screens have never had a row.

So the empty state is not a fallback here. **On most screens it is the state.**

### 6.1 Three levels, and they are different objects

| Level | When | What it is |
|---|---|---|
| **Page** | the whole route has nothing | A marker, a heading, one sentence, and **at most one action** — and no action at all when there is nowhere useful to send the person. **A button that goes nowhere is worse than none.** |
| **Card** | one section of a populated page has nothing | Quieter: no heading, no marker. It sits inside a card that already has its own frame, and it **reserves the height the real content would take**, so a card does not visibly change size when its first row arrives. |
| **Slot** | one *number* is not there | A mark in the number's place — see 6.2. |

The card level exists because of a measured mistake: on one screen six empty sections
were each rendered as a page-level empty state, and **the loudest object on the screen
ended up being the one carrying the least information.**

### 6.2 Three absence marks, and they must stay distinguishable without reading

This is a structural rule, not a visual one, and it recurs on every screen:

| The claim | What renders |
|---|---|
| **does not exist** | **nothing.** The slot is deleted, not filled with a dash. |
| **not yet measured** | one mark, with a spoken sentence: *"Reach has not been measured yet"* |
| **could not be read** | a **different** mark, with its own spoken sentence: *"Your credit balance could not be read"* — **never a bare dash, and never a zero** |

And the rule behind all three:

> **A zero is never a stand-in for a failure, anywhere.** Showing `0 credits` to a
> funded person stops them working. Showing `0/15` for an unreadable Brand Brain
> reports every confirmed field as unconfirmed. Both are explicitly forbidden.

Alongside those, on measurement surfaces, a total is never printed without the
coverage it was computed from: a total drawn from three of eight channels prints the
number with **`3/8`** beside it and *"3 of 8 channels reported."* underneath — **and
the complete form, "All 8 channels reported.", is printed too**, because a note that
only appears when something is wrong is a note readers learn to stop looking for.

### 6.3 The kinds of nothing — and there are two separate vocabularies

The inbox is where this is most fully worked out, and it is worth reading even for
screens that are not the inbox, because **the same distinctions recur everywhere.**

**Why so many.** The publishing partner does not fail a request when one account
breaks. It answers successfully with an empty list and reports the failure separately.
So an empty list genuinely has all of these meanings, and one sentence for all of them
makes the product lie — usually in the direction of a claim about the customer's
business it has no evidence for. ***"No reviews"* is the worst of them, because the
truth was that nobody was asked.**

#### Vocabulary A — a live read that fans out across accounts
Used on `/inbox/comments`, `/inbox/reviews` and both detail screens. **Ten
heading/body pairs.** Only **one** of the ten makes a claim about the customer's
business.

1. **not configured** — no request went out, because this deployment has no key
2. **never connected** — nothing is linked that this screen could read *(the only one
   that offers a button)*
3. **could not ask** — the request went out and came back without an answer
4. **could not ask, with a count** — *N connected accounts* named
5. **could not resolve** — accounts are linked and the partner did not recognise them
   and sent no request at all *(deliberately neither "nothing connected" nor "nothing
   there")*
6. **cannot confirm completeness** — *rows are still shown, under a warning strip*
7. **cannot confirm, more exists elsewhere** — same heading, different body
8. **partial** — some accounts answered, some did not; *rows are shown*
9. **genuinely empty** — every account answered and there was nothing. **The only
   "none yet".**
10. **fine**

Exact wording for all ten is in §2's inbox entry.

#### Vocabulary B — reading the product's own store
Used only on `/inbox`. **Six states, sharing no sentences with vocabulary A.**

1. **the store could not be read** — checked *before everything else*, so no later
   claim is allowed
2. **rows exist, the history behind them could not be fetched** — *rows shown*
3. **rows exist, all fine**
4. **nothing connected**
5. **connected, listening, nothing has ever arrived** — *"Nothing has come through
   yet"*. **This is the state every workspace is in today.**
6. **events have arrived and none of them were of this kind** — same heading as 4,
   entirely different body

> **"Nothing here yet" is literally a different sentence on `/inbox` than on
> `/inbox/comments`.** That is deliberate, and it is a thing to design for rather than
> to unify away.

#### And where a screen has several columns
**The middle panel carries the heading, the explanation and the one button. Every other
column gets one quiet line and nothing else.** Three columns each announcing "nothing"
was measured as reading like a broken screen.

### 6.4 Four more states that live outside those two lists

**No workspace yet.** A person can be signed in and belong to no workspace. **This is
the first screen every new account sees**, because signing up does not create a
workspace. It is not an error and not an empty workspace, and the sentence must send
the person to create one rather than report that their data is missing. Every screen
words it for itself: *"Create a workspace to build a Brand Brain"* · *"Create a
workspace to start writing"* · *"Create a workspace to build a library"* · *"Create a
workspace to build a site"* · *"No workspace yet"*.

**Not connected — and its two neighbours.** Three genuinely different conditions:
*nothing has ever been linked* · *a connection exists and has expired* (*"The
connection expired, so we can't read metrics until it's renewed."*) · and *the platform
no longer recognises the account* (*"That usually means the login behind it changed."*).
**Collapsing these removes the remedy**, because each has a different one.

**Suppressed by the platform.** Instagram withholds audience detail below 100
followers — **and it does not report the refusal.** It answers successfully with empty
arrays, **byte-indistinguishable from an account that genuinely has no data.** So
suppression has to be *inferred* from a follower count fetched separately, and the
product refuses the diagnosis when it has no count in hand. It exists as a named state
on `/brain/audience` and **nowhere else**; on `/home` and `/analytics` a withheld read
collapses into the empty branch, and the wording is written to survive both readings.

**Could not check today.** Several surfaces are fed by scheduled background reads —
metrics, competitor changes, playbook triggers, the Loop. **There is no treatment for
this anywhere in the product yet, and three of the four jobs are off by default.**
What exists instead:

- the trend chart **lifts the line across a missing day** rather than drawing a dip or
  a zero, so an outage reads as two runs of measurement rather than one line;
- the Loop and Playbooks simply **do not render their preview panel** — no error, no
  spinner, no explanation;
- the Wallet **states a stopped job's condition as permanent fact** (*"…are not
  released automatically"*).

**This is the largest missing state in the product** and it is listed as an open
question in §11.

### 6.5 Loading, and error

**Loading** is a skeleton standing in for the shape of the content that is arriving —
same rows, same columns — so nothing changes size when data lands. **A skeleton carries
no text and no numbers by rule**; its only wording is spoken (*"Loading your home
screen"*, *"Loading your posts"*, *"Loading your analytics"*, *"Loading this page"*).

Most screens inherit one shared skeleton — a title block, one wide block, three rows.
A few own theirs, and where they do, **the skeleton reproduces the same responsive
switch the real content makes, so the cards do not jump.**

**In-flight actions are per-button, not per-page**: *Sending…* · *Deleting…* ·
*Adding…* · *Saving…* · *Reading…* · *Checking where it is used…* · *Cropping…* ·
*creating…*.

**Two paid actions replace their button with a rotating line that advances every 1.8
seconds and stops on the last rather than looping.** Both end on the same reassurance:

- Sites: *"Reading your Brand Brain…"* → *"Writing your homepage, section by section…"*
  → *"Building the page with your brand tokens…"* → **"Still working — if this fails
  you will not be charged."**
- Planner: *"Reading your Brand Brain…"* → *"Planning five posts across your week…"* →
  *"Placing each one at a sensible time…"* → **"Still working — if this fails you will
  not be charged."**

**Error is a distinct thing from every kind of nothing above: the read itself failed.**
And the product's rule is that a failed read must never be reported as an empty result.
Most error sentences say so in as many words:

- *"This is not a claim that it is empty — the list did not come back."*
- *"Reload — this is not a sign that nothing needs you."*
- *"Couldn't check your sites just now — reload before generating. You may already
  have a site, and generating again costs credits."*

**Error is per block, not per page.** Most screens have no whole-page error state at
all; each card degrades on its own. A whole-page failure falls to one shared boundary
that keeps the navigation on screen: *"This screen didn't load"* / *"Something broke on
our side, not yours. Try again in a moment — if it keeps happening, contact
support."* / **Try again** / an optional *"Reference: {id}"*.

**And a retry is offered only where a retry is the actual remedy.** Several states
deliberately name reloading instead, and two deliberately offer nothing:

- *"Sahoda can't read Instagram metrics here."* — **no retry, because refresh cannot
  conjure a key.**
- *"The model ran, but we could not confirm whether it was charged. **Check your wallet
  balance before you run this again.**"* — **the only failure message in the product
  that does not invite a retry.**

### 6.6 Which screens produce which

The per-screen list is inside each route's entry in §2, under **States**. The short
version:

- **Every signed-in screen**: loading · error · no workspace yet.
- **The three inbox lists**: all ten of vocabulary A — `/inbox` speaks vocabulary B
  instead.
- **The two single-conversation screens**: only the row-count ones, because exactly one
  account is asked and there is no fan-out to be uncertain about.
- **Every measurement screen** (`/analytics`, `/home`, `/brain/audience`, `/report`,
  post metrics): no data yet · not connected · connection expired · account
  unrecognised · not configured · suppressed · **and the slot-level marks on any
  individual figure**.
- **Every screen that depends on a connected channel** (`/posts`, `/planner`,
  `/connections`, `/loop`): not connected · connection broken — **plus the two-way
  auto-publish copy split described in the Planner entry**.
- **Every paid action**: not enough credits (**always naming the shortfall in real
  numbers**) · model unreachable · nothing usable came back · could not save · **and
  the charge-unconfirmed warning**.
- **Every unbuilt screen** (§7) has exactly one state, and it is not an empty state —
  it is a statement that the section does not work yet.

## 7. Coming soon

The founder's ruling is that **the roadmap must be visible** — a hidden feature
teaches nobody what the product is for, and the product's whole pitch is invisible if
the Loop is not in the menu. **The condition is that "visible" must never read as
"available".** Design these fully. The rules below are what keeps the two apart, and
they are enforced by an automated check, not by convention.

### 7.1 The four rules an unbuilt screen obeys

**1. No figure. Ever.** An unbuilt screen may not display a count, a sum, a
percentage, a range or a raw value. A test reads every placeholder control on those
routes and **fails if it finds a digit**. The single exception is a **price**, and only
where the price is real and read from the price list: Studio quotes its carousel price
and nothing else. On Studio the words *"Two to ten"* and *"no layer panel"* are written
out as words rather than digits **because of that test**, and a specification reference
containing a "4" was removed from the copy by it.

**2. A chip carries no count — not even a zero.** A count would be a count of a table
that does not exist, and **a zero would claim the collection exists and is empty**.

**3. Every control is inert, and inert does not mean disabled.** Drawn controls are
plain non-interactive containers, **deliberately carrying no disabled marker**, so a
screen reader announces them as *text* rather than as a broken control. **A disabled
button still announces an action that does not exist.** Playbooks puts it best: *"a
disabled switch is a dead end in the costume of a control."*

**4. The banner says the same two sentences everywhere.** Each screen contributes one
sentence of its own, and then two fixed ones follow, identical on every unbuilt screen:

> *"…**This is the screen as it will be. Nothing on it is connected yet, and no numbers
> are shown because there is nothing to measure.**"*

There is also a marker reading **Coming soon**.

### 7.2 The vocabulary of drawn-but-dead things

The placeholder kit provides: an **inert button**, an **inert chip**, an **inert
field**, an **inert media slot** (an empty frame whose *proportion* is the content),
an **inert panel**, an **inert row**, the **roadmap banner**, and a **not-running
note**. Every one renders as a plain container. **Clicking any of them does nothing at
all — they are not focusable and cannot be activated by mouse or keyboard.**

### 7.3 The unbuilt surfaces

**Fully drawn placeholders — no query behind them at all:**

| Route | What it will do | What it needs that does not exist |
|---|---|---|
| **`/studio`** | Make the picture that goes with the caption, from templates locked to the workspace's own colours, type and logo. Words, picture and slides are yours; colour, type, layout and spacing are fixed by the template. | **A picture renderer** — code that turns a locked template plus brand values into an image file. There is also no store of designs. |
| **`/ads`** and its four sub-screens | Paid campaigns beside the posts they support, under one goal and one report. | **Three things, and two are outside the product's control**: a customer's separate grant to their own ad account; the platforms' review of both the app's ads access and every individual ad, which *"take as long as they take and can be refused"*; and the money-handling build. **There is no ads table in the database at all.** See §8. |
| **The eight inert tiles on `/create`** | Story · Campaign · Ad · Broadcast · Article · Email · Report · Automation | Each waits on its own feature. **One of them — Campaign — names something already built and reachable, which is an inconsistency rather than a decision (§11).** |
| **The Videos and Documents chips on `/assets`** | Filter the library to non-image files | **An upload path that can prove a video's or document's type from its own bytes.** Today only JPEG, PNG, WebP and GIF are recognised, and those four are the union of what every channel accepts. |
| **The four blocked recipes on `/playbooks`** | New article, new post · New review, reply ready · New product, small campaign · A quiet post, remade | Each names its own blocker in a sentence — a safe feed reader, a receiver for arriving reviews, somewhere to learn a product exists, and the Remix engine. **None of the four renders a control of any kind.** |
| **The six entries in "What Remix cannot make yet"** | A carousel outline · a reel script · a quote card · an email · a blog outline · a WhatsApp broadcast | Each names its own blocker. **This panel is the clearest model in the product for how to state an unbuilt thing: a named blocker in a sentence, never a control that would do nothing.** |

**Built but not yet connected, which is a different thing:**

| Route | What it will do | What it needs |
|---|---|---|
| **`/radar`** | A competitor **change feed** — what moved, not what they posted. The screen, the watch list, the detail view and the paid draft action are all written and tested. | **One file bound to the collector's real column names.** Until then it renders one honest panel, and the menu's *Soon* is right about the scan even though it understates the screen. |

**Built, working, and mislabelled — see §11:**

| Route | Status |
|---|---|
| **`/loop`** | Runs, charges, has a scheduled job behind it. Menu says *Soon*. |
| **`/playbooks`** | Runs, charges, writes rows. Menu says *Soon*. |
| **`/report`** | Runs seven real reads, no inert controls. Menu says *Soon*. |
| **`/remix`** and **`/leads`** | Built, and their menu entries have already been flipped to live. |

### 7.4 Partially built screens with one dead thing inside them

- **`/assets`** — two inert filter chips inside an otherwise fully working screen.
- **`/create`** — one working tile and eight inert ones.
- **`/playbooks`** — one operable recipe and four inert cards.
- **`/wallet`** — everything about reading credits is real; **the Top up button opens a
  real order and cannot complete a payment.**
- **`/sites`** — generating and previewing are real; **deploying to a live address does
  not exist, and there is no control for it at all** rather than a dead one.
- **`/planner` and `/posts`** — scheduling is real; **whether a scheduled post actually
  goes out depends on a setting that defaults to off**, and both screens carry a second
  complete set of sentences for that case.
- **`/loop`** — the **Test** step is named in the seven-step strip and no code path
  performs it.
- **`/loop`** — **Autopilot** is described in full and cannot be selected. **It appears
  as prose with a padlock and the words "— not available", inside the explanation block
  only, never in the picker.**

### 7.5 What a coming-soon screen should still contain

Judging by the ones that exist, an unbuilt screen is expected to carry:

- the **shape** of the job, laid out in full — Studio draws four empty frames and names
  their proportions; Ads walks five screens;
- **the split between what will be yours and what will be fixed** — Studio's *"Yours to
  edit"* against *"Locked to your brand"*;
- **what it will cost**, when a real price exists — and **an explicit refusal to quote
  one when it does not**: *"A short video slideshow will be priced too. Its rate is not
  set in the price list yet, so this page does not quote one."*;
- **the one thing it is waiting on**, named plainly;
- and **a working link to whatever does the nearest real thing today** — Studio points
  at Assets, Radar at the Brand Brain, Ads at Analytics.

## 8. What will not be built

**A note on how this section is sourced, because it is the one place this document has
to hedge.** The brief for this document named four things as *deliberately dropped*:
Ads functionality, WhatsApp, Design Studio, and node-based workflows. **The code
agrees on one of the four and treats the other three as "not now, and here is exactly
what is in the way".** Where the two disagree, this document reports the code and
flags the disagreement, because that is the rule §0 sets — and because the difference
matters: *dropped* means stop maintaining a screen, *not now* means keep it and mark it.

**None of the four should carry a figure under any circumstances.**

### 8.1 Genuinely and permanently refused: the free canvas

**This one the code is unambiguous about, and it is refused in two separate places for
the same stated reason.**

**Studio will not have a free canvas or a layer panel.** In its own words:

> *"There is no free canvas and no layer panel. **Predictable output beats an open
> editor for a business with no designer.**"*

The trade is stated on the screen: **the words, the picture and the slides are yours;
the colour, the type, the layout and the spacing are fixed by the template.** *"This
is the trade: you cannot move a box, and nothing you export can come out off-brand."*

**Playbooks will not be a node-based workflow builder.** It shipped explicitly as *"a
curated recipe library, not a canvas"*. The person **picks a recipe off a shelf and
fills in two or three blanks**. There is no trigger builder, no condition language and
no graph. A library that showed only what you had already chosen *"would be a settings
page"* — so all five recipes always render, whether or not any are switched on.

**Design accordingly: neither surface should be drawn as a canvas, an editor, or a
node graph.**

### 8.2 Not now, with the blocker named — Ads

**The code's position is "coming soon with three blockers", not "dropped".** Five
screens are drawn, in full, with **no figure anywhere** — enforced by a test.

The three blockers, quoted from the screen itself:

1. *"Posting to your Instagram and running an ad from your ad account are two separate
   grants. Sahoda has the first one. The second needs a business account set up on the
   platform's side, and **it is yours to give — nothing here can arrange it for you**."*
2. *"Meta and Google review both an app's ads access and every individual ad. **Those
   reviews take as long as they take and can be refused.**"*
3. The money-handling build.

**Two of the three are outside the product's control**, which is the practical
argument for treating Ads as roadmap-only rather than as work in progress.

**Supporting evidence that ads are out of scope for now:** there is **no ads table in
the database at all**, and `campaigns` — the one adjacent table — was shipped
**deliberately without a budget column**.

> **Open question for you (§11): five fully drawn screens is five screens of
> maintenance. Keep them as a visible roadmap statement, collapse them to one page, or
> remove them?**

### 8.3 Not now, with the blocker named — WhatsApp

**WhatsApp is not a channel in this product**, and two separate screens say so in one
sentence each:

- Remix: *"**A WhatsApp broadcast** — Needs WhatsApp as a channel. **It is not one of
  the four.**"*
- Remix again, for email: *"**An email** — Needs somewhere to send it. Sahoda publishes
  to four channels and email is not one."*

**And the refusal is structural, not a setting.** The four-channel list is enforced by
a database constraint on **seven** tables, so a fifth channel is a migration rather
than a feature flag.

**One qualification worth carrying**: WhatsApp *does* appear in the inbox's reply-window
model, which knows WhatsApp's 24-hour service window and its template rule. So the
product understands WhatsApp as a place messages arrive from; it cannot publish to it.

**Anything in the reference that shows WhatsApp broadcasts, WhatsApp opt-in counts, or
a WhatsApp channel tile is showing something the product cannot do.**

### 8.4 Not now, with the blocker named — Studio

Separately from the canvas refusal above, **the Studio feature itself is unbuilt and
waits on one thing: a picture renderer.** *"Nothing here renders yet."* There is also
no store of designs: *"There is no gallery of designs to browse and no picture saved to
your library."*

### 8.5 Other things the reference shows that the product does not do

Not framed as dropped anywhere — they simply have no mechanism and no table:

- **Revenue, ROAS, conversions, clicks and attribution.** There is no order, no
  currency and no attribution anywhere in the schema.
- **Campaign budgets, spend and health scores.** Those columns do not exist.
- **Predicted performance of an unpublished post.** No model, no data, no table.
- **A best-posting-time recommendation.** The per-hour follower-activity figure it
  would need is absent from the whole upstream interface.
- **Customer order history and lifetime spend in the inbox.** No orders table — and the
  code names the exact false statement it is refusing: *"Orders 0 · Lifetime ₹0"*.
- **A Marketing Score, or any composite score.**
- **A "Reject" or "Send back" action.** Only approval is written from this app.
- **Multiple workspaces created by a customer.** Creating a second workspace is not a
  flow the product has, and there is deliberately no control for it in the switcher.
- **Content search.** The command palette moves between pages and **runs no database
  query at all** — deliberately, so that the shell's search box cannot become a surface
  that has to be kept honest against the database.
- **Folders, tags, collections or albums for assets.** No such column or table exists.
- **Drag to reschedule.** Times change only through the picker.
- **Hide, delete or like a comment.** The partner sends permission flags for all three
  and there is no handler behind any of them, **so they are not offered.**

### 8.6 Built once, and now dead

- **`/brain/competitors`** still exists as a route, but only as a redirect to `/radar`,
  **so an old bookmark does not break.** The tab was removed from the Brand Brain's tab
  row. **Do not design a Competitors tab.**
- **`/campaigns/new`**, the eight-step campaign builder with a budget slider and an AI
  health gate, **does not exist and has no counterpart.** Campaigns are created in a
  small dialog with four fields, none of them a budget.
- **Six guided tours and a progress table exist in the database, and the app is
  annotated with tour anchors throughout — and no tour engine exists.** Nothing reads
  either table. There is no mascot in the frame; the mascot artwork appears in exactly
  two page-level places.
- **Two tables are vestigial** and read by nothing: an old brand table superseded by
  the Brand Brain's own versioned store, and an old ledger superseded by the credit
  ledger.

## 9. What the current reference has never seen

Everything below arrived after the version of the UI package this document is written
against. Each entry says what it does and what feeds it. Full detail is in §2.

### The navigation itself was rebuilt

**10 destinations became 21, in five named groups.** The groups are named for the
**job**, not the module — *Create · Publish · Customers · Results · Automate* — and
Home and Brand Brain sit above them, ungrouped, because the Brand Brain is what every
screen below writes from.

Within a group, **what works is listed before what does not**, so the eye lands on
something usable and the roadmap trails it. And the whole roadmap is deliberately
**visible**: eight destinations are marked *Soon* and are real, followable links to
pages that say plainly they do not work yet.

Three surfaces project that one list: the rail, the phone's bottom bar plus its More
sheet, and the command palette. **They cannot disagree, because there is only one
list.**

### The Loop, and the Autonomy Dial

**The largest addition, and the product's actual thesis.** A weekly cycle of seven
named steps — **Collect · Reflect · Plan · Create · Test · Stage · Report** — with a
**halt between Plan and Create** where a person reads a priced list and approves a
number before anything is written.

The **Autonomy Dial** is set **per channel**, not per workspace: *Suggest* (writes
nothing) · *Draft* (writes drafts, the default) · *Approve to publish* (schedules, and
publishes on your approval). **A fourth level, Autopilot, is described and cannot be
chosen** — the database physically refuses to store it. **A brief that spans several
channels is governed by the lowest level among them.**

There is a weekly credit budget, a cost preview whose total the database recomputes
and refuses if it disagrees with the button, and a **kill switch** that returns
everything to draft without deleting anything.

Fed by: measurements, connections, the Brand Brain, and one model call per week.

### The Signal Resolution Console

A single queue of everything the product guessed about the business, ordered by **what
it had least business guessing**. Eleven of the fifteen fields are marked *"Only you
know this"*; four are marked *"Sahoda proposed this."* Confirming is free and never
re-runs the model. It also states, plainly, that it **cannot show which sentence
produced which field, and will not invent one.**

### The Knowledge library

Documents the owner hands over — a PDF, a web page, or something typed — chunked into
passages the product can quote. A post that names a price uses one from here, or does
not name one. **Adding is free; reading the whole library to teach the Brand Brain
costs 50 credits and writes only *suggestions*, never the Brain itself.**

It also names, per document, how many places in it were **written as if addressing an
assistant** — and reads them as words on a page, never as instructions.

### Audience

Real follower data, and the product's clearest demonstration of the honesty rule: **a
platform that withholds data answers successfully with empty arrays**, so suppression
has to be *inferred* from the follower count, and the screen says so rather than
reporting "no audience".

### Radar

Competitor watching built as **a change feed, not a content feed** — what *moved*, not
what they posted. Two chips separate observation from interpretation: **Seen** and
**Our read**. The screen is fully written; its read is not yet bound, so today it
renders one honest panel.

### Playbooks

Standing instructions picked **off a shelf**, not authored on a canvas. Five recipes;
**one operable**; the other four render no control at all, each naming the one thing
it waits on. Firing one costs nothing — it comes back with a priced list to approve.

### Remix

One long post becomes a week of them. **Adding a channel adds a draft, not a credit.**
It also carries a panel naming six things it cannot make yet and exactly what each
one needs.

### Leads

A four-column board — **New · Contacted · Won · Lost** — fed two ways: an embeddable
contact form for a website the shop already owns, and promotion from the inbox. **A
platform conversation carries a handle rather than an address, so those fields stay
empty rather than being filled with something that is not one.**

### Assets, with a delete gate — and the crop offer

A media library where **deletion is refused when a photo is used by a post that has
gone out or is about to**, enforced twice: once in the app and once as a database
trigger, so a second browser tab cannot walk past it. It also refuses to delete when
the *check itself* failed.

**The crop offer** appears when a photo is refused for a channel's shape. It shows the
original and the crop side by side, one row per channel with **the rule that channel
actually declares**, and produces a *child* of the original. **The original is never
modified.** Declining changes nothing.

### The rebuilt onboarding

Rebuilt around reading the business from one thing it is given, rather than a form.
See §2 and §10.

### Webhooks

A receiver that stores what the platform pushes and files it onto the inbox — with
truthful status codes, a five-second budget, and an explicit refusal to invent a
channel for an event it cannot file.

### Smaller, but structural

- **Wallet is its own destination**, no longer a Settings tab.
- **Conversations became Inbox**, split into comments, messages and reviews.
- **Brand became Brand Brain**, at `/brain`, with a Competitors tab removed and three
  tabs added.
- **The composer's follow-and-detach mechanism** — see §3. There is no equivalent in
  the current reference.
- **Certainty**, a third axis on every post: *real · committed · proposed · simulated ·
  failed · neutral*, computed from the channel rows rather than the post's own status.
- **"Simulated" as a first-class outcome** — a post can read *Published* on every
  channel while nothing ever reached a platform.
- **The eight kinds of nothing** (§6).
- **The three absence marks** — *does not exist* renders nothing, *not measured*
  renders one mark, *could not be read* renders a different one.
- **Two breakpoints, 700 and 1180**, producing three layouts.

## 10. The flows

Each journey as a sequence of screens and decisions. Screens are named by their URL.
Branches are written out. No layout.

### 10.1 First run — from nothing to a Brand Brain

1. **`/`** — a redirect. There is no marketing page. → the sign-in screen.
2. **`/sign-up`** — the hosted sign-up card, inside the product's own frame.
3. **`/home`** — **and this is the part most easily got wrong: signing up does not
   create a workspace.** So the first screen a brand-new account sees is `/home` in its
   **no-workspace** state: *"Create a workspace to get started"*, with one button.
4. Pressing **Create workspace** creates, **in one transaction**, the workspace, the
   owner's membership, the profile, and **the free signup credit grant**. It is
   **idempotent** — a second press returns the workspace that already exists. → redirect
   to onboarding.
5. **`/onboarding`, the intro.** It states the price up front, and **the server decides
   which sentence to show**: *"Building it is free the first time."* or *"Rebuilding it
   uses 50 credits, shown again before you spend them."*
   - **→ "I'll do this later"** saves the answers to the browser and goes to Home. The
     account now has a workspace and no Brand Brain.
6. **Steps 01 to 06** — brand basics · positioning · audience · visual identity ·
   references · knowledge. **Only three fields in the whole flow are required**: the
   brand name, something on positioning, and the ideal customer.
7. **Meanwhile, invisibly:** leaving step 01 starts the website read in the background.
   **Nothing about it is shown while it runs**, and it never blocks. Measured: half of
   reads finish in about 26 seconds, nine in ten within 37.
8. **The rivals step** — optional competitors.
9. **Build.** **Both buttons on that row run the same paid action** — *Build my Brand
   Brain* and, confusingly, *Skip for now*. It waits up to 45 seconds for the website
   read, then runs the model behind a full-screen overlay with **no percentage**.
   - **→ not enough credits.** *"Not enough credits to resolve your Brand Brain."* —
     **and no retry is offered**, because retrying cannot help.
   - **→ the model could not be reached.** A **sample** Brand Brain is shown instead,
     under a sentence saying exactly that, **and nothing is charged.** *(That sample
     state persists: `/brain/resolve` will later announce it as "A sample, not your
     brand".)*
   - **→ the website read failed.** One sentence above the result, **and the wording
     distinguishes a verdict about the page from a request that never reached one.**
   - **→ the website read is still running.** *"…so it was built without it. That is not
     a verdict on your site."*
10. **The result card**, with a Confidence word — *High · Medium · Getting started* —
    and **"What Sahoda learned"**, composed only from what was actually given.
11. **Enter Sahoda** is what actually writes: the workspace theme, **only when there are
    colours to save**, then the Brand Brain as a new version.
12. **→ `/brain/resolve`** is where the fifteen filled-but-unconfirmed fields get
    settled, free, one at a time. Confirming is free and **never re-runs the model**.

**What does not exist at the end: a connected channel, and a first post.**

### 10.2 Writing and publishing a post

1. **Entry.** Four doors, and **they do not all land in the same place**: the
   **`+`** button on a phone and **Create post** on `/home` and `/posts` go **straight
   to the composer**; the command palette's **Create** row goes to **`/create`**, the
   chooser, whose one working tile then goes to the composer.
2. **The composer.** The post row is **not created until the first save that has
   something to write.**
3. **Pick channels.** Instagram, LinkedIn, X, Google Business Profile.
4. **Write.** Each channel **follows the canonical body until the writer edits that
   channel**, at which point it **detaches** and keeps its own words. A detached channel
   offers **"Follow the post again"**, which mirrors the post's text across **without
   writing anything** and offers **"Put my {Channel} copy back"** as an undo.
5. **Choose a format per channel** — see §3.3. Not one global choice.
6. **Validation runs live, per channel**, against the real limits in §3.5. Over the
   limit: *"{channel} allows {N} characters; this has {M}."*
7. **Attach media, if needed.** Instagram **requires** it.
   - **→ the photo is refused for a channel's shape.** The **crop offer** appears. Using
     the crop produces a *child* of the original and never modifies it. **Declining
     changes nothing** — the refusal is still on the page and the post still has no
     photo.
   - **→ no crop can help.** One quiet sentence saying which of six reasons applies, and
     no offer.
8. **Ask for help, optionally.** Every AI action states its cost in the button before
   it spends: *"Generate variants for 3 channels · 3 credits"*, *"Uses 1 credit"*.
   - **→ not enough credits.** The shortfall is named in real numbers, and **nothing is
     charged.**
9. **Then one of three branches:**
   - **Publish now** → the publish endpoint. The person waits about **fifteen seconds**
     for a link back.
   - **Schedule** → a time, **at least five minutes ahead**. **And whether it then goes
     out by itself depends on a deployment setting that is off by default** — the card
     says which world it is in, in one of eight sentences (§2, Planner).
   - **Send for review** → `/approvals`, where someone ticks it and presses **Approve
     {n}**. **There is no reject.**
10. **Afterwards.** Each channel carries **its own** publish state, permalink and error.
    The post's own status can read `partial`. **A channel chip becomes a clickable link
    only if the platform actually returned a URL** — a published post with no permalink
    is a fourth state to design.

### 10.3 A failed publish — one channel out, one channel not

1. The post lands in **`/approvals`**, in the **second list, "Did not go out"** — which
   **has no checkboxes and no bulk action**, because approval cannot fix it.
2. It also appears in **`/home` → "Needs your attention"** with the word **Failed** or
   **Partly published**, and in **`/posts`** under the **Needs you** filter — **not
   under Published**, deliberately, because filing `partial` under Published would state
   an outcome for the channels that never went out.
3. **Neither of those screens says which channel failed or why.** The row's only remedy
   is to open the post.
4. **In the composer**, the failing channel carries its own error and its own retry.
5. **Charging:** a failure that did no work charges nothing, and the message says so.
   Where a partial charge happened, the real number is reported rather than a claim of
   zero. Credits reserved by a crashed action are **released by a sweep that is off by
   default** — until then the Wallet says they *"are not released automatically"*.
6. **A stuck publish is resolved by a background sweep**, also off by default. Until it
   runs, the product's record and the customer's account can disagree indefinitely.

### 10.4 Connecting a channel

1. **`/connections`** — eight tiles, four connectable.
   - **→ the plan is full.** The sentence names the plan, the allowance, the current
     count and the cheapest plan with room. **Nothing is charged and nothing starts.**
   - **→ the environment has no publishing key.** *"Publishing key isn't set in this
     environment."*
   - **→ the person is not an owner or editor.** *"Only an owner or editor can connect
     an account."*
2. **Connect {channel}** → the browser **leaves Sahoda entirely** for the partner's own
   consent screen. **The partner, not Sahoda, holds the resulting credential.**
3. **The return trip has five outcomes**, each with its own pair of sentences:
   connected · some accounts didn't finish · that connection didn't finish · your plan
   is full · **nothing new to connect** (*"you may have closed its screen before
   approving"*).
4. **Later, it breaks.** Access lasts 60 days with **no renewal and no warning signal**,
   so the countdown is computed here and refreshed by a sweep that is off by default.
   The health banner escalates: *"within {N} days"* → *"today — access ends tomorrow"* →
   *"its access has run out and scheduled posts will not go out."*
5. **Reconnect** is the same trip again. **There is no refresh** — it means consenting
   from scratch. Nothing is deleted first; the same account lands back on the same row.
6. **Disconnect** is the only two-step confirmation on that screen, and **it disarms
   itself after 8 seconds**. It removes the sealed credentials with the row — **the only
   way the app can make them disappear.**

### 10.5 Running the Loop

1. **`/loop`** — set the **Autonomy Dial per channel**: *Suggest* · *Draft* · *Approve
   to publish*. **Autopilot is described and cannot be chosen.** A channel with no
   setting runs at *Draft*.
2. Set a **weekly budget** (0–5,000 credits) and make sure the Loop is not paused.
3. **A cycle starts one of two ways** — the **Plan my week · 20 credits** button, or the
   Sunday job, **which is off unless deliberately switched on** and which only touches
   workspaces that already have a settings row.
   - **→ no channel is connected.** *"Sahoda has nowhere to plan for."* **Nothing is
     charged.**
4. **Collect → Reflect → Plan**, then **it halts.** Reflect is pure arithmetic and makes
   no claim unless it clears four floors. Plan is the one paid step, and **must return
   exactly five briefs.**
5. **The cost preview.** A priced list. Untick anything. **The number on the button is
   sent to the database, which recomputes it and refuses if they disagree** — *"The plan
   changed while you were looking — check the new total."*
   - **→ untick everything.** *"Keep at least one post, or stop the Loop below."*
   - **→ over budget.** It says by how much, and lets you approve anyway: *"the budget
     is yours to set."*
   - **→ a viewer presses it.** *"Your role cannot approve spending."*
6. **Write this week.** 3 credits per brief actually written. **A brief on a channel set
   to *Suggest* writes nothing and costs nothing.** A brief spanning several channels is
   governed by **the lowest** level among them.
7. **Where each draft lands depends on the dial**: nothing at *Suggest*; a dateless
   draft at *Draft*; an approved post with a time at *Approve to publish*.
8. **Then Report**, at `/report` — **which shows exactly one sentence when no cycle has
   ever run.**
9. **At any point: Stop the Loop.** It asks first. It cancels unfinished cycles, returns
   scheduled posts to draft with their times cleared, marks the briefs skipped and pauses
   the Loop. **Nothing already published or already sending is touched. Nothing is
   deleted.** Reserved-but-unspent credits come back afterwards. And **it scopes its work
   through the brief-to-post link rather than the post's origin**, so a post the person
   made themselves is not swept up.

### 10.6 Hitting a limit, and paying

1. **A limit is hit at the point of action, and it is stated before anything is
   charged**, not after:
   - channels — *"Your Free plan includes 2 channels and you're using 2. Starter
     includes 4."*
   - sites — *"Sites are on Starter and above — your Free plan doesn't include one."*
   - credits — *"Generating needs 100 credits and you have 40. Nothing was generated and
     you were not charged."*
2. **`/wallet`** — pick **Starter**, **Growth** or **Agency**. **Free is deliberately
   excluded, because there is nothing to check out for.** *"Nothing is charged and no
   credits are added until a payment completes."*
3. **`/billing/checkout/{order}`** — a real order is opened.
4. **→ and it stops there.** The checkout page **never hands the payment session to the
   browser, and says so on screen.** No payment can complete in this deployment.
5. **When it does work**, the payment receiver applies the plan's monthly grant — **and
   the amount comes from the plan catalogue, not from the payment.** If that receiver is
   unconfigured, **a customer who has paid sees no new credits and nothing anywhere says
   a payment was received.**

### 10.7 Getting the data back out

1. **`/settings`**, the **Your data** panel.
2. **Download a copy** → **one JSON file**, named for today's date.
3. **It covers 30 tables: 29 read and included, and 1 named as excluded with its
   reason.** Each carries a plain-words description rather than a table name.
4. **Afterwards it tells you what it left out**, as a count and a sentence — or
   *"Nothing was left out."* **The file itself also lists every omission and why, "so
   you can tell an empty section from a missing one."**
5. **Each table is capped at 5,000 rows, and the file flags per table whether that cap
   was hit.**
6. **Deleting is deliberately not self-serve.** *"Email support@sahodalabs.com from the
   address you signed up with… It is done by hand today, not self-serve."* And what
   survives is stated: *"Your credit and payment record is kept — it is what proves what
   you paid and what you were charged, so it is not ours to erase."*

## 11. Open questions

Each of these is a structural call the product has made that you may want to
challenge. They are stated as questions because they are yours and the founder's to
settle, not ours.

### On what the menu claims

**1. Three screens are built and the menu says they are not. Which one is wrong?**
`/loop` and `/playbooks` run live queries, write real rows and spend real credits,
and the repository's own honesty check has removed them from its list of drawn
screens — but both still carry *Soon*. `/radar` is the reverse-ish case: its screen is
fully written but its read is unbound, so *Soon* is arguably right for now. Should the
first two be flipped to live, and if so does the Loop's cost preview need a different
first-run treatment for people who will now find it?

**2. Six screens are reachable only from a tab row inside one section.**
`/brain/identity`, `/brain/voice`, `/brain/resolve`, `/brain/audience`,
`/brain/knowledge` and `/create` appear in **no** navigation surface — not the rail,
not the phone sheet, not the command palette. The Signal Resolution Console in
particular is a substantial screen with no way to find it except by opening Brand
Brain first. Is that deliberate depth, or should some of them surface?

**3. `/create` lists "Campaign" as *Coming soon* while `/campaigns` is built and in
the menu.** That is a straightforward inconsistency; which way should it resolve?

### On autonomy and money

**4. The plan catalogue promises an autonomy level the database cannot store.**
Growth and Agency both carry a loop-level limit of **3**, and the autonomy column is
constrained to **0–2**. So the plans sell Autopilot and the product refuses it. Should
the plan limit come down to 2, or should the constraint be the thing that changes when
L3 ships?

**5. The Wallet says *live* but cannot take money.** Everything about reading credits
is real; the Top up button opens a real order and can never complete it. Should that
button be replaced by a statement while the payment step is unfinished, or is the
current wording enough?

**6. Nothing in the product can be rejected — only approved.** There is no Reject, no
Send back and no Request changes anywhere: `/approvals` writes only the approval, and
the second list has no controls at all. Is a rejection path wanted, and if so, what
does a rejected post become?

**7. `/approvals` is silently capped at 100 while `/posts` and `/planner` both say so
when they hit the same cap.** In a busy workspace both counts on that screen, and the
navigation badge, can under-report with nothing telling anyone. Should it carry the
same notice?

### On the states

**8. "We could not check today" does not exist anywhere in the product.** Four
scheduled jobs feed screens, **three of them are off by default**, and when one stops
the screen it feeds looks exactly like "nothing happened". The starkest case: the
Wallet tells a customer their stranded credits *"are not released automatically"* — a
sentence that is true only while the sweep that would release them is switched off.
Should there be a shared treatment for "this figure comes from a check that did not
run", and where should it appear?

**9. A phone user cannot see how many approvals are waiting, anywhere.** The count
badge is a rail-only feature; neither the bottom bar nor the More sheet carries it.
Is that acceptable, or does the phone need its own signal?

**10. `/analytics` handles "no workspace" four different ways on one screen.** One card
has a purpose-built sentence; two fall through to *"Connect Instagram…"*; the tables
fall through to *"Nothing published yet"*. Should the whole screen have one
no-workspace state, as `/home` and `/brain` do?

**11. `/brain/audience` has no sentence for a stalled daily record.** A collection that
stops shows only as an old date and a gap in the chart. The collector itself treats
three days without a reading as a stall. Should the screen say so, and in what words?

**12. `/brain/audience` collapses two different things into one branch.** A person with
no workspace is told *"No Instagram account is connected"*, and a workspace read that
*failed* is told *"Instagram did not answer just now"* — even though Instagram was
never asked. Both are wrong sentences for their condition.

### On scope

**13. A campaign here is a grouping and nothing else.** No budget, no spend, no
revenue, no health score — and the product's own note says grouping is *"perhaps a
tenth"* of what most people mean by the word. Is "Campaigns" the right name for what
this is, or does the thing need a smaller word until the rest exists?

**14. The Ads section is five fully drawn screens for something the roadmap treats as
dropped.** They are honest — no figure anywhere — but they are also five screens of
maintenance. Should they stay as a visible roadmap statement, collapse to one page, or
go?

**15. Six seeded guided tours exist in the database, the app is annotated with tour
anchors throughout, and no tour engine exists.** Is the guided tour still wanted? If
so it is a whole surface with no design yet.

**16. A photo carries one crop per attachment.** Attaching the same photo to a second
post cannot reuse a crop cut for a different channel set. Is that the intended model?

**17. Two tabs in the Ads section have labels that do not match their addresses** —
*Audience* points at `targeting`, *Results* at `performance`. Harmless today; worth
settling before anyone links to them.

**18. Radar's watch list rows do not link to the per-competitor screen.** `/radar/{id}`
is fully written and, as far as we can find, nothing in the app links to it. Should a
row be a link?

### On the things that are true and might not be intended

**19. Three post statuses are never written by the app** — *Idea*, *In review* and
*Expired* — yet all three appear in the status vocabulary and two of the five filter
tabs on `/posts` depend on them. So *Needs you* and *Drafts* are thinner than they
look. Should the unused states go, or should something start writing them?

**20. The Loop describes a Test step that no code path performs.** The seven-step strip
names *Test — "Each draft is read by your Audience Twin before anyone else sees it"*,
and the cycle moves from creating straight to staging. Should the step be drawn as
not-yet, or is the Twin about to land?

**21. `post_metric_snapshots` holds only three metric names, on only two channels.**
Impressions, reach and engagement, from Instagram and LinkedIn. X and Google Business
Profile have never reported one figure. Any analytics design that assumes four
comparable channels will be drawing three empty columns.

### Three found late, and each is a small trap

**22. On the last step of onboarding, "Skip for now" runs the paid build.** Both
buttons on that row call the same 50-credit action; nothing is skipped. That is a
labelling bug rather than a design decision, and it is the highest-consequence one in
the document.

**23. Two onboarding failure sentences tell the person to "press Read this" — a button
that does not exist anywhere in that flow.**

**24. Seats are a plan number with no screen behind them.** Every plan states a seat
allowance — 1, 1, 3, 10 — and there is **no team list, no invite flow and no member
management anywhere in the customer product.** Four member roles exist and are shown in
the rail (*Workspace owner · Editor · Approver · Viewer*), and nothing lets anyone
assign one.
