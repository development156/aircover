/**
 * Byte-for-byte inline of `packages/shared/tokens.css`.
 *
 * The /sites preview needs this stylesheet as a STRING to inject into
 * `renderBundle`'s RenderContext. It used to be read from disk at request time
 * via `readFileSync(require.resolve('@sahoda/shared/tokens.css'))`, which works
 * in dev and FAILS in the deployed Vercel function: pnpm links
 * `node_modules/@sahoda/shared` as a symlink that the serverless bundle does
 * not recreate, so `require.resolve` cannot find the package. That threw, and
 * the throw took the whole /sites route down with a 500 on the first real
 * generated site (2026-07-20).
 *
 * Inlining removes the failure class outright — no filesystem, no module
 * resolution, no tracing config — and works identically under Turbopack (dev)
 * and webpack (build).
 *
 * DO NOT hand-edit. `tokens.css` remains the single source of truth;
 * `tokens-css-inline.test.ts` reads it from disk and fails if this copy drifts.
 */
export const TOKENS_CSS = `/*
 * SAHODA LABS — canonical design tokens (Design System §2).
 * This file is the single source of truth for tokens; it is mirrored into the
 * workspace_themes default row (TSD §17). Brand Skin overrides ONLY the seven
 * brand tokens per workspace (--p --pfg --pstrong --acc --t50 --t100 --t300);
 * neutrals and semantics are fixed. No raw hex in app code — reference these
 * variables (or their Tailwind mappings) only.
 */
:root {
  /* Brand (Brand Skin overrides exactly these seven per workspace) */
  --p: #ff4b00;
  --pfg: #131313;
  --pstrong: #d73f00;
  --acc: #ba3700;
  --t50: #fff2ed;
  --t100: #ffe4d9;
  --t300: #ffa580;
  /* Orange ramp (reference) */
  --o400: #ff763d;
  --o600: #e04200;
  --o800: #962c00;
  --o950: #521800;
  /* Neutrals */
  --bg: #ffffff;
  --s1: #fafaf9;
  --s2: #f4f4f3;
  --ink: #131313;
  --muted: #525252;
  --faint: #a3a3a2;
  --line: #e5e5e4;
  /* Semantic (danger is crimson, NEVER brand orange) */
  --ok: #15803d;
  --ok-bg: #eaf6ee;
  --warn: #b45309;
  --warn-bg: #fbf1e4;
  --danger: #c81e1e;
  --danger-bg: #fdecec;
  --info: #1d4ed8;
  /* Shape / elevation / motion */
  --r-input: 10px;
  --r-card: 12px;
  --r-pill: 999px;
  --sh-card: 0 1px 2px rgba(19, 19, 19, 0.06);
  --sh-pop: 0 8px 24px rgba(19, 19, 19, 0.12);
  --dur-1: 150ms;
  --dur-2: 250ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --ff: 'Outfit', Inter, system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
}
[data-theme='dark'] {
  --bg: #131313;
  --s1: #1b1b1c;
  --s2: #232324;
  --ink: #f5f5f4;
  --muted: #a3a3a2;
  --faint: #6b6b6a;
  --line: #2e2e2f;
  --pfg: #131313;
  --acc: #ffa580; /* accent text on dark = Orange300, 9.68:1 */
  --ok-bg: #12291b;
  --warn-bg: #2b1f10;
  --danger-bg: #2e1414;
}
`
