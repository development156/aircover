import { cn } from '@/lib/utils'

/**
 * The three-pane inbox shell (reference `.inbox`).
 *
 * ── RESPONSIVE, AND IT IS THE POINT ──────────────────────────────────────────
 *   >=1180   list | thread | context      three panes
 *   700-1179 list | thread                the context pane STEPS OUT
 *   <700     one pane                     list and thread SWAP
 *
 * Those are the reference's own breakpoints mapped onto this app's two
 * (`narrow` 700 / `wide` 1180). Mobile is a SWAP, not a squeeze: three columns
 * in 390px would give each about 130px, and the reference hides the list once a
 * thread is open rather than cramming both (SPECIFICATION.md §10 — "inbox swaps
 * list ↔ thread").
 *
 * ── FULL BLEED ───────────────────────────────────────────────────────────────
 * The panes carry their own headers and their own scroll. That is why this
 * escapes the page container: an inbox inside `p-page` under a page title has
 * two headers and two scrollbars, and the thread ends up scrolling the whole
 * document instead of its own column.
 */
export function InboxPanes({
  children,
  mobileShow,
}: {
  children: React.ReactNode
  /**
   * Which single pane survives below 700px. The reference swaps list ⇄ thread
   * and never stacks them; stacking would put a full-height empty column above
   * the thing the user came to read.
   *
   * On this route nothing is ever selected, so the choice is driven by whether
   * there is a list worth showing: with conversations, the LIST is the screen;
   * with none, the THREAD pane is — because it is the pane carrying the reason
   * the inbox is empty, and hiding it on a phone would leave a new user with a
   * blank column and no explanation.
   */
  mobileShow: 'list' | 'thread'
}) {
  return (
    <div
      data-guide="inbox.panes"
      data-mobile-show={mobileShow}
      className="surface-ring group/panes grid min-h-0 overflow-hidden rounded-card bg-surface
                 grid-cols-[288px_minmax(0,1fr)_292px]
                 max-wide:grid-cols-[250px_minmax(0,1fr)]
                 max-narrow:grid-cols-1
                 h-[calc(100dvh-var(--topbar-h)-2*var(--content-pad))]
                 max-narrow:h-[calc(100dvh-var(--topbar-h)-140px)]"
    >
      {children}
    </div>
  )
}

/**
 * One column. `min-h-0` on every level is load-bearing: a grid child defaults to
 * `min-height:auto`, so without it the scroll container grows to its content and
 * the pane never scrolls — the whole page does instead.
 */
export function InboxPane({
  kind,
  children,
  className,
}: {
  /** `context` hides below 1180; `list` hides below 700 when a thread is open. */
  kind: 'list' | 'thread' | 'context'
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      data-pane={kind}
      className={cn(
        'flex min-h-0 flex-col border-r border-line-soft last:border-r-0',
        // Context is the first pane the reference drops, at 1180.
        kind === 'context' && 'max-wide:hidden',
        // Below 700 exactly ONE of list/thread survives, chosen by the parent.
        kind === 'list' && 'max-narrow:group-data-[mobile-show=thread]/panes:hidden',
        kind === 'thread' && 'max-narrow:group-data-[mobile-show=list]/panes:hidden',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** A pane's own fixed header (reference `.inbox__hd`). */
export function PaneHeader({ children }: { children: React.ReactNode }) {
  return <header className="flex-none border-b border-line-soft p-3">{children}</header>
}

/** A pane's own scroll region (reference `.inbox__scroll`). */
export function PaneScroll({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>
}
