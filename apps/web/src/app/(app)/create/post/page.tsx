import { Suspense } from 'react'
import type { Channel } from '@sahoda/shared'

import { CreateFlow } from '@/components/create/create-flow'
import { listConnectedChannels } from '@/lib/connections/read'

export const metadata = { title: 'New post' }

/**
 * The create flow's page. Full-screen, not a modal — see CreateFlow.
 *
 * The only read here is which channels are connected, and it is used for one
 * thing: telling the user on the tile. A channel that is not connected stays
 * SELECTABLE, because writing and planning work without a connection and
 * disabling it would block the main reason someone opens this screen early.
 *
 * A failed read costs the "Connected" line and nothing else — the flow still
 * opens, every channel still selects, and no tile claims a state we could not
 * establish.
 *
 * `Suspense` is required, not decorative: CreateFlow reads the step from
 * `useSearchParams`, and Next opts the whole route out of static rendering
 * unless that hook sits under a boundary.
 */
export default async function CreatePostPage() {
  // `listConnectedChannels` already answers exactly this question — active rows
  // only, null-safe, and its own docstring is written for the composer: without
  // it "a shop owner picks Instagram, writes the post, attaches a photo, sets a
  // time — and learns there is no Instagram connection at the moment they press
  // Publish". Re-filtering `listConnections()` here would be a second, drifting
  // copy of that rule.
  let connected: Channel[] = []
  try {
    connected = [...(await listConnectedChannels())]
  } catch {
    // Leave it empty. "Not connected · you can still write" is the safe
    // direction: it never tells someone a channel is live when we could not
    // read it, and it never blocks the flow.
    connected = []
  }

  return (
    <Suspense fallback={null}>
      <CreateFlow connected={connected} />
    </Suspense>
  )
}
