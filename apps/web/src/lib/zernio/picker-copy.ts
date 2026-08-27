import type { ZernioSelectionPlatform } from '@sahoda/publishing'

import type { PickerCopy } from './picker-page'

/** Where the picker's form posts. One constant, so the page and the route agree. */
export const SELECT_PATH = '/api/oauth/zernio/select'

/**
 * What each selection step is called in the customer's words.
 *
 * Zernio's vocabulary is `googlebusiness`, `select_location`, `locationId`. None of
 * that belongs on a screen. This is the fourth vocabulary boundary in the Zernio
 * integration and, like `connect-platform.ts`, it is a map rather than a guess.
 *
 * The noun is SINGULAR and lowercase except where the platform capitalises it:
 * Facebook's product is a "Page" with a capital P and calling it a "page" reads as
 * a web page, which is a different thing on the one screen where the difference
 * decides what the customer clicks.
 */
const COPY: Readonly<Record<ZernioSelectionPlatform, PickerCopy & { empty: string }>> = {
  facebook: { channel: 'Facebook', noun: 'Page', empty: 'no-pages' },
  googlebusiness: {
    channel: 'Google Business Profile',
    noun: 'location',
    empty: 'no-locations',
  },
}

export function pickerCopyFor(platform: ZernioSelectionPlatform): PickerCopy & { empty: string } {
  return COPY[platform]
}
