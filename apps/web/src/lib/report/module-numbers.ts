/**
 * Consecutive numerals for the CMO Report's modules.
 *
 * MEASURED 2026-09-06 on the wt-core preview (Chai & Chapters, week 35): the
 * report read 01, 02, 03, 04, 06. Two modules are conditional — the ranking pair
 * and "When to post" — and each module's number was a literal that assumed the
 * others were present, so a missing module left a hole in the count. A reader
 * who sees 06 after 04 looks for the 05 they missed.
 *
 * `moduleNumbers` hands out the next numeral each time it is asked, in render
 * order, so the sequence is whole whatever is on the page.
 */
export function moduleNumbers(): { next: () => number } {
  let n = 0
  return { next: () => ++n }
}
