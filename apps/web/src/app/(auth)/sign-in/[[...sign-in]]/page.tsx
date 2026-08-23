import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { SignIn } from '@clerk/nextjs'

export const metadata = { title: 'Sign in' }

/**
 * ── A VISITOR WHO IS ALREADY SIGNED IN IS SENT ON, ON THE SERVER ─────────────
 * Clerk's <SignIn/> renders NOTHING for an authenticated session and then
 * redirects from the client. It works, so this was never a dead end — but it is
 * slow enough to be seen.
 *
 * MEASURED against `next start` on 2026-08-23, with no network latency at all:
 *   load        247ms   the page is up, and the only thing on it is the
 *                       lockup and one line of product copy
 *   settled    1306ms   /sign-up reaches /home
 *              1581ms   /sign-in reaches /home
 *
 * So a person who taps a bookmark, or presses back after signing in, looks at a
 * branded page with no heading, no message and no control for **about 1.1 to 1.3
 * seconds** — locally. On the mid-range Android on 4G that docs/37 §0 writes for,
 * that is a page that appears to have failed. §0 puts responsiveness third and
 * spells it "everything answers immediately, including no".
 *
 * The redirect therefore happens before a byte is sent. `auth()` is already read
 * on every protected route, so this costs nothing that was not already paid.
 *
 * `/home` rather than `/`: `/` redirects to `/home` anyway, and one hop is one
 * hop fewer.
 */
export default async function SignInPage() {
  const { userId } = await auth()
  if (userId) redirect('/home')

  return <SignIn />
}
