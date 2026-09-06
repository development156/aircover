import type { ZernioInboxResponseTime, ZernioInboxVolumeSummary } from '@sahoda/publishing'

/**
 * Received / Sent / Read / Failed / Conversations / Median response.
 *
 * Six tiles, not four: the inbox has no "not measured" figures the way
 * posting-analytics does — every one of these is a real reading, or the bare
 * absence mark when there is nothing to read (median response with a sample
 * size of zero, per `inboxResponseTime`'s own null-summary convention).
 */
export function InboxKpiStrip({
  summary,
  responseTime,
}: {
  summary: ZernioInboxVolumeSummary
  responseTime: ZernioInboxResponseTime
}) {
  const tiles: { label: string; value: number | null; caveat: string }[] = [
    { label: 'Received', value: summary.received, caveat: 'Inbound messages in this window.' },
    { label: 'Sent', value: summary.sent, caveat: 'Messages Sahoda or your team sent out.' },
    { label: 'Read', value: summary.read, caveat: 'Sent messages the recipient opened.' },
    { label: 'Failed', value: summary.failed, caveat: 'Sends the platform could not deliver.' },
    {
      label: 'Conversations',
      value: summary.uniqueConversations,
      caveat: 'Distinct threads with at least one message.',
    },
    {
      label: 'Median response',
      value: responseTime.summary ? responseTime.summary.medianSeconds : null,
      caveat: responseTime.summary
        ? `Time to first reply, across ${responseTime.summary.sampleSize.toLocaleString('en-IN')} paired conversations.`
        : 'No paired conversations yet in this window.',
    },
  ]

  return (
    <div className="grid grid-cols-6 gap-grid max-wide:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="surface-ring rounded-card bg-surface p-5">
          <p className="type-eyebrow text-muted">{tile.label}</p>
          <p className="mt-3 min-h-[36px] type-hero-num text-ink tabular-nums">
            {tile.value !== null ? (
              tile.label === 'Median response' ? (
                formatSeconds(tile.value)
              ) : (
                tile.value.toLocaleString('en-IN')
              )
            ) : (
              <span aria-hidden>—</span>
            )}
            {tile.value === null ? <span className="sr-only">Not measured</span> : null}
          </p>
          <p className="mt-1 type-meta text-muted">{tile.caveat}</p>
        </div>
      ))}
    </div>
  )
}

/** "3m 20s", "1h 5m" — a duration a shop owner can read at a glance. */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
