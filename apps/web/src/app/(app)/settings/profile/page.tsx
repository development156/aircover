import { currentUser } from '@clerk/nextjs/server'

import { SettingCard, SettingRow } from '@/components/settings/setting-row'

export const metadata = { title: 'Profile' }

/**
 * Profile — read from Clerk, which OWNS it.
 *
 * Nothing here is editable in this app and nothing should be: Clerk holds the
 * email, the password and the sessions, and a second edit surface for any of
 * them is a second source of truth. The avatar menu in the topbar opens Clerk's
 * own account screen, which is where changes belong.
 *
 * This tab exists so that "where do I change my email" has an answer inside
 * Settings rather than only in a menu people have to discover.
 */
export default async function SettingsProfilePage() {
  const user = await currentUser()

  return (
    <SettingCard title="Profile">
      <SettingRow
        label="Email"
        hint="You sign in with this."
        control={
          <span className="text-[13px] font-[550] text-ink">
            {user?.primaryEmailAddress?.emailAddress ?? 'Not recorded'}
          </span>
        }
      />
      <SettingRow
        label="Name"
        hint="Shown on anything you approve."
        control={
          <span className="text-[13px] font-[550] text-ink">
            {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Not set'}
          </span>
        }
      />
      <SettingRow
        label="Password and sessions"
        hint="Managed by our sign-in provider. Open the avatar menu, top right, to change either."
      />
    </SettingCard>
  )
}
