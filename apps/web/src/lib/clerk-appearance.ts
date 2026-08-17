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
       uses; 44px is SPECIFICATION.md §10's phone floor. Clerk shipped 32. */
    formButtonPrimary: {
      minHeight: '34px',
      fontSize: '13px',
      textTransform: 'none',
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
