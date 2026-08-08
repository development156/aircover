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
      <PageTitle>Inbox</PageTitle>
      <InboxTabs />
      {children}
    </div>
  )
}
