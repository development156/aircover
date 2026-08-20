import type { CampaignStatus } from '@sahoda/shared'
import type { Rung } from '@/components/ui/badge'

/**
 * The four stored values, in the words a customer reads.
 *
 * ── LABEL AND VALUE ARE NOT THE SAME THING, AND THE GAP IS WHERE THE BUG WAS ─
 * The screen this replaced showed a chip reading "Completed" and there is no
 * such value — the column says `finished`. A map keyed on the enum is what makes
 * that unrepeatable: the key must be a value the database accepts or this file
 * does not compile, and the label is free to be whatever reads best.
 *
 * "Finished" rather than "Completed" because completed implies it worked;
 * finished only says it is over, which is the only thing the row knows.
 */
export const CAMPAIGN_STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = {
  draft: 'Draft',
  active: 'Running',
  finished: 'Finished',
  cancelled: 'Called off',
}

/**
 * Which URGENCY rung each stage wears — how much it needs you, not how real it
 * is. The two axes are separate on purpose (docs/26 §3.2) and a campaign sits on
 * the SAME certainty rung throughout its life: `.is-committed`. Someone decided
 * it; no platform can ever prove a campaign happened, because nothing publishes
 * a campaign — posts publish, and they carry their own certainty per channel.
 *
 * So this map is urgency alone:
 *   draft      pending — it is waiting on you to start it
 *   active     active  — it is the thing currently running
 *   finished   calm    — nothing left to do
 *   cancelled  calm    — likewise, and the word carries the difference
 */
export const CAMPAIGN_STATUS_RUNG: Readonly<Record<CampaignStatus, Rung>> = {
  draft: 'pending',
  active: 'active',
  finished: 'calm',
  cancelled: 'calm',
}
