/**
 * Page heading — the kit's `.sl-page-title` / `.sl-page-sub`.
 *
 * 20px at weight 650 with -0.02em, not 25px at 800. The half-step weight is the
 * point: the kit separates levels with 550/650 rather than jumping to bold, and
 * a page title that shouts makes every screen below it feel like a landing page.
 * That only renders correctly because Inter is loaded on its variable axis
 * (see layout.tsx) — pinned static weights round 650 to 600.
 */
export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div>
      <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">{children}</h1>
      {sub ? <p className="mt-[2px] text-[13px] text-muted">{sub}</p> : null}
    </div>
  )
}
