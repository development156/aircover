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
}
