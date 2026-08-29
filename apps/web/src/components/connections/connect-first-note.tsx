import Link from 'next/link'
import { Plug } from 'lucide-react'
import { ChannelSchema } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { ConnectedChannelsRead } from '@/lib/connections/read'

/**
 * The first thing a new shop owner needs to be told, on the screen where they
 * start.
 *
 * ── WHY IT LIVES HERE AND NOT ON /connections ────────────────────────────────
 * Someone with nothing connected does not visit the Connections page — they open
 * Posts and start writing, because writing is what they came to do. They then
 * compose a post, attach a photo, set a time, press Publish, and only at that
 * last moment learn that no account was ever attached. Everything up to the
 * failure was offered as though it would work.
 *
 * Renders ONLY when the workspace has no live connection at all. One is enough to
 * make the journey work end to end, and a permanent banner nagging someone who
 * has connected Instagram but not LinkedIn would be noise they learn to ignore —
 * which is how the notice that actually matters stops being read.
 *
 * ── WHY IT TAKES THE READ AND NOT A COUNT ────────────────────────────────────
 * A count of zero used to arrive here from three different facts: nothing is
 * connected, there is no workspace to connect to, and the read failed. Only the
 * first earns this banner. The other two made it assert something about the
 * customer's account that nobody had established — and then pointed them at
 * /connections, which now says something different, so the two screens disagreed
 * about the same account.
 *
 * Silence on the other two is deliberate. There is no honest banner for "we
 * could not tell", and the page's own empty state owns "no workspace yet".
 */
export function ConnectFirstNote({ connections }: { connections: ConnectedChannelsRead }) {
  if (connections.status !== 'ok') return null
  if (connections.channels.size > 0) return null

  return (
    /**
     * ── IT IS NOT A BAND, AND THAT RULING STANDS ─────────────────────────────
     * This was a full-content-width wash with a hairline ring and a button in
     * it. `docs/37` §16 decides what leads a screen by asking first whether the
     * user is BLOCKED — "if something must be resolved before anything else on
     * this screen works". Nothing here blocks anything: you can write and plan
     * without a connection, and this note's own sentence says so. So on
     * /planner, whose job is the plan, the loudest object on the page was an
     * advisory about something that stops nothing. MEASURED on the baseline
     * capture (docs/flow/accent-before.jsonl): the two routes carrying this
     * banner were the two worst accent spends in the lane. The founder's verdict
     * names the shape exactly: "a 1032px orange band holding two words".
     *
     * The 2026-08-28 redesign asked for a richer status component with a
     * `[Connect channels]` BUTTON. The information it asked for is added below —
     * a status glyph, and the channels naming what connecting would buy. The
     * button is not, and this is the reason rather than an oversight:
     * `accent-budget.spec.ts` enforces docs/37 §16's "exactly one solid-brand
     * fill per view", /planner already spends that one on `Plan my week`, and a
     * second filled button here would restore precisely the object the ruling
     * removed. Accent TEXT is legal where an accent FILL is not, so the link
     * carries the action at full strength and none of the area.
     *
     * The channel names are read from `ChannelSchema.options`, never a literal
     * list. `channel-label.ts` is explicit about why: the day eight connect-only
     * platforms landed, an exhaustive Record "handed those three over as a
     * to-do list". A hand-typed four-channel list here would silently omit the
     * fifth and sixth the product already publishes to.
     */
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-xs bg-s2 text-muted"
      >
        <Plug size={13} strokeWidth={2} />
      </span>
      <p className="type-sm text-muted">
        <span className="font-[650] text-ink">Connect a channel to publish automatically.</span> You
        can write and plan without one, but nothing can go out.
      </p>
      <Link
        href="/connections"
        data-guide="nudge.connect"
        className="type-sm font-[650] text-accent underline underline-offset-2 max-narrow:min-h-11 max-narrow:inline-flex max-narrow:items-center"
      >
        Connect a channel
      </Link>
      {/* What connecting would buy, named. Truncated to a single line at every
          width: six full channel names wrap to three lines on a phone, and a
          three-line advisory about something that blocks nothing is the band
          this note stopped being. */}
      <span className="w-full truncate type-meta text-ink-mute">
        {ChannelSchema.options.map((channel) => CHANNEL_LABELS[channel]).join(' · ')}
      </span>
    </div>
  )
}
