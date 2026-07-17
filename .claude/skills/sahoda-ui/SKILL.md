---
name: sahoda-ui
description: Use for any React/Next.js UI work in apps/web — components, screens, styling, states.
---

Tokens only (Design System §2 via Tailwind names) — zero hex literals. Components come from shadcn/ui restyled per §6; check the two demo HTMLs for canonical look before inventing. Every component ships all states: hover/active/disabled/focus-visible(2px --acc)/loading(skeleton>400ms, never long spinners)/empty(one action + Sahoda tip)/error(what happened → what we did → one action + trace id, "we didn't charge you" when true).
Copy: sentence case, verb-first buttons, costs visible before spend, "predicted" on Twin numbers. Files <300 lines; client components only when interactive; server actions for mutations; zod-parse every boundary. Tabular-nums on all money/credits/metrics.
