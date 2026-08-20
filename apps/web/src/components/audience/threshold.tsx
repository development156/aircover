import { cn } from '@/lib/utils'

/**
 * THE FOLLOWER FLOOR, AS A DISTANCE YOU CAN SEE.
 *
 * ── WHY THIS IS THE PAGE'S ONE BOLD ELEMENT ──────────────────────────────────
 * Most workspaces will open this screen and find nothing in it, because Instagram
 * does not report who follows you until you pass 100 followers. That emptiness is
 * the screen's most common state, so it is the state worth designing — an empty
 * grid of four cards with dashes in them would be the same page telling the same
 * shop owner, every week, that something is missing.
 *
 * So the absence becomes the content: a real number (their followers) against a
 * real, documented threshold (Meta's 100), drawn as the distance between them.
 * Nothing here is invented — both ends of this bar came from a platform.
 *
 * ── AND WHY IT IS NOT AN ERROR STATE ─────────────────────────────────────────
 * No warning glyph, no `.is-unreadable` rule, no retry. Nothing has failed. The
 * copy says whose rule it is, because "we cannot show this" and "they do not
 * publish this yet" are different sentences and only one of them is true.
 *
 * ── THE ONE PROPORTIONAL COMPROMISE, STATED ──────────────────────────────────
 * At 1 follower the fill is 1% of the track, which at 390px is under three pixels
 * and rounds away to nothing. A fill of zero would say "none", and the difference
 * between none and one is the single most meaningful step on this bar. So a
 * non-zero count always paints at least 3px. That is a deliberate floor on the
 * DRAWING, never on the number: the figure beside it is exact, and the gap
 * between 1 and 2 followers is not something a shop owner reads off a bar.
 */
export function FollowerThreshold({
  followers,
  floor,
  className,
}: {
  followers: number
  floor: number
  className?: string
}) {
  const remaining = Math.max(0, floor - followers)
  const pct = Math.min(100, (followers / floor) * 100)

  return (
    <section
      aria-labelledby="audience-threshold"
      className={cn('surface-ring rounded-card bg-surface p-4 wide:p-5', className)}
    >
      <p className="type-eyebrow mb-3 text-muted">Followers</p>

      {/* NUMBER, then bar, then what it means. The first version set the hero
          number and the sentence on one baseline, which at 390 read as
          "58 42 more before…" for the half-second before the eye separated
          them — two numbers touching, neither labelled. */}
      <p className="type-hero-num num text-ink">
        {followers.toLocaleString()}
        <span className="type-h3 ml-2 font-[550] text-muted">
          follower{followers === 1 ? '' : 's'}
        </span>
      </p>

      {/* The track. `aria-hidden` because the two sentences around it already say
          the same thing in words — a screen reader hearing both hears it twice —
          and the progressbar role below carries the value for assistive tech. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={floor}
        aria-valuenow={Math.min(followers, floor)}
        aria-label={`${followers} of the ${floor} followers Instagram requires before it reports audience details`}
        // `bg-surface-3` and a hairline ring, NOT `bg-s2`. In dark, `--surface-2`
        // and `--surface` are the SAME value, so an s2 track on a surface card is
        // invisible — the exact "a tint cannot be a signature" trap docs/26 §3.1
        // records. The ring means the track is a structure, not a shade, so it
        // survives greyscale and both themes.
        className="surface-ring-firm mt-4 h-2 w-full overflow-hidden rounded-pill bg-surface-3"
      >
        <div
          data-layer="measured"
          className="h-full rounded-pill bg-brand"
          style={{ width: `${pct}%`, minWidth: followers > 0 ? '3px' : undefined }}
        />
      </div>

      <div className="type-sm mt-1.5 flex items-baseline justify-between text-muted">
        <span>now</span>
        <span className="num">{floor}</span>
      </div>

      <h2 id="audience-threshold" className="type-h3 mt-4 text-ink">
        {remaining === 0
          ? 'Instagram reports who follows you'
          : `${remaining.toLocaleString()} more before Instagram describes them`}
      </h2>

      <p className="type-body mt-1 max-w-[62ch] text-muted">
        Instagram starts reporting age, gender, cities and countries once an account passes{' '}
        <span className="num">{floor}</span> followers. That is a rule on their side. Nothing is
        wrong with your account and there is nothing to fix here &mdash; the details appear on
        their own once you cross.
      </p>
    </section>
  )
}
