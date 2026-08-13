/**
 * The Guide anchor registry for apps/web.
 *
 * Tours target UI by `data-guide="area.element"`, never by CSS selector, and a
 * seeded tour whose anchor is absent auto-skips (FSD M14 / the tour contract).
 * That degradation is deliberate and correct — but it is also SILENT, which is
 * how five of the six seeded tours came to point at anchors this app never had.
 *
 * So every seeded anchor must be accounted for here: it is present in the
 * markup, or it is BUILT FROM AN EXPRESSION and listed in `DYNAMIC_ANCHORS`, or
 * it does not exist and is listed in `PENDING_ANCHORS` with a reason.
 * `anchor-integrity.test.ts` enforces exactly that, and fails on a seeded anchor
 * that is none of the three.
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
 *
 * EMPTY IS A VALID STATE and is not an invitation to add to it. It became empty
 * on 2026-08-13 when its last entry turned out to describe a screen that had
 * been built — see `DYNAMIC_ANCHORS` below.
 */
export const PENDING_ANCHORS: Readonly<Record<string, string>> = {}

/**
 * Anchors this app DOES render, from an expression the static scan cannot see.
 *
 * `anchor-integrity.test.ts` finds anchors by matching `data-guide="…"` in the
 * source. That is the right check for the ninety-nine percent case and it has
 * one blind spot: an anchor composed at runtime, e.g.
 * `data-guide={`connections.connect_${platform}`}`, is rendered by the browser
 * and invisible to the regex.
 *
 * WHY THIS IS A SEPARATE LIST AND NOT A PENDING ENTRY. `connections.connect_x`
 * sat in `PENDING_ANCHORS` claiming "connecting is blocked, not merely unbuilt:
 * `connections` has no INSERT policy and apps/web has no service-role client".
 * Every load-bearing part of that was out of date by 2026-08-13:
 *
 *   - Connecting works. `connections` holds live rows for all four platforms
 *     (x, gbp, linkedin, instagram), and 7 live publishes have gone out through
 *     them.
 *   - The missing INSERT policy is REAL and no longer blocks anything: the
 *     write goes through `upsert_zernio_connection`, a SECURITY DEFINER
 *     function, which is why no INSERT policy and no service-role client are
 *     needed. `pg_policies` still lists only conn_select/conn_update/conn_delete.
 *   - The control exists — `components/connections/connect-button.tsx` renders
 *     the anchor for every platform it is given.
 *
 * Filing a built control under "pending" is precisely what the integrity test's
 * third case exists to catch; it could not catch this one because it cannot see
 * a template literal. So the claim moved here, where what it asserts is that the
 * anchor IS rendered — and the named component is checked to exist and to carry
 * a `data-guide`, so the exemption cannot outlive the code it describes.
 *
 * `connect-button.test.tsx` proves the composed value by rendering it. This map
 * is the static half; that test is the executed half, and neither is sufficient
 * alone.
 */
export const DYNAMIC_ANCHORS: Readonly<Record<string, string>> = {
  'connections.connect_x': 'components/connections/connect-button.tsx',
}

/** Anchors this app renders. Kept sorted; the test derives the real set from the markup. */
export const KNOWN_PENDING = Object.keys(PENDING_ANCHORS)
