/**
 * The LEGITIMATE reads, which must keep compiling.
 *
 * A guard that also blocks the honest uses gets weakened or deleted within a
 * week. `posts.status` is a real field with a real meaning — user intent — and
 * every use below is that meaning, under its own name.
 */
import type { Post } from '@sahoda/shared'

import { certaintyFor } from '@/lib/posts/certainty'
import { forDisplay, type DisplayPost } from '@/lib/posts/display-post'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import { canApprove } from '@/lib/planner/transitions'
import { autoPublishTruth } from '@/lib/posts/schedule-status'
import type { StatusBadgeProps } from '@/components/posts/status-badge'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

declare const raw: Post
declare const rows: readonly VariantStatusRow[]

// The one sanctioned conversion.
export const shown: DisplayPost = forDisplay(raw)

// Intent, under its own name: whether a person may approve this post.
export const canIt = canApprove(shown.intent)

// Intent as the promise gate — does this post claim it will publish itself.
export const truth = autoPublishTruth(shown.intent, shown.scheduled_at, new Date(), rows)

// Intent plus evidence, kept as separate arguments so neither can pass for the
// other.
export const certainty = certaintyFor(shown.intent, outcomeOf(rows))

// Both props supplied, in position.
export const props: StatusBadgeProps = { intent: shown.intent, outcome: outcomeOf(rows) }

// Everything else on the row is untouched.
export const title = shown.title
export const channels = shown.channels
