import Link from 'next/link'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { buttonVariants } from '@/components/ui/button'
import { readConnections } from '@/lib/connections/read'

export const metadata = { title: 'Integrations' }

/**
 * Integrations — a SUMMARY that points at /connections, not a second copy of it.
 *
 * /connections owns connecting, reconnecting and disconnecting. Duplicating
 * those controls here would give each two homes and let them disagree about
 * what is live. So this tab answers one question — what is linked right now —
 * and hands over.
 */
export default async function SettingsIntegrationsPage() {
  const read = await readConnections()

  return (
    <SettingCard title="Connected platforms">
      {read.status === 'unreadable' ? (
        <SettingRow label="Couldn’t read your connections just now" hint="Reload to try again." />
      ) : read.status === 'no-workspace' ? (
        /* The same sentence /connections was corrected to, because it is the
           same fact. This tab said "Couldn't read your connections just now —
           reload to try again" to a brand-new account: a failure that had not
           happened, and a remedy that cannot produce a workspace. Reloading
           forever is the whole of what that row offered. */
        <SettingRow
          label="No workspace yet"
          hint="Channels belong to a workspace. Nothing failed. There is nothing to connect to until one exists."
        />
      ) : read.connections.length === 0 ? (
        <SettingRow
          label="Nothing connected"
          hint="You can write and plan without a channel. Connecting is what lets a post go out."
          control={
            <Link
              href="/connections"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Connect a channel
            </Link>
          }
        />
      ) : (
        read.connections.map((connection) => (
          <SettingRow
            key={connection.id}
            label={CHANNEL_LABELS[connection.platform]}
            hint={connection.status === 'active' ? 'Connected' : 'Needs attention'}
            control={<ChannelLogo channel={connection.platform} size={20} />}
          />
        ))
      )}
      <SettingRow
        label="Manage channels"
        hint="Connecting, reconnecting and disconnecting all live on one screen."
        control={
          <Link
            href="/connections"
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Open connections
          </Link>
        }
      />
    </SettingCard>
  )
}
