# Design System — SAHODA LABS
**08 · v1.0 · Implementation-canonical.** Tokens and components for engineers. 06_UXUI holds screen layouts; 07_Brand_Kit holds identity rules; **this file wins for any token or component value.** The two demo HTMLs (`sahoda_dashboard_demo.html`, `sahoda_brand_brain_demo.html`) are living reference implementations of this system.

## 1. Principles (build-time form)
Tokens only — **no raw hex in app code, ever**; new color pairs enter via the Readability Guard script or not at all; one signature per screen (usually Sahoda/blade), everything else quiet; AA is enforced by the palette, not by review; states (hover/active/disabled/focus/loading/empty/error) ship with the component, not after.

## 2. Tokens (copy-paste canonical)
```css
:root{
  /* Brand (Brand Skin overrides exactly these seven per workspace) */
  --p:#FF4B00; --pfg:#131313; --pstrong:#D73F00; --acc:#BA3700;
  --t50:#FFF2ED; --t100:#FFE4D9; --t300:#FFA580;
  /* Orange ramp (reference) */
  --o400:#FF763D; --o600:#E04200; --o800:#962C00; --o950:#521800;
  /* Neutrals */
  --bg:#FFFFFF; --s1:#FAFAF9; --s2:#F4F4F3; --ink:#131313;
  --muted:#525252; --faint:#A3A3A2; --line:#E5E5E4;
  /* Semantic (danger is crimson, NEVER brand orange) */
  --ok:#15803D; --ok-bg:#EAF6EE; --warn:#B45309; --warn-bg:#FBF1E4;
  --danger:#C81E1E; --danger-bg:#FDECEC; --info:#1D4ED8;
  /* Shape / elevation / motion */
  --r-input:10px; --r-card:12px; --r-pill:999px;
  --sh-card:0 1px 2px rgba(19,19,19,.06); --sh-pop:0 8px 24px rgba(19,19,19,.12);
  --dur-1:150ms; --dur-2:250ms; --ease:cubic-bezier(.2,0,0,1);
  --ff:'Outfit',Inter,system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace;
}
[data-theme="dark"]{
  --bg:#131313; --s1:#1B1B1C; --s2:#232324; --ink:#F5F5F4;
  --muted:#A3A3A2; --faint:#6B6B6A; --line:#2E2E2F;
  --pfg:#131313; --acc:#FFA580; /* accent text on dark = Orange300, 9.68:1 */
  --ok-bg:#12291B; --warn-bg:#2B1F10; --danger-bg:#2E1414;
}
```
**Brand Skin contract:** a workspace theme replaces only `--p --pfg --pstrong --acc --t50 --t100 --t300` (per TSD §17); neutrals/semantics are fixed. Per-user "default theme" override beats workspace theme.
**Verified pairs (WCAG):** `--ink` on `--p` 5.54 ✓ · white on `--pstrong` 4.56 ✓ · `--acc` on `--bg` 5.78 ✓ · `--t300` on dark `--bg` 9.68 ✓ · `--muted` on `--bg` 7.81 ✓ · white on `--p` 3.36 (≥19px semibold only). Never: `--p` as body text on light.

**Tailwind mapping (v4):** expose each var as a color (`primary: var(--p)` etc.) in `@theme`; utilities may only reference these names. ESLint rule bans hex literals in `apps/web`.

## 3. Typography
Fonts: **Outfit** (variable, Google Fonts) everywhere now; **Garet** headings later only after license (swap via `--ff-display`). Hindi: Noto Sans Devanagari. Numbers: `font-variant-numeric: tabular-nums` for credits/money/metrics — always.
| Token | Size/Line | Weight | Use |
|---|---|---|---|
| display | 40/44, −1% | 800 | Hero numbers, marketing |
| h1 | 25/32 | 800 | Page titles |
| h2 | 18/26 | 700 | Card titles |
| h3/label | 14/20 | 600 | Section labels, buttons |
| body | 15/22 | 400–500 | Default |
| small | 13/18 | 400 | Meta |
| caption | 12/16 | 400 | Hints, footers |
| eyebrow | 11/16, +14% tracking | 600 mono | Kickers (`--acc`) |

## 4. Layout & Z
App shell: rail 236px (collapses to 64px ≤1180px), topbar 60px sticky, content max 1200px, page pad 26px (14px mobile). Grid gap 18px; 4pt spacing scale (4/8/12/16/24/32/48). Breakpoints: 700 / 1180. Z: content 0 · sticky top 5 · popover 15 · mascot 20 · toast 30 · overlay/tour 40 · confetti 50.

