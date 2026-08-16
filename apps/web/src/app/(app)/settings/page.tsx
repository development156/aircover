import { SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Settings' }

/**
 * ONE tab, because one tab is how many have data.
 *
 * The brief for this screen was "build only the tabs whose data already
 * exists", and the honest count is one. Everything else a settings page
 * normally holds already lives somewhere better and is READ FROM THERE:
 * channels on /connections, plan and credits on /wallet, brand voice on
 * /brain, profile and password in the Clerk user menu. Duplicating any of
 * them here would give each two homes and let them disagree.
 *
 * So this page shows the workspace itself — the one thing with no other
 * home — and points at the rest rather than restating it. There is no
 * "Notifications", "Billing" or "Team" tab, because there is no data behind
 * them and a tab that opens onto nothing is worse than no tab.
 *
 * READ-ONLY on purpose. Renaming a workspace is a mutation, and this pass
 * changes no mutations (R2). The field shows what is stored; it does not
 * pretend to be editable.
 */

/** Where a setting actually lives, when it lives elsewhere. */
const ELSEWHERE = [
  { href: '/connections', label: 'Channels', detail: 'Connect, reconnect and disconnect accounts' },
  { href: '/wallet', label: 'Plan and credits', detail: 'Balance, activity and top-ups' },
  { href: '/brain', label: 'Brand voice', detail: 'What Sahoda writes from' },
] as const

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-3 last:border-b-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13px] font-[550] text-ink">{value}</span>
    </div>
  )
}

export default async function SettingsPage() {
  const workspace = await getActiveWorkspace()

  return (
    <div className="space-y-grid">
      <PageTitle sub="Your workspace, and where everything else is configured.">Settings</PageTitle>

      {workspace === null ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Nothing to configure yet"
          body="Settings belong to a workspace and you don't have one yet. Nothing failed — there is simply nothing to show until one exists."
        />
      ) : (
        <section className="surface-ring rounded-card bg-surface px-4 py-2">
          <Row label="Workspace name" value={workspace.name} />
          <Row label="Address" value={workspace.slug} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="type-eyebrow text-muted">Configured elsewhere</h2>
        <ul className="grid gap-2 wide:grid-cols-3">
          {ELSEWHERE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="surface-ring block rounded-card bg-surface p-4 transition-panel hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_var(--line-firm),var(--sh-card)]"
              >
                <span className="block text-[13px] font-[550] text-ink">{item.label}</span>
                <span className="mt-[2px] block text-[12px] text-muted">{item.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
