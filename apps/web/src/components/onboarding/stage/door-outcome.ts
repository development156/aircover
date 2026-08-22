/**
 * What the website door produced — or, on three of the five arms, what it
 * DID NOT produce and why.
 *
 * The distinction this type exists to keep is the one `door-transport-failure.ts`
 * documents at length: a failed READ is a verdict about the customer's page, and
 * a failed REQUEST is not. Collapsing them is how "we could not read that" ends
 * up on screen about a site nothing ever fetched — a confident answer to a
 * question nobody asked, aimed at something the customer owns.
 */
export type DoorOutcome =
  /** No website was given. Nothing was attempted and nothing is claimed. */
  | { kind: 'none' }
  | { kind: 'reading' }
  /** A page was fetched and read. `text` is theirs, verbatim. */
  | { kind: 'read'; text: string; label: string; foundName: string; colors: string[] }
  /** A page WAS fetched and could not be made sense of. A verdict, legitimately. */
  | { kind: 'unread'; message: string }
  /**
   * The request never produced a verdict about the document. NOTHING here may
   * describe the page. `fatal` marks the two arms — no workspace, signed out —
   * where there is nowhere to save anything, so the flow must not offer to
   * carry on into a resolve that cannot succeed.
   */
  | { kind: 'blocked'; message: string; retryable: boolean; fatal: boolean }

export function doorText(outcome: DoorOutcome): string {
  return outcome.kind === 'read' ? outcome.text : ''
}

export function doorColors(outcome: DoorOutcome): string[] {
  return outcome.kind === 'read' ? outcome.colors : []
}

/**
 * The `Website` cell on the result card. One sentence per arm, and the three
 * failure arms differ because they are three different situations.
 */
export function websiteCell(outcome: DoorOutcome, site: string): string {
  switch (outcome.kind) {
    case 'none':
      return 'Not given'
    case 'reading':
      return 'Reading'
    case 'read':
      return outcome.label
    case 'unread':
      return `${site} · not read`
    case 'blocked':
      // Deliberately NOT "not read", which reads as a verdict on the page.
      return `${site} · read did not run`
  }
}
