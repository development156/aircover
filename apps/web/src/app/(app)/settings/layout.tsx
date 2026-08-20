import { PageTitle } from '@/components/page-title'
import { SettingsNav } from '@/components/settings/settings-nav'

/**
 * The reference's `.snav` — a 196px section rail beside the content pane,
 * rather than a wall of cards. The rail collapses above the content on a phone,
 * where a 196px column would leave under 200px for the settings themselves.
 *
 * ── THE PANE IS CAPPED AT --measure-form (docs/26 §6.1) ──────────────────────
 * It used to be `minmax(0,1fr)`, so at 1440 the workspace form ran the full
 * ~1150px pane and each label sat about 900px from the control it names. Every
 * gap was on the 4pt scale and nothing was mis-spaced; the row had simply
 * stopped reading as a row. That is what made this screen read as unfinished
 * rather than merely short.
 *
 * The GRID still fills the viewport — the pane is capped, not the page — so
 * nothing about the shell or the rail changes.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageTitle sub="Your workspace, and where everything else is configured.">Settings</PageTitle>
      <div className="grid grid-cols-[196px_minmax(0,1fr)] items-start gap-5 max-narrow:grid-cols-1 max-narrow:gap-3">
        <SettingsNav />
        <div className="min-w-0 max-w-[var(--measure-form)] space-y-4">{children}</div>
      </div>
    </div>
  )
}
