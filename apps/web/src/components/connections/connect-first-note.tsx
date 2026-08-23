import Link from 'next/link'
import { Plug } from 'lucide-react'

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
 */
/**
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
     * ── IT IS NOT A BAND ANY MORE, AND THE REASON IS §16's OWN LADDER ─────────
     * This was a full-content-width wash with a hairline ring and a button in
     * it, and the previous pass demoted the button from primary to secondary
     * while writing, accurately: "the banner is still the loudest thing in its
     * own right — it has the wash AND the hairline ring."
     *
     * That is the finding, not the mitigation. `docs/37` §16 decides what leads
     * by asking first whether the user is BLOCKED — "if something must be
     * resolved before anything else on this screen works". Nothing here blocks
     * anything: this banner's own second sentence says "you can write and plan
     * without one". So on /posts, whose job is the list, and on /planner, whose
     * job is the plan, the loudest object on the page was an advisory about
     * something that stops nothing.
     *
     * MEASURED on the baseline capture (docs/flow/accent-before.jsonl): the two
     * routes carrying this banner are the two worst accent spends in the lane.
     *
     * So it keeps its claim and loses its band. One line, no fill, no ring, no
     * button — the information survives, the competition does not. The founder's
     * verdict names this shape exactly: "a 1032px orange band holding two words".
     */
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Plug size={13} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
      <span className="type-sm text-muted">
        No channel is connected yet — you can write and plan, but nothing can go out.
      </span>
      {/* `text-accent` is `--acc`, the darkened step that clears AA on every
          light ground (§2.2). Accent TEXT is legal where an accent FILL is not,
          and a link is the whole control: a second button on a page that already
          has a primary is the thing being removed. */}
      <Link
        href="/connections"
        data-guide="nudge.connect"
        className="type-sm font-[650] text-accent underline underline-offset-2"
      >
        Connect a channel
      </Link>
    </p>
  )
}
