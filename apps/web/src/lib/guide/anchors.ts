/**
 * The Guide anchor registry for apps/web.
 *
 * Tours target UI by `data-guide="area.element"`, never by CSS selector, and a
 * seeded tour whose anchor is absent auto-skips (FSD M14 / the tour contract).
 * That degradation is deliberate and correct — but it is also SILENT, which is
 * how five of the six seeded tours came to point at anchors this app never had.
 *
 * So every seeded anchor must be accounted for here: either it is present in the
 * markup, or it is listed below with a reason. `anchor-integrity.test.ts`
 * enforces exactly that, and fails on a seeded anchor that is neither.
 */

/**
 * Seeded anchors that are deliberately ABSENT, with why.
 *
 * The rule these share: the control the tour step describes does not exist. An
 * anchor hung on a placeholder would make the step appear to work over a feature
 * that isn't there — the same fabricated success the honesty rule forbids
 * everywhere else. A missing anchor auto-skips, which is the truthful state.
 *
 * Removing an entry is how a screen "claims" its tour step: build the real
 * control, add the anchor, delete the line. The test fails if you do one without
 * the other in either direction.
 */
export const PENDING_ANCHORS: Readonly<Record<string, string>> = {
  'connections.connect_x':
    'Connecting is blocked, not merely unbuilt: `connections` has no INSERT policy and apps/web has no service-role client (see REQUESTS.md, upsert_connection). A "connect" anchor would imply an action that cannot complete.',
}

/** Anchors this app renders. Kept sorted; the test derives the real set from the markup. */
export const KNOWN_PENDING = Object.keys(PENDING_ANCHORS)
