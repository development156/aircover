import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'

/**
 * A page inside the app that is not there — a deleted post, a mistyped id, a
 * bookmark to something that has since gone.
 *
 * ── WHY THIS IS NOT THE ERROR BOUNDARY ───────────────────────────────────────
 * `(app)/error.tsx` offers "Try again", and it earns that: a page-level crash is
 * often transient (an expired token, a request that timed out) so a retry can
 * genuinely succeed. A 404 is the opposite. The row is not there, and it will not
 * be there on the second press. Offering a retry that can never succeed is worse
 * than offering nothing, because it spends the reader's attention on a control
 * that is guaranteed to fail. So this offers navigation instead — the only thing
 * that actually helps.
 *
 * Run 9's four-way distinction, held: "not connected" is not "read failed" is
 * not "not configured" is not "no data yet". This is a fifth, and it is none of
 * them — the thing was ASKED FOR BY NAME and does not exist.
 *
 * ── WHY IT KEEPS THE SHELL ───────────────────────────────────────────────────
 * Next's default 404 replaced the entire document: no nav, no workspace, no way
 * back except the browser's own button. This renders inside `(app)/layout.tsx`,
 * so the rail, topbar and bottom nav all survive and every route is still one tap
 * away.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto w-full max-w-[520px] py-12">
      {/* EmptyState's title is an h2, so without this the screen has NO h1 and is
          invisible to anyone navigating by headings — the same defect runs 7 and
          8 fixed on /home and /posts/[id]. sr-only because the EmptyState already
          says it visually; a second visible copy would be a duplicate. */}
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={FileQuestion}
        title="This page isn't here"
        body="The link may be old, or whatever it pointed at may have been deleted. Nothing has gone wrong with your account."
        action={
          <Link href="/home" className={buttonVariants({ variant: 'primary' })}>
            Go to Home
          </Link>
        }
        tip="If you followed a link from inside Sahoda, tell us — that one is ours to fix."
      />
    </div>
  )
}
