'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { readPublishState } from '@/app/actions/publish-state'
import {
  byPostId,
  cadenceFor,
  msUntilNextWatch,
  type LivePhase,
  type PostLiveState,
  type PublishSnapshot,
} from '@/lib/posts/live-state'

/**
 * Live publish state for one page of posts.
 *
 * ── WHY A PROVIDER RATHER THAN A HOOK PER CARD ───────────────────────────────
 * `listVariantStates` is already batched one-query-per-page — the list read is
 * built that way because "a 50-post list would otherwise be 50 round-trips".
 * A hook per card would undo exactly that, turning one poll into fifty. One
 * subscription for the page, fanned out through context, keeps the polled read
 * the same shape as the render that seeded it.
 *
 * ── WHY THE CARDS STAY SERVER COMPONENTS ─────────────────────────────────────
 * Only the two regions a publisher can change are client components: the status
 * badge and the channel chips. `PostCard` says of itself that it is a "server
 * component — the only client island inside it is the delete control, so the
 * card itself costs no JS", and that stays true. The excerpt, the title, the
 * metrics and the layout are all still rendered once, on the server.
 *
 * ── THE POLL IS A FALLBACK, NOT THE DESIGN ───────────────────────────────────
 * Supabase Realtime is the right mechanism and it is not available to this lane:
 * `posts` and `post_variants` are not in the `supabase_realtime` publication,
 * and adding them is a migration, which only wt-db may write (see
 * `apps/web/REQUESTS.md`). Everything below feeds off a single `PublishSnapshot`,
 * so swapping the timer for a subscription later changes this file and nothing
 * else — the cards, the context and the payload are all unchanged by it.
 */

interface LiveContextValue {
  byId: Map<string, PostLiveState>
  phase: LivePhase
}

/**
 * Default is EMPTY and phase `idle`, so a card rendered outside a provider —
 * in a test, or on a surface that has not been wired — silently falls back to
 * its server-rendered props instead of throwing. A live region is an
 * enhancement; nothing on these screens may depend on it to be correct.
 */
const LiveContext = createContext<LiveContextValue>({ byId: new Map(), phase: 'idle' })

export function useLivePost(postId: string): PostLiveState | undefined {
  return useContext(LiveContext).byId.get(postId)
}

export function useLivePhase(): LivePhase {
  return useContext(LiveContext).phase
}

export interface PublishStateProviderProps {
  /** The server-rendered snapshot. The first paint is always this, never a fetch. */
  initial: PublishSnapshot
  children: React.ReactNode
}

export function PublishStateProvider({ initial, children }: PublishStateProviderProps) {
  const [snapshot, setSnapshot] = useState<PublishSnapshot>(initial)
  const [phase, setPhase] = useState<LivePhase>('idle')

  // The ids are fixed for the life of the page: they come from the server render,
  // and a post appearing or disappearing is a navigation, not a poll result.
  // Frozen in a ref so the effect below does not re-arm on every render.
  const postIds = useMemo(() => initial.posts.map((post) => post.postId), [initial])

  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  useEffect(() => {
    if (postIds.length === 0) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // When this stretch of watching began. Reset whenever the page goes quiet or
    // the tab is hidden, so the cap measures one continuous watch rather than the
    // lifetime of the tab — a writer who publishes twice in an hour gets two full
    // watches, not one that expired during the first.
    let watchStartedAt: number | null = null

    const clear = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }

    const schedule = () => {
      if (cancelled) return
      clear()

      const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
      const now = new Date()
      const watchedMs = watchStartedAt === null ? 0 : now.getTime() - watchStartedAt

      const cadence = cadenceFor(snapshotRef.current.posts, now, watchedMs, visible)
      setPhase(cadence.phase)

      if (cadence.intervalMs === null) {
        // `watchStartedAt` is cleared only when going idle — a PAUSED watch must
        // stay expired, or the next re-evaluation would restart it and it would
        // poll forever in a loop.
        if (cadence.phase !== 'idle') return
        watchStartedAt = null

        // NOT FETCHING IS NOT THE SAME AS NOT LOOKING AGAIN.
        //
        // A post scheduled ten minutes out sits outside `TICK_LEAD_MS`, so the
        // cadence is `idle` and no poll is warranted yet. Stopping here would
        // mean nothing ever re-enters this decision — the post would publish and
        // the screen would never move, which is precisely the bug this whole
        // component exists to fix. So an idle page with something on the clock
        // arms a RE-DECISION: no request, just `schedule()` again once the post
        // has entered its watch window, at which point the real poll begins.
        const wakeMs = msUntilNextWatch(snapshotRef.current.posts, now)
        if (wakeMs === null) return
        timer = setTimeout(schedule, wakeMs)
        return
      }

      if (watchStartedAt === null) watchStartedAt = now.getTime()

      timer = setTimeout(() => {
        void (async () => {
          const next = await readPublishState(postIds).catch(() => null)
          if (cancelled) return
          // An empty or failed read is NO NEWS. Keeping the last snapshot is the
          // honest response: the alternative is a card that reports a published
          // post as unknown because one request timed out.
          if (next !== null && next.posts.length > 0) setSnapshot(next)
          schedule()
        })()
      }, cadence.intervalMs)
    }

    schedule()

    // Re-evaluate the instant the tab comes back rather than waiting out a timer
    // that was never armed. A writer who switches away during a publish and back
    // 30 seconds later should see the result immediately, not after another wait.
    const onVisibility = () => schedule()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [postIds])

  const value = useMemo<LiveContextValue>(
    () => ({ byId: byPostId(snapshot), phase }),
    [snapshot, phase],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
