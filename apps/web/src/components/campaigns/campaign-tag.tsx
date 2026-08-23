import Link from 'next/link'
import { Megaphone } from 'lucide-react'

/**
 * Which campaign a post belongs to, on a screen that is not the campaign screen.
 *
 * ── WHY IT IS `.is-committed` AND NEVER `.is-real` ───────────────────────────
 * A campaign is something a person decided. No platform can ever prove one
 * happened — nothing publishes a campaign, posts publish — so the highest rung
 * it can honestly reach is "someone decided this", which is exactly what
 * `.is-committed` means. That is also why the tag never carries a publish state:
 * the post's own chip and its per-channel chips already say what went out, and a
 * campaign label repeating a weaker version of that would be a second, drifting
 * source for the same fact.
 *
 * ── A POST MAY BE IN MORE THAN ONE ───────────────────────────────────────────
 * `campaign_posts` allows it by design, and the read returns a list rather than
 * a first match. Rendering only one would hide a grouping the customer made from
 * the only screen that would have shown it.
 *
 * ── NOTHING RENDERS WHEN THE MEMBERSHIP READ FAILED ──────────────────────────
 * The caller passes `undefined`, not an empty list. An empty list is the claim
 * "this post is in no campaign", and a hiccup that quietly stripped a label the
 * customer put there would look like the app losing their work.
 */
export function CampaignTag({
  campaigns,
}: {
  campaigns: ReadonlyArray<{ id: string; name: string }> | undefined
}) {
  if (!campaigns || campaigns.length === 0) return null

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {campaigns.map((campaign) => (
        <Link
          key={campaign.id}
          href={`/campaigns/${campaign.id}`}
          className="is-committed type-sm inline-flex max-w-[20ch] items-center gap-1 rounded-pill px-2 py-[2px] font-[550] transition-micro hover:underline"
        >
          <Megaphone aria-hidden size={12} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{campaign.name}</span>
          <span className="sr-only">, open this campaign</span>
        </Link>
      ))}
    </span>
  )
}
