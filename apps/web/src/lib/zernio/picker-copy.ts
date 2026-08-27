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
  facebook: {
    channel: 'Facebook',
    noun: 'Page',
    // Names the thing that is actually true of Facebook: it cannot post to a
    // personal profile at all, only to a Page. Saying "create a Page" without
    // that fact reads as a hoop rather than a requirement.
    extra:
      'Facebook only lets apps post to a Page, never to a personal profile. ' +
      'Create one at facebook.com/pages/create, then connect again.',
    empty: 'no-pages',
  },
  pinterest: {
    channel: 'Pinterest',
    noun: 'board',
    // A board is free and instant to make, and Pinterest requires one before
    // anything can be pinned — so "create one" is a remedy that genuinely works
    // here, unlike on Google Business.
    extra:
      'Pins have to go somewhere, so a board has to exist first. Create one in ' +
      'Pinterest, then connect again.',
    empty: 'no-boards',
  },
  googlebusiness: {
    channel: 'Google Business Profile',
    noun: 'location',
    // Deliberately NOT the Facebook sentence with the noun swapped. A location
    // is verified by Google, often by post, so "create one and connect again" is
    // a remedy that cannot work today and `no-impossible-remedy.spec.ts` is the
    // standing rule against exactly that.
    extra:
      'A location has to exist and be verified in Google Business Profile before ' +
      'it can be connected. Check business.google.com with this Google account.',
    empty: 'no-locations',
  },
}

export function pickerCopyFor(platform: ZernioSelectionPlatform): PickerCopy & { empty: string } {
  return COPY[platform]
}
