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
  },
}
