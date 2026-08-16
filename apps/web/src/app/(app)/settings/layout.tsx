import { PageTitle } from '@/components/page-title'
import { SettingsNav } from '@/components/settings/settings-nav'

/**
 * The reference's `.snav` — a 196px section rail beside the content pane,
 * rather than a wall of cards. The rail collapses above the content on a phone,
 * where a 196px column would leave under 200px for the settings themselves.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageTitle sub="Your workspace, and where everything else is configured.">Settings</PageTitle>
      <div className="grid grid-cols-[196px_minmax(0,1fr)] items-start gap-5 max-narrow:grid-cols-1 max-narrow:gap-3">
        <SettingsNav />
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  )
}
