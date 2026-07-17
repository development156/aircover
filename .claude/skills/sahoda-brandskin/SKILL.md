---
name: sahoda-brandskin
description: Use when working on theming, workspace_themes, the Readability Guard, color extraction, or any new color pair anywhere in the app.
---

Only these 7 tokens are themeable: --p --pfg --pstrong --acc --t50 --t100 --t300 (Design System §2). Neutrals & semantics are fixed; danger is crimson, never brand orange.
Any new color pair MUST pass the Guard: OKLCH, adjust foreground lightness only until text≥4.5:1 / UI≥3:1, clamp surface chroma ≤0.15, keep semantic hue bands, emit a human-readable diff_log. Themes are versioned rows in workspace_themes; apply = SSR-inlined CSS vars (no FOUC), swap <150ms; per-user default-override wins. No raw hex in apps/web — ESLint enforces.
