/*  SAHODA LABS — Tailwind preset
    =====================================================================
    Makes the design system available as utilities: bg-surface, text-t2,
    rounded-lg, h-control, shadow-float, gap-4 …

    Everything points at the CSS variables from sahoda-tokens.css rather
    than duplicating hex values, so there is exactly one source of truth.
    Change a token, the utilities follow.

    USE
      // tailwind.config.js  (Tailwind v3)
      module.exports = {
        presets: [require('./theme/tailwind-sahoda.preset.js')],
        content: [...],
      }

    Tailwind v4 users: skip this file. Map the tokens in your CSS with
    @theme instead — see RETHEME.md §3.

    NOTE ON ALPHA
    Because these resolve to var(), Tailwind's slash-opacity syntax
    (`bg-surface/50`) will NOT work on them. That is a fair trade for one
    source of truth. Where you need a wash, use the named alpha steps
    below (`bg-wash`, `bg-ink-04`) — the system only uses a handful, and
    naming them stops arbitrary alphas creeping in.                    */

module.exports = {
  theme: {
    extend: {
      colors: {
        /* Brand */
        brand: 'var(--sl-orange)',
        ink: 'var(--sl-black)',
        grey: 'var(--sl-grey)',
        line: 'var(--sl-gainsboro)',

        /* Semantic roles — prefer these in components */
        bg: 'var(--sl-bg)',
        surface: 'var(--sl-surface)',
        'surface-2': 'var(--sl-surface-2)',
        'surface-3': 'var(--sl-surface-3)',
        t1: 'var(--sl-text)',
        t2: 'var(--sl-text-2)',
        t3: 'var(--sl-text-3)',
        border: 'var(--sl-border)',
        'border-soft': 'var(--sl-border-soft)',

        /* Named washes — the only alphas the system uses */
        wash: 'var(--sl-orange-06)',
        'wash-10': 'var(--sl-orange-10)',
        'wash-16': 'var(--sl-orange-16)',
        'wash-24': 'var(--sl-orange-24)',
        'ink-02': 'var(--sl-black-02)',
        'ink-04': 'var(--sl-black-04)',
        'ink-06': 'var(--sl-black-06)',
        'ink-08': 'var(--sl-black-08)',
        scrim: 'var(--sl-black-45)',
      },

      /* 4px base, 8px rhythm. Half-steps are absent on purpose — if a
         gap needs 6px, the layout above it is usually the problem. */
      spacing: {
        1: 'var(--sl-s1)',
        2: 'var(--sl-s2)',
        3: 'var(--sl-s3)',
        4: 'var(--sl-s4)',
        5: 'var(--sl-s5)',
        6: 'var(--sl-s6)',
        7: 'var(--sl-s7)',
        8: 'var(--sl-s8)',
        9: 'var(--sl-s9)',
      },

      borderRadius: {
        sm: 'var(--sl-r-sm)',
        DEFAULT: 'var(--sl-r)',
        md: 'var(--sl-r-md)',
        lg: 'var(--sl-r-lg)',
        full: 'var(--sl-r-full)',
      },

      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },

      /* Line heights are baked in — the pairing is part of the scale,
         not a separate decision made per-usage. */
      fontSize: {
        11: ['11px', '1.45'],
        12: ['12px', '1.45'],
        13: ['13px', '1.5'],
        14: ['14px', '1.5'],
        16: ['16px', '1.4'],
        18: ['18px', '1.35'],
        20: ['20px', '1.25'],
        24: ['24px', '1.2'],
        30: ['30px', '1.15'],
      },

      /* 550 and 650 are load-bearing — the UI separates a label from its
         value with a half-step rather than jumping to bold. */
      fontWeight: {
        normal: '400',
        medium: '500',
        'medium-plus': '550',
        semibold: '600',
        'semibold-plus': '650',
        bold: '700',
      },

      /* Named `float` rather than overriding `shadow` so an existing
         `shadow-md` in your codebase keeps working while you migrate. */
      boxShadow: {
        hairline: 'inset 0 0 0 1px var(--sl-border-soft)',
        ring: 'inset 0 0 0 1px var(--sl-border)',
        'float-sm': 'var(--sl-shadow-sm)',
        float: 'var(--sl-shadow)',
        'float-lg': 'var(--sl-shadow-lg)',
      },

      height: {
        control: 'var(--sl-control-h)',   /* 34px — buttons, segmented */
        input: 'var(--sl-input-h)',       /* 38px — text fields */
        header: 'var(--sl-header-h)',     /* 56px */
      },

      width: {
        sidebar: 'var(--sl-sidebar-w)',              /* 232px */
        'sidebar-collapsed': 'var(--sl-sidebar-w-collapsed)',
      },

      transitionTimingFunction: {
        sl: 'var(--sl-ease)',
        'sl-out': 'var(--sl-ease-out)',
      },

      /* The motion table. Anything slower than 400ms is a mistake. */
      transitionDuration: {
        fast: '140ms',
        DEFAULT: '180ms',
        slow: '280ms',
      },
    },
  },
};
