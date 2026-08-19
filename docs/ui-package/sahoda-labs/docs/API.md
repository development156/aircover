# API reference

Every function and object available globally, grouped by module. Signatures are
taken from the source, not from memory.

Conventions used throughout:
- Functions returning **`string`** produce HTML to be interpolated into a
  template. They never touch the DOM.
- Functions taking **`host`/`root`/`el`** operate on live DOM and are called from
  `mount()`.

---

## `js/icons.js` — iconography

### `icon(name, cls?) → string`
Stroked UI icon inheriting `currentColor`. ~75 available.

```js
icon('check')                  // <svg class="ic ">…</svg>
icon('sparkle', 't-accent')    // with an extra class
```

The `.ic` class carries a default 15px size. Any context rule (`.btn svg`,
`.tile svg`, `.nav__i svg`) is more specific and wins, so icons dropped into
plain text come out the right size automatically.

Returns `''` for an unknown name — never throws.

### `brandIcon(name, cls?) → string`
Platform mark. Serves a real logo from `icons/` when one exists in `BRAND_PNG`,
otherwise falls back to a simplified inline SVG in `BRAND`.

```js
brandIcon('instagram')              // <img class="bic " src="icons/…">
brandIcon('linkedin', 'bic--sm')    // 13px variant
```

Always decorative (`alt=""`, `aria-hidden`) — the channel name is written beside
it in every placement.

### `PLATFORM_LABEL: Record<string, string>`
Key → display name. `PLATFORM_LABEL.googleads === 'Google Ads'`.

### `BRAND_PNG: Record<string, string>`
Platform key → filename in `icons/`. Adding a real logo is one line here.

---

## `js/ui.js` — DOM, overlays, rendering helpers

### Selectors

```js
$(sel, root = document)    // → Element | null
$$(sel, root = document)   // → Element[]
esc(str)                   // → HTML-escaped string. Use on ALL interpolated data.
isMobile()                 // → boolean, matches (max-width: 767px)
reducedMotion()            // → boolean, matches prefers-reduced-motion
```

`esc()` is not optional. Any user- or API-supplied string interpolated into a
template must go through it.

### `Overlay`

```js
Overlay.open(html, {
  kind = 'drawer',    // 'drawer' | 'drawer-wide' | 'modal' | 'modal-lg' | 'sheet' | 'cmdk'
  onMount,            // (el) => void  — attach handlers here
  dismissable = true, // scrim click closes
  label,              // aria-label for the dialog
}) → HTMLElement

Overlay.close()       // animates out, restores focus to the opener
Overlay.closeAll()
Overlay.stack         // [{ scrim, el, restore }] — LIFO
```

Handles focus trapping, focus restoration, body scroll lock, swipe-to-close on
touch, and the closing animation. Any element with `[data-close]` inside the
overlay closes it.

### `drawer({ title, sub, body, foot, wide?, onMount })`
Right-side panel on desktop, bottom sheet on mobile (CSS, not JS).

```js
drawer({
  title: item.title,
  sub: `${PLATFORM_LABEL[item.platform]} · ${item.due}`,
  wide: true,
  body: `<div class="ai-note">…</div>`,
  foot: `<button class="btn" data-close>Cancel</button>
         <button class="btn btn--primary grow" id="go">Approve</button>`,
  onMount(el) {
    el.querySelector('#go').onclick = () => { … };
  },
});
```

### `modal({ title, sub, body, foot, large?, onMount })`
Centred dialog. Use for confirmation, short forms, focused creation — **not** for
whole workflows that a page or drawer would serve better.

### `confirmDialog({ title, message, confirmLabel?, destructive?, onConfirm })`
Two-button confirmation. `destructive: true` styles the confirm as primary orange.

```js
confirmDialog({
  title: 'Reject this item?',
  message: 'It goes back to draft…',
  confirmLabel: 'Reject',
  destructive: true,
  onConfirm: () => decide(id, 'reject'),
});
```

### Toasts

```js
toast(message, { kind?, icon?, ms?, action? })

notify.success(msg, opts?)   // ✓  3.2s
notify.error(msg, opts?)     // !  6.0s
notify.warning(msg, opts?)   // !  5.0s
notify.info(msg, opts?)      // i  4.0s
notify.ai(msg, opts?)        // ✦  4.0s
```

Bottom-right on desktop, bottom-centre above the nav on mobile. Max 3 on screen;
the oldest steps aside. Hovering cancels the dismiss timer.

```js
notify.success('Post approved', {
  action: { label: 'Undo', on: () => restore() },
});
```

