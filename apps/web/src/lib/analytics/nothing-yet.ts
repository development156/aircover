/**
 * The one card /analytics shows when nothing has ever been published through
 * Sahoda and nothing has been measured.
 *
 * MEASURED 2026-09-07 on a workspace with a connected Instagram that had never
 * posted through Sahoda: the card said "Connect a channel". A remedy that is
 * already done is the impossible-remedy defect in another coat, so the card
 * now reads the account state and offers the step that is actually next.
 */
export type NothingYetAccount =
  'ready' | 'reconnect' | 'not-connected' | 'not-configured' | 'unreadable' | 'no-workspace'

export interface NothingYetCard {
  headline: string
  detail: string
  action: { label: string; href: '/posts/new' | '/connections' } | null
}

export function nothingYetCard(account: NothingYetAccount, platformName?: string): NothingYetCard {
  switch (account) {
    case 'ready':
      return {
        headline: 'Nothing has gone out through Sahoda yet',
        detail: `${platformName ?? 'Your account'} is connected. Per-post numbers start with the first post Sahoda publishes; followers and reach from the account itself appear here once the channel reports them.`,
        action: { label: 'Write a post', href: '/posts/new' },
      }
    case 'reconnect':
      return {
        headline: 'Nothing to measure yet',
        detail: `${platformName ?? 'Your account'} needs reconnecting before Sahoda can read it or publish to it.`,
        action: { label: 'Reconnect the account', href: '/connections' },
      }
    case 'not-configured':
      return {
        headline: 'Sahoda can’t read metrics in this environment',
        detail:
          'No request went out, so this is not a reading of your accounts. Nothing is wrong with them.',
        action: null,
      }
    case 'unreadable':
      return {
        headline: 'Sahoda could not read your accounts just now',
        detail:
          'The request went out and came back without an answer. Nothing is wrong with your accounts. Refresh to try again.',
        action: null,
      }
    default:
      return {
        headline: 'Nothing to measure yet',
        detail:
          'Reach and followers come from the channel itself, so connecting an account starts the numbers even before you post.',
        action: { label: 'Connect a channel', href: '/connections' },
      }
  }
}
