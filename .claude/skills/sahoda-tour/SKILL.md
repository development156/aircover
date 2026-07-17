---
name: sahoda-tour
description: Use when creating or editing a Sahoda Guide tour, adding data-guide anchors, or touching the tour/mascot engine.
---
Tours are versioned JSON per FSD Appendix C: steps[{anchor, say(≤2 sentences), action: none|click|input_min:N, spotlight, confirm_spend?}], ≤8 steps, per-locale copy. UI targets get stable `data-guide="area.element"` attributes — never CSS selectors. A missing anchor auto-skips + logs; a tour may degrade, never break the screen; overlay always dismissible.
confirm_spend steps ALWAYS pause (even in future DIFM). New/renamed anchors: update the registry + run the anchor-integrity check before PR. Reduced-motion: static mascot, fade-only. Tours never fire during approvals.