**Prefer an error toast with an action over a dead-end message.**

### Popovers and menus

```js
popover(anchorEl, html, { align = 'right' }) → HTMLElement
closePopovers()

menu(anchorEl, items, opts?) → HTMLElement
```

`menu` items:

```js
menu(btn, [
  { label: 'Priority', heading: true },
  { label: 'Open', icon: 'expand', on: () => {}, active: false },
  { sep: true },
  { label: 'Reject', icon: 'x', on: () => {} },
]);
```

Auto-flips above the anchor when there is no room below, and clamps to the
viewport horizontally.

### Charts

```js
sparkline(points, { w = 100, h = 26, fill = false }) → string
```
Inline trend line. Stroke is `currentColor`, so colour it with a class on the
wrapper (`.t-accent` for up, `.t-2` for down).

```js
ring(value, { size = 42, stroke = 4, label }) → string
```
Progress ring with the value centred.

```js
lineChart(series, labels, { h = 220, fill = true, interactive = true }) → string
```
Axis-labelled line chart. With `interactive`, emits full-height hit columns
(`.chart-hit[data-i]`) and hover dots — wire them with `bindChartTips()`.

```js
shareBar(pct, ink = false) → string
```

### Badges and states

```js
statusBadge(status) → string
```
Maps a status onto the four-rung ladder. Known values: `error` ·
`disconnected` · `Overdue` · `High` · `Active` · `connected` · `Published` ·
`Review` · `pending` · `Medium` · `Draft` · `Scheduled` · `Completed` ·
`Approved` · `Low` · `Ideas` · `Invited` · `Paid`. Unknown values render as a
calm badge with the raw text.

```js
deltaTag(delta, dir) → string          // '↑ 12.5%' — direction from the glyph
emptyState({ ic, title, desc, action, accent }) → string
errorState({ title, desc, action }) → string
skeletonList(rows = 5) → string
skeletonCards(n = 4) → string
platformTile(key, size?) → string      // logo with no chrome — see .tile--brand
initials(name) → string                // 'Meera Patnaik' → 'MP'
```

---

## `js/interactions.js` — behaviour primitives

### `runAction(btn, opts) → Promise<void>`

The button lifecycle: default → busy → success → default.

```js
runAction(btn, {
  busy: 'Approving…',   // label while working
  done: 'Approved',     // label on success
  work: async () => api.approve(id),   // optional; omit for a timed demo
  ms: 750,              // used only when `work` is omitted
  restore: true,        // return to the original label after 1.15s
  onDone: () => { … },  // runs on success, before restore
});
```

Pins the button's width for the duration so nothing around it reflows. On
rejection it restores the original label and raises an error toast — the caller
does not need a try/catch.

### `Keys`

```js
Keys.init()                          // once, at boot
Keys.setScope(handlers, hintRows)    // per page, in mount()
Keys.clearScope()                    // automatic on navigation
Keys.help()                          // opens the ? dialog
Keys.isTyping(event) → boolean
```

Global bindings: `⌘K` search · `C` create · `Esc` close a layer · `?` help.
Single letters are suppressed while typing and while any overlay is open.

### `createAutosave(hostEl, { onSave }) → controller`

```js
const saver = createAutosave(indicatorEl, { onSave: () => persist(state) });

saver.touch()      // mark dirty; debounced save after 650ms
saver.flush()      // save immediately
saver.isDirty      // boolean
saver.hasSaved     // boolean
saver.destroy()    // clear timers
```

Renders `Saving… → Saved just now → Saved 5s ago` into the host element.

### `guardUnsaved(isDirty, { onSave, onDiscard }) → boolean`
Returns `true` if it is safe to leave. Otherwise opens a three-way dialog
(Discard / Keep editing / Save) and returns `false`.

### Optimistic DOM helpers

```js
removeRow(rowEl, after)   // animate out (220ms), remove, then run `after`
tickValue(el, value)      // replace a number with a short tick animation
highlight(text, query)    // → HTML with <mark> around the match
```

### `bindChartTips(root, { series, labels, format, compare })`
Attaches hover/focus readouts to a chart produced by `lineChart()`.

```js
bindChartTips(chartEl, {
  series: revenueSeries,
  labels: ['1','3','5', …],
  format: v => `₹${(v * 1000).toLocaleString('en-IN')}`,
  compare: 'Click to see campaigns',
});
```

### `ChartTip`
Low-level singleton behind `bindChartTips`. `ChartTip.show(x, y, html)` /
`ChartTip.hide()`.

---

## `js/ai.js` — the AI experience layer

