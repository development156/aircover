# apps/web

Follow the **sahoda-ui** skill. Tokens only (no raw hex — import `@sahoda/shared/tokens.css`).
Server actions for all mutations. `data-guide="…"` anchors on anything a tour targets. All states
ship with the component (hover/active/disabled/focus/loading/empty/error). Verb-first
sentence-case copy; `tabular-nums` for all credits/money/metrics.

- Import contracts/types from `@sahoda/shared` only — never redefine them here.
- Model calls go through server actions → `@sahoda/mesh`; never call a provider from the client.
- Playwright `@smoke` on the golden paths. Costs shown before any spend.
