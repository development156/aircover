import { redirect } from 'next/navigation'

/**
 * COMPETITORS MOVED TO RADAR, AND THIS ROUTE FOLLOWS IT.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * This page rendered `<ComingSoon feature="Radar" …>`. It was not a Brand Brain
 * section that happened to resemble Radar; it WAS Radar, under a second name, in
 * a second place in the navigation. Two homes for one idea is how a reader stops
 * trusting a menu: they click both, find the same unbuilt thing twice, and
 * conclude the app does not know what it has.
 *
 * ── WHY RADAR WON THE NAME ───────────────────────────────────────────────────
 * PRD M9 puts both halves — the watch list you enter and the weekly scan that
 * reads it — inside Radar. Splitting them so the Brand Brain held the list and
 * Radar held the scan would have been a distinction the product does not make
 * and no shop owner would guess.
 *
 * The Brand Brain holds what YOUR business is. Radar holds what the businesses
 * around it are doing. That line is clean, and it leaves this route with nothing
 * of its own to say.
 *
 * ── AND WHY A REDIRECT RATHER THAN A DELETION ────────────────────────────────
 * The URL has been reachable, `BrainTabs` linked to it, and a bookmark or a
 * half-remembered path should land somewhere useful rather than on a 404. A
 * permanent 404 for a feature that MOVED is the dead end the whole coming-soon
 * treatment exists to avoid.
 */
export default function BrainCompetitorsPage() {
  redirect('/radar')
}
