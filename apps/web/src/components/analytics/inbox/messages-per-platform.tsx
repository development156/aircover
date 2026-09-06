import { Panel, PanelHead, ChartSparse } from '@/components/charts/panel'
import { PLATFORM_LABELS } from '@/components/posts/channel-label'
import type { ZernioInboxVolumePlatform } from '@sahoda/publishing'
import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * One stacked column per platform: received, sent, read.
 *
 * Same drawing rules as `PostsPerPlatform`: neutral fills (received in
 * `--acc`, sent in `--ink-mute`, read as a hatch on top of sent), a measured
 * zero drawn as a stub rather than an absent column, and the peak named in
 * words via the figure's own totals rather than a separate legend number.
 */
export function MessagesPerPlatform({
  byPlatform,
}: {
  byPlatform: readonly ZernioInboxVolumePlatform[]
}) {
  if (byPlatform.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Messages per platform" />
        <ChartSparse compact>
          No inbox activity in this window yet, so there is no split to draw by platform.
        </ChartSparse>
      </Panel>
    )
  }

  const peak = Math.max(1, ...byPlatform.map((p) => p.received + p.sent))

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Messages per platform"
        sub="Received and sent messages, stacked per platform, for this window."
      />

      <figure className="flex flex-col">
        <div className="flex h-[168px] items-end gap-3 max-narrow:h-[132px]">
          {byPlatform.map((p, index) => {
            const total = p.received + p.sent
            const receivedPct = (p.received / (peak || 1)) * 100
            const sentPct = (p.sent / (peak || 1)) * 100
            return (
              <div
                key={p.platform}
                className="enter-step flex min-w-0 flex-1 flex-col items-center justify-end gap-2 self-stretch"
                style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
              >
                <span className="type-meta font-[550] tabular-nums text-ink">{total}</span>
                <div className="flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-pill">
                  <div
                    className={total === 0 ? 'w-full bg-line-firm' : 'w-full bg-ink-mute'}
                    style={{ height: `${sentPct}%`, minHeight: total === 0 ? '3px' : undefined }}
                  />
                  <div className="w-full bg-accent" style={{ height: `${receivedPct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-2 flex gap-3">
          {byPlatform.map((p) => (
            <div key={p.platform} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="truncate type-meta text-muted">{labelFor(p.platform)}</span>
            </div>
          ))}
        </div>

        <figcaption className="sr-only">
          {byPlatform
            .map((p) => `${labelFor(p.platform)}: ${p.received} received, ${p.sent} sent`)
            .join('. ')}
          .
        </figcaption>
      </figure>

      <div className="flex items-center gap-3 type-meta text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden /> Received
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-ink-mute" aria-hidden /> Sent
        </span>
      </div>
    </Panel>
  )
}

function labelFor(platform: string): string {
  return PLATFORM_LABELS[platform as ConnectionPlatform] ?? platform
}
