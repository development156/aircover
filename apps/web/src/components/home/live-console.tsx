'use client'

import { useEffect, useState } from 'react'
import { Check, Coins, Radio, Sparkles, UserRound } from 'lucide-react'

import { askSahoda, pollLiveFeed } from '@/app/actions/home-live'
import { HomeSection } from '@/components/home/section'
import { agoWords } from '@/lib/home/ago'
import type { LiveKind, LiveLine } from '@/lib/home/live-types'
import { cn } from '@/lib/utils'

/**
 * "Right now": what Sahoda is doing, refreshed while the page is open.
 *
 * ── HOW IT STAYS HONEST ──────────────────────────────────────────────────────
 * The first render is the server's, from the same rows the dashboard read, so
 * there is nothing to flash in. Every twenty seconds while the tab is visible
 * it asks the server again through `pollLiveFeed`, which runs the same reads
 * under the same session; a poll that fails leaves the last good lines on
 * screen and says so in the footer rather than blanking the card. Hidden tabs
 * do not poll: a dashboard left open overnight must not cost a query every
 * twenty seconds for nobody.
 *
 * ── THE MOTION ───────────────────────────────────────────────────────────────
 * A new line arrives with the same `.enter` the page's regions use, so nothing
 * on this card moves in a way the rest of the screen does not. The dot pulses
 * only while polling is armed; the global reduced-motion rule stops it.
 */
export const LIVE_POLL_MS = 20_000

const GLYPH: Record<LiveKind, typeof Check> = {
  you: UserRound,
  sahoda: Sparkles,
  credits: Coins,
  check: Radio,
}

export function LiveConsole({ initial, readAt }: { initial: LiveLine[]; readAt: string }) {
  const [lines, setLines] = useState(initial)
  const [freshAt, setFreshAt] = useState(readAt)
  const [stale, setStale] = useState(false)
  const [now, setNow] = useState(() => new Date(readAt))
  const [asked, setAsked] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = asked.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const result = await askSahoda(text)
      setReply(result.said)
      if (result.did !== 'nothing') setAsked('')
      // The sentence is on screen before the move, so nothing happens unsaid.
      // A plain navigation, not the router: this card is inside the /home
      // JS budget and the moved-to screen is a fresh server render anyway.
      if (result.href) window.location.assign(result.href)
    } catch {
      setReply('Sahoda could not do that just now. Try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const feed = await pollLiveFeed()
        setLines(feed.lines)
        setFreshAt(feed.readAt)
        setNow(new Date(feed.readAt))
        setStale(false)
      } catch {
        setStale(true)
      }
    }
    const arm = () => {
      if (timer === null) timer = setInterval(tick, LIVE_POLL_MS)
    }
    const disarm = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick()
        arm()
      } else disarm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disarm()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <HomeSection id="home-live" title="Right now" guide="home.live">
      <div className="-mt-1 mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'relative grid size-2 place-items-center rounded-pill bg-brand',
            !stale &&
              'after:absolute after:inset-0 after:animate-ping after:rounded-pill after:bg-brand after:opacity-60',
          )}
        />
        <span className="type-meta text-muted">
          {stale
            ? 'Could not refresh just now. Showing what Sahoda last saw.'
            : 'Live · updates every 20 seconds'}
        </span>
      </div>
      <ol className="space-y-2" aria-live="polite" aria-relevant="additions">
        {lines.map((line) => {
          const Glyph = GLYPH[line.kind]
          return (
            <li key={`${line.at}-${line.text}`} className="enter flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-pill',
                  line.kind === 'check'
                    ? 'bg-surface-2 text-ink-mute'
                    : 'bg-brand-wash text-accent dark:bg-s2',
                )}
              >
                <Glyph size={12} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-sm text-ink">{line.text}</span>
                <span className="block type-meta text-muted">{agoWords(line.at, now)}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 type-meta text-ink-mute">Last looked {agoWords(freshAt, now)}</p>

      {/* ── THE LISTENING HALF ───────────────────────────────────────────────
          One box, three things it can do, and it says what it is doing before
          it moves you. It does only what a click already can (see
          `lib/home/instruct.ts`): a draft through the composer's own action,
          or the screen that owns what was asked. It never spends credits. */}
      <form onSubmit={ask} className="mt-4 border-t border-line-soft pt-4">
        <label htmlFor="home-ask" className="block type-meta font-[550] text-ink">
          Ask Sahoda to do something
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="home-ask"
            value={asked}
            onChange={(event) => setAsked(event.target.value)}
            placeholder="Write a post about the weekend menu"
            maxLength={500}
            disabled={busy}
            className="h-control min-w-0 flex-1 rounded-input border border-line bg-surface px-3 type-sm text-ink placeholder:text-ink-mute focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-narrow:h-11"
          />
          <button
            type="submit"
            disabled={busy || asked.trim() === ''}
            className="h-control flex-none rounded-input border border-line bg-surface px-3 type-sm font-[550] text-ink transition-micro hover:bg-surface-2 disabled:opacity-50 max-narrow:h-11"
          >
            Ask
          </button>
        </div>
        <p className="mt-2 type-meta text-muted" aria-live="polite">
          {busy
            ? 'Sahoda is on it.'
            : (reply ?? 'It can write a post, open your week, or open your accounts.')}
        </p>
      </form>
    </HomeSection>
  )
}