### `AITask.mount(host, steps, opts) → controller`

The step list that shows what AI is doing right now.

```js
const task = AITask.mount(hostEl,
  ['Researching audience', 'Analysing competitors', 'Generating strategy'], {
    title: 'Creating campaign',
    stepMs: 850,        // auto-advance interval
    auto: true,         // false → drive it yourself with task.advance()
    done: {
      title: 'Campaign ready',
      desc: 'AI will monitor pacing.',
      action: { label: 'Review campaign', on: () => App.go('campaigns/c1') },
      on: () => { /* side effects on completion */ },
    },
  });

task.advance()   // → true when that was the final step
task.finish()
task.stop()
```

The mascot in the panel switches from *working* to *happy* on completion — that
change **is** the completion signal.

### `AITask.modal(steps, opts)`
The same panel inside a modal, for flows that block on AI.

### `stream(el, text, { chunk = 3, ms = 26, onDone }) → { cancel() }`
Writes text into an element in word-sized chunks with a caret. Honours reduced
motion by jumping straight to the finished text.

### `aiResult({ id?, accept? }) → string` and `bindAiResult(root, handlers)`
The attribution + action bar under generated content.

```js
container.innerHTML = aiResult({ accept: 'Keep' });
bindAiResult(container, {
  getText: () => state.body,
  onAccept: (btn) => runAction(btn, { … }),
  onRegenerate: (btn) => runAction(btn, { … }),
  onEdit: () => editor.focus(),
});
```

Renders *Generated by Sahoda AI* + Copy / Edit / Regenerate / Accept.

### The mascot

```js
mascot(mood = 'happy', size = '') → string   // '' | 'mface--sm' | 'mface--lg' | 'mface--xl'
setMascot(el, mood)                          // swap expression in place
workspaceMood() → 'alert' | 'unsure' | 'working' | 'happy'
```

`workspaceMood()` is the **single rule** that picks the face:

```
a connection has status 'error'          → 'alert'
a pending approval has priority 'High'   → 'unsure'
any pending approval                     → 'working'
otherwise                                → 'happy'
```

Because every surface reads this one function, the mascot can never contradict
the pages.

### Contextual AI

```js
contextualAI(route) → string       // the per-page AI button
bindContextualAI(host, route)      // wired automatically by App.render
PAGE_AI                            // route → { label, prompt }
```

### 3D (opt-in, currently off)

```js
MASCOT_3D = { scene: '', runtime: 'https://unpkg.com/@splinetool/runtime@…' }
canRender3D() → boolean
mountMascot3D(hostEl) → Promise<boolean>
disposeMascot3D()
```

Set `MASCOT_3D.scene` to a `.splinecode` path to enable. Every failure path
(offline, no WebGL, bad path, reduced motion) silently falls back to the still
mascot.

---

## `js/app.js` — shell and router

```js
App.start()                        // boot
App.go(path)                       // 'campaigns/c1'
App.goBack(fallback)               // context-preserving back
App.backLink(label, route) → string
App.render({ withLoading })        // full render with entry animation
App.refresh()                      // re-render in place, no animation
App.renderShell()                  // rebuild sidebar + header
App.syncNav()                      // active states + badge counts
App.applyTheme(mode) / App.toggleTheme()
App.commandPalette()
App.notifications()
App.askAI(prefill)                 // delegates to Chat
App.createMenu() / App.createFlow(kind)
App.remember(label)                // command palette recents
App.trail                          // navigation history
```

### `NAV` and `LOGO`

```js
NAV = [{ k, label, icon, badge? }]      // badge is a function → live count
LOGO.src()    // full lockup for the current theme
LOGO.mark()   // mark only for the current theme
```

---

## `js/chat.js` — the assistant

```js
Chat.init()                     // inject launcher, schedule the peek
Chat.toggle(force?, prefill?)   // open/close; optionally send a message
Chat.send(text)
Chat.paintFab()                 // refresh face + badge from workspace state
Chat.answer(question) → string  // grounded lookup — replace with your API
Chat.messages                   // [{ me, text, at }]
```

`Chat.answer()` is the one function to replace when connecting a real model. It
is deliberately a lookup over `DB` so the assistant can never contradict the UI —
preserve that property by passing real context to your model.

---

## Global constants

```js
PAGES        // route key → { skeleton?, render, mount? }
DB           // all domain data — see SCHEMA.md
STAGES       // ['Ideas','Draft','Review','Scheduled','Published']
CREATE_ITEMS // the Create menu
TOAST_KIND   // toast variant config
MAX_TOASTS   // 3
```
