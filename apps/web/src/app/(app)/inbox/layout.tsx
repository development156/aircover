import { InboxTabs } from '@/components/inbox/inbox-tabs'
import { PageTitle } from '@/components/page-title'

/**
 * One shell for the three read surfaces. The tabs live here rather than on each page
 * so switching sections does not re-render the heading — and so a new surface cannot
 * ship without appearing in the navigation.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-grid">
      {/* The PANES run full-bleed (see the data-fullbleed rule in globals.css —
          the reference gives this workspace the whole width), but the heading
          and the tabs are ordinary page furniture and keep the page's own
          gutter. Without this they sit flush against the rail, which reads as a
          layout fault rather than as a deliberate edge-to-edge workspace. */}
      <div className="px-page max-narrow:px-0">
        <PageTitle>Inbox</PageTitle>
        <div className="mt-grid">
          <InboxTabs />
        </div>
      </div>
      {children}
    </div>
  )
}
