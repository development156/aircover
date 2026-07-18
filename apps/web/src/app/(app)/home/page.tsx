import { House } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'

export const metadata = { title: 'Home' }

export default function HomePage() {
  return (
    <div className="space-y-grid">
      <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Home</h1>
      <EmptyState
        icon={House}
        title="Connect a channel to get started"
        body="Sahoda plans your week once it can see a channel."
        action={
          <Link
            href="/connections"
            className="inline-flex items-center rounded-pill bg-primary px-4 py-2 font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white active:scale-[.97]"
          >
            Connect a channel
          </Link>
        }
        tip="I'll draft your first week's plan the moment a channel is live."
      />
    </div>
  )
}
