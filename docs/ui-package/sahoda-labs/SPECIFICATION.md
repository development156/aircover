# Sahoda Labs — Complete Specification

**AI Marketing Operating System · Front-end reference implementation**

Single-document reference covering the product, design system, architecture,
API, data contract, components, features and the path to production. Everything
below is verified against the source, not recalled.

| | |
|---|---|
| **Version** | 1.0 — August 2026 |
| **Stack** | Vanilla HTML / CSS / JS. No build step, no dependencies, runs from `file://` |
| **Size** | 57 files · 5.2 MB · 3,285 lines CSS · 6,312 lines JS |
| **Scope** | 10 routes, ~24 sub-views, 86 UI icons, 16 platform marks |
| **Status** | Complete. Zero runtime errors across all routes, desktop and mobile. |

---

## Contents

1. [Product](#1-product)
2. [Information architecture](#2-information-architecture)
3. [Design system](#3-design-system)
4. [Motion system](#4-motion-system)
5. [Architecture](#5-architecture)
6. [API reference](#6-api-reference)
7. [Data contract](#7-data-contract)
8. [Component reference](#8-component-reference)
9. [Feature catalogue](#9-feature-catalogue)
10. [Responsive behaviour](#10-responsive-behaviour)
11. [Accessibility](#11-accessibility)
12. [Assets](#12-assets)
13. [Implementation guide](#13-implementation-guide)
14. [Verification](#14-verification)
15. [Decisions log](#15-decisions-log)
16. [Known limits](#16-known-limits)

---

## 1. Product

### Mental model

Every screen communicates one idea:

> **AI executes. You supervise. You approve what matters.**

| Page | Answers |
|---|---|
| Home | What happened · what needs me · what next |
| Approvals | What must I decide, and how fast can I decide it |
| Planner | What is going out, and when |
| Brand Brain | What does the AI know about us |
| Analytics | What worked, and what should change |
| Campaigns | What are we running, and is it healthy |
| Conversations | Who is talking to us |
| Assets | What can we publish |
| Connections | Is anything broken |
| Settings | Who we are and how the AI behaves |

### The four questions Home answers, in order

1. **What happened?** — the AI activity feed
2. **What is happening?** — performance metrics with sparklines
3. **What needs my attention?** — the approval queue preview
4. **What should I do next?** — contextual AI, planner, connections

---

## 2. Information architecture

```
/home                  Greeting banner · performance · attention · week · AI · brand · connections
/approvals             The supervision queue
/approvals/:id         → detail drawer over the list
/planner               Calendar + Board over the same events
/brand                 Overview
/brand/identity        Logo · colours · typography · positioning
/brand/voice           Traits · tone sliders · generated example
/brand/audience        Demographics · interests · pains · goals
/brand/competitors     Tracked rivals + AI comparison
/brand/knowledge       Document library with index status
/analytics             KPIs · trend chart · channel table · AI insights
/campaigns             List with filters
/campaigns/new         8-step builder with an AI health gate
/campaigns/:id         Detail — metrics, channels, creative, insights
/conversations         Omnichannel inbox (list · thread · customer context)
/conversations/:id     → selects that thread
/assets                Creative library, grid or list
/assets/:name          → asset drawer
/connections           Grouped by Social/Advertising/Commerce/Messaging/Analytics
/settings              Workspace
/settings/profile      · team · notifications · integrations · billing · credits · security
```

**Creation is global, not a route.** The `+` button, `C` and `⌘K` all open the
Create menu, which launches a flow in a modal so the page behind is preserved.

---

## 3. Design system

### Palette — five colours

| Token | Value | Role |
|---|---|---|
| `--orange` | `#FF6600` | CTAs, active state, attention. **Rationed.** |
| `--black` | `#000000` | Primary text, headings, dark surfaces |
| `--grey` | `#575756` | Secondary text, muted elements |
| `--gainsboro` | `#DCDCDC` | Borders, dividers, disabled |
| `--white` | `#FFFFFF` | Background, high-contrast surfaces |

Everything else is one of those five at reduced alpha:

```css
--orange-06 --orange-10 --orange-16 --orange-24 --orange-40
--black-02 --black-04 --black-06 --black-08 --black-12 --black-30 --black-45 --black-60
--white-06 --white-10 --white-16 --white-45 --white-70
```

**Permitted non-palette values** (all achromatic or contained):

| Value | Why |
|---|---|
| `#FAFAFA` `#F4F4F4` | Light-theme surface steps — black at low alpha, flattened |
| `#0B0B0C` `#131315` `#17171A` `#1F1F23` | Dark-theme surfaces. You cannot build a dark UI from pure black. |
| `#FDF3EC` | Peach ground matched to the greeting banner artwork, so there is no seam |
| Platform logo colours | Channel identity, contained in `.tile--brand` |
| Mascot face colours | Character display, contained in `.mface` |

### Status — four rungs, no hue

Status is carried by **fill weight + glyph + label**, never colour alone.

| Rung | Appearance | Meaning | Class |
|---|---|---|---|
| 1 | Solid orange + `!` | Overdue, urgent, broken. **The only thing that shouts.** | `.badge--urgent` |
| 2 | Solid black | Active, current, selected | `.badge--active` |
| 3 | Orange outline + `!` | Pending, in review | `.badge--pending` |
| 4 | Grey outline + `✓` | Done, scheduled, informational | `.badge--calm` |

Rationale: the brand has no green/red pair. Rather than smuggle extra hues in,
status is encoded in weight and iconography — which also survives colour
blindness and greyscale.

### Typography

```
--font: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif
Scale:  11 · 12 · 13 · 14 · 16 · 18 · 20 · 24 · 30
Base:   13px / 1.5
Weights: 400 · 500 · 550 · 600 · 650 · 700
Headings: -0.01em to -0.02em tracking
```

`.tabnum` (tabular figures) on **every** number that sits in a column.

### Spacing, radius, elevation

```
Spacing:  4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48   (--s1 … --s9)
Radius:   6 (sm) · 8 · 10 (md) · 12 (lg) · 999 (full)
Frame:    sidebar 232px (64 collapsed) · header 56px · page padding 24px
Controls: button 34px (28 sm, 40 lg) · input 38px
```

**Elevation is hairline-first.** Cards are separated by a 1px border, not a
shadow. Shadows are reserved for things that genuinely float: drawers, modals,
popovers, toasts, the chat panel.

### Dark theme

Tokens are redefined under `[data-theme="dark"]` on `<html>`. Nothing else in
the codebase knows a colour value, so the theme is a single override block.

---

## 4. Motion system

**One rule: every animation answers a question.** What changed, where did it come
from, where did it go, what is happening, what needs me, what worked.

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1)
--ease:     cubic-bezier(0.2, 0, 0.2, 1)
--spring:   cubic-bezier(0.34, 1.4, 0.5, 1)
--t-fast: 150ms   --t: 200ms   --t-mid: 280ms   --t-slow: 340ms
```

| Movement | Duration | Says |
|---|---|---|
| Page content enters (fade + 6px up) | 280ms | You navigated; the shell did not |
| List rows stagger | 200ms, 22ms apart, capped at 8 | These arrived together |
| Button press | 90ms `scale(.98)` | Received |
| Card hover | 200ms, 1px lift | Clickable |
| Row leaves the queue | 220ms, slide right | Decided and gone |
| Drawer slides in | 280ms | It came from the edge |
| Modal scales 0.98 → 1 | 200ms | Focus moved here |
| Chat panel grows from launcher | 280ms | Same object opening |
| Chart line draws | 700ms, once | Follow the trend |
| Mascot breathes | 1.6s loop, **only while working** | Something is happening |

**Only `transform` and `opacity` are animated** — both composite on the GPU and
never trigger layout. The single exception is `.bar__f` width, which is small
and isolated.

**The scrim is 28% black with no blur.** A drawer belongs to the page behind it;
blurring that page denies the relationship.

`prefers-reduced-motion` removes every decorative loop (mascot breathing, glow,
streaming caret, chart draw, hover lifts) and keeps only essential state
transitions.

---

## 5. Architecture

### Module graph — load order *is* the dependency graph

```
js/icons.js        UI_PATHS · BRAND · BRAND_PNG · icon() · brandIcon() · PLATFORM_LABEL
js/data.js         DB · STAGES
js/ui.js           PAGES{} · $ · $$ · esc · Overlay · drawer/modal · toast · charts · badges
js/interactions.js runAction · Keys · createAutosave · highlight · ChartTip · removeRow
js/ai.js           MASCOT · mascot() · AITask · stream() · aiResult() · contextualAI()
js/chat.js         Chat
js/pages/*.js      each registers into PAGES
js/app.js          NAV · LOGO · App — boots on DOMContentLoaded
```

> **Two rules that break the app if violated.**
> 1. `PAGES = {}` is declared in **`ui.js`**, not `app.js`. Page files run first
>    and register into it; moving the declaration throws `PAGES is not defined`.
> 2. `app.js` must be **last** — it boots and expects every page registered.
>
> Both constraints vanish under a bundler; they exist only because there is no
> build step.

### Boot

```
DOMContentLoaded → App.start()
  ├─ applyTheme(localStorage['sahoda-theme'] ?? 'light')
  ├─ renderShell()                       // sidebar + header + mobile nav
  ├─ addEventListener('hashchange', navigate)
  ├─ navigate()                          // first route
  ├─ Keys.init()                         // one global keydown listener (capture)
  └─ Chat.init()                         // mascot launcher + 6s proactive peek
```

### Routing

```
#/campaigns/c1  →  route 'campaigns', params ['c1']
```

`App.navigate()` parses the hash, falls back to `home` for unknown routes,
pushes the previous location onto `App.trail`, closes overlays and popovers,
clears the page keyboard scope, syncs nav, renders, scrolls to top.

### Render lifecycle

Every page is three optional functions:

```js
PAGES.x = {
  skeleton()          { return '<html>' },   // optional
  render(params)      { return '<html>' },   // required — returns a STRING
  mount(host, params) { /* handlers */ },    // optional — receives live DOM
};
```

The string/DOM split is deliberate: markup stays declarative and every page is
testable by asserting on the returned string.

```
App.render({ withLoading })
  1. reset the full-height override left by Conversations
  2. paint skeleton → setTimeout(paint, booted ? 90 : 220)
  3. paint(): innerHTML = render() → add .page-in → mount() →
     bindContextualAI() → wire [data-back]

App.refresh()      // same, WITHOUT the entry animation
```

**Use `refresh()` after a state change.** A state change is not a navigation and
must not look like one — calling `render()` after an approval flashes the whole
page and the interaction feels like a reload.

**Optimistic updates bypass the cycle entirely** and mutate the DOM directly,
because a re-render would destroy the exit animation and scroll position.

### State — deliberately split three ways

| Kind | Lives in | Example |
|---|---|---|
| Domain data | `DB` | approvals, campaigns, connections |
| View state | the page module | `Approvals.filter`, `Planner.view`, `Inbox.active` |
| Session state | `App`, `Chat`, `localStorage` | `App.trail`, theme, recent searches |

View state on the module is what lets `App.refresh()` be a pure re-render — the
filter, cursor and selection survive because they were never in the DOM.

### Overlay stack

LIFO, so dialogs open on dialogs and `Esc` unwinds one layer at a time.
`Escape` order: **popover → overlay → chat**. Every overlay gets a scrim, focus
trap, focus restoration, swipe-to-close, and `role="dialog" aria-modal="true"`.

### Keyboard layer

One global listener in capture phase. Global: `⌘K` search · `C` create · `Esc`
close · `?` help. Pages register their own scope in `mount()`.

Two guards that matter:

```js
if (Keys.isTyping(e)) return;       // never hijack a keystroke meant for a field
if (Overlay.stack.length) return;   // letters stand down while a dialog is open
```

---

## 6. API reference

### Icons

```js
icon(name, cls?) → string          // stroked, currentColor, ~86 available
brandIcon(name, cls?) → string     // platform mark; real logo or SVG fallback
PLATFORM_LABEL                     // key → display name (16 platforms)
BRAND_PNG                          // key → filename in icons/
```

### DOM & overlays

```js
$(sel, root?)  $$(sel, root?)  esc(str)  isMobile()  reducedMotion()

Overlay.open(html, { kind, onMount, dismissable, label }) → HTMLElement
Overlay.close()  Overlay.closeAll()  Overlay.stack
// kind: 'drawer' | 'drawer-wide' | 'modal' | 'modal-lg' | 'sheet' | 'cmdk'

drawer({ title, sub, body, foot, wide?, onMount })
modal({ title, sub, body, foot, large?, onMount })
confirmDialog({ title, message, confirmLabel?, destructive?, onConfirm })

toast(message, { kind?, icon?, ms?, action? })
notify.success | error | warning | info | ai          // max 3 on screen

popover(anchor, html, { align? })   closePopovers()
menu(anchor, items, opts?)          // items: { label, icon, on, active, sep, heading }
```

`esc()` is **not optional** on any interpolated data.

### Rendering helpers

```js
sparkline(points, { w?, h?, fill? }) → string
ring(value, { size?, stroke?, label? }) → string
lineChart(series, labels, { h?, fill?, interactive? }) → string
shareBar(pct, ink?) → string

statusBadge(status) → string       // maps onto the four-rung ladder
deltaTag(delta, dir) → string
emptyState({ ic, title, desc, action, accent }) → string
errorState({ title, desc, action }) → string
skeletonList(rows?) → string       skeletonCards(n?) → string
platformTile(key, size?) → string  initials(name) → string
```

### Behaviour primitives

```js
runAction(btn, { busy, done, work, ms, restore, onDone }) → Promise
// default → busy (spinner, width pinned) → ✓ done → default
// on rejection: restores label + error toast. No try/catch needed.

Keys.init()  Keys.setScope(handlers, hintRows)  Keys.clearScope()
Keys.help()  Keys.isTyping(event)

createAutosave(hostEl, { onSave }) → { touch, flush, isDirty, hasSaved, destroy }
guardUnsaved(isDirty, { onSave, onDiscard }) → boolean

removeRow(rowEl, after)     // animate out 220ms, remove, then callback
tickValue(el, value)        // number change with a tick animation
highlight(text, query)      // → HTML with <mark>
bindChartTips(root, { series, labels, format, compare })
```

### AI layer

```js
AITask.mount(host, steps, { title, stepMs, auto, done }) → { advance, finish, stop }
AITask.modal(steps, opts)
stream(el, text, { chunk?, ms?, onDone }) → { cancel }
aiResult({ id?, accept? }) → string
bindAiResult(root, { onAccept, onRegenerate, onEdit, getText })

mascot(mood?, size?) → string       // '' | mface--sm | mface--lg | mface--xl
setMascot(el, mood)
workspaceMood() → 'alert' | 'unsure' | 'working' | 'happy'

contextualAI(route) → string        bindContextualAI(host, route)
```

`workspaceMood()` is the **single rule** that picks the mascot's face:

```
connection.status === 'error'                  → 'alert'
pending approval with priority 'High'          → 'unsure'
any pending approval                           → 'working'
otherwise                                      → 'happy'
```

### Shell & chat

```js
App.start()  App.go(path)  App.goBack(fallback)  App.backLink(label, route)
App.render({ withLoading })  App.refresh()  App.renderShell()  App.syncNav()
App.applyTheme(mode)  App.toggleTheme()  App.commandPalette()  App.notifications()
App.askAI(prefill)  App.createMenu()  App.createFlow(kind)  App.remember(label)
App.trail

Chat.init()  Chat.toggle(force?, prefill?)  Chat.send(text)
Chat.paintFab()  Chat.answer(question) → string  Chat.messages
```

`Chat.answer()` is the one function to replace when connecting a real model.

---

## 7. Data contract

Full TypeScript in [`docs/SCHEMA.md`](docs/SCHEMA.md). The critical parts:

### Display values arrive pre-formatted

```ts
type Display = string;   // '18.2K' · '₹24.8K' · '4.2x' · '2 min ago'
```

Currency symbols, unit suffixes and relative times are the **server's** job.
This keeps locale and rounding in one place — but your API must format, not just
serialise. Exceptions: `campaign.budget` / `campaign.spent` are raw numbers
because the UI computes a ratio bar.

### Approvals — the highest-value contract

```ts
interface Approval {
  id: string;
  platform: PlatformKey;
  kind: 'Post'|'Story'|'Campaign'|'Broadcast'|'Ad';
  title: string;  desc: string;
  priority: 'High'|'Medium'|'Low';   // ⚠ drives the status rung
  due: Display;                      // ⚠ human text
  dueSort: number;                   // ⚠ hours until due — THE QUEUE SORTS ON THIS
  status: 'pending'|'approved'|'rejected';
  progress: number;                  // 0–100 ring
  reach: Display;  credits: number;
  ai: string;                        // ⚠ inline reasoning. NOT OPTIONAL.
  caption: string;                   // supports \n
  audience: string;  schedule: Display;
  predict: { reach: Display; engage: Display; conv: Display };
}
```

`due` is human text and cannot be sorted; `dueSort` is what makes "next" mean
"next most urgent". `ai` is what makes a row reviewable without opening it — an
empty string produces a row that says *trust me*, defeating a supervision surface.

### Connections — three states, not a boolean

```ts
status: 'connected' | 'disconnected' | 'error'
```

| Status | Meaning | Treatment |
|---|---|---|
| `connected` | Working | Calm — rung 4 |
| `error` | **Worked before, broken now.** Publishing paused. | Loud — rung 1, page banner, mascot turns red |
| `disconnected` | Never set up | Neutral — an invitation |

`error` is an incident; `disconnected` is a to-do. Collapsing them to a boolean
removes this page's purpose.

### Derived values — do not send these

| Value | Derived from |
|---|---|
| Sidebar approvals badge | `approvals.filter(a => a.status === 'pending').length` |
| Conversations badge | `sum(conversations.unread)` |
| Home attention count | the same pending filter |
| Filter chip counts | the same collection |
| Mascot face | `workspaceMood()` |
| Campaign spend ratio | `spent / budget` |

**The invariant:** sidebar badge, Home count and Approvals header read one
collection. A separate `pendingCount` field will eventually disagree with it.

### Suggested endpoints

```
GET  /api/bootstrap                   → user, workspace, workspaces, credits
GET  /api/approvals?filter=           → Approval[]
POST /api/approvals/:id/approve|reject
POST /api/approvals/bulk              → { ids[], action }
GET  /api/connections                 → Connection[]
POST /api/connections/:k/connect      → streamed step progress
GET  /api/planner?month=YYYY-MM       → PlannerEvent[]
PATCH /api/planner/:id                → 409 + conflicting event on clash
GET  /api/analytics?range=&channel=   → metrics, series, channelPerf, insights
POST /api/insights/:id/apply
GET  /api/campaigns                   POST /api/campaigns (streamed launch)
GET  /api/brand                       GET /api/conversations[/:id/messages]
GET  /api/assets                      POST /api/ai/chat
```

Planner PATCH should return **409 with the conflicting event** so the client can
show the conflict dialog rather than re-deriving it. Long AI operations should
**stream their steps** — `AITask` consumes staged progress, and faking it with a
timer is the one thing that makes the UI feel dishonest.

---

## 8. Component reference

Full markup in [`docs/COMPONENTS.md`](docs/COMPONENTS.md). Essentials:

```html
<!-- Buttons: one primary per view -->
<button class="btn">Default</button>
<button class="btn btn--primary">Primary</button>
<button class="btn btn--ink">Secondary emphasis</button>
<button class="btn btn--ghost">Quiet</button>
<button class="btn btn--accent-ghost">AI action</button>
<!-- + btn--sm btn--lg btn--block btn--icon -->

<!-- Cards -->
<section class="card">
  <div class="card__head"><span class="sec-title">Title</span>
    <a class="link push" href="#">View all →</a></div>
  <div class="card__body">…</div>
  <div class="card__foot">…</div>
</section>
<!-- .card--line  .card--pad  .card--int (only if the whole card is clickable) -->

<!-- Status: prefer statusBadge(status) -->
<span class="badge badge--urgent">! Overdue</span>
<span class="badge badge--active">Active</span>
<span class="badge badge--pending">! Review</span>
<span class="badge badge--calm">✓ Scheduled</span>

<!-- Platform tile: logo gets NO chrome -->
<span class="tile tile--brand"><!-- brandIcon() --></span>
<!-- UI icon keeps the container -->
<span class="tile"><!-- icon() --></span>

<!-- List row -->
<div class="lrow" tabindex="0" role="button">
  <span class="tile tile--brand">…</span>
  <div class="grow" style="min-width:0">…</div>   <!-- min-width:0 required for truncate -->
  <div class="row g2" style="flex:none">…actions…</div>
</div>
<!-- .is-cursor keyboard position · .is-leaving exit -->

<!-- AI surfaces -->
<span class="ai-mark">✦</span>              <!-- marks generated CONTENT -->
<span class="mface mface--sm">…</span>      <!-- the assistant as a CHARACTER -->
<div class="ai-note">…</div>
<span class="ai-sig">✦ Generated by Sahoda AI</span>
```

**Two AI signals, never mixed in one header.** The sparkle marks generated
content; the mascot face is the assistant as a character.

**Utilities:** `.row .col .between .grow .push .g1–.g6 .grid .g-2…g-6`
`.t-11…t-24 .t-2 .t-3 .t-accent .w-500/600/650 .truncate .clamp-2 .tabnum`
`.page__in .page__hd .page__tools .split .snav .sep .kbd .tip[data-tip] .hide .sr`

---

## 9. Feature catalogue

Full rationale in [`docs/FEATURES.md`](docs/FEATURES.md).

| # | Feature | Why it matters |
|---|---|---|
| 1 | **Rapid review** — decide, row exits, `Reviewed 3 of 5`, next focuses. `A/R/E/J/K` | Highest-frequency screen. Twelve items should not need twelve mouse trips. |
| 2 | **Mascot as status** — red/amber/blue/green face on the launcher | Reports the workspace before you open it. Reads one function so it cannot contradict the UI. |
| 3 | **Guided flows with real failure** — Search Console fails on first attempt | Error recovery that is never exercised is never designed. |
| 4 | **AI reports work** — staged steps, streamed text, mascot completion signal | A spinner says "wait". A step list says "I am reading your documents". |
| 5 | **One conversational surface** — every entry point opens the same chat | Two places to talk to one assistant is duplication users learn around. |
| 6 | **Command palette** — opens on Recent + Suggested, match highlighting | An empty palette teaches users not to open it. |
| 7 | **Optimistic updates with undo** | Undo beats a confirm dialog for anything reversible. |
| 8 | **Context-preserving navigation** — drawers, named back links, deep links | A back button labelled "Back" is a guess; "Whitening Launch" is information. |
| 9 | **Motion with a job** — every animation answers a question | Decoration costs perceived speed. |
| 10 | **Status without colour** — four rungs | Survives a five-colour brand, colour blindness and greyscale. |
| 11 | **Autosave + unsaved guard** | Losing a half-written post is unforgivable. |
| 12 | **Conflict as a decision** — planner clash opens a dialog | Silent overwrite is data loss; silent rejection is confusing. |
| 13 | **Mobile recomposed, not shrunk** | Density is right on desktop and wrong under a thumb. |
| 14 | **Every state designed** — empty, loading, error, success, no-results | |
| 15 | **Accessibility** — focus trap, landmarks, live regions, reduced motion | |

### If you can only port five things

1. The **four-rung status ladder** — the whole visual language
2. **`runAction`** — the button lifecycle appears on every screen
3. **Optimistic mutation with undo** — this is what "fast" actually means
4. **`AITask` + streaming** — this is what "intelligent" actually means
5. **The 280ms page-entry transition** — makes navigation feel continuous

---

## 10. Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| **≥1200px** | Full sidebar (232px), three-column inbox, side rails |
| **768–1199px** | Sidebar collapses to 64px icons (logo crops to the mark), rails stack, inbox drops the context column |
| **<768px** | Bottom navigation with a dominant `+`, drawers become sheets, inbox swaps list ↔ thread |

**Mobile is recomposed, not shrunk:**
- Own header; bottom nav with a 50px orange FAB
- Drawers/modals become bottom sheets with a drag handle and swipe-to-close
- Approval rows become a grid — full title, meta on its own line, full-width
  actions — instead of truncating to "Insta…"
- Metrics become a snap-scrolling strip
- Every tappable control clears **44px**; desktop stays dense
- Keyboard hints and bulk-select checkboxes step out (desktop concerns)

---

## 11. Accessibility

- Focus **trapped** inside dialogs, **restored** to the opener on close
- Dialog containers take focus **silently** — they must not draw a ring
- `aria-current="page"` on active navigation
- Landmarks: `<nav aria-label>`, `<main id="main">`, `role="dialog" aria-modal`
- Live regions: review counter, chat log, toasts (`aria-live="polite"`)
- Command palette: `role="combobox"` + `role="listbox"` + `aria-selected`
- Keyboard-visible focus everywhere (`:focus-visible`, never on mouse click)
- Status never conveyed by colour alone
- Platform logos are decorative (`alt=""` + `aria-hidden`) — the name is beside them
- `prefers-reduced-motion` honoured throughout

---

## 12. Assets

```
icons/     10 platform logos (PNG) → BRAND_PNG in js/icons.js
           Instagram · Facebook · LinkedIn · TikTok · YouTube · X
           WhatsApp · Telegram · Google Ads · Shopify
           Fallback SVGs remain for Meta Ads, Google Analytics,
           Search Console, Google Business, Email, Website

mascot/    11–14.png  four expression faces → MASCOT in js/ai.js
           0–4.png    full renders (only 0 is used, as the chat portrait)
           Agent.spline  Spline editor project — see §16

logo/      dark logo.png / white logo.png    lockup, by theme
           favicondark.png / favicon white.png   mark only, for the tab
           banner.png                        greeting artwork
```

### Asset rules

- **Platform logos get no container.** `.tile--brand` removes the background and
  border. A logo inside a grey bordered box is a box inside a box.
- **The lockup crops, it does not shrink.** Collapsed sidebar narrows the
  container to 34px to reveal just the mark.
- **The favicon follows `prefers-color-scheme`, not the app theme.** The tab
  strip is browser chrome and tracks the OS.
- **The mascot's four faces map to four AI states**, picked by one function.

### ⚠ The URL-resolution trap

A `url()` inside a **CSS custom property** resolves relative to *the stylesheet
that consumes it*, not the document.

```js
// BROKEN — layout.css consumes this, so it resolves to css/logo/banner.png
el.style.setProperty('--greet-art', 'url("logo/banner.png")');

// CORRECT — inline styles resolve against the document
el.style.backgroundImage = 'url("logo/banner.png")';
```

It fails **silently**: no console error, no failed-resource entry, just no image.
Under a bundler, prefer `import url from './banner.png'`.

---

## 13. Implementation guide

There are two ways in, and they answer different questions.

**Retheme** — you already have a working dashboard and want it to *look* like
this. Nothing about your routes, queries or handlers changes. The kit in
[`theme/`](theme/RETHEME.md) is drop-in CSS: tokens, a `sl-`prefixed component
library, and bridges that retheme shadcn/ui through its own variables so
existing components change appearance with no edits. About 20 minutes on
shadcn. See [`theme/RETHEME.md`](theme/RETHEME.md), and
[`theme/preview.html`](theme/preview.html) to see the kit rendering.

**Rebuild** — you want the behaviours too: the rapid-review queue, optimistic
mutation with undo, staged AI progress, the recomposed mobile layout. Those
live in the JavaScript and in the decisions, not in the CSS. Full detail in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md).

Most teams want the first, then some of the second. They compose — the retheme
kit is the CSS layer the rebuild would have installed anyway.

### What is portable

| Layer | Portable? |
|---|---|
| `css/tokens.css` | **Yes, verbatim** |
| `css/components.css` · `motion.css` · `chat.css` | **Yes** |
| `css/layout.css` | Mostly — class names may collide |
| `js/icons.js` | Yes — convert to components/sprites |
| `js/interactions.js` · `js/ai.js` | Partly — patterns translate ~1:1 |
| `js/ui.js` | Rewrite as your framework's primitives |
| `js/pages/*.js` | **No — treat as specifications** |
| `js/data.js` | **No — replace with your API layer** |

### Strategy

**Option A — tokens + CSS first** (recommended for Next.js + Tailwind + shadcn).
Port `tokens.css` and `motion.css`, remap existing components onto the variables.
Fastest to "it looks like the new design", lowest risk, ships in pieces.

**Option B** — rebuild the shell, migrate pages behind a flag.
**Option C** — full rewrite. Only if the current dashboard was disposable.

### Phase 0 — tokens (80% of the look)

```js
// tailwind.config.js — point at the variables, one source of truth
colors: {
  brand: 'var(--orange)', ink: 'var(--black)', muted: 'var(--grey)',
  line: 'var(--gainsboro)', surface: 'var(--surface)',
  'surface-2': 'var(--surface-2)', 'text-2': 'var(--text-2)', 'text-3': 'var(--text-3)',
}
```

**Two traps:**
- **Dark mode selector.** This uses `[data-theme="dark"]`; Tailwind uses `.dark`.
  Pick one. Two theming systems produce a light component inside a dark panel.
- **Class collisions.** `.row .card .btn .grow .g2` will clash. Prefix
  (`.sh-card`) or scope under `.sahoda { … }` **in the first commit** —
  retrofitting is painful.

### Phase 1 — shell

Layout frame → navigation with live badges → theme toggle → **page transition**
→ command palette → toasts. Each independently shippable.

### Phase 2 — pages, by value-per-effort

Approvals → Home → Connections → Planner → Analytics → Campaigns → Brand Brain,
Conversations, Assets, Settings.

### Do not port

`js/data.js` · the fake `setTimeout` latency (keep the *staged display*, drive it
from real progress) · `Connections.failOnce` (keep the failure **UI**) ·
`sessionStorage` peek suppression.

---

## 14. Verification

```bash
# 1 — syntax
for f in js/*.js js/pages/*.js; do node --check "$f"; done

# 2 — runtime errors across every route
for r in home approvals planner campaigns brand analytics \
         conversations assets connections settings; do
  chrome --headless=new --disable-gpu --virtual-time-budget=3000 \
    --enable-logging=stderr --v=0 --screenshot=/dev/null \
    "file:///…/index.html#/$r" 2>&1 | grep -iE 'Uncaught|TypeError'
done

# 3 — palette drift
grep -rhoiE '#[0-9a-f]{3,8}' css/ | sort -u
```

Expected palette output: the five brand colours, the achromatic surface steps,
and `#FDF3EC`. Anything else is a regression.

### Definition of done

- [ ] One theming system — no light component inside a dark panel
- [ ] Sidebar badge, Home count and Approvals header cannot disagree
- [ ] Approve from Home and Approvals both update optimistically, with Undo
- [ ] `⌘K`, `A`, `R`, `J`, `K`, `?` work and do nothing while typing
- [ ] Every error names a cause and offers an action
- [ ] Every empty state says what the area does and what to do next
- [ ] `prefers-reduced-motion` honoured
- [ ] Mobile recomposed — targets ≥44px, drawers→sheets, tables→cards
- [ ] Focus visible everywhere and trapped inside dialogs
- [ ] Palette audit clean

---

## 15. Decisions log

Decisions made during the build, with the reasoning, so they are not silently
reversed later.

| Decision | Reasoning |
|---|---|
| **Status carries no hue** | Five-colour brand has no green/red pair. Weight + glyph + label instead — also survives colour blindness. |
| **Platform logos keep their brand colours** | A channel is identity, not chrome. A monochrome Instagram glyph costs recognition for no gain. Contained in `.tile--brand`. |
| **Logos get no container** | Each mark ships its own plate and radius. A grey well around it is a box inside a box. |
| **Mascot faces are contained, not banned** | Green/amber/blue/red are the *character's display*, inside a drawn black screen — the same exception logos get. |
| **One AI conversational surface** | The Ask-AI drawer was deleted and folded into the chat. Two places to talk to one assistant is duplication. |
| **The chat replaced the drawer, ~4,800 chars removed** | Simplicity beat feature count. |
| **Scrim is 28% black with no blur** | A drawer belongs to the page behind it; blur denies that. |
| **Display values arrive pre-formatted** | Locale and rounding in one place, server-side. |
| **Approve is orange even repeated in a list** | Approval *is* the queue's purpose. Demoting it would cost the speed the page is built for. |
| **Banner height 128 → 190px** | The supplied 2.25:1 art needs vertical room; at 128px only a band through the sphere showed. |
| **Full renders 1–4 unused** | 2048×983 with the subject at ~15% of frame — mostly empty canvas inline. Better as marketing art. |
| **3D mascot built but off** | ~1MB runtime, needs network + GPU. The app otherwise assumes neither and runs from `file://`. |

---

## 16. Known limits

| Limit | Detail |
|---|---|
| **Data is mocked** | `js/data.js`; state resets on reload. Mutations are real (approve, drag, connect, credit spend) — just not persisted. |
| **Charts are hand-rolled SVG** | Line, sparkline, ring, bar. No zoom, brushing or multi-series. Take a library if you need those; keep the interaction rules. |
| **Drag and drop is pointer-only** | No touch or keyboard reordering. Use `dnd-kit` in production. |
| **No virtualisation** | Fine at this scale. Needed before any list exceeds ~200 rows — plan for Conversations and Assets. |
| **`thread` is one shared conversation** | Becomes `Record<id, Message[]>` in production. |
| **Asset `name` is the id** | Renaming breaks deep links. Give assets a real id. |
| **3D mascot needs a `.splinecode`** | `mascot/Agent.spline` is the *editor project* — browsers cannot load it. Export → Code in Spline, then set `MASCOT_3D.scene`. |
| **Favicons are 594×508** | Not square; browsers letterbox them. A 512×512 export would render slightly larger at 16px. |

---

## Document map

| Doc | For |
|---|---|
| **`SPECIFICATION.md`** (this file) | Everything, in one place |
| `README.md` | Product, design system, mascot, motion |
| **`theme/RETHEME.md`** | Retheming an existing dashboard without touching its logic |
| `IMPLEMENTATION.md` | Rebuilding this properly, screen by screen |
| `docs/ARCHITECTURE.md` | Module graph, boot, routing, render lifecycle |
| `docs/API.md` | Every function with examples |
| `docs/SCHEMA.md` | Full TypeScript data contract |
| `docs/COMPONENTS.md` | Component markup reference |
| `docs/FEATURES.md` | What exists and why |

**Reading order** — Designer/PM: README → FEATURES → COMPONENTS ·
Frontend: IMPLEMENTATION → ARCHITECTURE → COMPONENTS → API ·
Backend: SCHEMA only.
