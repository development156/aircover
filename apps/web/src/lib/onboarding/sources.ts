/**
 * Which picked knowledge sources are actually sendable, in ONE place.
 *
 * ── THE DEFECT THIS EXISTS TO END ───────────────────────────────────────────
 * The knowledge step lets somebody pick "Website" and never type an address,
 * because the step deliberately does not gate. `sendSources` then skips that
 * source, correctly: posting an empty URL just earns a refusal.
 *
 * The summary card counted `data.sources.length` — the PICKS. So a person who
 * ticked three tiles and filled in none was told "3 sources to draw on" and
 * "Sahoda has 3 knowledge sources", about a library that had received nothing.
 *
 * That is the same defect the card's own comment already records surviving once
 * before: "an uploaded file was `{ name, size }` with no bytes, so a person who
 * dropped in three PDFs was told Sahoda had three more sources than it had." It
 * came back because the RULE for what gets sent lived inside the sender and the
 * COUNT was written separately. One function now, read by both, so the number on
 * the screen cannot mean something different from the work.
 *
 * ── WHY A BLANK ADDRESS IS THE WHOLE TEST ───────────────────────────────────
 * Not a URL parse. `addUrlDocument` prepends `https://` to a bare host and the
 * server is the thing that decides whether a page can be read; a stricter test
 * here would silently drop addresses the product would have accepted, which is
 * the same class of lie in the other direction. Blank is the only thing this
 * knows for certain, and it is exactly the condition the sender skips on.
 */
export function sendableSources(
  picked: readonly string[],
  urls: Readonly<Record<string, string>>,
): string[] {
  return picked.filter((key) => (urls[key] ?? '').trim() !== '')
}
