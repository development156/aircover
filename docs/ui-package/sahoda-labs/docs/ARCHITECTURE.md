# Architecture

How the application is wired: module graph, boot sequence, routing, the render
lifecycle, and where state lives.

---

## 1. Module graph

There is no bundler and no module system. Every file adds to the global scope,
so **load order is the dependency graph**. This is the order in `index.html`:

```
js/icons.js          UI_PATHS · BRAND · BRAND_PNG · icon() · brandIcon() · PLATFORM_LABEL
        ↓            no dependencies
js/data.js           DB · STAGES
        ↓            no dependencies
js/ui.js             PAGES{} · $ · $$ · esc · Overlay · drawer/modal · toast · popover
        ↓            charts · badges · states · skeletons
js/interactions.js   runAction · Keys · createAutosave · highlight · ChartTip · removeRow
        ↓            depends on: ui.js (notify, icon, Overlay)
js/ai.js             MASCOT · mascot() · AITask · stream() · aiResult() · contextualAI()
        ↓            depends on: ui.js, data.js
js/chat.js           Chat
        ↓            depends on: ai.js, data.js, ui.js
js/pages/*.js        each registers into PAGES
        ↓            depends on: everything above
js/app.js            NAV · LOGO · App  — boots on DOMContentLoaded
```

**Two ordering rules that will break the app if violated:**

1. `PAGES = {}` is declared in **`ui.js`, not `app.js`.** The page files run
   before `app.js` and register themselves into it. If you move that declaration
   back to `app.js`, every page file throws `PAGES is not defined`.
2. `app.js` must be **last**. It boots on `DOMContentLoaded` and expects every
   page to have registered already.

If you port this to a bundler, all of this becomes ordinary imports and the
constraint disappears. It only exists because there is no build step.

---

## 2. Boot sequence

```
DOMContentLoaded
  └─ App.start()
       ├─ applyTheme(localStorage['sahoda-theme'] ?? 'light')   → sets <html data-theme>
       ├─ renderShell()          → paints sidebar + header + mobile nav into #shell
       ├─ addEventListener('hashchange', navigate)
       ├─ navigate()             → first route render
       ├─ Keys.init()            → single global keydown listener (capture phase)
       └─ Chat.init()            → injects the mascot launcher, schedules the 6s peek
```

`renderShell()` is idempotent and is re-run whenever shell-level state changes —
theme toggle, workspace switch, badge counts. It rebuilds the sidebar and header
from scratch, then calls `bindShell()` to reattach handlers and `syncNav()` to
set active states.

---

## 3. Routing

Hash-based, no library:

```
#/campaigns/c1
   └─ route  = 'campaigns'      → PAGES['campaigns']
      params = ['c1']           → passed to render(params) and mount(host, params)
```

`App.navigate()` runs on every hash change:

```js
navigate() {
  parse hash → route + params
  if (!PAGES[route]) route = 'home'      // unknown routes fall back, never blank
  push previous location onto App.trail  // for context-preserving back
  Overlay.closeAll()                     // a route change closes any dialog
  closePopovers()
  Keys.clearScope()                      // drop the previous page's shortcuts
  syncNav()
  render({ withLoading: true })
  scroll content to top
}
```

### Deep links

Every meaningful object has a route. Pages handle the extra param in `mount()`:

| Route | Behaviour |
|---|---|
| `#/approvals/:id` | Opens the detail drawer over the list |
| `#/campaigns/:id` | Campaign detail view |
| `#/campaigns/new` | The 8-step builder |
| `#/assets/:name` | Opens the asset drawer (name is URL-encoded) |
| `#/conversations/:id` | Selects that thread |
| `#/brand/:section` | Tab within Brand Brain |
| `#/settings/:section` | Panel within Settings |

A deep link to a deleted object shows an error state or an error toast — it
never renders blank.

### Back that preserves context

`App.trail` is a capped stack of the last 20 locations. `App.backLink()` reads
the top of it and **names where it returns to**, so a back link from a campaign
detail reads "Campaigns" or "New campaign" depending on how you arrived.

```js
App.goBack('campaigns')   // pops the trail, falls back to the argument
```

---

## 4. The render lifecycle

Every page is an object with three optional functions:

```js
PAGES.example = {
  skeleton()               { return '<html string>' },   // optional
  render(params)           { return '<html string>' },   // required
  mount(host, params)      { /* attach handlers */ },    // optional
};
```

`render()` returns a **string**. `mount()` receives the live DOM. This split is
deliberate — it keeps markup declarative and makes every page trivially testable
by asserting on the returned string.

### `App.render({ withLoading })`

```
1. reset the full-height override left by Conversations
2. if withLoading && page.skeleton
     → paint skeleton immediately
     → setTimeout(paint, booted ? 90 : 220)
   else
     → paint now
3. paint():
     host.innerHTML = page.render(params)
     add .page-in            (entry animation — content only, shell never moves)
     page.mount(host, params)
     bindContextualAI(host, route)      // wires the per-page AI button
     wire [data-back] elements
```

### `App.refresh()`

Same as `paint()` but **without** the entry animation. Use it after a state
change. A state change is not a navigation and must not look like one — if you
call `render()` instead of `refresh()` after approving an item, the whole page
flashes and the interaction feels like a reload.

```js
App.refresh();      // re-render current route in place
```

### When *not* to re-render

Optimistic updates bypass the render cycle entirely and mutate the DOM directly,
because a full re-render would destroy the exit animation and scroll position:

