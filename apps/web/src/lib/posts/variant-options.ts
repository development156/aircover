import type { VariantOptions } from '@sahoda/publishing/format'

import type { VariantExtras } from './variant-extras'

/**
 * `post_variants.extras` → the shape the publish path's rules take.
 *
 * ── ONE TRANSLATION, SO THE EDITOR AND THE PUBLISHER CHECK ONE THING ────────
 * `refusePoll` and `refuseGbpTopic` live in `@sahoda/publishing` and are run by
 * `buildPlatformData` before any adapter is reached. The composer runs the SAME
 * functions on the SAME shape, so a poll that is red on the card is the poll the
 * publisher would refuse, with the same sentence. The alternative — the editor
 * checking its own copy of "2 to 4 answers" — is how the hashtag counter and the
 * publisher disagreed for weeks.
 *
 * Empty is undefined, not `{}`: a version with no options set must produce no
 * `platformSpecificData` key at all, which is a different claim from an empty
 * object.
 */
export function optionsFromExtras(extras: VariantExtras): VariantOptions | undefined {
  const options: VariantOptions = {}

  if (extras.poll !== undefined) {
    const answers = extras.poll.options.filter((option) => option.trim() !== '')
    // A poll box the writer opened and left empty is not a poll. Carrying it
    // forward would refuse the post for a control they never used.
    if (answers.length > 0) {
      options.poll = {
        options: extras.poll.options,
        ...(extras.poll.question === undefined ? {} : { question: extras.poll.question }),
        ...(extras.poll.durationMinutes === undefined
          ? {}
          : { durationMinutes: extras.poll.durationMinutes }),
        ...(extras.poll.durationCode === undefined
          ? {}
          : { durationCode: extras.poll.durationCode }),
      }
    }
  }

  const firstComment = extras.firstComment?.trim()
  if (firstComment !== undefined && firstComment !== '') options.firstComment = firstComment

  const collaborators = (extras.collaborators ?? []).filter((name) => name.trim() !== '')
  if (collaborators.length > 0) options.collaborators = collaborators

  if (extras.aiGenerated === true) options.aiGenerated = true

  if (extras.gbpTopic !== undefined) {
    options.gbpTopic = extras.gbpTopic
    if (extras.gbpEvent !== undefined) options.gbpEvent = extras.gbpEvent
    if (extras.gbpOffer !== undefined) options.gbpOffer = extras.gbpOffer
  }

  return Object.keys(options).length === 0 ? undefined : options
}
