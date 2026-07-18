import { House } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Home' }

export default function HomePage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Home</PageTitle>
      <EmptyState
        icon={House}
        title="Connect a channel to get started"
        body="Sahoda plans your week once it can see a channel."
        action={
          // Navigation copy, not an action promise — connecting isn't
          // possible until the adapters land (honest states).
          <Link
            href="/connections"
            className="inline-flex items-center rounded-pill bg-primary px-4 py-2 font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white active:scale-[.97]"
          >
            View connections
          </Link>
        }
        tip="I'll draft your first week's plan the moment a channel is live."
      />
    </div>
  )
}
