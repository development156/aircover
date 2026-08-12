/**
 * What "reset this workspace" clears, and what it must never touch.
 *
 * This list is the SINGLE source for three things that would otherwise drift
 * apart: the copy on the button, the confirmation dialog's enumeration, and the
 * statement list in `ops_workspace_reset`. A reset whose label says "everything"
 * while the function quietly leaves the Brand Brain standing is the
 * dishonest-success shape this codebase keeps writing comments about — so the UI
 * reads these arrays rather than restating them in prose.
 *
 * SCOPE DECIDED 2026-08-12: workspace CONTENT only. It destroys work. It never
 * touches money, access, or identity.
 */

export interface ResetTable {
  table: string
  /** What a person loses when this row goes. Rendered verbatim in the dialog. */
  label: string
}

/**
 * Cleared. Every one is workspace-scoped and re-creatable by using the product
 * again — that is the test for belonging on this list.
 */
export const RESET_CLEARS: readonly ResetTable[] = [
  { table: 'brand_memory', label: 'The Brand Brain, and every saved version of it' },
  { table: 'memory_events', label: 'The record of what was accepted into the brain' },
  { table: 'posts', label: 'All posts, drafts and scheduled' },
  { table: 'post_variants', label: 'Every per-channel variant' },
  { table: 'post_media', label: 'Generated images and attachments' },
  { table: 'planner_events', label: 'The planner calendar' },
  { table: 'sites', label: 'Generated sites' },
  { table: 'site_pages', label: 'Their pages' },
  { table: 'site_sections', label: 'Their sections' },
  { table: 'inbox_threads', label: 'Inbox conversations' },
  { table: 'inbox_messages', label: 'Messages inside them, including sent replies' },
  { table: 'leads', label: 'Leads captured by site forms' },
  { table: 'tour_progress', label: 'Guide progress, so tours run again' },
] as const

/**
 * Never touched, and each for a different reason. Shown to the reader too: the
 * useful half of a destructive confirmation is what SURVIVES it.
 */
export const RESET_KEEPS: readonly ResetTable[] = [
  {
    table: 'credit_ledger',
    label: 'Credits and the whole ledger — append-only, and the money record',
  },
  { table: 'credit_balances', label: 'The wallet balance' },
  { table: 'subscriptions', label: 'The plan and billing state' },
  { table: 'connections', label: 'Connected social accounts — no re-authorising' },
  { table: 'workspace_themes', label: 'The Brand Skin' },
  { table: 'workspace_members', label: 'Members and their roles' },
  {
    table: 'post_publish_logs',
    label: 'Publish history — append-only evidence a post really went out',
  },
  { table: 'audit_logs', label: 'The audit trail' },
] as const

/**
 * NOT workspace data, and the reason this list exists at all.
 *
 * `plans` and `guide_tours` carry `using (true)` policies — they are GLOBAL
 * catalogues every tenant reads, not rows belonging to anybody. Naming them in a
 * per-workspace reset would delete the product's own configuration for every
 * customer at once. Recorded here so the next person to extend `RESET_CLEARS`
 * meets the reason before the temptation.
 */
export const RESET_NEVER_GLOBAL: readonly string[] = ['plans', 'guide_tours'] as const

/** The phrase an operator must type. Deliberately the workspace's own name. */
export function resetConfirmationPhrase(workspaceName: string): string {
  return workspaceName.trim()
}

/** Whether what they typed matches, ignoring case and stray spaces only. */
export function resetConfirmationMatches(typed: string, workspaceName: string): boolean {
  const target = resetConfirmationPhrase(workspaceName)
  if (target.length === 0) return false
  return typed.trim().toLowerCase() === target.toLowerCase()
}