## 5. Elevation, Motion, Iconography
Two shadows only (`--sh-card`, `--sh-pop`). Motion: micro `--dur-1`, panels `--dur-2`, easing `--ease`; signature **blade-sweep** route transition 250ms; confetti (Orange 300/500 + Ink) reserved for real milestones; `prefers-reduced-motion` disables sweep/bob/confetti and swaps to fades. Icons: Lucide, 20px, stroke 1.7, round caps; the **blade** is used via CSS mask (`.blade{background:var(--p);mask:var(--bl) center/contain no-repeat}`) so it auto-tints with Brand Skin; ≤2 decorative blades per screen.

## 6. Components (anatomy → tokens → states)
| Component | Spec | States |
|---|---|---|
| **Button / primary** | `--p` bg, `--pfg` text, pill, 600, pad 9×16 | hover `--pstrong`+white · active scale .97 · disabled `--ink` bg 45% opacity for done-states, else 45% opacity · focus ring 2px `--acc` offset 2 · loading = blade micro-spinner |
| Button / secondary | 1.5px `--ink` border, transparent | hover fill `--ink`/white |
| Button / ghost | `--muted` text | hover `--s2` + `--ink` |
| Button / destructive | `--danger` bg, white | confirm-required pattern |
| **Credit chip** | pill, 1.5px `--p` border, blade 9×14 + tabular number | pulses once on change; click→wallet |
| Input/Textarea/Select | `--s1` bg, `--line` border, `--r-input`, pad 10×12 | focus: `--bg` bg + ring · error: `--danger` border + 13px message below · disabled 50% |
| Card | `--bg`, `--line`, `--r-card`, `--sh-card`, pad 16–24 | interactive: hover translateY(-2px) |
| Tabs (pill) | per brand-brain demo: pill, active `--t50` bg + `--t300` border + `--acc` text, mono idx | done idx `--ok` |
| Pill/Chip | `--s2`/`--ink` default · `.or` `--t100`/`--acc` · `.no` `--danger-bg`/`--danger` line-through | — |
| Status badge | Draft `--s2` · Review `--warn-bg/--warn` · Scheduled `--t100/--acc` · Published `--ok-bg/--ok` · Failed `--danger-bg/--danger` | — |
| **Twin score** | pill: ≥70 `--ok-bg/--ok` · 40–69 `--warn-bg/--warn` · <40 `--danger-bg/--danger` · n/a `--s2` | tooltip: "predicted, not guaranteed" |
| Toast (sonner) | bottom-left, `--ink` bg, white, `--r-input`, 4s, one action slot | role=status |
| Dialog/Sheet | max 480px, `--sh-pop`, overlay rgba(19,19,19,.4) | Esc closes; focus-trapped |
| Table | 13px header `--muted`, row hover `--s1`, sticky head | ledger rows get "why" popover |
| Skeleton | `--s2` shimmer; never spinners >400ms | — |
| Progress/Bar | 7px, `--s2` track, `--p` fill, 4px radius | animated width `--dur-2` |
| **Tour overlay** | dim rgba(19,19,19,.65), SVG cutout, 2px `--p` pulse ring; bubble `--ink`/white r12 blade-tail | per FSD M14; anchors `data-guide="…"` |
| **Mascot** | blade mask body, eye at notch (white + `--ink` pupil, cursor-gaze ±3.5px, blink ~5s), sizes 64/96/128 | poses idle/look/point/celebrate; static under reduced-motion |
| Empty state | icon-in-`--t50`-circle + one sentence + ONE primary action + optional Sahoda tip | — |
| Error state | what happened → what we did ("not charged") → one action + trace ID | never blames user |

## 7. Content style (build-enforced)
Sentence case; buttons start with verbs and keep their name through the flow (Publish→"Published"); costs always visible before spend ("Uses 6 credits"); predictions say "predicted"; Sahoda speaks first person, ≤2 sentences per bubble.

## 8. A11y floor
Focus ring 2px `--acc` (light) / `--t300` (dark), offset 2 · full keyboard incl. tour (Tab/Enter/Esc) · aria-live for generation + credit changes · 44px touch targets on phone views · charts get table toggle · contrast guaranteed by §2 pairs only.

## 9. Governance
Tokens live in `packages/shared/tokens.css` + mirrored in `workspace_themes` default row (TSD §17). Change = PR with Readability-Guard output attached. Version: bump this doc header; demos updated same PR.
