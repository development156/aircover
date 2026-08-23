'use client'

import { useLivePhase } from '@/components/posts/live/publish-state-provider'

/**
 * Says when the screen has STOPPED following the publish.
 *
 * ── WHY THIS IS NOT OPTIONAL POLISH ──────────────────────────────────────────
 * The watch stops on its own after `WATCH_CAP_MS`, because an unattended tab
 * must not poll forever. Stopping silently, though, leaves a post frozen at
 * "Publishing" on a screen that is no longer asking — and a stale chip is
 * indistinguishable from a current one. The reader would take it as "still
 * going", which is a claim nothing on this page can support any more.
 *
 * So `paused` is the only phase that renders. `idle` deliberately says nothing:
 * there is genuinely nothing happening, the chips are current, and a permanent
 * "not watching" badge on a list of drafts would be noise that trains people to
 * ignore the one case that matters.
 *
 * `live` and `watching` say nothing either. The chips themselves are the
 * feedback — a spinner announcing that a screen is up to date is a claim about
 * the machinery rather than about the post.
 */
export function LivePhaseNote({ className }: { className?: string }) {
  const phase = useLivePhase()
  if (phase !== 'paused') return null

  return (
    <p className={className} role="status">
      <span className="text-[13px] text-muted">
        Stopped watching for updates. A publish has been running for a while. Reload to see where it
        got to.
      </span>
    </p>
  )
}
