import type { CSSProperties } from 'react'

export interface ThemePreviewProps {
  /** Brand Skin overrides (docs/superpowers spec: the 7 CSS vars, inline). */
  style?: CSSProperties
  brandName: string
  tagline: string
  chips: string[]
}

/**
 * The persistent right-hand "live app preview" (docs/superpowers spec: "full-
 * bleed split: steps LEFT, live preview RIGHT"). Purely illustrative — every
 * token utility here (bg-primary, text-primary-foreground, bg-tint-100,
 * text-accent…) resolves through the 7 CSS vars, so setting `style` on this
 * root is the entire re-theming mechanism; no other code needs to change.
 */
export function ThemePreview({ style, brandName, tagline, chips }: ThemePreviewProps) {
  return (
    <div data-guide="onboarding.preview" className="sticky top-6 flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">
        Live preview
      </h2>
      <div
        style={style}
        aria-hidden
        className="rounded-card border border-line bg-bg p-5 shadow-card transition-panel"
      >
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-accent uppercase">
          {brandName || 'Your brand'}
        </p>
        <h3 className="mt-1 text-[18px] leading-[26px] font-bold text-ink">This week's post</h3>
        <p className="mt-1.5 text-[13.5px] text-muted">{tagline}</p>
        <button
          type="button"
          tabIndex={-1}
          className="mt-4 rounded-pill bg-primary px-4 py-[9px] text-[14px] font-semibold text-primary-foreground"
        >
          Publish this post
        </button>
        {chips.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-pill bg-tint-100 px-2.5 py-1 text-[12px] font-semibold text-accent dark:bg-s2"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
