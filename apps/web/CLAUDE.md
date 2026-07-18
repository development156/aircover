# apps/web

Follow the **sahoda-ui** skill. Tokens only (no raw hex — import `@sahoda/shared/tokens.css`).
Server actions for all mutations. `data-guide="…"` anchors on anything a tour targets. All states
ship with the component (hover/active/disabled/focus/loading/empty/error). Verb-first
sentence-case copy; `tabular-nums` for all credits/money/metrics.

- Import contracts/types from `@sahoda/shared` only — never redefine them here.
- Model calls go through server actions → `@sahoda/mesh`; never call a provider from the client.
- Playwright `@smoke` on the golden paths. Costs shown before any spend.
- **Dark accent-on-tint:** never pair `text-accent` on a `bg-tint-50/100` surface — in dark, `--t50/--t100` stay warm-light while `--acc` flips to Orange300 (~1.7:1). Add a `dark:bg-s2` surface swap (pattern: `bg-tint-50 text-accent dark:bg-s2`). See `empty-state.tsx`, `nav-item.tsx`, `workspace-switcher.tsx`.
