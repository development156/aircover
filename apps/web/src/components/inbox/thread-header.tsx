import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { ZernioMessage } from '@sahoda/publishing'

import { PlatformIcon } from '@/components/inbox/platform-icon'
import { platformLabel } from '@/components/inbox/platform-label'
import { dayLabel } from '@/lib/inbox/day-groups'
import type { InboxListRow } from '@/lib/inbox/list-row'
import { safeExternalUrl } from '@/lib/inbox/safe-external-url'

/**
 * The thread pane's header: who this is, which platform, which account is replying,
 * when it was last active, and — where Zernio gave one — a link out to the platform's
 * own app.
 *
 * `conversation` is the matching row from the sibling list, when one exists. It is
 * `null` on the stored-thread route, where there is no live `ZernioConversation` to
 * match against, and every optional line below simply does not render.
 */
export function ThreadHeader({
  fallbackTitle,
  conversation,
  messages,
}: {
  fallbackTitle: string
  conversation: InboxListRow | null
  messages: readonly ZernioMessage[]
}) {
  const participant = conversation?.participantName ?? fallbackTitle
  const platform = conversation?.platform ?? messages.find((m) => m.platform)?.platform ?? null
  const newest = messages.length > 0 ? messages[messages.length - 1] : undefined
  const activeAt = newest?.createdAt
  const externalUrl = safeExternalUrl(conversation?.url)

  return (
    <div className="flex items-center gap-2">
      {/* Back is the mobile affordance: above 700px the list is right there and a
          back button would point at a visible pane. */}
      <Link
        href="/inbox"
        aria-label="Back to messages"
        className="surface-ring grid size-8 shrink-0 place-items-center rounded-sm text-muted transition-micro hover:text-ink wide:hidden"
      >
        <ArrowLeft size={15} aria-hidden />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {platform ? (
            <PlatformIcon platform={platform} size={14} className="shrink-0 text-muted" />
          ) : null}
          <h2 className="type-h3 min-w-0 truncate font-[600] tracking-[-0.01em]">{participant}</h2>
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 type-meta text-muted">
          {conversation?.accountUsername ? (
            <span>Replying as @{conversation.accountUsername}</span>
          ) : null}
          {activeAt ? <span>Active {dayLabel(activeAt)}</span> : null}
        </p>
      </div>

      {externalUrl && platform ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="surface-ring-firm inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 type-meta font-[550] text-ink transition-micro hover:text-accent"
        >
          Open on {platformLabel(platform)}
          <ExternalLink size={12} aria-hidden />
        </a>
      ) : null}
    </div>
  )
}
