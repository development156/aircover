# Onboarding + Brand Resolve — Design (2026-07-19)

Lane: **apps/web** (consume frozen `@sahoda/shared`, `@sahoda/mesh`, `@sahoda/billing`; never edit
shared/db). FSD M1. Alpha gate: *signup → resolved Brand Brain in <10 min*.

## Principle: approve, don't author
The user never faces a 30-field form. Give the model a **spark** (name + a hint or two), let it
**generate** a full Brand Brain, then let the user **refine** editable cards and **theme** from their
logo. Everything except business name is optional; blanks never block (frozen `ResolveInputSchema`).

## Flow (4 steps, full-bleed split: steps left / live preview right)
Entry: `createWorkspace` success → redirect `/onboarding` (was `/home`). No hard first-run gate yet
(can't detect "has brain" without persistence); a "Skip for now" exits to `/home`.

1. **Spark** — business **name** (required), category, optional website/Instagram, **logo upload**.
   Cost shown: `creditCost('brand_research')` = **50 credits** before the Generate click.
2. **Generate** — server action `resolveBrand(spark)`:
   - map Spark → `ResolveInput` (name→`source.name`, category→`source.category`, website/IG→`source`
     hints; everything else default '' — the model infers).
   - `withCredits({ workspaceId, action: 'brand_research', objectRef }, fn)` where `fn` runs
     `createMesh().runTask(brandGuidelinesTask.def, input, { workspaceId, traceId })`.
   - **Charge policy:** DEBIT only on a *real* resolve (`ok && !fallback`). A demo-fallback
     (`fallback:true`) or error → `fn` throws → `withCredits` RELEASEs → **no charge**; the flagged
     fallback payload is carried out-of-band and shown honestly ("showing a sample — not charged,
     retry"). `CREDIT_INSUFFICIENT` (can't HOLD) → honest "not enough credits". Show `balanceAfter`.
3. **Refine** — the `BrandMemoryPayload` as inline-editable cards: voice, brand persona, customer
   persona, hook, taboo (mirrors the demo's result cards + `Signal Lock`). Per-card **Regenerate**
   (re-runs resolve; fresh `objectRef` → a new charge, cost shown). **Signal Clarity** meter fills as
   fields are confirmed/enriched (client-side count of non-empty tracked fields).
4. **Theme** — logo → **client-side** dominant-color extraction (canvas, no lib) → map onto frozen
   `ThemeTokens` (OKLCH: primary/secondary/accent/surface[4]/text/border/status) → live re-theme the
   preview by setting CSS vars on a `[data-theme]` scope. **Readability Guard**: enforce a min contrast
   for text-on-surface and fg-on-primary; auto-adjust lightness until it passes, never ship an
   unreadable pair. Accept / revert.

## Persistence — BLOCKED (honest pending)
No `brand_memory` write RPC on main (see `apps/web/REQUESTS.md`). **Finish** returns typed
`SAVE_PENDING` — brain held in session, flagged "saving to your workspace turns on shortly", **no fake
save**. When `public.resolve_brand_memory` lands, Finish persists via `supabase.rpc(...)` (~10 lines).
Theme persistence (`workspace_themes`) is the same shape — deferred to the same/adjacent RPC.

## Modules (small files, tokens-only)
- `app/(onboarding)/onboarding/page.tsx` + `layout.tsx` — split shell, step state machine.
- `components/onboarding/`: `spark-step`, `refine-step`, `brand-card` (editable), `theme-step`,
  `theme-preview`, `signal-clarity-meter`, `step-rail`.
- `app/actions/brand-resolve.ts` (`'use server'`) — the resolve action (withCredits + mesh); **only
  async exports** (Turbopack lesson: no `export type {}` re-export from a 'use server' file).
- `lib/brand/`: `spark-to-resolve-input.ts` (pure), `resolve-result.ts` (pure map mesh+credits →
  typed state, incl. no-charge-on-fallback), `color-extract.ts` (client), `theme-from-colors.ts`
  (pure: colors → ThemeTokens + Readability Guard), `signal-clarity.ts` (pure).

## States (all shipped)
empty / typing / uploading-logo / generating (aria-live status) / resolved-real / resolved-fallback
(flagged) / error / credit-insufficient / saving-pending / themed / revertable. Verb-first
sentence-case copy; `tabular-nums` for credits; error copy never blames the user.

## Testing (tests-first on pure seams)
`spark-to-resolve-input`, `resolve-result` (real→charge, fallback→no-charge+flag, error, insufficient),
`theme-from-colors` (mapping + contrast guarantees), `signal-clarity`. Server action = thin glue.
Playwright `@smoke` on signup→onboarding→resolved brain (post-build).

## Scope
IN tonight (Alpha quality): the 4-step flow, real resolve + real charge, editable refine, live logo
theming with Readability Guard, honest SAVE_PENDING. Deferred to 2026-07-21: deep Brand-Skin polish
(motion, palette tuning, advanced guard), brain persistence (needs wt-db RPC), theme persistence,
memory_events writeback, per-card regen refinements.