```js
removeRow(row, () => { ... })   // animate the row out, then reconcile counts
tickValue(el, newCount)         // swap a number with a tick animation
```

`Approvals.syncAfterDecision()` is the reference implementation: it repaints only
the counter, the chips and the cursor — or falls back to `App.refresh()` when the
list empties and the empty state is needed.

---

## 5. Where state lives

There is no store. State is deliberately split three ways:

| Kind | Lives in | Example |
|---|---|---|
| **Domain data** | `DB` (`js/data.js`) | approvals, campaigns, connections |
| **View state** | The page module itself | `Approvals.filter`, `Planner.view`, `Inbox.active` |
| **Session state** | `App`, `Chat`, `localStorage` | `App.trail`, `Chat.messages`, theme, recent searches |

View state living on the page module is what allows `App.refresh()` to be a pure
re-render — the filter, cursor and selection survive because they were never in
the DOM.

```js
const Approvals = {
  filter: 'All',          // survives re-render
  selected: new Set(),
  cursor: 0,
  session: null,          // { done, total } — the review progress counter
  ...
};
```

**Porting note:** in React these become `useState`/`useReducer` in the page
component, or a small Zustand slice per page. `DB` becomes your query layer.

---

## 6. The overlay stack

`Overlay` manages a LIFO stack, so dialogs can open on top of dialogs and `Esc`
unwinds one layer at a time.

```
Overlay.open(html, { kind, onMount, dismissable, label }) → element
Overlay.close()        // animates out, restores focus to the opener
Overlay.closeAll()
Overlay.stack          // array of { scrim, el, restore }
```

`kind` selects the shape: `drawer` · `drawer-wide` · `modal` · `modal-lg` ·
`sheet` · `cmdk`. On mobile a drawer *becomes* a bottom sheet via CSS, not JS.

Every open overlay gets:
- a scrim (28% black, **no blur** — see README on why)
- `role="dialog"` and `aria-modal="true"`
- a focus trap (`trapFocus`)
- swipe-to-close on touch (`enableSwipeToClose`)
- focus restoration to whatever opened it

`Escape` order is: popover → overlay → chat panel. Never all at once.

---

## 7. The keyboard layer

One global listener in capture phase, in `Keys`.

```js
Keys.init()                        // once, at boot
Keys.setScope(handlers, hintRows)  // per page, in mount()
Keys.clearScope()                  // automatic on navigate
```

```js
// in a page's mount()
Keys.setScope({
  a: () => approveFocused(),
  j: () => move(1),
  k: () => move(-1),
}, [
  ['A', 'Approve the focused item'],
  ['J', 'Next item'],
]);
```

The hint rows feed the `?` help dialog, so page shortcuts document themselves.

**Two guards that matter:**

```js
if (Keys.isTyping(e)) return;      // never hijack a keystroke meant for a field
if (Overlay.stack.length) return;  // single letters stand down while a dialog is open
```

Without the second, pressing `A` inside a modal would approve something on the
page hidden behind it.

---

## 8. Theming

Tokens are declared on `:root` and overridden under `[data-theme="dark"]` in
`css/tokens.css`. Nothing else in the codebase knows a colour value.

```js
App.applyTheme('dark')   // sets <html data-theme>, persists to localStorage
App.toggleTheme()        // flips, re-renders shell + page, toasts
```

The **favicon is the exception** — it follows `prefers-color-scheme` (the OS),
not `data-theme` (the app), because the tab strip is browser chrome. See
`index.html`.

---

## 9. Assets and URL resolution

```
icons/    platform logos → BRAND_PNG in js/icons.js
mascot/   4 expression faces + full renders → MASCOT in js/ai.js
logo/     lockup, mark-only favicons, banner art → LOGO in js/app.js
```

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
Under a bundler, prefer `import url from './banner.png'` and pass the resolved
value.

---

## 10. Performance characteristics

- **No virtual DOM.** `innerHTML` on a page-sized container, once per navigation.
  Fine at this scale; add virtualisation before any list exceeds ~200 rows.
- **Animation is `transform`/`opacity` only** — both composite on the GPU and
  never trigger layout. The one exception is `.bar__f` width, which is small and
  isolated.
- **Charts are inline SVG** with `pathLength="1"` so the draw-in animation needs
  no measurement in JS.
- **Images decode async** (`decoding="async"`); the mascot and logos are small.
- **The Spline runtime is lazy** and only loads if a scene is configured.

---

## 11. Adding a page

One file, three functions, one script tag:

```js
// js/pages/reports.js
PAGES.reports = {
  skeleton() {
    return `<div class="page__in">${skeletonCards(3)}</div>`;
  },

  render(params) {
    return `<div class="page__in">
      <div class="page__hd">
        <div>
          <div class="page-title">Reports</div>
          <div class="page-sub">What happened, summarised.</div>
        </div>
        <div class="page__tools">${contextualAI('reports')}</div>
      </div>
      ${DB.reports.length ? renderList() : emptyState({ ... })}
    </div>`;
  },

  mount(host, params) {
    host.querySelectorAll('[data-id]').forEach(el => el.onclick = ...);
    Keys.setScope({ n: () => next() }, [['N', 'Next report']]);
  },
};
```

Then add `<script src="js/pages/reports.js"></script>` **before** `app.js`, and
an entry in `NAV` in `app.js`. That is the whole contract.
