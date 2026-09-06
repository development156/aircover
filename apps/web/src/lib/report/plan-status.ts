/**
 * What the plan module says under each post it wrote, from the post's CURRENT
 * status rather than from what was true when the plan was written.
 *
 * Every sentence is a fact the reader can check on the linked post. The
 * fallback arm (no status readable) keeps the stage outcome, which is a fact
 * about the past and is worded as one.
 */
export function planPostSentence(status: string | null, stageOutcome: string): string {
  switch (status) {
    case 'draft':
    case 'idea':
      return 'A draft in your Planner'
    case 'review':
      return 'Waiting in Approvals'
    case 'approved':
      return 'Approved, not yet booked'
    case 'scheduled':
      return 'Booked in your Planner'
    case 'publishing':
      return 'Going out now'
    case 'published':
      return 'Published'
    case 'partially_published':
      return 'Published on some channels, not all'
    case 'failed':
      return 'Did not go out'
    case 'expired':
      return 'Expired before it was approved'
    case 'cancelled':
      return 'Cancelled'
    default:
      return stageOutcome === 'awaiting_approval'
        ? 'Sent to Approvals when the plan was written'
        : 'A draft in your Planner'
  }
}
