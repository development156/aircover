// Clerk appearance bound to sahoda tokens — CSS vars resolve in the browser,
// so dark mode and Brand Skin flow through without Clerk-specific theming.
export const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--p)',
    colorText: 'var(--ink)',
    colorTextSecondary: 'var(--muted)',
    colorBackground: 'var(--bg)',
    colorInputBackground: 'var(--s1)',
    colorInputText: 'var(--ink)',
    colorDanger: 'var(--danger)',
    colorSuccess: 'var(--ok)',
    colorWarning: 'var(--warn)',
    borderRadius: 'var(--r-input)',
    fontFamily: 'var(--ff)',
  },
  elements: {
    /**
     * The avatar trigger renders at 28px, which is under the 44px SPECIFICATION.md
     * §10 requires of every tappable control on a phone. It is the one shell
     * control the app cannot size from outside: the surrounding wrapper was
     * already widened to 44px and Clerk still drew its own 28px button inside it,
     * so the hit area has to be set here, in Clerk's own element slot.
     *
     * Applied at max-narrow only, through a plain media query rather than a
     * Tailwind variant — this string is handed to Clerk, not to the Tailwind
     * compiler, so `max-narrow:` would never be generated. 699px is one below
     * the `narrow: 700px` breakpoint the rest of the shell uses.
     */
    userButtonTrigger: {
      '@media (max-width: 699px)': {
        minWidth: '44px',
        minHeight: '44px',
      },
    },

    /* ── THE AUTH CARD ────────────────────────────────────────────────────────
       The page around this card already carries the lockup and one line of
       product copy (see (auth)/layout.tsx). Clerk draws its OWN mark, its own
       "Sign in to SAHODA LABS" and its own "Welcome back! Please sign in to
       continue" — so the brand appeared TWICE within 150px, in two different
       voices, on the first screen a beta user ever sees. One of them had to go.

       Clerk's goes. The frame keeps the product's own mark and its own sentence;
       Clerk supplies the form, which is the part it is actually good at. That
       also removes the shouted application name (SAHODA LABS) and the only
       exclamation mark anywhere in this product's copy. */
    header: { display: 'none' },
    logoBox: { display: 'none' },

    /* The card wears the app's own surface treatment rather than Clerk's
       shadow, so it reads as the same product as every screen behind it. */
    card: {
      boxShadow: 'inset 0 0 0 1px var(--line)',
      borderRadius: 'var(--r-card)',
      backgroundColor: 'var(--surface)',
    },

    /* 34px is the kit's control height and what every other button in the app
       uses; 44px is SPECIFICATION.md §10's phone floor. Clerk shipped 32.

       ── AND ITS LABEL IS INK, NOT WHITE ────────────────────────────────────
       MEASURED off the shipped /sign-in at 1440 light on 2026-08-23, by
       sampling the rendered button: white `#ffffff` on Clerk's computed fill
       `rgb(255,107,8)` is **2.85:1** — under AA and under the 3:1 UI-boundary
       floor, on the ONLY action of the first screen a customer ever meets.
       docs/37 §2.4 names this exact pair as a never.

       Clerk derives a foreground from `colorPrimary` on its own and chose
       white. `--pfg` is `#000000`, which measures 7.15:1 on the brand and is
       the value every other primary in this product already uses.

       `background` is pinned too, and that is not belt-and-braces: Clerk paints
       a slight gradient (the sampled fill ran `rgb(255,107,8)` to
       `rgb(255,101,0)` across the button), so the contrast VARIES along the
       label. A ratio that is only true at one x-coordinate is not a ratio.

       ── AND WHY A SOURCE SCANNER COULD NOT HAVE CAUGHT THIS ────────────────
       `ink-on-brand` greps 927 source files for `text-white` beside a brand
       fill. This pair never appears in our source: Clerk composes it at
       runtime from `colorPrimary`. `e2e/auth-contrast.spec.ts` measures the
       rasterised button instead, which is the only place this pair exists. */
    formButtonPrimary: {
      minHeight: '34px',
      fontSize: '13px',
      textTransform: 'none',
      background: 'var(--p)',
      backgroundImage: 'none',
      color: 'var(--pfg)',
      '&:hover': { background: 'var(--ink)', color: 'var(--canvas)' },
      '@media (max-width: 699px)': { minHeight: '44px' },
    },
    formFieldInput: {
      minHeight: '34px',
      fontSize: '13px',
      '@media (max-width: 699px)': { minHeight: '44px' },
    },
    socialButtonsBlockButton: {
      minHeight: '34px',
      fontSize: '13px',
      '@media (max-width: 699px)': { minHeight: '44px' },
    },
  },
}
